import {
  McpServerErrorStatusEnum,
  McpServerStatusEnum,
  McpServerTypeEnum,
} from "@repo/zod-types";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const mcpServerTypeEnum = pgEnum(
  "mcp_server_type",
  McpServerTypeEnum.options,
);
export const mcpServerStatusEnum = pgEnum(
  "mcp_server_status",
  McpServerStatusEnum.options,
);
export const mcpServerErrorStatusEnum = pgEnum(
  "mcp_server_error_status",
  McpServerErrorStatusEnum.options,
);

export const mcpServersTable = pgTable(
  "mcp_servers",
  {
    uuid: uuid("uuid").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    type: mcpServerTypeEnum("type")
      .notNull()
      .default(McpServerTypeEnum.Enum.STDIO),
    command: text("command"),
    cwd: text("cwd"),
    args: text("args")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    env: jsonb("env")
      .$type<{ [key: string]: string }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    url: text("url"),
    error_status: mcpServerErrorStatusEnum("error_status")
      .notNull()
      .default(McpServerErrorStatusEnum.Enum.NONE),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    bearerToken: text("bearer_token"),
    // user_id removed - no longer needed after auth deactivation
  },
  (table) => [

    // user_id index removed - no longer needed after auth deactivation


    // user-specific unique constraint removed - no longer needed after auth deactivation
  ],
);

// Configuration table for app-wide settings
export const configTable = pgTable("config", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// OAuth Registered Clients table
export const oauthClientsTable = pgTable("oauth_clients", {
  client_id: text("client_id").primaryKey(),
  client_secret: text("client_secret"),
  client_name: text("client_name").notNull(),
  redirect_uris: text("redirect_uris")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  grant_types: text("grant_types")
    .array()
    .notNull()
    .default(sql`'{"authorization_code","refresh_token"}'::text[]`),
  response_types: text("response_types")
    .array()
    .notNull()
    .default(sql`'{"code"}'::text[]`),
  token_endpoint_auth_method: text("token_endpoint_auth_method")
    .notNull()
    .default("none"),
  scope: text("scope").default("admin"),
  client_uri: text("client_uri"),
  logo_uri: text("logo_uri"),
  contacts: text("contacts").array(),
  tos_uri: text("tos_uri"),
  policy_uri: text("policy_uri"),
  software_id: text("software_id"),
  software_version: text("software_version"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// OAuth Authorization Codes table
export const oauthAuthorizationCodesTable = pgTable(
  "oauth_authorization_codes",
  {
    code: text("code").primaryKey(),
    client_id: text("client_id")
      .notNull()
      .references(() => oauthClientsTable.client_id, { onDelete: "cascade" }),
    redirect_uri: text("redirect_uri").notNull(),
    scope: text("scope").notNull().default("admin"),
    user_id: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    code_challenge: text("code_challenge"),
    code_challenge_method: text("code_challenge_method"),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [


    index("oauth_authorization_codes_expires_at_idx").on(table.expires_at),
  ],
);

// OAuth Access Tokens table
export const oauthAccessTokensTable = pgTable(
  "oauth_access_tokens",
  {
    access_token: text("access_token").primaryKey(),
    client_id: text("client_id")
      .notNull()
      .references(() => oauthClientsTable.client_id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("admin"),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [


    index("oauth_access_tokens_expires_at_idx").on(table.expires_at),
  ],
);

// Tool Cache Metadata table for cache configuration
export const toolCacheMetadataTable = pgTable(
  "tool_cache_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tool_uuid: uuid("tool_uuid")
      .notNull()
      .references(() => toolsTable.uuid, { onDelete: "cascade" }),
    cache_ttl: integer("cache_ttl").notNull().default(300),
    cache_strategy: text("cache_strategy").notNull().default("memory"),
    last_cached_at: timestamp("last_cached_at", { withTimezone: true }),
    cache_hit_count: integer("cache_hit_count").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tool_cache_metadata_tool_uuid_idx").on(table.tool_uuid),

  ],
);

// Performance Metrics table for system monitoring
export const performanceMetricsTable = pgTable(
  "performance_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metric_type: text("metric_type").notNull(),
    metric_value: numeric("metric_value").notNull(),
    metric_unit: text("metric_unit").notNull().default("ms"),
    server_uuid: uuid("server_uuid").references(() => mcpServersTable.uuid, {
      onDelete: "cascade",
    }),
    namespace_uuid: uuid("namespace_uuid").references(
      () => namespacesTable.uuid,
      {
        onDelete: "cascade",
      },
    ),
    tool_name: text("tool_name"),
    additional_data: jsonb("additional_data").$type<Record<string, any>>(),
    recorded_at: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [

    index("performance_metrics_server_uuid_idx").on(table.server_uuid),


  ],
);
// Users table
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  email_verified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  unique().on(table.email),
]);

// API Keys table
export const apiKeysTable = pgTable("api_keys", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  key: text("key").notNull(),
  user_id: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  is_active: boolean("is_active").notNull().default(true),
}, (table) => [
  unique().on(table.key),
  unique().on(table.user_id, table.name),
  index("api_keys_user_id_idx").on(table.user_id),
]);

// Namespaces table
export const namespacesTable = pgTable("namespaces", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  unique().on(table.name),
]);

// Endpoints table
export const endpointsTable = pgTable("endpoints", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  namespace_uuid: uuid("namespace_uuid")
    .notNull()
    .references(() => namespacesTable.uuid, { onDelete: "cascade" }),
  enable_api_key_auth: boolean("enable_api_key_auth").notNull().default(true),
  use_query_param_auth: boolean("use_query_param_auth").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  unique().on(table.name),
  index("endpoints_name_idx").on(table.name),
]);

// Tools table
export const toolsTable = pgTable("tools", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  tool_schema: jsonb("tool_schema").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  mcp_server_uuid: uuid("mcp_server_uuid")
    .notNull()
    .references(() => mcpServersTable.uuid, { onDelete: "cascade" }),
}, (table) => [
  unique().on(table.mcp_server_uuid, table.name),
  index("tools_mcp_server_uuid_idx").on(table.mcp_server_uuid),
]);

