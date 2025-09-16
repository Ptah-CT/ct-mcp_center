import { db } from "./src/db/index";
import { mcpServersTable, namespacesTable, namespaceServerMappingsTable } from "./src/db/schema";
import { eq, notInArray } from "drizzle-orm";

async function analyzeUnmappedServers() {
  console.log("🔍 Genauere Analyse der WIRKLICH unmapped Server...\n");
  
  try {
    // Alle Server IDs die in Namespaces gemappt sind
    const mappedServerIds = await db
      .select({ serverId: namespaceServerMappingsTable.serverId })
      .from(namespaceServerMappingsTable);
    
    const mappedIds = mappedServerIds.map(row => row.serverId);
    console.log(`📊 ${mappedIds.length} Server sind in Namespaces gemappt\n`);
    
    // Server die NICHT gemappt sind
    const unmappedServers = await db
      .select({
        uuid: mcpServersTable.uuid,
        name: mcpServersTable.name,
        type: mcpServersTable.type,
        command: mcpServersTable.command,
        args: mcpServersTable.args,
        created_at: mcpServersTable.created_at
      })
      .from(mcpServersTable)
      .where(notInArray(mcpServersTable.uuid, mappedIds));
    
    console.log(`⚠️  ${unmappedServers.length} Server sind WIRKLICH unmapped:\n`);
    
    unmappedServers.forEach((server, index) => {
      console.log(`${index + 1}. 🔸 ${server.name}`);
      console.log(`   UUID: ${server.uuid}`);
      console.log(`   Type: ${server.type}`);
      console.log(`   Command: ${server.command}`);
      if (server.args) {
        console.log(`   Args: ${JSON.stringify(server.args)}`);
      }
      console.log(`   Created: ${server.created_at?.toISOString().split('T')[0]}`);
      console.log();
    });
    
    // Kategorisierung
    const stdioServers = unmappedServers.filter(s => s.type === 'STDIO');
    const httpServers = unmappedServers.filter(s => s.type === 'STREAMABLE_HTTP');
    
    console.log(`📊 Kategorisierung:`);
    console.log(`   STDIO Server: ${stdioServers.length}`);
    console.log(`   STREAMABLE_HTTP Server: ${httpServers.length}`);
    
    // Analyse der HTTP Server (sind das die Proxy-Endpoints?)
    if (httpServers.length > 0) {
      console.log(`\n🔍 STREAMABLE_HTTP Server Analyse:`);
      httpServers.forEach(server => {
        console.log(`   ${server.name}: ${server.command}`);
      });
    }
    
  } catch (error) {
    console.error("❌ Fehler:", error);
  }
}

analyzeUnmappedServers().catch(console.error);