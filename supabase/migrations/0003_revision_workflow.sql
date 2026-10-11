CREATE TABLE "revision_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"from_status" "revision_status",
	"to_status" "revision_status" NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"localized_revision_id" uuid NOT NULL,
	"from_status" "translation_status",
	"to_status" "translation_status" NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "revision_status_events" ADD CONSTRAINT "revision_status_events_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_status_events" ADD CONSTRAINT "translation_status_events_localized_revision_id_localized_revisions_id_fk" FOREIGN KEY ("localized_revision_id") REFERENCES "public"."localized_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revision_status_events_revision_idx" ON "revision_status_events" USING btree ("revision_id","created_at");--> statement-breakpoint
CREATE INDEX "translation_status_events_revision_idx" ON "translation_status_events" USING btree ("localized_revision_id","created_at");
--> statement-breakpoint
DROP TRIGGER "content_revisions_are_immutable" ON "content_revisions";
--> statement-breakpoint
DROP TRIGGER "localized_revisions_are_immutable" ON "localized_revisions";
--> statement-breakpoint
CREATE FUNCTION "archive_guard_content_revision"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR ROW(
    NEW.id, NEW.content_id, NEW.revision_number, NEW.source_revision_id,
    NEW.authored_by, NEW.change_summary, NEW.metadata, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.content_id, OLD.revision_number, OLD.source_revision_id,
    OLD.authored_by, OLD.change_summary, OLD.metadata, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'content_revisions payload is immutable; attempted %', TG_OP
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "archive_guard_localized_revision"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR ROW(
    NEW.id, NEW.revision_id, NEW.locale, NEW.source_locale,
    NEW.source_localized_revision_id, NEW.title, NEW.description, NEW.slug,
    NEW.source_markdown, NEW.source_hash, NEW.frontmatter, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.revision_id, OLD.locale, OLD.source_locale,
    OLD.source_localized_revision_id, OLD.title, OLD.description, OLD.slug,
    OLD.source_markdown, OLD.source_hash, OLD.frontmatter, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'localized_revisions payload is immutable; attempted %', TG_OP
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "content_revisions_are_immutable"
BEFORE UPDATE OR DELETE ON "content_revisions"
FOR EACH ROW EXECUTE FUNCTION "archive_guard_content_revision"();
--> statement-breakpoint
CREATE TRIGGER "localized_revisions_are_immutable"
BEFORE UPDATE OR DELETE ON "localized_revisions"
FOR EACH ROW EXECUTE FUNCTION "archive_guard_localized_revision"();
--> statement-breakpoint
CREATE TRIGGER "revision_status_events_are_immutable"
BEFORE UPDATE OR DELETE ON "revision_status_events"
FOR EACH ROW EXECUTE FUNCTION "archive_prevent_immutable_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "translation_status_events_are_immutable"
BEFORE UPDATE OR DELETE ON "translation_status_events"
FOR EACH ROW EXECUTE FUNCTION "archive_prevent_immutable_history_mutation"();
