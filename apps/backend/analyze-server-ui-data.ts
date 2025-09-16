import { db } from "./src/db/index";
import { mcpServersRepository } from "./src/db/repositories/mcp-servers.repo";
import { namespacesRepository } from "./src/db/repositories/namespaces.repo";
import { endpointsRepository } from "./src/db/repositories/endpoints.repo";

async function analyzeServerUIData() {
  console.log("🔍 Analysiere MCP Server UI Daten...\n");
  
  try {
    // 1. Server wie sie in der UI erscheinen würden
    console.log("📋 MCP Server (UI Ansicht):");
    console.log("=".repeat(80));
    
    const allServers = await mcpServersRepository.findAll();
    
    if (allServers.length === 0) {
      console.log("❌ Keine Server gefunden");
    } else {
      console.log(`📊 ${allServers.length} Server konfiguriert:\n`);
      
      for (const server of allServers) {
        console.log(`🔸 ${server.name}`);
        console.log(`   UUID: ${server.uuid}`);
        console.log(`   Type: ${server.type}`);
        console.log(`   Status: ${server.error_status}`);
        console.log(`   User: ${server.user_id ? 'PRIVATE' : 'PUBLIC'}`);
        console.log(`   Command: ${server.command || server.url || 'N/A'}`);
        console.log(`   Created: ${server.created_at.toISOString().split('T')[0]}`);
        console.log();
      }
    }

    // 2. Namespaces und ihre Server
    console.log("📦 Namespaces mit zugeordneten Servern:");
    console.log("=".repeat(80));
    
    const allNamespaces = await namespacesRepository.findAll();
    
    if (allNamespaces.length === 0) {
      console.log("❌ Keine Namespaces gefunden");
    } else {
      for (const namespace of allNamespaces) {
        const namespaceWithServers = await namespacesRepository.findByUuidWithServers(namespace.uuid);
        
        console.log(`📦 Namespace: ${namespace.name}`);
        console.log(`   UUID: ${namespace.uuid}`);
        console.log(`   Description: ${namespace.description || 'N/A'}`);
        console.log(`   User: ${namespace.user_id ? 'PRIVATE' : 'PUBLIC'}`);
        
        if (namespaceWithServers?.servers && namespaceWithServers.servers.length > 0) {
          console.log(`   Server (${namespaceWithServers.servers.length}):`);
          for (const server of namespaceWithServers.servers) {
            console.log(`     - ${server.name} (${server.status})`);
          }
        } else {
          console.log(`   Server: Keine`);
        }
        console.log();
      }
    }

    // 3. Public Endpoints (wie Clients sie sehen würden)
    console.log("🌐 Public Endpoints (Client Zugang):");
    console.log("=".repeat(80));
    
    const allEndpoints = await endpointsRepository.findAllWithNamespaces();
    
    if (allEndpoints.length === 0) {
      console.log("❌ Keine Public Endpoints gefunden");
    } else {
      console.log(`📊 ${allEndpoints.length} Public Endpoints:\n`);
      
      for (const endpoint of allEndpoints) {
        console.log(`🌐 Endpoint: ${endpoint.name}`);
        console.log(`   Namespace: ${endpoint.namespace.name}`);
        console.log(`   Description: ${endpoint.description || 'N/A'}`);
        console.log(`   API Key Auth: ${endpoint.enable_api_key_auth ? '✅' : '❌'}`);
        console.log(`   OAuth: ${endpoint.enable_oauth ? '✅' : '❌'}`);
        console.log(`   Query Auth: ${endpoint.use_query_param_auth ? '✅' : '❌'}`);
        console.log(`   User: ${endpoint.user_id ? 'PRIVATE' : 'PUBLIC'}`);
        
        // Zeige verfügbare URLs
        console.log(`   URLs:`);
        console.log(`     SSE: /metamcp/${endpoint.name}/sse`);
        console.log(`     MCP: /metamcp/${endpoint.name}/mcp`);
        console.log(`     API: /metamcp/${endpoint.name}/api`);
        console.log(`     OpenAPI: /metamcp/${endpoint.name}/api/openapi.json`);
        console.log();
      }
    }

    // 4. Server-to-Client Mapping Analyse
    console.log("🔄 Server-zu-Client Mapping Analyse:");
    console.log("=".repeat(80));
    
    let serversInNamespaces = 0;
    let serversInEndpoints = 0;
    
    for (const namespace of allNamespaces) {
      const namespaceWithServers = await namespacesRepository.findByUuidWithServers(namespace.uuid);
      if (namespaceWithServers?.servers) {
        serversInNamespaces += namespaceWithServers.servers.length;
      }
    }
    
    for (const endpoint of allEndpoints) {
      const namespaceWithServers = await namespacesRepository.findByUuidWithServers(endpoint.namespace_uuid);
      if (namespaceWithServers?.servers) {
        serversInEndpoints += namespaceWithServers.servers.length;
      }
    }
    
    console.log(`Total konfigurierte Server: ${allServers.length}`);
    console.log(`Server in Namespaces gemappt: ${serversInNamespaces}`);
    console.log(`Server über Endpoints erreichbar: ${serversInEndpoints}`);
    
    if (allServers.length > serversInNamespaces) {
      console.log(`⚠️  ${allServers.length - serversInNamespaces} Server NICHT in Namespaces gemappt`);
    }
    
    if (serversInNamespaces > serversInEndpoints) {
      console.log(`⚠️  ${serversInNamespaces - serversInEndpoints} gemappte Server NICHT über Endpoints erreichbar`);
    }
    
    if (allServers.length === serversInEndpoints) {
      console.log(`✅ Alle Server sind über Public Endpoints erreichbar`);
    }
    
  } catch (error) {
    console.error("❌ Fehler bei der UI-Datenanalyse:", error);
  } finally {
    process.exit(0);
  }
}

analyzeServerUIData();