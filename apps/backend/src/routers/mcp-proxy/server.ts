import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express from "express";

import { mcpServersRepository } from "../../db/repositories";
import { betterAuthMcpMiddleware } from "../../middleware/better-auth-mcp.middleware";

const serverRouter = express.Router();

// Apply better auth middleware to all server routes
serverRouter.use(betterAuthMcpMiddleware);

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
const STDIO_COOLDOWN_DURATION = 10000; // 10 seconds
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

serverRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

export default serverRouter;
