import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, type SpyInstance, vi } from "vitest";

const validateApiKeyMock = vi.fn<
  [string],
  Promise<{ valid: boolean; user_id?: string | null; key_uuid?: string }>
>();
const connectSpies: SpyInstance[] = [];
const cleanupMocks: Array<ReturnType<typeof vi.fn>> = [];

const mockCreateServer = vi.fn(
  async (
    namespaceUuid: string,
    apiKey: string,
    keyUuid: string,
    userId?: string,
    _includeInactiveServers: boolean = false,
  ) => {
    const server = new Server(
      {
        name: `test-server-${namespaceUuid}`,
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    const originalConnect = server.connect.bind(server);
    const connectSpy = vi
      .spyOn(server, "connect")
      .mockImplementation(async (transport) => {
        await originalConnect(transport);
      });
    connectSpies.push(connectSpy);

    const cleanupMock = vi.fn(async () => {});
    cleanupMocks.push(cleanupMock);

    return {
      server,
      cleanup: cleanupMock,
    };
  },
);

vi.mock("../../middleware/better-auth-mcp.middleware", () => ({
  betterAuthMcpMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

vi.mock("../../db/repositories/api-keys.repo", () => ({
  ApiKeysRepository: class {
    validateApiKey = validateApiKeyMock;
  },
}));

vi.mock("../../lib/metamcp/index", () => ({
  createServer: mockCreateServer,
}));

const { default: metamcpRouter } = await import("./metamcp");

const parseSseJsonMessages = (payload: string): Record<string, unknown>[] => {
  const trimmed = payload.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{")) {
    return [JSON.parse(trimmed) as Record<string, unknown>];
  }

  return trimmed
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const dataLine = chunk
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) {
        return null;
      }
      const jsonText = dataLine.slice("data: ".length);
      return JSON.parse(jsonText) as Record<string, unknown>;
    })
    .filter((value): value is Record<string, unknown> => value !== null);
};

describe("MetaMCP streamable HTTP transport", () => {
  beforeEach(() => {
    validateApiKeyMock.mockReset();
    validateApiKeyMock.mockResolvedValue({
      valid: true,
      key_uuid: "test-key-uuid",
      user_id: "user-123",
    });
    mockCreateServer.mockClear();
    connectSpies.splice(0, connectSpies.length);
    cleanupMocks.splice(0, cleanupMocks.length);
  });

  it("completes handshake and handles sequential Streamable HTTP requests", async () => {
    const app = express();
    app.use("/mcp-proxy/metamcp", metamcpRouter);

    const namespaceUuid = "ns-123";

    const initPayload = {
      jsonrpc: "2.0" as const,
      id: "1",
      method: "initialize",
      params: {
        protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "0.1.0",
        },
      },
    };

    const initResponse = await request(app)
      .post(`/mcp-proxy/metamcp/${namespaceUuid}/mcp`)
      .set("x-api-key", "test-api-key")
      .set("accept", "application/json, text/event-stream")
      .set("content-type", "application/json")
      .send(JSON.stringify(initPayload));

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers["mcp-session-id"] as string;
    expect(sessionId).toBeTruthy();
    const initMessages = parseSseJsonMessages(initResponse.text);
    expect(initMessages.length).toBeGreaterThan(0);
    expect(initMessages.at(-1)).toHaveProperty("result.serverInfo.name");
    expect(mockCreateServer).toHaveBeenCalledTimes(1);
    expect(connectSpies[0]?.mock.calls.length).toBeGreaterThan(0);

    const pingPayload = {
      jsonrpc: "2.0" as const,
      id: "2",
      method: "ping",
    };

    const pingResponse = await request(app)
      .post(`/mcp-proxy/metamcp/${namespaceUuid}/mcp`)
      .set("x-api-key", "test-api-key")
      .set("mcp-session-id", sessionId)
      .set("accept", "application/json, text/event-stream")
      .set("content-type", "application/json")
      .send(JSON.stringify(pingPayload));

    expect(pingResponse.status).toBe(200);
    expect(pingResponse.headers["mcp-session-id"]).toBe(sessionId);
    const pingMessages = parseSseJsonMessages(pingResponse.text);
    expect(pingMessages.length).toBeGreaterThan(0);
    expect(pingMessages.at(-1)).toHaveProperty("result");

    const secondPing = await request(app)
      .post(`/mcp-proxy/metamcp/${namespaceUuid}/mcp`)
      .set("x-api-key", "test-api-key")
      .set("mcp-session-id", sessionId)
      .set("accept", "application/json, text/event-stream")
      .set("content-type", "application/json")
      .send(JSON.stringify(pingPayload));

    expect(secondPing.status).toBe(200);
    expect(secondPing.headers["mcp-session-id"]).toBe(sessionId);
    const secondPingMessages = parseSseJsonMessages(secondPing.text);
    expect(secondPingMessages.length).toBeGreaterThan(0);
    expect(secondPingMessages.at(-1)).toHaveProperty("result");

    const deleteResponse = await request(app)
      .delete(`/mcp-proxy/metamcp/${namespaceUuid}/mcp`)
      .set("x-api-key", "test-api-key")
      .set("mcp-session-id", sessionId);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.headers["mcp-session-id"]).toBe(sessionId);
    expect(cleanupMocks[0]).toHaveBeenCalled();

    const resumeAttempt = await request(app)
      .post(`/mcp-proxy/metamcp/${namespaceUuid}/mcp`)
      .set("x-api-key", "test-api-key")
      .set("mcp-session-id", sessionId)
      .set("accept", "application/json, text/event-stream")
      .set("content-type", "application/json")
      .send(JSON.stringify(pingPayload));

    expect(resumeAttempt.status).toBe(404);
  });
});
