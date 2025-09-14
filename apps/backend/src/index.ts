import express from "express";

import { auth } from "./auth";
import { pool } from "./db";
import { toolResponseCache } from "./lib/caching/tool-response-cache";
import { logger } from "./lib/logging/logfire";
import { metaMcpServerPool } from "./lib/metamcp/metamcp-server-pool";
import { mcpServerPool } from "./lib/metamcp/mcp-server-pool";
import { initializeIdleServers } from "./lib/startup";
import mcpProxyRouter from "./routers/mcp-proxy";
import oauthRouter from "./routers/oauth";
import publicEndpointsRouter from "./routers/public-metamcp";
import trpcRouter from "./routers/trpc";

const app = express();

// Global JSON middleware for non-proxy routes
app.use((req, res, next) => {
  if (req.path.startsWith("/mcp-proxy/") || req.path.startsWith("/metamcp/")) {
    // Skip JSON parsing for all MCP proxy routes and public endpoints to allow raw stream access
    next();
  } else {
    express.json({ limit: "50mb" })(req, res, next);
  }
});

// Mount OAuth metadata endpoints at root level for .well-known discovery
app.use(oauthRouter);

// Mount better-auth routes by calling auth API directly
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api/auth")) {
    try {
      // Create a web Request object from Express request
      const url = new URL(req.url, `http://${req.headers.host}`);
      const headers = new Headers();

      // Copy headers from Express request
      Object.entries(req.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value[0] : value);
        }
      });

      // Create Request object
      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body:
          req.method !== "GET" && req.method !== "HEAD"
            ? JSON.stringify(req.body)
            : undefined,
      });

      // Call better-auth directly
      const response = await auth.handler(request);

      // Convert Response back to Express response
      res.status(response.status);

      // Copy headers
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // Send body
      const body = await response.text();
      res.send(body);
    } catch (error) {
      console.error("Auth route error:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  next();
});

// Mount public endpoints routes (must be before JSON middleware to handle raw streams)
app.use("/metamcp", publicEndpointsRouter);

// Mount MCP proxy routes
app.use("/mcp-proxy", mcpProxyRouter);

// Mount tRPC routes
app.use("/trpc", trpcRouter);

// Admin endpoint to reconnect Redis
app.post("/admin/redis/reconnect", async (req, res) => {
  try {
    logger.info("Admin Redis reconnection requested");
    
    const success = await toolResponseCache.reconnectRedis();
    const status = await toolResponseCache.getStatus();
    
    res.json({
      success,
      message: success ? "Redis reconnection successful" : "Redis reconnection failed",
      redis: {
        connected: status.redisConnected,
        status: status.status
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Admin Redis reconnection failed", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(32009, '0.0.0.0', async () => {
  console.log(`Server is running on port 32009`);
  console.log(`Auth routes available at: http://localhost:32009/api/auth`);
  console.log(
    `Public MetaMCP endpoints available at: http://localhost:32009/metamcp`,
  );
  console.log(
    `MCP Proxy routes available at: http://localhost:32009/mcp-proxy`,
  );
  console.log(`tRPC routes available at: http://localhost:32009/trpc`);

  // Wait a moment for the server to be fully ready to handle incoming connections,
  // then initialize idle servers (prevents connection errors when MCP servers connect back)
  console.log(
    "Waiting for server to be fully ready before initializing idle servers...",
  );
  await new Promise((resolve) => setTimeout(resolve, 3000)).then(
    initializeIdleServers,
  );
});

app.get("/health", async (req, res) => {
  try {
    // Collect performance metrics from all components
    const [cacheStatus, poolStatus, mcpPoolStatus] = await Promise.all([
      toolResponseCache.getStatus(),
      pool.totalCount ? {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingCount: pool.waitingCount
      } : { error: "Pool metrics unavailable" },
      mcpServerPool.getPoolStatus()
    ]);
    
    const metaMcpPoolStatus = metaMcpServerPool.getPoolStatus();
    
    // Calculate overall system health
    const isHealthy = 
      cacheStatus.status !== 'error' &&
      typeof poolStatus.totalConnections === 'number' &&
      poolStatus.totalConnections > 0;
    
    const response = {
      status: isHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      metrics: {
        cache: {
          status: cacheStatus.status,
          hitRate: cacheStatus.hitRate,
          totalEntries: cacheStatus.totalEntries,
          memoryUsageMB: cacheStatus.memoryUsageMB,
          redisConnected: cacheStatus.redisConnected
        },
        database: {
          pool: poolStatus
        },
        mcpServers: {
          idle: mcpPoolStatus.idle,
          active: mcpPoolStatus.active,
          activeSessionIds: mcpPoolStatus.activeSessionIds.length
        },
        metaMcpServers: {
          idle: metaMcpPoolStatus.idle,
          active: metaMcpPoolStatus.active,
          activeSessionIds: metaMcpPoolStatus.activeSessionIds.length
        },
        memory: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      }
    };
    
    // Log health check with detailed metrics
    logger.info("Health check performed", {
      status: response.status,
      cacheHitRate: cacheStatus.hitRate,
      activeConnections: poolStatus.totalConnections,
      mcpSessions: mcpPoolStatus.active + metaMcpPoolStatus.active
    });
    
    res.status(isHealthy ? 200 : 503).json(response);
  } catch (error) {
    logger.error("Health check failed", error);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: "Health check failed"
    });
  }
});

// Detailed performance metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    const [cacheStatus, mcpPoolStatus] = await Promise.all([
      toolResponseCache.getStatus(),
      mcpServerPool.getPoolStatus()
    ]);
    
    const metaMcpPoolStatus = metaMcpServerPool.getPoolStatus();
    const memUsage = process.memoryUsage();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      cache: {
        hitRate: cacheStatus.hitRate,
        totalEntries: cacheStatus.totalEntries,
        memoryUsageMB: cacheStatus.memoryUsageMB,
        redisConnected: cacheStatus.redisConnected,
        status: cacheStatus.status
      },
      pools: {
        database: {
          total: pool.totalCount || 0,
          idle: pool.idleCount || 0,
          waiting: pool.waitingCount || 0
        },
        mcpServers: {
          idle: mcpPoolStatus.idle,
          active: mcpPoolStatus.active,
          sessions: mcpPoolStatus.activeSessionIds.length
        },
        metaMcpServers: {
          idle: metaMcpPoolStatus.idle,
          active: metaMcpPoolStatus.active,
          sessions: metaMcpPoolStatus.activeSessionIds.length
        }
      },
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform
      }
    };
    
    res.json(metrics);
  } catch (error) {
    logger.error("Metrics endpoint failed", error);
    res.status(500).json({
      error: "Failed to collect metrics",
      timestamp: new Date().toISOString()
    });
  }
});
