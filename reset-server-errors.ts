/**
 * Script to reset all MCP server error states to NONE
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { mcpServersTable } from "./apps/backend/src/db/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const connection = postgres(DATABASE_URL);
const db = drizzle(connection);

async function resetAllServerErrorStates() {
  try {
    console.log("Resetting all server error states to NONE...");
    
    const result = await db
      .update(mcpServersTable)
      .set({ error_status: "NONE" })
      .where(eq(mcpServersTable.error_status, "ERROR"));
    
    console.log(`Successfully reset error states for servers`);
    
    // List all servers after reset
    const servers = await db.select({
      uuid: mcpServersTable.uuid,
      name: mcpServersTable.name,
      error_status: mcpServersTable.error_status
    }).from(mcpServersTable);
    
    console.log("Current server states:");
    servers.forEach(server => {
      console.log(`- ${server.name} (${server.uuid}): ${server.error_status}`);
    });
    
  } catch (error) {
    console.error("Error resetting server states:", error);
  } finally {
    await connection.end();
  }
}

resetAllServerErrorStates();