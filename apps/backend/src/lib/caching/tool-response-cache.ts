import { Redis as UpstashRedis } from "@upstash/redis";
import Redis from "ioredis";

import { logger } from "../logging/logfire";

export interface ToolCacheKey {
  toolName: string;
  serverUuid: string;
  parameters: Record<string, any>;
  namespaceUuid?: string;
}

export interface CachedToolResponse {
  response: any;
  cachedAt: number;
  ttl: number;
  hitCount: number;
}

export interface CacheStatus {
  status: "ok" | "degraded" | "error";
  totalEntries: number;
  memoryUsageMB: number;
  hitRate: number;
  redisConnected: boolean;
}

/**
 * Tool Response Caching System
 *
 * Implements a two-tier caching strategy:
 * 1. In-Memory Cache (L1) - Fast access for frequently used tools
 * 2. Redis Cache (L2) - Distributed cache for scalability (optional)
 *
 * Pattern consistent with AuthRateLimiter for architectural consistency
 */
export class ToolResponseCache {
  // In-memory cache: cacheKey -> CachedToolResponse
  private memoryCache: Map<string, CachedToolResponse> = new Map();

  // Redis client (optional for distributed caching)
  private redis: any = null;

  // Cache statistics
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
  };

  // Configuration
  private readonly maxMemoryEntries: number;
  private readonly defaultTtlSeconds: number;
  private readonly cleanupIntervalMs: number;

  /**
   * Static factory method with fail-fast Redis validation
   */
  static async create(
    maxMemoryEntries: number = 1000,
    defaultTtlSeconds: number = 300,
    cleanupIntervalMs: number = 60000,
  ): Promise<ToolResponseCache> {
    const instance = new ToolResponseCache(
      maxMemoryEntries,
      defaultTtlSeconds,
      cleanupIntervalMs,
      false,
    );
    await instance.initializeRedis();
    instance.startCleanupInterval();

    logger.info("Tool Response Cache initialized", {
      maxMemoryEntries,
      defaultTtlSeconds,
      cleanupIntervalMs,
      redisEnabled: instance.redis !== null,
    });

    return instance;
  }

  constructor(
    maxMemoryEntries: number = 1000,
    defaultTtlSeconds: number = 300,
    cleanupIntervalMs: number = 60000,
    autoStart: boolean = true,
  ) {
    this.maxMemoryEntries = maxMemoryEntries;
    this.defaultTtlSeconds = defaultTtlSeconds;
    this.cleanupIntervalMs = cleanupIntervalMs;

    if (autoStart) {
      // Legacy constructor behavior - initialize asynchronously
      this.initializeRedis().catch((error) => {
        logger.error("Failed to initialize Redis during construction", error);
      });

      this.startCleanupInterval();

      logger.info("Tool Response Cache initialized", {
        maxMemoryEntries,
        defaultTtlSeconds,
        cleanupIntervalMs,
        redisEnabled: this.redis !== null,
      });
    }
  }

  /**
   * Initialize Redis connection if REDIS_URL or Upstash credentials are available
   */
  private async initializeRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl && (!upstashUrl || !upstashToken)) {
      logger.info("Redis not configured - using memory-only cache");
      return;
    }

    try {
      // Prefer Upstash REST if available
      if (upstashUrl && upstashToken) {
        this.redis = new UpstashRedis({
          url: upstashUrl,
          token: upstashToken,
        });
        logger.info("Using Upstash Redis REST API");

        // FAIL FAST: Test connection immediately
        await this.redis.ping();
        logger.info("Upstash Redis connection validated successfully");

        // NOTE: Upstash REST API does not support .on() event handlers
        // Event handlers are only available for traditional TCP connections
      } else {
        // Fallback to traditional Redis with TCP connection
        this.redis = new Redis(redisUrl, {
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });
        logger.info("Using traditional Redis TCP connection");

        // FAIL FAST: Test connection immediately
        await this.redis.ping();
        logger.info("Traditional Redis connection validated successfully");

        // Event handlers only for traditional Redis TCP connections
        this.redis.on("connect", () => {
          logger.info("Redis TCP cache connected successfully");
        });

        this.redis.on("error", (error: Error) => {
          logger.error("Redis TCP cache error", error);
          // FAIL LOUD: Critical Redis errors should be visible
          if (process.env.NODE_ENV === "production") {
            logger.error(
              "CRITICAL: Redis TCP connection lost in production",
              error,
            );
          }
        });
      }
    } catch (error) {
      // FAIL LOUD: Redis is configured but not working
      const errorMessage = `Redis is configured but connection failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error("CRITICAL Redis initialization failure", {
        error: errorMessage,
        upstashConfigured: !!(upstashUrl && upstashToken),
        redisUrlConfigured: !!redisUrl,
        environment: process.env.NODE_ENV || "development",
      });

      // In development: crash to surface the issue immediately
      if (process.env.NODE_ENV !== "production") {
        throw new Error(
          `FAIL FAST: ${errorMessage}. Fix Redis configuration or remove Redis environment variables to use memory-only cache.`,
        );
      }

      // In production: log extensively but don't crash
      logger.error(
        "Production fallback: continuing with memory-only cache",
        error,
      );
      this.redis = null;
    }
  }

  /**
   * Generate cache key from tool cache parameters
   */
  private generateCacheKey(key: ToolCacheKey): string {
    const paramStr = JSON.stringify(
      key.parameters,
      Object.keys(key.parameters).sort(),
    );
    const keyParts = [
      key.serverUuid,
      key.toolName,
      key.namespaceUuid || "default",
      Buffer.from(paramStr).toString("base64").slice(0, 16),
    ];
    return keyParts.join(":");
  }

  /**
   * Get TTL for specific tool type
   */
  private getTtlForTool(toolName: string): number {
    // Smart TTL strategies based on tool characteristics
    const ttlStrategies: Record<string, number> = {
      // Read-only tools - longer cache
      githubGetFileContent: 600,
      "get-library-docs": 1800,
      sql_reference: 3600,
      get_logfire_records_schema: 1800,

      // Dynamic tools - shorter cache
      arbitrary_query: 60,
      list_tasks: 30,
      githubSearchCode: 300,
      get_current_time: 10,

      // State-changing tools - very short cache
      execute_task: 5,
      "create-secret": 0, // No cache
      "update-secret": 0, // No cache
      "delete-secret": 0, // No cache
    };

    return ttlStrategies[toolName] || this.defaultTtlSeconds;
  }

  /**
   * Get cached tool response
   */
  async get(key: ToolCacheKey): Promise<any | null> {
    const cacheKey = this.generateCacheKey(key);
    const now = Date.now();

    // Try L1 Cache (Memory) first
    const memoryCached = this.memoryCache.get(cacheKey);
    if (memoryCached && now - memoryCached.cachedAt < memoryCached.ttl * 1000) {
      memoryCached.hitCount++;
      this.stats.hits++;

      logger.debug("Cache hit (memory)", {
        toolName: key.toolName,
        serverUuid: key.serverUuid,
        hitCount: memoryCached.hitCount,
      });

      return memoryCached.response;
    }

    // Try L2 Cache (Redis) if available
    if (this.redis) {
      try {
        const redisValue = await this.redis.get(`tool-cache:${cacheKey}`);
        if (redisValue) {
          const parsed = JSON.parse(redisValue);
          this.stats.hits++;

          // Promote to L1 cache
          this.memoryCache.set(cacheKey, {
            response: parsed.response,
            cachedAt: parsed.cachedAt,
            ttl: parsed.ttl,
            hitCount: parsed.hitCount + 1,
          });

          logger.debug("Cache hit (redis)", {
            toolName: key.toolName,
            serverUuid: key.serverUuid,
          });

          return parsed.response;
        }
      } catch (error) {
        logger.error("Redis get error", error);
      }
    }

    // Cache miss
    this.stats.misses++;
    logger.debug("Cache miss", {
      toolName: key.toolName,
      serverUuid: key.serverUuid,
    });

    return null;
  }

  /**
   * Cache tool response
   */
  async set(
    key: ToolCacheKey,
    response: any,
    ttlSeconds?: number,
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(key);
    const ttl = ttlSeconds || this.getTtlForTool(key.toolName);

    // Skip caching for zero TTL tools
    if (ttl === 0) {
      return;
    }

    const cachedResponse: CachedToolResponse = {
      response,
      cachedAt: Date.now(),
      ttl,
      hitCount: 0,
    };

    // Store in L1 Cache (Memory)
    this.memoryCache.set(cacheKey, cachedResponse);
    this.stats.sets++;

    // Enforce memory limit
    if (this.memoryCache.size > this.maxMemoryEntries) {
      this.evictOldestEntries();
    }

    // Store in L2 Cache (Redis) if available
    if (this.redis && ttl > 60) {
      // Only cache in Redis for longer TTLs
      try {
        await this.redis.setex(
          `tool-cache:${cacheKey}`,
          ttl,
          JSON.stringify(cachedResponse),
        );
      } catch (error) {
        logger.error("Redis set error", error);
      }
    }

    logger.debug("Tool response cached", {
      toolName: key.toolName,
      serverUuid: key.serverUuid,
      ttl,
      responseSize: JSON.stringify(response).length,
    });
  }

  /**
   * Invalidate cache entries matching pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    let evicted = 0;

    // Invalidate memory cache
    for (const [key, _] of this.memoryCache.entries()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
        evicted++;
      }
    }

    // Invalidate Redis cache
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`tool-cache:*${pattern}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          evicted += keys.length;
        }
      } catch (error) {
        logger.error("Redis invalidate error", error);
      }
    }

    logger.info("Cache invalidated", { pattern, evicted });
  }

  /**
   * Reconnect Redis with current environment variables
   */
  async reconnectRedis(): Promise<boolean> {
    logger.info("Attempting Redis reconnection...");

    // Close existing connection if any
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch (error) {
        logger.warn("Error closing existing Redis connection", error);
      }
      this.redis = null;
    }

    // Re-initialize with current environment
    try {
      await this.initializeRedis();
      logger.info("Redis reconnection successful", {
        redisEnabled: this.redis !== null,
      });
      return this.redis !== null;
    } catch (error) {
      logger.error("Redis reconnection failed", error);
      return false;
    }
  }

  /**
   * Get cache status for monitoring
   */
  async getStatus(): Promise<CacheStatus> {
    const totalHits = this.stats.hits;
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

    // Calculate memory usage estimate
    const memoryUsageBytes = JSON.stringify(
      Array.from(this.memoryCache.entries()),
    ).length;
    const memoryUsageMB =
      Math.round((memoryUsageBytes / (1024 * 1024)) * 100) / 100;

    let redisConnected = false;
    if (this.redis) {
      try {
        await this.redis.ping();
        redisConnected = true;
      } catch {
        redisConnected = false;
      }
    }

    return {
      status: hitRate > 0.8 ? "ok" : hitRate > 0.5 ? "degraded" : "error",
      totalEntries: this.memoryCache.size,
      memoryUsageMB,
      hitRate: Math.round(hitRate * 10000) / 100, // Percentage with 2 decimals
      redisConnected,
    };
  }

  /**
   * Evict oldest entries when memory limit is reached
   */
  private evictOldestEntries(): void {
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);

    const toEvict = entries.slice(0, Math.floor(this.maxMemoryEntries * 0.1));
    for (const [key, _] of toEvict) {
      this.memoryCache.delete(key);
      this.stats.evictions++;
    }

    logger.debug("Cache entries evicted", { evicted: toEvict.length });
  }

  /**
   * Start cleanup interval for expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.memoryCache.entries()) {
      if (now - value.cachedAt > value.ttl * 1000) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug("Cache cleanup completed", { cleaned });
    }
  }
}

// Create singleton instance with fail-fast Redis validation
let _toolResponseCacheInstance: ToolResponseCache | null = null;

export async function getToolResponseCache(): Promise<ToolResponseCache> {
  if (!_toolResponseCacheInstance) {
    _toolResponseCacheInstance = await ToolResponseCache.create(
      parseInt(process.env.TOOL_CACHE_MAX_ENTRIES || "1000"),
      parseInt(process.env.TOOL_CACHE_DEFAULT_TTL || "300"),
      parseInt(process.env.TOOL_CACHE_CLEANUP_INTERVAL || "60000"),
    );
  }
  return _toolResponseCacheInstance;
}

// Legacy export for immediate use (with potential Redis issues)
export const toolResponseCache = new ToolResponseCache(
  parseInt(process.env.TOOL_CACHE_MAX_ENTRIES || "1000"),
  parseInt(process.env.TOOL_CACHE_DEFAULT_TTL || "300"),
  parseInt(process.env.TOOL_CACHE_CLEANUP_INTERVAL || "60000"),
);
