-- Drop foreign key constraints first
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_user_id_users_id_fk";
ALTER TABLE "endpoints" DROP CONSTRAINT IF EXISTS "endpoints_user_id_users_id_fk";
ALTER TABLE "namespaces" DROP CONSTRAINT IF EXISTS "namespaces_user_id_users_id_fk";
ALTER TABLE "mcp_servers" DROP CONSTRAINT IF EXISTS "mcp_servers_user_id_users_id_fk";

-- Drop indices related to user_id
DROP INDEX IF EXISTS "api_keys_user_id_idx";
DROP INDEX IF EXISTS "endpoints_user_id_idx";
DROP INDEX IF EXISTS "namespaces_user_id_idx";
DROP INDEX IF EXISTS "mcp_servers_user_id_idx";

-- Drop unique constraints that include user_id
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_name_per_user_idx";
ALTER TABLE "endpoints" DROP CONSTRAINT IF EXISTS "endpoints_name_per_user_idx";
ALTER TABLE "namespaces" DROP CONSTRAINT IF EXISTS "namespaces_name_per_user_idx";
ALTER TABLE "mcp_servers" DROP CONSTRAINT IF EXISTS "mcp_servers_name_per_user_idx";

-- Remove user_id columns
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "endpoints" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "namespaces" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "mcp_servers" DROP COLUMN IF EXISTS "user_id";

-- Remove unused OAuth tables related to user authentication
DROP TABLE IF EXISTS "oauth_authorization_codes";
DROP TABLE IF EXISTS "oauth_access_tokens";
DROP TABLE IF EXISTS "oauth_clients";
DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "accounts";
DROP TABLE IF EXISTS "verifications";
DROP TABLE IF EXISTS "users";

-- Add performance indices
CREATE INDEX "performance_metrics_type_recorded_idx" ON "performance_metrics" USING btree ("metric_type", "recorded_at");
CREATE INDEX "performance_metrics_namespace_uuid_idx" ON "performance_metrics" USING btree ("namespace_uuid");
CREATE INDEX "performance_metrics_recorded_at_idx" ON "performance_metrics" USING btree ("recorded_at");

-- Add CHECK constraints for data integrity
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_value_positive" CHECK ("metric_value" >= 0);

-- Recreate unique constraints without user_id dependency
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_name_unique" UNIQUE ("name");
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_name_unique" UNIQUE ("name");
ALTER TABLE "namespaces" ADD CONSTRAINT "namespaces_name_unique" UNIQUE ("name");
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_name_unique" UNIQUE ("name");