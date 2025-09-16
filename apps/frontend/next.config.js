/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    proxyTimeout: 1000 * 120,
    // Enable WebSocket proxying for STDIO transport
    serverExternalPackages: ["@modelcontextprotocol/sdk"],
  },
  // Configure allowed origins for cross-origin requests in development
  allowedDevOrigins: [
    "192.168.2.222:3000",
    "192.168.2.222:32008",
    "localhost:3000", 
    "localhost:32008",
    "127.0.0.1:3000",
    "127.0.0.1:32008"
  ],
  async rewrites() {
    // Use localhost for rewrites since frontend and backend run in the same container
    const backendUrl = "http://localhost:32009";

    return [
      {
        source: "/health",
        destination: `${backendUrl}/health`,
      },
      // OAuth endpoints - proxy all oauth paths
      {
        source: "/oauth/:path*",
        destination: `${backendUrl}/oauth/:path*`,
      },
      // Well-known endpoints - proxy all well-known paths
      {
        source: "/.well-known/:path*",
        destination: `${backendUrl}/.well-known/:path*`,
      },
      // Auth API endpoints
      {
        source: "/api/auth/:path*",
        destination: `${backendUrl}/api/auth/:path*`,
      },
      // Register endpoint for dynamic client registration
      {
        source: "/register",
        destination: `${backendUrl}/api/auth/register`,
      },
      {
        source: "/trpc/:path*",
        destination: `${backendUrl}/trpc/frontend/:path*`,
      },
      {
        source: "/mcp-proxy/:path*",
        destination: `${backendUrl}/mcp-proxy/:path*`,
      },
      {
        source: "/metamcp/:path*",
        destination: `${backendUrl}/metamcp/:path*`,
      },
      {
        source: "/service/:path*",
        destination: "https://metatool-service.jczstudio.workers.dev/:path*",
      },
    ];
  },
};

export default nextConfig;
