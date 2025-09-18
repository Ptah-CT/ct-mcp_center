import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express from "express";

import { ApiKeysRepository } from "../../db/repositories/api-keys.repo";
import { createServer } from "../../lib/metamcp/index";
import { betterAuthMcpMiddleware } from "../../middleware/better-auth-mcp.middleware";

const metamcpRouter = express.Router();

// Apply better auth middleware to all metamcp routes
metamcpRouter.use(betterAuthMcpMiddleware);

const apiKeysRepository = new ApiKeysRepository();

/**
 * Extract API-Key from request headers
 * @param req Express request object
 * @returns API-Key string or undefined if not found
 */
function extractApiKey(req: express.Request): string | undefined {
  // Check X-API-Key header first
  const apiKeyHeader = req.headers["x-api-key"] as string;
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  // Check Authorization Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return undefined;
}

/**
 * Validate API key and extract authentication context
 * @param apiKey API key to validate
 * @returns Promise with authentication context or null if invalid
 */
async function validateApiKeyAndGetContext(apiKey: string): Promise<{
  keyUuid: string;
  userId?: string;
} | null> {
  try {
    const result = await apiKeysRepository.validateApiKey(apiKey);
    if (result?.valid) {
      return {
        keyUuid: result.key_uuid,
        userId: result.user_id || undefined,
      };
    }
    return null;
  } catch (error) {
    console.error("Error validating API key:", error);
    return null;
  }
}
const webAppTransports: Map<string, Transport> = new Map<string, Transport>(); // Web app transports by sessionId
const metamcpServers: Map<
  string,
  {
    server: Awaited<ReturnType<typeof createServer>>["server"];
    cleanup: () => Promise<void>;
  }
> = new Map(); // MetaMCP servers by sessionId
const sessionsByApiKey: Map<string, Set<string>> = new Map();
const sessionToApiKey: Map<string, string> = new Map();

const normalizeSessionId = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const registerSession = (apiKey: string, sessionId: string) => {
  let sessions = sessionsByApiKey.get(apiKey);
  if (!sessions) {
    sessions = new Set();
    sessionsByApiKey.set(apiKey, sessions);
  }
  sessions.add(sessionId);
  sessionToApiKey.set(sessionId, apiKey);
};

const unregisterSession = (sessionId: string) => {
  const associatedApiKey = sessionToApiKey.get(sessionId);
  sessionToApiKey.delete(sessionId);

  if (!associatedApiKey) {
    return;
  }

  const sessions = sessionsByApiKey.get(associatedApiKey);
  if (!sessions) {
    return;
  }

  sessions.delete(sessionId);
  if (sessions.size === 0) {
    sessionsByApiKey.delete(associatedApiKey);
  }
};

// Create a MetaMCP server instance
const createMetaMcpServer = async (
  namespaceUuid: string,
  apiKey: string,
  keyUuid: string,
  userId?: string,
  includeInactiveServers: boolean = false,
) => {
  const { server, cleanup } = await createServer(
    namespaceUuid,
    apiKey,
    keyUuid,
    userId,
    includeInactiveServers,
  );
  return { server, cleanup };
};

// Session tracking for cleanup logic
const transportLastAccess: Map<string, Date> = new Map();
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const MAX_IDLE_TIME = 2 * 60 * 60 * 1000; // 2 hours

const cleanupSession = async (sessionId: string) => {
  const associatedApiKey = sessionToApiKey.get(sessionId);
  console.log(
    `Cleaning up MetaMCP session ${sessionId}${
      associatedApiKey ? ` for API-Key ${associatedApiKey}` : ""
    }`,
  );

  const transport = webAppTransports.get(sessionId);
  if (transport) {
    webAppTransports.delete(sessionId);
    try {
      await transport.close();
    } catch (error) {
      console.error(
        `Error closing transport for MetaMCP session ${sessionId}:`,
        error,
      );
    }
  }

  const serverInstance = metamcpServers.get(sessionId);
  if (serverInstance) {
    metamcpServers.delete(sessionId);
    try {
      await serverInstance.cleanup();
    } catch (error) {
      console.error(
        `Error cleaning up MetaMCP server for session ${sessionId}:`,
        error,
      );
    }
  }

  transportLastAccess.delete(sessionId);
  unregisterSession(sessionId);
};

