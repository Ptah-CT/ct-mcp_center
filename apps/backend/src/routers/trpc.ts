import { existsSync, readFileSync } from "node:fs";

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

const DEFAULT_TRPC_ALLOWED_ORIGINS = [
  "http://192.168.2.222:23456",
  "http://localhost:23456",
  "http://127.0.0.1:23456",
];

const splitOrigins = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
};

type ResolveOriginsOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (filePath: string) => string;
  fileExists?: (filePath: string) => boolean;
};

export const resolveTrpcAllowedOrigins = (
  options: ResolveOriginsOptions = {},
): string[] => {
  const env = options.env ?? process.env;
  const readFile =
    options.readFile ?? ((filePath: string) => readFileSync(filePath, "utf8"));
  const fileExists = options.fileExists ?? existsSync;

  const configuredOrigins = new Set<string>();

  const envOrigins = splitOrigins(
    env.TRPC_ALLOWED_ORIGINS ?? env.CORS_ALLOWED_ORIGINS,
  );
  for (const origin of envOrigins) {
    configuredOrigins.add(origin);
  }

  const filePath = env.TRPC_ALLOWED_ORIGINS_FILE;
  if (filePath && fileExists(filePath)) {
    try {
      const fileContents = readFile(filePath).trim();
      if (fileContents) {
        try {
          const parsed = JSON.parse(fileContents);
          if (Array.isArray(parsed)) {
            for (const entry of parsed) {
              if (typeof entry === "string") {
                const trimmed = entry.trim();
                if (trimmed) {
                  configuredOrigins.add(trimmed);
                }
              }
            }
          } else if (typeof parsed === "string") {
            for (const origin of splitOrigins(parsed)) {
              configuredOrigins.add(origin);
            }
          }
        } catch {
          for (const origin of splitOrigins(fileContents)) {
            configuredOrigins.add(origin);
          }
        }
      }
    } catch {
      // Ignore file read errors and fall back to other configuration sources.
    }
  }

  const appUrl = env.APP_URL?.trim();
  if (appUrl) {
    configuredOrigins.add(appUrl);
  }

  if (!configuredOrigins.size) {
    for (const origin of DEFAULT_TRPC_ALLOWED_ORIGINS) {
      configuredOrigins.add(origin);
    }
  }

  return Array.from(configuredOrigins);
};

const allowedOrigins = resolveTrpcAllowedOrigins();

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
    origin: allowedOrigins,
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
