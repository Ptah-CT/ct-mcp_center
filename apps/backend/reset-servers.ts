/**
 * Script to reset all MCP server error states to NONE
 */
import { eq } from "drizzle-orm";

import { db } from "./src/db/index.js";
import { mcpServersTable } from "./src/db/schema.js";

async function resetAllServerErrorStates() {
  try {
    console.log("Resetting all server error states to NONE...");

    const result = await db
      .update(mcpServersTable)
      .set({ error_status: "NONE" })
      .where(eq(mcpServersTable.error_status, "ERROR"));

    console.log(`Successfully reset error states`);

    // List all servers after reset
    const servers = await db
      .select({
        uuid: mcpServersTable.uuid,
        name: mcpServersTable.name,
        error_status: mcpServersTable.error_status,
      })
      .from(mcpServersTable);

    console.log("Current server states:");
    servers.forEach((server) => {
      console.log(`- ${server.name} (${server.uuid}): ${server.error_status}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("Error resetting server states:", error);
    process.exit(1);
  }
}

resetAllServerErrorStates();
