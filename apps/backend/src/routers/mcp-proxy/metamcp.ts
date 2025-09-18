import { randomUUID } from "node:crypto";

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

const getSessionIdFromRequest = (req: express.Request): string | undefined => {
  const sessionHeader = req.headers["mcp-session-id"];
  return Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
};

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
const sseTransportsByApiKey: Map<string, Transport> = new Map<
  string,
  Transport
>(); // Web app transports by API-Key
const streamableHttpSessions: Map<
  string,
  {
    namespaceUuid: string;
    apiKey: string;
    transport: StreamableHTTPServerTransport;
    cleanup: () => Promise<void>;
  }
> = new Map();
const metamcpServers: Map<
  string,
  {
    server: Awaited<ReturnType<typeof createServer>>["server"];
    cleanup: () => Promise<void>;
  }
> = new Map(); // MetaMCP servers by API-Key

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

// API-Key cleanup function with time-based cleanup
const cleanupStreamableSession = async (
  sessionId: string,
  options?: { initiatedByTransport?: boolean },
) => {
  const session = streamableHttpSessions.get(sessionId);
  if (!session) {
    return;
  }

  console.log(
    `Cleaning up MetaMCP Streamable HTTP session ${sessionId} for namespace ${session.namespaceUuid}`,
  );

  streamableHttpSessions.delete(sessionId);
  streamableSessionLastAccess.delete(sessionId);

  try {
    if (!options?.initiatedByTransport) {
      await session.transport.close();
    }
  } catch (error) {
    console.error(
      `Error closing transport for MetaMCP session ${sessionId}:`,
      error,
    );
  }

  try {
    await session.cleanup();
  } catch (error) {
    console.error(
      `Error running cleanup for MetaMCP session ${sessionId}:`,
      error,
    );
  }
};

const cleanupApiKey = async (apiKey: string) => {
  console.log(`Cleaning up MetaMCP API-Key ${apiKey}`);

  // Clean up transport
  const transport = sseTransportsByApiKey.get(apiKey);
  if (transport) {
    sseTransportsByApiKey.delete(apiKey);
    await transport.close();
  }

  // Clean up server instance
  const serverInstance = metamcpServers.get(apiKey);
  if (serverInstance) {
    metamcpServers.delete(apiKey);
    await serverInstance.cleanup();
  }

  const sessionsForApiKey = Array.from(streamableHttpSessions.entries()).filter(
    ([, session]) => session.apiKey === apiKey,
  );

  for (const [sessionId] of sessionsForApiKey) {
    await cleanupStreamableSession(sessionId);
  }

  // Clean up session connections from pool - TODO: Convert to API-Key based cleanup when ApiKeyConnectionPool is implemented
  // For now, we'll skip pool cleanup since we don't have session mapping
};
// Time-based cleanup tracking for MetaMCP
const apiKeyTransportLastAccess: Map<string, Date> = new Map();
const streamableSessionLastAccess: Map<string, Date> = new Map();
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const MAX_IDLE_TIME = 2 * 60 * 60 * 1000; // 2 hours

// Update last access time for an API-Key
const updateApiKeyLastAccess = (apiKey: string) => {
  apiKeyTransportLastAccess.set(apiKey, new Date());
};

const updateSessionLastAccess = (sessionId: string) => {
  streamableSessionLastAccess.set(sessionId, new Date());
};

// Time-based cleanup function for MetaMCP
const performTimeBasedCleanup = async () => {
  console.log("Performing MetaMCP time-based transport cleanup...");
  const now = new Date();
  const keysToCleanup: string[] = [];
  const sessionsToCleanup: string[] = [];

  // Check all tracked API-Keys for idle timeout
  for (const [apiKey, lastAccess] of apiKeyTransportLastAccess.entries()) {
    const idleTime = now.getTime() - lastAccess.getTime();
    if (idleTime > MAX_IDLE_TIME) {
      keysToCleanup.push(apiKey);
    }
  }

  for (const [sessionId, lastAccess] of streamableSessionLastAccess.entries()) {
    const idleTime = now.getTime() - lastAccess.getTime();
    if (idleTime > MAX_IDLE_TIME) {
      sessionsToCleanup.push(sessionId);
    }
  }

  // Cleanup idle transports
  for (const apiKey of keysToCleanup) {
    console.log(`Cleaning up idle MetaMCP transport for API-Key: ${apiKey}`);
    await cleanupApiKey(apiKey);
    apiKeyTransportLastAccess.delete(apiKey);
  }

  for (const sessionId of sessionsToCleanup) {
    console.log(
      `Cleaning up idle MetaMCP Streamable HTTP session: ${sessionId}`,
    );
    await cleanupStreamableSession(sessionId);
  }

  console.log(
    `MetaMCP time-based cleanup completed. Cleaned up ${keysToCleanup.length} idle API-Key transports and ${sessionsToCleanup.length} idle Streamable HTTP sessions.`,
  );
};

