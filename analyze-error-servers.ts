import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: ".env.ct-mcp-center" });

import { db } from "./apps/backend/src/db/index";
import { mcpServersTable, namespacesTable, namespaceServerMappingsTable } from "./apps/backend/src/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and } from "drizzle-orm";
import * as schema from "./apps/backend/src/db/schema";

// Load environment variables
config({ path: ".env.ct-mcp-center" });

const { mcpServersTable, namespacesTable, namespaceServerMappingsTable } = schema;

async function analyzeErrorServers() {
  console.log("🔍 Analysiere MCP Server im ERROR-Status...\n");
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("supabase.com") ? { rejectUnauthorized: false } : false,
  });
  
  const db = drizzle(pool, { schema });
  
  try {
    // 1. Alle Server mit ERROR Status
    const errorServers = await db
      .select({
        uuid: mcpServersTable.uuid,
        name: mcpServersTable.name,
        description: mcpServersTable.description,
        type: mcpServersTable.type,
        command: mcpServersTable.command,
        url: mcpServersTable.url,
        error_status: mcpServersTable.error_status,
        created_at: mcpServersTable.created_at,
        user_id: mcpServersTable.user_id,
      })
      .from(mcpServersTable)
      .where(eq(mcpServersTable.error_status, "ERROR"));

    console.log(`📊 Gefunden: ${errorServers.length} Server im ERROR-Status`);
    
    if (errorServers.length === 0) {
      console.log("✅ Keine Server im ERROR-Status gefunden");
    } else {
      console.log("\n🚨 Server im ERROR-Status:");
      console.log("=".repeat(80));
      
      for (const server of errorServers) {
        console.log(`Name: ${server.name}`);
        console.log(`UUID: ${server.uuid}`);
        console.log(`Type: ${server.type}`);
        console.log(`User: ${server.user_id || 'PUBLIC'}`);
        console.log(`Command: ${server.command || 'N/A'}`);
        console.log(`URL: ${server.url || 'N/A'}`);
        console.log(`Description: ${server.description || 'N/A'}`);
        console.log(`Created: ${server.created_at.toISOString()}`);
        console.log("-".repeat(40));
      }
    }

    // 2. Prüfe Namespace Mappings für ERROR Server
    if (errorServers.length > 0) {
      console.log("\n📋 Namespace Mappings für ERROR Server:");
      console.log("=" .repeat(80));
      
      const namespaceMappings = await db
        .select({
          server_uuid: namespaceServerMappingsTable.mcp_server_uuid,
          server_name: mcpServersTable.name,
          namespace_uuid: namespaceServerMappingsTable.namespace_uuid,
          namespace_name: namespacesTable.name,
          mapping_status: namespaceServerMappingsTable.status,
        })
        .from(namespaceServerMappingsTable)
        .innerJoin(mcpServersTable, eq(namespaceServerMappingsTable.mcp_server_uuid, mcpServersTable.uuid))
        .innerJoin(namespacesTable, eq(namespaceServerMappingsTable.namespace_uuid, namespacesTable.uuid))
        .where(eq(mcpServersTable.error_status, "ERROR"));

      if (namespaceMappings.length === 0) {
        console.log("❌ ERROR Server sind in keinen Namespaces gemappt");
      } else {
        for (const mapping of namespaceMappings) {
          console.log(`Server: ${mapping.server_name} → Namespace: ${mapping.namespace_name}`);
          console.log(`Status: ${mapping.mapping_status}`);
          console.log(`Server UUID: ${mapping.server_uuid}`);
          console.log(`Namespace UUID: ${mapping.namespace_uuid}`);
          console.log("-".repeat(40));
        }
      }
    }

    // 3. Gesamtstatistik aller Server
    console.log("\n📈 Gesamtstatistik aller MCP Server:");
    console.log("=" .repeat(80));
    
    const allServers = await db
      .select({
        error_status: mcpServersTable.error_status,
        type: mcpServersTable.type,
        user_scope: mcpServersTable.user_id,
      })
      .from(mcpServersTable);
    
    // Statistiken berechnen
    const stats = {
      total: allServers.length,
      error: allServers.filter(s => s.error_status === "ERROR").length,
      none: allServers.filter(s => s.error_status === "NONE").length,
      stdio: allServers.filter(s => s.type === "STDIO").length,
      sse: allServers.filter(s => s.type === "SSE").length,
      http: allServers.filter(s => s.type === "STREAMABLE_HTTP").length,
      public: allServers.filter(s => s.user_scope === null).length,
      private: allServers.filter(s => s.user_scope !== null).length,
    };
    
    console.log(`Gesamt Server: ${stats.total}`);
    console.log(`Status ERROR: ${stats.error}`);
    console.log(`Status NONE: ${stats.none}`);
    console.log(`Type STDIO: ${stats.stdio}`);
    console.log(`Type SSE: ${stats.sse}`);
    console.log(`Type STREAMABLE_HTTP: ${stats.http}`);
    console.log(`Public Server: ${stats.public}`);
    console.log(`Private Server: ${stats.private}`);

    // 4. Prüfe ob ERROR Server in aktiven Mappings sind
    if (errorServers.length > 0) {
      console.log("\n⚠️  ERROR Server in ACTIVE Namespace Mappings:");
      console.log("=" .repeat(80));
      
      const activeErrorMappings = await db
        .select({
          server_name: mcpServersTable.name,
          namespace_name: namespacesTable.name,
        })
        .from(namespaceServerMappingsTable)
        .innerJoin(mcpServersTable, eq(namespaceServerMappingsTable.mcp_server_uuid, mcpServersTable.uuid))
        .innerJoin(namespacesTable, eq(namespaceServerMappingsTable.namespace_uuid, namespacesTable.uuid))
        .where(
          and(
            eq(mcpServersTable.error_status, "ERROR"),
            eq(namespaceServerMappingsTable.status, "ACTIVE")
          )
        );
      
      if (activeErrorMappings.length === 0) {
        console.log("✅ Keine ERROR Server in ACTIVE Mappings");
      } else {
        console.log(`🚨 ${activeErrorMappings.length} ERROR Server sind in ACTIVE Mappings:`);
        for (const mapping of activeErrorMappings) {
          console.log(`- ${mapping.server_name} in Namespace "${mapping.namespace_name}"`);
        }
      }
    }
    
  } catch (error) {
    console.error("❌ Fehler bei der Analyse:", error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

analyzeErrorServers();

analyzeErrorServers();