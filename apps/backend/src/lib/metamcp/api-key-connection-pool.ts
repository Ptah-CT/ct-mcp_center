import { ServerParameters } from "@repo/zod-types";

import { ConnectedClient, connectMetaMcpClient } from "./client";
import { serverErrorTracker } from "./server-error-tracker";

export interface ApiKeyConnection {
  apiKey: string;
  connections: Map<string, ConnectedClient>; // serverUuid -> ConnectedClient
  lastAccess: Date;
  createdAt: Date;
  metadata: {
    userId?: string;
    keyUuid: string;
    serverCount: number;
  };
}

export interface ApiKeyPoolStatus {
  totalConnections: number;
  totalApiKeys: number;
  connectionsPerApiKey: Record<string, number>;
  oldestConnection?: Date;
  newestConnection?: Date;
  totalServers: number;
}

export class ApiKeyConnectionPool {
  // Singleton instance
  private static instance: ApiKeyConnectionPool | null = null;

  // Active connections: apiKey -> ApiKeyConnection
  private activeConnections: Map<string, ApiKeyConnection> = new Map();

  // Server parameters cache: serverUuid -> ServerParameters
  private serverParamsCache: Map<string, ServerParameters> = new Map();

  // Cleanup configuration
  private readonly maxIdleTime = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  private readonly cleanupIntervalTime = 30 * 60 * 1000; // 30 minutes in milliseconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Connection limits
  private readonly maxConnectionsPerApiKey = 50;
  private readonly maxGlobalConnections = 100;

  private constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ApiKeyConnectionPool {
    if (!ApiKeyConnectionPool.instance) {
      ApiKeyConnectionPool.instance = new ApiKeyConnectionPool();
    }
    return ApiKeyConnectionPool.instance;
  }

  /**
   * Get or create a connection for a specific API key and server
   */
  async getConnection(
    apiKey: string,
    serverUuid: string,
    params: ServerParameters,
    keyUuid: string,
    userId?: string,
  ): Promise<ConnectedClient> {
    // Update server params cache
    this.serverParamsCache.set(serverUuid, params);

    // Get or create API key connection entry
    let apiKeyConnection = this.activeConnections.get(apiKey);
    if (!apiKeyConnection) {
      // Check global connection limit before creating new API key entry
      const totalConnections = this.getTotalConnectionCount();
      if (totalConnections >= this.maxGlobalConnections) {
        throw new Error(
          `Global connection limit reached (${this.maxGlobalConnections})`,
        );
      }

      apiKeyConnection = {
        apiKey,
        connections: new Map(),
        lastAccess: new Date(),
        createdAt: new Date(),
        metadata: {
          userId,
          keyUuid,
          serverCount: 0,
        },
      };
      this.activeConnections.set(apiKey, apiKeyConnection);
      console.log(`Created new API key connection entry for key ${keyUuid}`);
    }

    // Check if we already have a connection to this server for this API key
    const existingConnection = apiKeyConnection.connections.get(serverUuid);
    if (existingConnection) {
      // Update last access time
      apiKeyConnection.lastAccess = new Date();
      console.log(
        `Reusing existing connection for API key ${keyUuid}, server ${serverUuid}`,
      );
      return existingConnection;
    }

    // Check per-API-key connection limit
    if (apiKeyConnection.connections.size >= this.maxConnectionsPerApiKey) {
      throw new Error(
        `Per-API-key connection limit reached (${this.maxConnectionsPerApiKey})`,
      );
    }

    // Create new connection
    const newClient = await this.createNewConnection(params, apiKey, keyUuid);
    if (!newClient) {
      throw new Error(`Failed to create connection to server ${serverUuid}`);
    }

    // Add connection to API key entry
    apiKeyConnection.connections.set(serverUuid, newClient);
    apiKeyConnection.lastAccess = new Date();
    apiKeyConnection.metadata.serverCount = apiKeyConnection.connections.size;

    console.log(
      `Created new connection for API key ${keyUuid}, server ${serverUuid} (${params.name})`,
    );

    return newClient;
  }

  /**
   * Create a new connection for a server
   */
  private async createNewConnection(
    params: ServerParameters,
    apiKey: string,
    keyUuid: string,
  ): Promise<ConnectedClient | undefined> {
    console.log(
      `Creating new connection for server ${params.name} (${params.uuid}) with API key ${keyUuid}`,
    );

    const connectedClient = await connectMetaMcpClient(
      params,
      (exitCode, signal) => {
        console.log(
          `Crash handler callback called for server ${params.name} (${params.uuid}) with API key ${keyUuid}`,
        );

        // Handle process crash
        this.handleServerCrash(
          params.uuid,
          apiKey,
          keyUuid,
          exitCode,
          signal,
        ).catch((error) => {
          console.error(
            `Error handling server crash for ${params.uuid} with API key ${keyUuid}:`,
            error,
          );
        });
      },
    );

    if (!connectedClient) {
      return undefined;
    }

    return connectedClient;
  }

