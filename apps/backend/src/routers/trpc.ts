import { createAppRouter } from "@repo/trpc";
import * as trpcExpress from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { createContext } from "../trpc";
import { apiKeysImplementations } from "../trpc/api-keys.impl";
import { configImplementations } from "../trpc/config.impl";
import { endpointsImplementations } from "../trpc/endpoints.impl";
import { logsImplementations } from "../trpc/logs.impl";
import { mcpServersImplementations } from "../trpc/mcp-servers.impl";
import { namespacesImplementations } from "../trpc/namespaces.impl";
import { oauthImplementations } from "../trpc/oauth.impl";
import { toolsImplementations } from "../trpc/tools.impl";

// Create the app router with implementations
const appRouter = createAppRouter({
  frontend: {
    mcpServers: mcpServersImplementations,
    namespaces: namespacesImplementations,
    endpoints: endpointsImplementations,
    oauth: oauthImplementations,
    tools: toolsImplementations,
    apiKeys: apiKeysImplementations,
    config: configImplementations,
    logs: logsImplementations,
  },
});

// Export the router type for client usage
export type AppRouter = typeof appRouter;

// Create Express router
const trpcRouter = express.Router();

// Apply security middleware for frontend communication
trpcRouter.use(helmet());
trpcRouter.use(
  cors({
    origin: ["http://192.168.2.222:23456", "http://localhost:23456", "http://127.0.0.1:23456"],
    credentials: true,
  }),
);

// Better-auth integration now handled in tRPC context

// Mount tRPC handler
trpcRouter.use(
  "/",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

export default trpcRouter;
