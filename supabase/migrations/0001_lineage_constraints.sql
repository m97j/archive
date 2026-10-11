ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_source_revision_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "definition_ledger" ADD CONSTRAINT "definition_ledger_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."definition_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."hypotheses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localized_revisions" ADD CONSTRAINT "localized_revisions_source_translation_fk" FOREIGN KEY ("source_localized_revision_id") REFERENCES "public"."localized_revisions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION "archive_prevent_immutable_history_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; attempted %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "content_revisions_are_immutable"
BEFORE UPDATE OR DELETE ON "content_revisions"
FOR EACH ROW EXECUTE FUNCTION "archive_prevent_immutable_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "localized_revisions_are_immutable"
BEFORE UPDATE OR DELETE ON "localized_revisions"
FOR EACH ROW EXECUTE FUNCTION "archive_prevent_immutable_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "render_artifacts_are_immutable"
BEFORE UPDATE OR DELETE ON "render_artifacts"
FOR EACH ROW EXECUTE FUNCTION "archive_prevent_immutable_history_mutation"();