// Start time-based cleanup timer for MetaMCP
const cleanupTimer = setInterval(performTimeBasedCleanup, CLEANUP_INTERVAL);
cleanupTimer.unref();

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
  const sessionId = getSessionIdFromRequest(req);

  if (!sessionId) {
    res.status(400).end("mcp-session-id header required");
    return;
  }

  const session = streamableHttpSessions.get(sessionId);
  if (
    !session ||
    session.apiKey !== apiKey ||
    session.namespaceUuid !== namespaceUuid
  ) {
    res
      .status(404)
      .setHeader("mcp-session-id", sessionId)
      .end("Session not found");
    return;
  }

  try {
    updateSessionLastAccess(sessionId);
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error("Error in MetaMCP GET /mcp route:", error);
    res.status(500).json(error);
  }
});

metamcpRouter.post("/:uuid/mcp", async (req, res) => {
  const namespaceUuid = req.params.uuid;
  const includeInactiveServers = req.query.includeInactiveServers === "true";
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    res.status(401).end("API-Key required");
    return;
  }

  const authContext = await validateApiKeyAndGetContext(apiKey);
  if (!authContext) {
    res.status(401).end("Invalid API-Key");
    return;
  }

  const sessionId = getSessionIdFromRequest(req);

  try {
    if (!sessionId) {
      const newSessionId = randomUUID();
      const mcpServerInstance = await createMetaMcpServer(
        namespaceUuid,
        apiKey,
        authContext.keyUuid,
        authContext.userId,
        includeInactiveServers,
      );

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: async (initializedSessionId) => {
          updateSessionLastAccess(initializedSessionId);
        },
        onsessionclosed: async (closedSessionId) => {
          await cleanupStreamableSession(closedSessionId, {
            initiatedByTransport: true,
          });
        },
      });

      streamableHttpSessions.set(newSessionId, {
        namespaceUuid,
        apiKey,
        transport,
        cleanup: mcpServerInstance.cleanup,
      });
      updateSessionLastAccess(newSessionId);

      try {
        await mcpServerInstance.server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        streamableHttpSessions.delete(newSessionId);
        streamableSessionLastAccess.delete(newSessionId);
        try {
          await transport.close();
        } catch (closeError) {
          console.error(
            `Error closing transport for MetaMCP session ${newSessionId}:`,
            closeError,
          );
        }
        await mcpServerInstance.cleanup();
        throw error;
      }
    } else {
      const session = streamableHttpSessions.get(sessionId);
      if (
        !session ||
        session.apiKey !== apiKey ||
        session.namespaceUuid !== namespaceUuid
      ) {
        res
          .status(404)
          .setHeader("mcp-session-id", sessionId)
          .end("Session not found");
        return;
      }

      updateSessionLastAccess(sessionId);
      await session.transport.handleRequest(req, res);
    }
  } catch (error) {
    console.error("Error in MetaMCP POST /mcp route:", error);
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

  const sessionId = getSessionIdFromRequest(req);

  if (sessionId) {
    const session = streamableHttpSessions.get(sessionId);
    if (
      !session ||
      session.apiKey !== apiKey ||
      session.namespaceUuid !== namespaceUuid
    ) {
      res
        .status(404)
        .setHeader("mcp-session-id", sessionId)
        .end("Session not found");
      return;
    }

    try {
      await cleanupStreamableSession(sessionId);
      res.status(200).setHeader("mcp-session-id", sessionId).end();
    } catch (error) {
      console.error(
        "Error cleaning up MetaMCP Streamable HTTP session:",
        error,
      );
      res.status(500).json(error);
    }
    return;
  }

  console.log(
    `Received DELETE message for MetaMCP namespace ${namespaceUuid} API-Key ${authContext.keyUuid}`,
  );

  try {
    await cleanupApiKey(apiKey);
    console.log(
      `MetaMCP API-Key ${authContext.keyUuid} cleaned up successfully`,
    );
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
    console.log("Created MetaMCP SSE transport");

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

    sseTransportsByApiKey.set(apiKey, webAppTransport);
    metamcpServers.set(apiKey, mcpServerInstance);

    // Handle cleanup when connection closes
    res.on("close", async () => {
      console.log(
        `MetaMCP SSE connection closed for API key ${authContext.keyUuid}`,
      );
      await cleanupApiKey(apiKey);
    });

    await mcpServerInstance.server.connect(webAppTransport);
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

    const transport = sseTransportsByApiKey.get(apiKey) as SSEServerTransport;
    if (!transport) {
      res.status(404).end("Transport not found for API-Key");
      return;
    }
    updateApiKeyLastAccess(apiKey);
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