// API-Key cleanup function with time-based cleanup support
const cleanupApiKey = async (apiKey: string, sessionId?: string) => {
  if (sessionId) {
    const ownerApiKey = sessionToApiKey.get(sessionId);
    if (ownerApiKey && ownerApiKey !== apiKey) {
      console.warn(
        `Session ${sessionId} does not belong to API-Key ${apiKey}. Skipping cleanup.`,
      );
      return;
    }

    if (!ownerApiKey) {
      console.warn(
        `No API-Key association found for session ${sessionId}. Proceeding with cleanup.`,
      );
    }

    await cleanupSession(sessionId);
    return;
  }

  const sessions = sessionsByApiKey.get(apiKey);
  if (!sessions || sessions.size === 0) {
    console.log(
      `No active MetaMCP sessions to clean up for API-Key ${apiKey}.`,
    );
    return;
  }

  console.log(
    `Cleaning up MetaMCP API-Key ${apiKey} with ${sessions.size} active session(s).`,
  );

  for (const session of Array.from(sessions)) {
    await cleanupSession(session);
  }
};

// Update last access time for a session
const updateLastAccess = (sessionId: string) => {
  transportLastAccess.set(sessionId, new Date());
};

// Time-based cleanup function for MetaMCP
const performTimeBasedCleanup = async () => {
  console.log("Performing MetaMCP time-based transport cleanup...");
  const now = new Date();
  const sessionsToCleanup: { apiKey: string; sessionId: string }[] = [];

  // Check all tracked sessions for idle timeout
  for (const [sessionId, lastAccess] of transportLastAccess.entries()) {
    const idleTime = now.getTime() - lastAccess.getTime();
    if (idleTime > MAX_IDLE_TIME) {
      const apiKey = sessionToApiKey.get(sessionId);
      if (apiKey) {
        sessionsToCleanup.push({ apiKey, sessionId });
      } else {
        console.warn(
          `Skipping time-based cleanup for session ${sessionId} due to missing API-Key association`,
        );
        transportLastAccess.delete(sessionId);
      }
    }
  }

  // Cleanup idle transports
  for (const { apiKey, sessionId } of sessionsToCleanup) {
    console.log(
      `Cleaning up idle MetaMCP session ${sessionId} for API-Key: ${apiKey}`,
    );
    await cleanupApiKey(apiKey, sessionId);
  }

  console.log(
    `MetaMCP time-based cleanup completed. Cleaned up ${sessionsToCleanup.length} idle transport(s).`,
  );
};

// Start time-based cleanup timer for MetaMCP
const cleanupTimer = setInterval(performTimeBasedCleanup, CLEANUP_INTERVAL);
cleanupTimer.unref?.();

metamcpRouter.get("/:uuid/mcp", async (req, res) => {
  const namespaceUuid = req.params.uuid;
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    res.status(401).end("API-Key required");
    return;
  }

  // Validate API key and get authentication context
  const authContext = await validateApiKeyAndGetContext(apiKey);
  if (!authContext) {
    res.status(401).end("Invalid API-Key");
    return;
  }
  // console.log(
  //   `Received GET message for MetaMCP namespace ${namespaceUuid} API-Key ${apiKey}`,
  // );
  try {
    const headerSessionId = normalizeSessionId(
      req.headers["mcp-session-id"] as string | string[] | undefined,
    );
    const querySessionId = normalizeSessionId(
      req.query.sessionId as string | string[] | undefined,
    );
    const sessionId = headerSessionId ?? querySessionId;

    if (!sessionId) {
      res.status(400).end("Session ID required");
      return;
    }

    const sessionOwner = sessionToApiKey.get(sessionId);
    if (sessionOwner && sessionOwner !== apiKey) {
      res.status(403).end("Session does not belong to the provided API-Key");
      return;
    }

    const transport = webAppTransports.get(
      sessionId,
    ) as StreamableHTTPServerTransport;
    if (!transport) {
      res.status(404).end("Transport not found for session");
      return;
    }

    console.log(
      `Handling MetaMCP Streamable HTTP request for namespace ${namespaceUuid} session ${sessionId}`,
    );

    updateLastAccess(sessionId);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error in MetaMCP GET /mcp route:", error);
    res.status(500).json(error);
  }
});

