const { Client } = require('pg');

// Simple debug script to check MCP servers and tools
async function debugTools() {
  const connectionString = 'postgresql://postgres.wnjutnyzlpoldutwjflg:gKBJddL0QK7FSZ7U@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify';
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    console.log('=== MCP Servers ===');
    const servers = await client.query(`
      SELECT s.uuid, s.name, s.type, s.error_status, nsm.status as mapping_status
      FROM mcp_servers s
      LEFT JOIN namespace_server_mappings nsm ON s.uuid = nsm.mcp_server_uuid
      ORDER BY s.name
    `);
    console.log(servers.rows);
    
    console.log('\n=== Namespaces ===');
    const namespaces = await client.query('SELECT uuid, name FROM namespaces ORDER BY name');
    console.log(namespaces.rows);
    
    console.log('\n=== Tools ===');
    const tools = await client.query(`
      SELECT t.uuid, t.name, t.mcp_server_uuid, s.name as server_name
      FROM tools t
      LEFT JOIN mcp_servers s ON t.mcp_server_uuid = s.uuid
      ORDER BY s.name, t.name
    `);
    console.log(tools.rows);
    
    console.log('\n=== Namespace Tool Mappings ===');
    const mappings = await client.query(`
      SELECT ntm.uuid, ntm.status, t.name as tool_name, s.name as server_name, n.name as namespace_name
      FROM namespace_tool_mappings ntm
      LEFT JOIN tools t ON ntm.tool_uuid = t.uuid
      LEFT JOIN mcp_servers s ON ntm.mcp_server_uuid = s.uuid
      LEFT JOIN namespaces n ON ntm.namespace_uuid = n.uuid
      ORDER BY n.name, s.name, t.name
    `);
    console.log(mappings.rows);
    
  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await client.end();
  }
}

debugTools();