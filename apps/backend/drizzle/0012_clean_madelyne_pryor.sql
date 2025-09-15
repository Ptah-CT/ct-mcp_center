CREATE INDEX "endpoints_name_idx" ON "endpoints" USING btree ("name");--> statement-breakpoint
CREATE INDEX "namespace_tool_mappings_lookup_idx" ON "namespace_tool_mappings" USING btree ("namespace_uuid","mcp_server_uuid","tool_uuid");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");