// Namespace Server Mappings table
export const namespaceServerMappingsTable = pgTable("namespace_server_mappings", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  namespace_uuid: uuid("namespace_uuid")
    .notNull()
    .references(() => namespacesTable.uuid, { onDelete: "cascade" }),
  mcp_server_uuid: uuid("mcp_server_uuid")
    .notNull()
    .references(() => mcpServersTable.uuid, { onDelete: "cascade" }),
  status: mcpServerStatusEnum("status")
    .notNull()
    .default(McpServerStatusEnum.Enum.ACTIVE),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  unique().on(table.namespace_uuid, table.mcp_server_uuid),
  index("namespace_server_mappings_namespace_uuid_idx").on(table.namespace_uuid),
  index("namespace_server_mappings_mcp_server_uuid_idx").on(table.mcp_server_uuid),
]);

// Namespace Tool Mappings table
export const namespaceToolMappingsTable = pgTable("namespace_tool_mappings", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  namespace_uuid: uuid("namespace_uuid")
    .notNull()
    .references(() => namespacesTable.uuid, { onDelete: "cascade" }),
  tool_uuid: uuid("tool_uuid")
    .notNull()
    .references(() => toolsTable.uuid, { onDelete: "cascade" }),
  mcp_server_uuid: uuid("mcp_server_uuid")
    .notNull()
    .references(() => mcpServersTable.uuid, { onDelete: "cascade" }),
  status: mcpServerStatusEnum("status")
    .notNull()
    .default(McpServerStatusEnum.Enum.ACTIVE),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  unique().on(table.namespace_uuid, table.tool_uuid),
  index("namespace_tool_mappings_namespace_uuid_idx").on(table.namespace_uuid),
  index("namespace_tool_mappings_tool_uuid_idx").on(table.tool_uuid),
  index("namespace_tool_mappings_mcp_server_uuid_idx").on(table.mcp_server_uuid),
  index("namespace_tool_mappings_lookup_idx").on(table.namespace_uuid, table.mcp_server_uuid, table.tool_uuid),
]);

// OAuth Sessions table
export const oauthSessionsTable = pgTable("oauth_sessions", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  mcp_server_uuid: uuid("mcp_server_uuid")
    .notNull()
    .references(() => mcpServersTable.uuid, { onDelete: "cascade" }),
  client_information: jsonb("client_information")
    .$type<{ [key: string]: string }>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  tokens: jsonb("tokens").$type<Record<string, any>>(),
  code_verifier: text("code_verifier"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  unique().on(table.mcp_server_uuid),
  index("oauth_sessions_mcp_server_uuid_idx").on(table.mcp_server_uuid),
]);

// Sessions table
export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
  user_id: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
}, (table) => [
  unique().on(table.token),
  index("sessions_user_id_idx").on(table.user_id),
  index("sessions_token_idx").on(table.token),
]);

// Accounts table
export const accountsTable = pgTable("accounts", {
  id: text("id").primaryKey(),
  account_id: text("account_id").notNull(),
  provider_id: text("provider_id").notNull(),
  user_id: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  access_token: text("access_token"),
  refresh_token: text("refresh_token"),
  id_token: text("id_token"),
  access_token_expires_at: timestamp("access_token_expires_at", { withTimezone: true }),
  refresh_token_expires_at: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("accounts_user_id_idx").on(table.user_id),
]);

// Verifications table
export const verificationsTable = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
