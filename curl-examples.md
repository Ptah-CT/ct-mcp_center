# CURL Testing Examples for resetErrorStatus Endpoint

## Authentication Required
All requests to the resetErrorStatus endpoint require authentication. Here are examples of how to test with curl.

## Step 1: Authenticate and Save Cookies

### Sign Up (if needed)
```bash
curl -X POST http://localhost:32009/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com", 
    "password": "testpassword123"
  }'
```

### Sign In and Save Session Cookies
```bash
curl -X POST http://localhost:32009/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

### Verify Authentication
```bash
curl -X GET http://localhost:32009/api/auth/get-session \
  -b cookies.txt
```

## Step 2: List MCP Servers (to find UUIDs)

```bash
curl -X GET "http://localhost:32009/trpc/frontend.mcpServers.list" \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

## Step 3: Reset Error Status

### Reset Error Status for a Specific Server
```bash
curl -X POST http://localhost:32009/trpc/frontend.mcpServers.resetErrorStatus \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "uuid": "replace-with-actual-server-uuid"
  }'
```

### Example with Real UUID (replace with actual UUID from your system)
```bash
curl -X POST http://localhost:32009/trpc/frontend.mcpServers.resetErrorStatus \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "uuid": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

## Expected Responses

### Successful Reset
```json
{
  "result": {
    "data": {
      "success": true,
      "data": {
        "uuid": "123e4567-e89b-12d3-a456-426614174000",
        "name": "example-server",
        "error_status": "NONE"
      },
      "message": "Server error status reset successfully"
    }
  }
}
```

### Server Not Found
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

### Access Denied
```json
{
  "result": {
    "data": {
      "success": false,
      "message": "Access denied: You can only reset error status of servers you own"
    }
  }
}
```

### Server Not in Error State
```json
{
  "result": {
    "data": {
      "success": false,
      "message": "Server does not have an error status to reset"
    }
  }
}
```

### Authentication Required
```json
{
  "error": {
    "message": "You must be logged in to access this resource",
    "code": -32001,
    "data": {
      "code": "UNAUTHORIZED",
      "httpStatus": 401
    }
  }
}
```

## Debug Commands

### Check Current Session
```bash
curl -X GET http://localhost:32009/api/auth/get-session \
  -b cookies.txt \
  -v
```

### List All Available Auth Endpoints
```bash
curl -X GET http://localhost:32009/api/auth \
  -v
```

## Notes

- The `cookies.txt` file stores the session cookies needed for authentication
- Replace `localhost:32009` with your actual backend URL
- Replace UUIDs with actual server UUIDs from your database
- Ensure the backend server is running before testing
- The endpoint only works with servers that have `error_status = 'ERROR'`