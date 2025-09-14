import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
} from "@modelcontextprotocol/sdk/types.js";

import { logger } from "../logging/logfire";
import { ToolCacheKey, toolResponseCache } from "./tool-response-cache";

export interface CachedMcpProxyConfig {
  serverUuid: string;
  namespaceUuid?: string;
  enableCaching?: boolean;
}

/**
 * MCP Cache Middleware - Intercepts tool calls and implements caching
 *
 * Implements intelligent caching for MCP tool responses to reduce latency
 * and server load. Cache behavior is configurable per tool type.
 */
export class McpCacheMiddleware {
  private config: CachedMcpProxyConfig;

  constructor(config: CachedMcpProxyConfig) {
    this.config = config;
  }

  /**
   * Check if a message is a cacheable tool call
   */
  private isCacheableToolCall(
    message: JSONRPCMessage,
  ): message is JSONRPCRequest {
    return (
      message &&
      typeof message === "object" &&
      "method" in message &&
      "params" in message &&
      message.method === "tools/call" &&
      message.params &&
      typeof message.params === "object" &&
      "name" in message.params
    );
  }

  /**
   * Check if a message is a tool response
   */
  private isToolResponse(message: JSONRPCMessage): message is JSONRPCResponse {
    return (
      message &&
      typeof message === "object" &&
      "result" in message &&
      !("method" in message)
    );
  }

  /**
   * Generate cache key from tool call request
   */
  private generateCacheKey(request: JSONRPCRequest): ToolCacheKey {
    const params = request.params as any;
    return {
      toolName: params.name,
      serverUuid: this.config.serverUuid,
      parameters: params.arguments || {},
      namespaceUuid: this.config.namespaceUuid,
    };
  }

  /**
   * Check if tool should be cached based on its characteristics
   */
  private shouldCacheTool(toolName: string): boolean {
    // Skip caching for tools that modify state
    const noCacheTools = [
      "create-secret",
      "update-secret",
      "delete-secret",
      "execute_task",
      "split_tasks",
      "verify_task",
      "update_task",
      "delete_task",
      "clear_all_tasks",
    ];

    return !noCacheTools.includes(toolName);
  }

  /**
   * Wrap transport with caching middleware
   */
  wrapTransport(originalTransport: Transport): Transport {
    if (!this.config.enableCaching) {
      return originalTransport;
    }

    // Track pending requests for cache population
    const pendingRequests = new Map<string | number, ToolCacheKey>();

    return {
      // Preserve original transport interface
      async start() {
        return originalTransport.start();
      },

      async close() {
        return originalTransport.close();
      },

      // Intercept outbound messages (to server) for cache checks
      async send(message: JSONRPCMessage): Promise<void> {
        // Check if this is a cacheable tool call
        if (this.isCacheableToolCall(message)) {
          const cacheKey = this.generateCacheKey(message);

          // Skip caching for non-cacheable tools
          if (!this.shouldCacheTool(cacheKey.toolName)) {
            return originalTransport.send(message);
          }

          try {
            // Try to get cached response
            const cachedResponse = await toolResponseCache.get(cacheKey);

            if (cachedResponse) {
              logger.debug("Serving tool response from cache", {
                toolName: cacheKey.toolName,
                serverUuid: cacheKey.serverUuid,
                requestId: message.id,
              });

              // Send cached response directly to original transport's onmessage handler
              const response: JSONRPCResponse = {
                jsonrpc: "2.0",
                id: message.id,
                result: cachedResponse,
              };

              // Emit cached response immediately
              if (originalTransport.onmessage) {
                originalTransport.onmessage(response);
              }

              return; // Don't forward request to server
            }

            // Cache miss - track request for response caching
            if (message.id) {
              pendingRequests.set(message.id, cacheKey);
            }
          } catch (error) {
            logger.error(
              "Cache check failed, proceeding without cache",
              error,
              {
                toolName: cacheKey.toolName,
                serverUuid: cacheKey.serverUuid,
              },
            );
          }
        }

        // Forward to original transport
        return originalTransport.send(message);
      },

      // Preserve onmessage handler chain and intercept responses
      set onmessage(handler) {
        originalTransport.onmessage = async (message: JSONRPCMessage) => {
          // Check if this is a tool response we should cache
          if (this.isToolResponse(message) && message.id) {
            const cacheKey = pendingRequests.get(message.id);

            if (cacheKey && message.result) {
              try {
                // Cache the successful response
                await toolResponseCache.set(cacheKey, message.result);

                logger.debug("Cached tool response", {
                  toolName: cacheKey.toolName,
                  serverUuid: cacheKey.serverUuid,
                  requestId: message.id,
                });
              } catch (error) {
                logger.error("Failed to cache tool response", error, {
                  toolName: cacheKey.toolName,
                  serverUuid: cacheKey.serverUuid,
                });
              } finally {
                // Clean up pending request
                pendingRequests.delete(message.id);
              }
            }
          }

          // Forward to original handler
          if (handler) {
            handler(message);
          }
        };
      },

      get onmessage() {
        return originalTransport.onmessage;
      },

      // Preserve other transport properties
      set onclose(handler) {
        originalTransport.onclose = handler;
      },

      get onclose() {
        return originalTransport.onclose;
      },

      set onerror(handler) {
        originalTransport.onerror = handler;
      },

      get onerror() {
        return originalTransport.onerror;
      },
    };
  }
}