  /**
   * Cleanup all connections for a specific API key
   */
  async cleanupApiKey(apiKey: string): Promise<void> {
    const apiKeyConnection = this.activeConnections.get(apiKey);
    if (!apiKeyConnection) {
      return;
    }

    console.log(
      `Cleaning up ${apiKeyConnection.connections.size} connections for API key ${apiKeyConnection.metadata.keyUuid}`,
    );

    // Cleanup all connections for this API key
    await Promise.allSettled(
      Array.from(apiKeyConnection.connections.values()).map(async (client) => {
        await client.cleanup();
      }),
    );

    // Remove from active connections
    this.activeConnections.delete(apiKey);

    console.log(
      `Cleaned up API key connection ${apiKeyConnection.metadata.keyUuid}`,
    );
  }

  /**
   * Perform time-based cleanup of idle connections
   */
  async performTimeBasedCleanup(): Promise<void> {
    const now = new Date();
    const keysToCleanup: string[] = [];

    // Find API keys that have exceeded the idle time
    this.activeConnections.forEach((apiKeyConnection, apiKey) => {
      const timeSinceLastAccess =
        now.getTime() - apiKeyConnection.lastAccess.getTime();

      if (timeSinceLastAccess > this.maxIdleTime) {
        keysToCleanup.push(apiKey);
        console.log(
          `API key ${apiKeyConnection.metadata.keyUuid} idle for ${Math.floor(timeSinceLastAccess / 1000 / 60)} minutes, scheduling for cleanup`,
        );
      }
    });

    // Cleanup idle API keys
    for (const apiKey of keysToCleanup) {
      try {
        await this.cleanupApiKey(apiKey);
      } catch (error) {
        console.error(`Error during cleanup of API key ${apiKey}:`, error);
      }
    }

    if (keysToCleanup.length > 0) {
      console.log(
        `Time-based cleanup completed: removed ${keysToCleanup.length} idle API key connections`,
      );
    }
  }

  /**
   * Get pool status for monitoring
   */
  getPoolStatus(): ApiKeyPoolStatus {
    const connectionsPerApiKey: Record<string, number> = {};
    let oldestConnection: Date | undefined;
    let newestConnection: Date | undefined;
    let totalServers = 0;

    this.activeConnections.forEach((apiKeyConnection, apiKey) => {
      connectionsPerApiKey[apiKeyConnection.metadata.keyUuid] =
        apiKeyConnection.connections.size;
      totalServers += apiKeyConnection.connections.size;

      // Track oldest and newest connections
      if (!oldestConnection || apiKeyConnection.createdAt < oldestConnection) {
        oldestConnection = apiKeyConnection.createdAt;
      }
      if (!newestConnection || apiKeyConnection.createdAt > newestConnection) {
        newestConnection = apiKeyConnection.createdAt;
      }
    });

    return {
      totalConnections: this.activeConnections.size,
      totalApiKeys: this.activeConnections.size,
      connectionsPerApiKey,
      oldestConnection,
      newestConnection,
      totalServers,
    };
  }