metamcpRouter.delete("/:uuid/mcp", async (req, res) => {
  const namespaceUuid = req.params.uuid;
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    res.status(401).end("API-Key required");
    return;
  }

  // Validate API key and get authentication context
  const authContext = await validateApiKeyAndGetContext(apiKey);
  if (!authContext) {
    res.status(401).end("Invalid API-Key");
    return;
  }

  const headerSessionId = normalizeSessionId(
    req.headers["mcp-session-id"] as string | string[] | undefined,
  );
  const querySessionId = normalizeSessionId(
    req.query.sessionId as string | string[] | undefined,
  );
  const sessionId = headerSessionId ?? querySessionId;

  console.log(
    `Received DELETE message for MetaMCP namespace ${namespaceUuid} API-Key ${authContext.keyUuid}${
      sessionId ? ` session ${sessionId}` : ""
    }`,
  );

  try {
    await cleanupApiKey(apiKey, sessionId);
    if (sessionId) {
      console.log(
        `MetaMCP session ${sessionId} for API-Key ${authContext.keyUuid} cleaned up successfully`,
      );
    } else {
      console.log(
        `MetaMCP API-Key ${authContext.keyUuid} cleaned up successfully`,
      );
    }
    res.status(200).end();
  } catch (error) {
    console.error("Error in MetaMCP /mcp DELETE route:", error);
    res.status(500).json(error);
  }
});

metamcpRouter.get("/:uuid/sse", async (req, res) => {
  const namespaceUuid = req.params.uuid;
  const includeInactiveServers = req.query.includeInactiveServers === "true";
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    res.status(401).end("API-Key required");
    return;
  }

  // Validate API key and get authentication context
  const authContext = await validateApiKeyAndGetContext(apiKey);
  if (!authContext) {
    res.status(401).end("Invalid API-Key");
    return;
  }

  try {
    console.log(
      `New MetaMCP SSE connection request for namespace ${namespaceUuid}, includeInactiveServers: ${includeInactiveServers}`,
    );

    const webAppTransport = new SSEServerTransport(
      `/mcp-proxy/metamcp/${namespaceUuid}/message`,
      res,
    );
    const sessionId = webAppTransport.sessionId;
    res.setHeader("mcp-session-id", sessionId);
    console.log(
      `Created MetaMCP SSE transport for API key ${authContext.keyUuid} with session ${sessionId}`,
    );

    // Create MetaMCP server instance with API key authentication
    const mcpServerInstance = await createMetaMcpServer(
      namespaceUuid,
      apiKey,
      authContext.keyUuid,
      authContext.userId,
      includeInactiveServers,
    );
    console.log(
      `Created MetaMCP server instance for API key ${authContext.keyUuid}`,
    );

    webAppTransports.set(sessionId, webAppTransport);
    metamcpServers.set(sessionId, mcpServerInstance);
    registerSession(apiKey, sessionId);
    updateLastAccess(sessionId);

    // Handle cleanup when connection closes
    res.on("close", async () => {
      console.log(
        `MetaMCP SSE connection closed for API key ${authContext.keyUuid} session ${sessionId}`,
      );
      await cleanupApiKey(apiKey, sessionId);
    });

    try {
      await mcpServerInstance.server.connect(webAppTransport);
    } catch (error) {
      await cleanupApiKey(apiKey, sessionId);
      throw error;
    }
  } catch (error) {
    console.error("Error in MetaMCP /sse route:", error);
    res.status(500).json(error);
  }
});

metamcpRouter.post("/:uuid/message", async (req, res) => {
  // const namespaceUuid = req.params.uuid;
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    res.status(401).end("API-Key required");
    return;
  }

  // Validate API key and get authentication context
  const authContext = await validateApiKeyAndGetContext(apiKey);
  if (!authContext) {
    res.status(401).end("Invalid API-Key");
    return;
  }

  try {
    // console.log(
    //   `Received POST message for MetaMCP namespace ${namespaceUuid} API-Key ${authContext.keyUuid}`,
    // );

    const sessionId = normalizeSessionId(
      req.query.sessionId as string | string[] | undefined,
    );
    if (!sessionId) {
      res.status(400).end("Session ID required");
      return;
    }

      const sessionOwner = sessionToApiKey.get(sessionId);
      if (sessionOwner && sessionOwner !== apiKey) {
        res.status(403).end("Session does not belong to the provided API-Key");
        return;
      }

    const transport = webAppTransports.get(sessionId) as SSEServerTransport;
    if (!transport) {
      res.status(404).end("Transport not found for session");
      return;
    }
    updateLastAccess(sessionId);
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Error in MetaMCP /message route:", error);
    res.status(500).json(error);
  }
});

metamcpRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "metamcp",
  });
});

metamcpRouter.get("/info", (req, res) => {
  res.json({
    service: "metamcp",
    version: "1.0.0",
    description: "MetaMCP unified MCP proxy service",
  });
});

export default metamcpRouter;
