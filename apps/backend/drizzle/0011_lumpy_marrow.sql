DROP INDEX "api_keys_key_idx";--> statement-breakpoint
DROP INDEX "api_keys_is_active_idx";--> statement-breakpoint
DROP INDEX "endpoints_namespace_uuid_idx";--> statement-breakpoint
DROP INDEX "mcp_servers_type_idx";--> statement-breakpoint
DROP INDEX "namespace_tool_mappings_status_idx";--> statement-breakpoint
DROP INDEX "oauth_access_tokens_client_id_idx";--> statement-breakpoint
DROP INDEX "oauth_access_tokens_user_id_idx";--> statement-breakpoint
DROP INDEX "oauth_authorization_codes_client_id_idx";--> statement-breakpoint
DROP INDEX "oauth_authorization_codes_user_id_idx";--> statement-breakpoint
DROP INDEX "performance_metrics_type_recorded_idx";--> statement-breakpoint
DROP INDEX "performance_metrics_namespace_uuid_idx";--> statement-breakpoint
DROP INDEX "performance_metrics_tool_name_idx";--> statement-breakpoint
DROP INDEX "performance_metrics_recorded_at_idx";--> statement-breakpoint
DROP INDEX "tool_cache_metadata_last_cached_idx";--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");