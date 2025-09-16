import { createApiKeysRouter } from "./api-keys";
import { createConfigRouter } from "./config";
import { createEndpointsRouter } from "./endpoints";
import { createLogsRouter } from "./logs";
import { createMcpServersRouter } from "./mcp-servers";
import { createNamespacesRouter } from "./namespaces";

import { createToolsRouter } from "./tools";

export { createMcpServersRouter };
export { createNamespacesRouter };
export { createEndpointsRouter };
// OAuth router export removed - no longer needed after auth deactivation
export { createToolsRouter };
export { createApiKeysRouter };
export { createConfigRouter };

export const createFrontendRouter = (implementations: {
  mcpServers: Parameters<typeof createMcpServersRouter>[0];
  namespaces: Parameters<typeof createNamespacesRouter>[0];
  endpoints: Parameters<typeof createEndpointsRouter>[0];

  tools: Parameters<typeof createToolsRouter>[0];
  apiKeys: Parameters<typeof createApiKeysRouter>[0];
  config: Parameters<typeof createConfigRouter>[0];
  logs: Parameters<typeof createLogsRouter>[0];
}) => {
  return {
    mcpServers: createMcpServersRouter(implementations.mcpServers),
    namespaces: createNamespacesRouter(implementations.namespaces),
    endpoints: createEndpointsRouter(implementations.endpoints),

    tools: createToolsRouter(implementations.tools),
    apiKeys: createApiKeysRouter(implementations.apiKeys),
    config: createConfigRouter(implementations.config),
    logs: createLogsRouter(implementations.logs),
  };
};
