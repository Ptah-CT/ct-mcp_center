import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express from "express";

import { mcpServersRepository } from "../../db/repositories";
import { betterAuthMcpMiddleware } from "../../middleware/better-auth-mcp.middleware";
import { ProcessManagedStdioTransport } from "../../lib/stdio-transport/process-managed-transport";

const serverRouter = express.Router();

// Apply better auth middleware to all server routes - DISABLED for development
// serverRouter.use(betterAuthMcpMiddleware);

// Map to store transports by sessionId
const webAppTransports: Map<string, Transport> = new Map<string, Transport>();

// Function to handle connection cleanup
const handleConnectionClose = () => {
  // This function can be extended to handle cleanup logic when connections close
  console.log("Connection closed");
};

const SSE_HEADERS_PASSTHROUGH = ["authorization"];
const STREAMABLE_HTTP_HEADERS_PASSTHROUGH = [
  "authorization",
  "mcp-session-id",
  "last-event-id",
];

const defaultEnvironment = {
  ...getDefaultEnvironment(),
};

// Cooldown mechanism for failed STDIO commands
const STDIO_COOLDOWN_DURATION = parseInt(process.env.STDIO_COOLDOWN_DURATION || "10000", 10);
const stdioCommandCooldowns = new Map<string, number>();

// Function to create a key for STDIO commands
const createStdioKey = (
  command: string,
  args: string[],
  env: Record<string, string>,
) => {
  return `${command}:${args.join(",")}:${JSON.stringify(env)}`;
};

// Function to check if a STDIO command is in cooldown
const isStdioInCooldown = (
  command: string,
  args: string[],
  env: Record<string, string>,
): boolean => {
  const key = createStdioKey(command, args, env);
  const cooldownEnd = stdioCommandCooldowns.get(key);
  if (cooldownEnd && Date.now() < cooldownEnd) {
    return true;
  }
  if (cooldownEnd && Date.now() >= cooldownEnd) {
    stdioCommandCooldowns.delete(key);
  }
  return false;
};

// Function to set a STDIO command in cooldown
const setStdioCooldown = (
  command: string,
  args: string[],
  env: Record<string, string>,
) => {
  const key = createStdioKey(command, args, env);
  stdioCommandCooldowns.set(key, Date.now() + STDIO_COOLDOWN_DURATION);
};

// Function to extract server UUID from STDIO command
const extractServerUuidFromStdioCommand = async (
  command: string,
  args: string[],
): Promise<string | null> => {
  try {
    // For filesys server, the command is typically: npx @modelcontextprotocol/server-filesystem /workspaceFolder
    // We need to find the server in the database that matches this command pattern

    // First, try to find by command and args pattern
    const fullCommand = `${command} ${args.join(" ")}`;
    console.log(`Looking for server with command: ${fullCommand}`);

    // Look for servers that match this command pattern
    const servers = await mcpServersRepository.findAll();
    console.log(`Found ${servers.length} servers in database`);

    for (const server of servers) {
      if (server.type === "STDIO" && server.command) {
        const serverCommand = `${server.command} ${(server.args || []).join(" ")}`;
        console.log(
          `Checking server ${server.name} (${server.uuid}): ${serverCommand}`,
        );
        if (serverCommand === fullCommand) {
          console.log(
            `Found exact match for server ${server.name} (${server.uuid})`,
          );
          return server.uuid;
        }
      }
    }

    // If no exact match, try to find by command only (for cases where args might vary)
    for (const server of servers) {
      if (server.type === "STDIO" && server.command === command) {
        console.log(
          `Found command-only match for server ${server.name} (${server.uuid})`,
        );
        return server.uuid;
      }
    }

    console.log(`No server found for command: ${fullCommand}`);
    return null;
  } catch (error) {
    console.error(
      `Response error while extracting server UUID from STDIO command:`,
      error,
    );
    handleConnectionClose();
    return null;
  }
};

serverRouter.post("/message", async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    // console.log(`Received POST message for sessionId ${sessionId}`);

    const transport = webAppTransports.get(
      sessionId as string,
    ) as SSEServerTransport;
    if (!transport) {
      res.status(404).end("Session not found");
      return;
    }
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Error in /message route:", error);
    res.status(500).json(error);
  }
});

// STDIO SSE endpoint
serverRouter.get("/stdio", async (req, res) => {
  try {
    const { command, args, env } = req.query;
    
    if (!command || typeof command !== "string") {
      return res.status(400).json({ error: "Command is required" });
    }

    // Parse args - expect JSON array or convert string to array
    let parsedArgs: string[] = [];
    if (args) {
      try {
        if (typeof args === "string") {
          // Try parsing as JSON first, fall back to splitting by space
          try {
            parsedArgs = JSON.parse(args);
          } catch {
            parsedArgs = args.trim() ? args.split(" ") : [];
          }
        } else if (Array.isArray(args)) {
          parsedArgs = args;
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid args format" });
      }
    }

    // Parse env - expect JSON object
    let parsedEnv: Record<string, string> = {};
    if (env) {
      try {
        if (typeof env === "string") {
          parsedEnv = JSON.parse(env);
        } else if (typeof env === "object") {
          parsedEnv = env as Record<string, string>;
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid env format" });
      }
    }

    // Check cooldown
    if (isStdioInCooldown(command, parsedArgs, parsedEnv)) {
      return res.status(429).json({ 
        error: "Command is in cooldown period due to recent failures" 
      });
    }

    console.log(`Creating STDIO transport for: ${command} ${parsedArgs.join(" ")}`);

    // Create STDIO transport
    const transport = new ProcessManagedStdioTransport({
      command,
      args: parsedArgs,
      env: { ...defaultEnvironment, ...parsedEnv },
      onprocesscrash: (exitCode, signal) => {
        console.log(`STDIO process crashed: exit=${exitCode}, signal=${signal}`);
        setStdioCooldown(command, parsedArgs, parsedEnv);
      },
    });

    // Create SSE server transport
    const sseTransport = new SSEServerTransport("/stdio", res);

    console.log(`Attempting to handle SSE connection for: ${command} ${parsedArgs.join(" ")}`);

    // Start the STDIO transport to establish connection to the MCP server process
    await transport.start();

    // Set up bidirectional message forwarding between SSE and STDIO transports
    
    // Forward messages from SSE client to STDIO server
    sseTransport.onmessage = async (message) => {
      try {
        await transport.send(message);
      } catch (error) {
        console.error("Error forwarding message from SSE to STDIO:", error);
        sseTransport.onerror?.(error as Error);
      }
    };

    // Forward messages from STDIO server to SSE client
    transport.onmessage = async (message) => {
      try {
        await sseTransport.send(message);
      } catch (error) {
        console.error("Error forwarding message from STDIO to SSE:", error);
      }
    };

    // Handle errors and cleanup
    transport.onerror = (error) => {
      console.error("STDIO transport error:", error);
      sseTransport.onerror?.(error);
    };

    transport.onclose = () => {
      console.log("STDIO transport closed");
      sseTransport.onclose?.();
    };

    sseTransport.onclose = () => {
      console.log("SSE transport closed");
      transport.close();
    };

    // Start the SSE server transport to handle incoming connections
    await sseTransport.start();

    console.log("SSE transport connected to STDIO transport via proxy");
    
  } catch (error) {
    console.error("Error in STDIO SSE endpoint:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    console.error("Error details:", { 
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error ? error.cause : undefined
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
    }
  }
});

serverRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

export default serverRouter;