  /**
   * Get total connection count across all API keys
   */
  private getTotalConnectionCount(): number {
    let total = 0;
    this.activeConnections.forEach((apiKeyConnection) => {
      total += apiKeyConnection.connections.size;
    });
    return total;
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performTimeBasedCleanup();
      } catch (error) {
        console.error("Error during time-based cleanup:", error);
      }
    }, this.cleanupIntervalTime);

    console.log(
      `Started API key connection pool cleanup timer (${this.cleanupIntervalTime / 1000 / 60} minute intervals)`,
    );
  }

  /**
   * Stop the cleanup timer (for graceful shutdown)
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log("Stopped API key connection pool cleanup timer");
    }
  }

  /**
   * Handle server process crash
   */
  private async handleServerCrash(
    serverUuid: string,
    apiKey: string,
    keyUuid: string,
    exitCode: number | null,
    signal: string | null,
  ): Promise<void> {
    console.warn(
      `Handling server crash for ${serverUuid} with API key ${keyUuid}`,
    );

    // Record the crash in the error tracker
    await serverErrorTracker.recordServerCrash(serverUuid, exitCode, signal);

    // Clean up the specific connection for this server and API key
    await this.cleanupServerConnection(serverUuid, apiKey);
  }

  /**
   * Clean up a specific server connection for an API key
   */
  private async cleanupServerConnection(
    serverUuid: string,
    apiKey: string,
  ): Promise<void> {
    const apiKeyConnection = this.activeConnections.get(apiKey);
    if (!apiKeyConnection) {
      return;
    }

    const connection = apiKeyConnection.connections.get(serverUuid);
    if (connection) {
      try {
        await connection.cleanup();
        console.log(
          `Cleaned up crashed server connection ${serverUuid} for API key ${apiKeyConnection.metadata.keyUuid}`,
        );
      } catch (error) {
        console.error(
          `Error cleaning up crashed server connection ${serverUuid}:`,
          error,
        );
      }

      // Remove from connections map
      apiKeyConnection.connections.delete(serverUuid);
      apiKeyConnection.metadata.serverCount = apiKeyConnection.connections.size;

      // If no connections left for this API key, remove it entirely
      if (apiKeyConnection.connections.size === 0) {
        this.activeConnections.delete(apiKey);
        console.log(
          `Removed empty API key connection ${apiKeyConnection.metadata.keyUuid}`,
        );
      }
    }
  }

  /**
   * Cleanup all connections and stop cleanup timer (for graceful shutdown)
   */
  async cleanupAll(): Promise<void> {
    console.log("Cleaning up all API key connections");

    // Stop cleanup timer
    this.stopCleanupTimer();

    // Cleanup all API key connections
    const cleanupPromises = Array.from(this.activeConnections.keys()).map(
      (apiKey) => this.cleanupApiKey(apiKey),
    );

    await Promise.allSettled(cleanupPromises);

    // Clear caches
    this.serverParamsCache.clear();

    console.log("Cleaned up all API key connections");
  }

  /**
   * Get active API keys (for debugging/monitoring)
   */
  getActiveApiKeys(): string[] {
    const keys: string[] = [];
    this.activeConnections.forEach((conn) => {
      keys.push(conn.metadata.keyUuid);
    });
    return keys;
  }

  /**
   * Get connection details for a specific API key (for debugging/monitoring)
   */
  getApiKeyConnectionDetails(apiKey: string): ApiKeyConnection | undefined {
    return this.activeConnections.get(apiKey);
  }

  /**
   * Check if a server is in error state
   */
  async isServerInErrorState(serverUuid: string): Promise<boolean> {
    return await serverErrorTracker.isServerInErrorState(serverUuid);
  }

  /**
   * Reset error state for a server (e.g., after manual recovery)
   */
  async resetServerErrorState(serverUuid: string): Promise<void> {
    await serverErrorTracker.resetServerErrorState(serverUuid);
    console.log(`Reset error state for server ${serverUuid}`);
  }

  /**
   * Invalidate connections for a specific server across all API keys
   * This should be called when a server's parameters change
   */
  async invalidateServerConnections(
    serverUuid: string,
    params: ServerParameters,
  ): Promise<void> {
    console.log(`Invalidating connections for server ${serverUuid}`);

    // Update server params cache
    this.serverParamsCache.set(serverUuid, params);

    // Find and cleanup connections to this server across all API keys
    const cleanupPromises: Promise<void>[] = [];

    this.activeConnections.forEach((apiKeyConnection, apiKey) => {
      const connection = apiKeyConnection.connections.get(serverUuid);
      if (connection) {
        cleanupPromises.push(
          (async () => {
            try {
              await connection.cleanup();
              apiKeyConnection.connections.delete(serverUuid);
              apiKeyConnection.metadata.serverCount =
                apiKeyConnection.connections.size;
              console.log(
                `Invalidated connection to server ${serverUuid} for API key ${apiKeyConnection.metadata.keyUuid}`,
              );

              // If no connections left for this API key, remove it entirely
              if (apiKeyConnection.connections.size === 0) {
                this.activeConnections.delete(apiKey);
                console.log(
                  `Removed empty API key connection ${apiKeyConnection.metadata.keyUuid}`,
                );
              }
            } catch (error) {
              console.error(
                `Error invalidating connection to server ${serverUuid} for API key ${apiKeyConnection.metadata.keyUuid}:`,
                error,
              );
            }
          })(),
        );
      }
    });

    await Promise.allSettled(cleanupPromises);
    console.log(
      `Completed invalidation of connections for server ${serverUuid}`,
    );
  }

  /**
   * Remove connections for a deleted server across all API keys
   */
  async cleanupServerConnections(serverUuid: string): Promise<void> {
    console.log(`Cleaning up all connections for deleted server ${serverUuid}`);

    // Remove from server params cache
    this.serverParamsCache.delete(serverUuid);

    // Clean up connections across all API keys
    const cleanupPromises: Promise<void>[] = [];

    this.activeConnections.forEach((apiKeyConnection, apiKey) => {
      const connection = apiKeyConnection.connections.get(serverUuid);
      if (connection) {
        cleanupPromises.push(this.cleanupServerConnection(serverUuid, apiKey));
      }
    });

    await Promise.allSettled(cleanupPromises);
    console.log(`Completed cleanup of connections for server ${serverUuid}`);
  }
}

// Create and export singleton instance
export const apiKeyConnectionPool = ApiKeyConnectionPool.getInstance();
