-- These trigger bodies use NEW/OLD and PostgreSQL built-ins only. An empty,
-- function-local search_path excludes caller-controlled schemas without changing
-- function bodies, ownership, execution privileges, triggers or stored rows.
ALTER FUNCTION "public"."archive_prevent_immutable_history_mutation"() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION "public"."archive_guard_content_revision"() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION "public"."archive_guard_localized_revision"() SET search_path = '';
