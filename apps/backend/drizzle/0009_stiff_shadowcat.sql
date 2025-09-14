CREATE TABLE "performance_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_type" text NOT NULL,
	"metric_value" numeric NOT NULL,
	"metric_unit" text DEFAULT 'ms' NOT NULL,
	"server_uuid" uuid,
	"namespace_uuid" uuid,
	"tool_name" text,
	"additional_data" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_cache_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_uuid" uuid NOT NULL,
	"cache_ttl" integer DEFAULT 300 NOT NULL,
	"cache_strategy" text DEFAULT 'memory' NOT NULL,
	"last_cached_at" timestamp with time zone,
	"cache_hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_namespace_uuid_namespaces_uuid_fk" FOREIGN KEY ("namespace_uuid") REFERENCES "public"."namespaces"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_cache_metadata" ADD CONSTRAINT "tool_cache_metadata_tool_uuid_tools_uuid_fk" FOREIGN KEY ("tool_uuid") REFERENCES "public"."tools"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performance_metrics_type_recorded_idx" ON "performance_metrics" USING btree ("metric_type","recorded_at");--> statement-breakpoint
CREATE INDEX "performance_metrics_server_uuid_idx" ON "performance_metrics" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "performance_metrics_namespace_uuid_idx" ON "performance_metrics" USING btree ("namespace_uuid");--> statement-breakpoint
CREATE INDEX "performance_metrics_tool_name_idx" ON "performance_metrics" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "performance_metrics_recorded_at_idx" ON "performance_metrics" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "tool_cache_metadata_tool_uuid_idx" ON "tool_cache_metadata" USING btree ("tool_uuid");--> statement-breakpoint
CREATE INDEX "tool_cache_metadata_last_cached_idx" ON "tool_cache_metadata" USING btree ("last_cached_at");