# resetErrorStatus API Endpoint Documentation

## 🜄 Ziel
Documentation for the new `resetErrorStatus` tRPC endpoint that allows authorized users to reset MCP server error states from ERROR back to NONE.

## Endpoint Details

### tRPC Endpoint
- **Path**: `frontend.mcpServers.resetErrorStatus`
- **Method**: Mutation (POST)
- **URL**: `http://localhost:32009/trpc/frontend.mcpServers.resetErrorStatus`
- **Authentication**: Required (protected procedure)

### Request Schema
```typescript
{
  uuid: string; // UUID of the MCP server (must be valid UUID format)
}
```

### Response Schema
```typescript
{
  success: boolean;
  data?: McpServer; // Updated server object if successful
  message?: string; // Error message if unsuccessful
}
```

### Example Request Body
```json
{
  "uuid": "123e4567-e89b-12d3-a456-426614174000"
}
```

### Example Successful Response
```json
{
  "result": {
    "data": {
      "success": true,
      "data": {
        "uuid": "123e4567-e89b-12d3-a456-426614174000",
        "name": "example-server",
        "description": "Example MCP server",
        "type": "STDIO",
        "command": "node server.js",
        "cwd": "/path/to/server",
        "args": [],
        "env": {},
        "url": null,
        "created_at": "2024-01-01T00:00:00.000Z",
        "bearerToken": null,
        "user_id": "user123",
        "error_status": "NONE"
      },
      "message": "Server error status reset successfully"
    }
  }
}
```

### Example Error Response
```json
{
  "result": {
    "data": {
      "success": false,
      "message": "MCP server not found"
    }
  }
}
```

## Authentication Requirements

This endpoint requires authentication via better-auth session cookies. Users must be logged in and can only reset error status for servers they own.

### Authentication Flow
1. User must be authenticated with valid session cookies
2. Session is validated via better-auth
3. User ownership is verified (server.user_id === authenticated_user.id)
4. Only servers in ERROR state can be reset

## Authorization Rules

- **User Authentication**: Must have valid better-auth session
- **Server Ownership**: User can only reset servers they own (user_id match)
- **Error State Validation**: Only servers with `error_status = 'ERROR'` can be reset
- **Access Denied**: Returns error if user tries to reset server they don't own

## Error Conditions

| Condition | HTTP Status | Response |
|-----------|-------------|----------|
| Not authenticated | 401 | `{"error": "UNAUTHORIZED", "message": "You must be logged in"}` |
| Server not found | 200 | `{"success": false, "message": "MCP server not found"}` |
| Access denied | 200 | `{"success": false, "message": "Access denied: You can only reset error status of servers you own"}` |
| Server not in error | 200 | `{"success": false, "message": "Server does not have an error status to reset"}` |

## Database Operation

The endpoint performs the following database operation:
```sql
UPDATE mcp_servers 
SET error_status = 'NONE' 
WHERE uuid = ? AND error_status = 'ERROR' AND user_id = ?
```

## Implementation Details

### Files Modified
- `packages/zod-types/src/mcp-servers.zod.ts` - Added Zod schemas
- `apps/backend/src/trpc/mcp-servers.impl.ts` - Added implementation logic
- `packages/trpc/src/routers/frontend/mcp-servers.ts` - Added tRPC endpoint

### Key Implementation Points
1. Uses existing `serverErrorTracker.resetServerErrorState()` method
2. Follows existing tRPC patterns for error handling
3. Implements comprehensive input validation
4. Provides detailed error messages for debugging

## Testing Examples

### Using curl with Authentication
```bash
# First, authenticate and save cookies
curl -X POST http://localhost:32009/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email": "your-email@example.com", "password": "your-password"}'

# Then use the endpoint with saved cookies
curl -X POST http://localhost:32009/trpc/frontend.mcpServers.resetErrorStatus \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"uuid": "your-server-uuid-here"}'
```

### Using JavaScript/Fetch
```javascript
// Assuming user is already authenticated in browser with session cookies
const response = await fetch('/trpc/frontend.mcpServers.resetErrorStatus', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Include session cookies
  body: JSON.stringify({
    uuid: 'your-server-uuid-here'
  }),
});

const result = await response.json();
console.log(result);
```

### Using tRPC Client
```typescript
// In your tRPC client code
const result = await trpc.frontend.mcpServers.resetErrorStatus.mutate({
  uuid: 'your-server-uuid-here'
});

if (result.success) {
  console.log('Server error status reset successfully:', result.data);
} else {
  console.error('Failed to reset server error status:', result.message);
}
```

## Frontend Integration

For frontend integration, the endpoint should be called when:
1. User clicks a "Reset Error" button on a server in ERROR state
2. After successful reset, update the UI to reflect the new status
3. Show appropriate success/error messages to the user

### React Example
```tsx
const handleResetError = async (serverUuid: string) => {
  try {
    const result = await trpc.frontend.mcpServers.resetErrorStatus.mutate({
      uuid: serverUuid
    });
    
    if (result.success) {
      // Refresh server list or update local state
      toast.success('Server error status reset successfully');
    } else {
      toast.error(result.message || 'Failed to reset error status');
    }
  } catch (error) {
    toast.error('An error occurred while resetting server status');
  }
};
```

## 🜄 Verantwortung
- **Implementation**: Backend tRPC endpoint with full validation and error handling
- **Security**: User authentication and authorization implemented
- **Documentation**: Complete API documentation with examples provided
- **Testing**: Endpoint structure validated, authentication requirements documented