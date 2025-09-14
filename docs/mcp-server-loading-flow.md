# MCP Server Loading Flow Documentation

## Issue Resolution
**Problem**: "Error Loading MCP Servers - Output validation failed"
**Root Cause**: Missing `cwd` field in serializer response
**Fix**: Added `cwd: dbServer.cwd,` to McpServersSerializer.serializeMcpServer()

## Execution Flow

### Frontend → Backend
1. `mcp-servers-list.tsx:92` - React component calls tRPC query
   ```typescript
   } = trpc.frontend.mcpServers.list.useQuery();
   ```

2. `mcp-servers.impl.ts:81` - Backend handler processes request
   ```typescript
   list: async (userId: string): Promise<ListMcpServersResponse>
   ```

3. `mcp-servers.impl.ts:87` - Database query execution
   ```typescript
   const servers = await mcpServersRepository.findAllAccessibleToUser(userId);
   ```

4. `mcp-servers.impl.ts:91` - Response serialization
   ```typescript
   data: McpServersSerializer.serializeMcpServerList(servers)
   ```

### Serialization Process
5. `mcp-servers.serializer.ts:22` - List serialization
   ```typescript
   static serializeMcpServerList(dbServers: DatabaseMcpServer[]): McpServer[]
   ```

6. `mcp-servers.serializer.ts:4` - Individual server serialization
   ```typescript
   static serializeMcpServer(dbServer: DatabaseMcpServer): McpServer
   ```

### Validation Layer
7. `mcp-servers.zod.ts:180` - Zod schema validation
   ```typescript
   export const McpServerSchema = z.object({
     // ... fields including cwd: z.string().nullable()
   });
   ```

## Critical Fix Details
- **File**: `apps/backend/src/db/serializers/mcp-servers.serializer.ts`
- **Line**: 11
- **Change**: Added `cwd: dbServer.cwd,` to serializer return object
- **Impact**: Prevents validation failures when loading MCP servers

## Database Schema Reference
- **File**: `apps/backend/src/db/schema.ts:44`
- **Field**: `cwd: text("cwd"),`
- **Type**: Nullable text field for current working directory

## Testing Verification
The tracing analysis confirmed that with the serialization fix:
1. Database queries include cwd field
2. Serializer now maps cwd field correctly
3. Zod validation passes with complete schema
4. Frontend receives valid response without errors