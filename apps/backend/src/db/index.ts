import { config } from "dotenv";
import { resolve } from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Load environment variables from the root .env file
const envPath = resolve(process.cwd(), "../../.env");
config({ path: envPath });

import { logger } from "../lib/logging/logfire";
import * as schema from "./schema";

const { 
  DATABASE_URL, 
  POSTGRES_CA_CERT,
  DB_POOL_MIN,
  DB_POOL_MAX,
  DB_POOL_IDLE_TIMEOUT,
  DB_POOL_ACQUIRE_TIMEOUT,
  DB_POOL_CREATE_TIMEOUT
} = process.env;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}



// Use an explicit pg Pool so we can attach a global error handler.
// This prevents unhandled 'error' events from bringing down the Node process
// when the database terminates idle connections (e.g., during maintenance).
export const pool = new Pool({
  connectionString: DATABASE_URL,
  // Optimized pool parameters for 10 MCP-Server workload
  min: parseInt(DB_POOL_MIN || '2'),
  max: parseInt(DB_POOL_MAX || '20'),
  idleTimeoutMillis: parseInt(DB_POOL_IDLE_TIMEOUT || '30000'),
  acquireTimeoutMillis: parseInt(DB_POOL_ACQUIRE_TIMEOUT || '5000'),
  createTimeoutMillis: parseInt(DB_POOL_CREATE_TIMEOUT || '5000'),
  connectionTimeoutMillis: 5000,
  ssl: DATABASE_URL.includes('supabase.com') || DATABASE_URL.includes('sslmode=require') 
    ? (POSTGRES_CA_CERT ? {
        ca: POSTGRES_CA_CERT,
        rejectUnauthorized: true,
      } : { rejectUnauthorized: false })
    : false,
});

// Performance monitoring event handlers
pool.on("connect", (client) => {
  logger.debug("DB pool: New client connected", { 
    totalCount: pool.totalCount, 
    idleCount: pool.idleCount, 
    waitingCount: pool.waitingCount 
  });
});

pool.on("acquire", (client) => {
  logger.debug("DB pool: Connection acquired", { 
    totalCount: pool.totalCount, 
    idleCount: pool.idleCount, 
    waitingCount: pool.waitingCount 
  });
});

pool.on("release", (client) => {
  logger.debug("DB pool: Connection released", { 
    totalCount: pool.totalCount, 
    idleCount: pool.idleCount, 
    waitingCount: pool.waitingCount 
  });
});

pool.on("error", (err) => {
  // Log and continue so the process doesn't crash on idle client errors.
  // pg-pool will create a new client on the next checkout automatically.
  logger.error("PostgreSQL pool error (handled gracefully)", err, {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});





// Log pool configuration on startup
logger.info("PostgreSQL connection pool initialized", {
  minConnections: parseInt(DB_POOL_MIN || '2'),
  maxConnections: parseInt(DB_POOL_MAX || '20'),
  idleTimeoutMs: parseInt(DB_POOL_IDLE_TIMEOUT || '30000'),
  acquireTimeoutMs: parseInt(DB_POOL_ACQUIRE_TIMEOUT || '5000'),
  createTimeoutMs: parseInt(DB_POOL_CREATE_TIMEOUT || '5000'),
  connectionTimeoutMs: 5000,
  databaseUrl: DATABASE_URL.replace(/(\/\/[^:]*:)([^@]*)(@)/, '$1***$3') // Hide password in logs
});

export const db = drizzle(pool, { schema });
