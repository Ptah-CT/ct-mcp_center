#!/usr/bin/env tsx

import { db } from "./apps/backend/src/db";
import { mcpServersTable } from "./apps/backend/src/db/schema";
import { eq, isNull, or, not, inArray } from "drizzle-orm";

async function fixErrorStatusValues() {
  console.log("🔧 Fixing error_status values in mcp_servers table...");

  try {
    // Find servers with null or invalid error_status
    const serversWithInvalidStatus = await db
      .select({
        uuid: mcpServersTable.uuid,
        name: mcpServersTable.name,
        error_status: mcpServersTable.error_status,
      })
      .from(mcpServersTable)
      .where(
        or(
          isNull(mcpServersTable.error_status),
          not(inArray(mcpServersTable.error_status, ["NONE", "ERROR"]))
        )
      );

    console.log(`Found ${serversWithInvalidStatus.length} servers with invalid error_status`);

    if (serversWithInvalidStatus.length > 0) {
      console.log("Servers to fix:", serversWithInvalidStatus);

      // Update all invalid error_status values to "NONE"
      const updateResult = await db
        .update(mcpServersTable)
        .set({ error_status: "NONE" })
        .where(
          or(
            isNull(mcpServersTable.error_status),
            not(inArray(mcpServersTable.error_status, ["NONE", "ERROR"]))
          )
        );

      console.log(`✅ Updated ${updateResult.rowCount || 0} servers with error_status = "NONE"`);
    }

    // Verify all servers now have valid error_status
    const totalServers = await db
      .select({
        count: mcpServersTable.uuid,
      })
      .from(mcpServersTable);

    const validServers = await db
      .select({
        count: mcpServersTable.uuid,
      })
      .from(mcpServersTable)
      .where(inArray(mcpServersTable.error_status, ["NONE", "ERROR"]));

    console.log(`📊 Total servers: ${totalServers.length}`);
    console.log(`📊 Valid error_status: ${validServers.length}`);

    if (totalServers.length === validServers.length) {
      console.log("✅ All servers now have valid error_status values!");
    } else {
      console.log("❌ Some servers still have invalid error_status values");
    }
  } catch (error) {
    console.error("❌ Error fixing error_status values:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  fixErrorStatusValues()
    .then(() => {
      console.log("🎉 Fix completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Fix failed:", error);
      process.exit(1);
    });
}

export { fixErrorStatusValues };