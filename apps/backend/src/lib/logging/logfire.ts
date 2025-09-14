import { configure, debug, error, info, trace, warning } from "logfire";

// Configure Logfire with the write token
configure({
  token: "pylf_v1_us_CNmCpw3JWnKCC0j6zQXSXT4mcTyR1BTcHKm0zcY4S0CG",
  service_name: "metamcp-backend",
  service_version: "1.0.0",
});

// Utility functions for structured logging
export const logger = {
  debug: (message: string, data?: any) => {
    console.log(`[DEBUG] ${message}`, data || "");
    debug(message, data);
  },

  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data || "");
    info(message, data);
  },

  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data || "");
    warning(message, data);
  },

  error: (message: string, errorData?: any, data?: any) => {
    console.error(`[ERROR] ${message}`, errorData || "", data || "");
    error(message, { error: errorData, data });
  },

  // MCP-specific logging methods
  mcp: {
    toolsFiltered: (
      originalCount: number,
      filteredCount: number,
      namespace: string,
      details?: any,
    ) => {
      const message = `Tools filtered: ${originalCount} -> ${filteredCount} for namespace ${namespace}`;
      console.log(`[MCP-TOOLS] ${message}`, details || "");
      info("mcp.tools.filtered", {
        original_count: originalCount,
        filtered_count: filteredCount,
        namespace,
        details,
      });
    },

    serverConnection: (
      serverName: string,
      status: "success" | "failed",
      details?: any,
    ) => {
      const message = `MCP Server ${serverName} connection ${status}`;
      if (status === "success") {
        console.log(`[MCP-CONNECTION] ${message}`, details || "");
        info("mcp.server.connection", {
          server_name: serverName,
          status,
          details,
        });
      } else {
        console.error(`[MCP-CONNECTION] ${message}`, details || "");
        error("mcp.server.connection_failed", {
          server_name: serverName,
          status,
          details,
        });
      }
    },

    sessionCreated: (
      sessionId: string,
      namespace: string,
      serverCount: number,
    ) => {
      const message = `MCP Session created: ${sessionId} for namespace ${namespace} with ${serverCount} servers`;
      console.log(`[MCP-SESSION] ${message}`);
      info("mcp.session.created", {
        session_id: sessionId,
        namespace,
        server_count: serverCount,
      });
    },
  },
};

export { debug, info, warning, error, trace };
