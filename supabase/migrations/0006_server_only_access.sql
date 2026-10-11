ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_relations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "definition_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "experiment_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hypotheses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "localized_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "navigation_spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "publication_pointers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "redirect_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "render_artifacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "research_programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revision_status_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tag_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taxonomy_closure" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taxonomy_node_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taxonomy_nodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "taxonomy_placements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "translation_status_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Content is served through the private business API, NOT directly through PostgREST.
-- Supabase Auth still handles login. Browser anon/authenticated roles have no table access.
-- No permissive RLS policies are intentionally installed. The trusted server currently uses
-- the database owner; a future non-owner runtime role needs explicit scoped grants/policies.
DO $archive_access$
DECLARE
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'assets', 'claims', 'content_relations', 'content_revisions', 'content_tags', 'contents',
    'definition_ledger', 'evidence', 'experiment_profiles', 'hypotheses', 'jobs',
    'localized_revisions', 'navigation_spaces', 'outbox_events', 'publication_pointers',
    'redirect_history', 'render_artifacts', 'research_programs', 'revision_status_events',
    'tag_labels', 'tags', 'taxonomy_closure', 'taxonomy_node_labels', 'taxonomy_nodes',
    'taxonomy_placements', 'translation_status_events',
    -- Existing legacy tables are preserved, not deleted or rewritten.
    'Post', 'Tag', 'TagOnPost', 'TagonPost', '_prisma_migrations'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END;
$archive_access$;
--> statement-breakpoint
-- Protect the migration history too when it is exposed by the platform Data API.
DO $archive_migrations$
DECLARE
  role_name text;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NOT NULL THEN
    ALTER TABLE drizzle.__drizzle_migrations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE drizzle.__drizzle_migrations FROM PUBLIC;
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE drizzle.__drizzle_migrations FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;
END;
$archive_migrations$;
