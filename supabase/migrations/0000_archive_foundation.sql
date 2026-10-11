CREATE TYPE "public"."content_kind" AS ENUM('PAGE', 'PROJECT', 'RESEARCH_PROGRAM', 'PUBLICATION', 'DOC', 'LOG_ENTRY', 'EXPERIMENT');--> statement-breakpoint
CREATE TYPE "public"."epistemic_status" AS ENUM('REGULATIVE_IDEA', 'SPECULATIVE', 'HYPOTHESIS', 'WORKING', 'EXPERIMENTAL', 'REPRODUCED', 'SUPPORTED', 'CHALLENGED', 'REFUTED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."evidence_relation" AS ENUM('SUPPORTS', 'CHALLENGES', 'NEUTRAL');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'ko', 'ja', 'zh', 'es', 'fr', 'de');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."content_relation_type" AS ENUM('PART_OF', 'CONTINUES', 'SUPERSEDES', 'TRANSLATES', 'CITES', 'SUPPORTS', 'CHALLENGES', 'IMPLEMENTS', 'REPRODUCES', 'USES_DATASET', 'RELATED_TO');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."navigation_space" AS ENUM('ABOUT', 'WORK', 'RESEARCH', 'DOCS', 'LOGS');--> statement-breakpoint
CREATE TYPE "public"."translation_status" AS ENUM('MISSING', 'DRAFT', 'REVIEWED', 'PUBLISHED', 'STALE');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('PRIVATE', 'UNLISTED', 'PUBLIC');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid,
	"storage_provider" varchar(40) NOT NULL,
	"storage_key" text NOT NULL,
	"media_type" varchar(160) NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"alt_text" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_byte_size_nonnegative" CHECK ("assets"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"localized_revision_id" uuid NOT NULL,
	"stable_key" varchar(160) NOT NULL,
	"statement" text NOT NULL,
	"status" "epistemic_status" DEFAULT 'WORKING' NOT NULL,
	"locator" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_content_id" uuid NOT NULL,
	"to_content_id" uuid NOT NULL,
	"type" "content_relation_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_relations_not_self" CHECK ("content_relations"."from_content_id" <> "content_relations"."to_content_id")
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"status" "revision_status" DEFAULT 'DRAFT' NOT NULL,
	"source_revision_id" uuid,
	"authored_by" uuid,
	"change_summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revisions_number_positive" CHECK ("content_revisions"."revision_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "content_tags" (
	"content_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "content_tags_content_id_tag_id_pk" PRIMARY KEY("content_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "content_kind" NOT NULL,
	"canonical_key" varchar(160) NOT NULL,
	"visibility" "visibility" DEFAULT 'PRIVATE' NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "definition_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_program_id" uuid NOT NULL,
	"term" varchar(240) NOT NULL,
	"locale" "locale" NOT NULL,
	"definition" text NOT NULL,
	"valid_from_revision_id" uuid,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"content_id" uuid,
	"relation" "evidence_relation" NOT NULL,
	"citation" text,
	"source_uri" text,
	"strength" numeric(4, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_strength_range" CHECK ("evidence"."strength" is null or ("evidence"."strength" >= 0 and "evidence"."strength" <= 1))
);
--> statement-breakpoint
CREATE TABLE "experiment_profiles" (
	"content_id" uuid PRIMARY KEY NOT NULL,
	"hypothesis_id" uuid,
	"protocol" text NOT NULL,
	"environment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_summary" text,
	"reproducibility_notes" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypotheses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"research_program_id" uuid NOT NULL,
	"stable_key" varchar(160) NOT NULL,
	"statement" text NOT NULL,
	"status" "epistemic_status" DEFAULT 'HYPOTHESIS' NOT NULL,
	"falsification_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(100) NOT NULL,
	"status" "job_status" DEFAULT 'PENDING' NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(160),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_attempts_valid" CHECK ("jobs"."attempts" >= 0 and "jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "localized_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"translation_status" "translation_status" DEFAULT 'DRAFT' NOT NULL,
	"source_locale" "locale",
	"source_localized_revision_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"slug" varchar(240) NOT NULL,
	"source_markdown" text NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localized_revisions_source_hash_format" CHECK ("localized_revisions"."source_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "navigation_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space" "navigation_space" NOT NULL,
	"locale" "locale" NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "publication_pointers" (
	"content_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"localized_revision_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"path" varchar(512) NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	CONSTRAINT "publication_pointers_content_id_locale_pk" PRIMARY KEY("content_id","locale")
);
--> statement-breakpoint
CREATE TABLE "redirect_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" "locale" NOT NULL,
	"from_path" varchar(512) NOT NULL,
	"to_content_id" uuid NOT NULL,
	"to_path" varchar(512) NOT NULL,
	"http_status" integer DEFAULT 308 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirect_history_http_status_allowed" CHECK ("redirect_history"."http_status" in (301, 302, 307, 308))
);
--> statement-breakpoint
CREATE TABLE "render_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"localized_revision_id" uuid NOT NULL,
	"compiler_version" varchar(80) NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"html" text NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"toc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_text" text NOT NULL,
	"compiled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_programs" (
	"content_id" uuid PRIMARY KEY NOT NULL,
	"objective" text NOT NULL,
	"scope" text,
	"methodology" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_labels" (
	"tag_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "tag_labels_tag_id_locale_pk" PRIMARY KEY("tag_id","locale")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_closure" (
	"ancestor_id" uuid NOT NULL,
	"descendant_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "taxonomy_closure_ancestor_id_descendant_id_pk" PRIMARY KEY("ancestor_id","descendant_id"),
	CONSTRAINT "taxonomy_closure_depth_nonnegative" CHECK ("taxonomy_closure"."depth" >= 0)
);
--> statement-breakpoint
CREATE TABLE "taxonomy_node_labels" (
	"node_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"label" text NOT NULL,
	"slug" varchar(240) NOT NULL,
	"description" text,
	CONSTRAINT "taxonomy_node_labels_node_id_locale_pk" PRIMARY KEY("node_id","locale")
);
--> statement-breakpoint
CREATE TABLE "taxonomy_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" varchar(160) NOT NULL,
	"space" "navigation_space" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_placements" (
	"content_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_placements_content_id_node_id_pk" PRIMARY KEY("content_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_localized_revision_id_localized_revisions_id_fk" FOREIGN KEY ("localized_revision_id") REFERENCES "public"."localized_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_from_content_id_contents_id_fk" FOREIGN KEY ("from_content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_to_content_id_contents_id_fk" FOREIGN KEY ("to_content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "definition_ledger" ADD CONSTRAINT "definition_ledger_research_program_id_research_programs_content_id_fk" FOREIGN KEY ("research_program_id") REFERENCES "public"."research_programs"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "definition_ledger" ADD CONSTRAINT "definition_ledger_valid_from_revision_id_content_revisions_id_fk" FOREIGN KEY ("valid_from_revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_profiles" ADD CONSTRAINT "experiment_profiles_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_profiles" ADD CONSTRAINT "experiment_profiles_hypothesis_id_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."hypotheses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_research_program_id_research_programs_content_id_fk" FOREIGN KEY ("research_program_id") REFERENCES "public"."research_programs"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localized_revisions" ADD CONSTRAINT "localized_revisions_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_pointers" ADD CONSTRAINT "publication_pointers_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_pointers" ADD CONSTRAINT "publication_pointers_localized_revision_id_localized_revisions_id_fk" FOREIGN KEY ("localized_revision_id") REFERENCES "public"."localized_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_pointers" ADD CONSTRAINT "publication_pointers_artifact_id_render_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."render_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirect_history" ADD CONSTRAINT "redirect_history_to_content_id_contents_id_fk" FOREIGN KEY ("to_content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_artifacts" ADD CONSTRAINT "render_artifacts_localized_revision_id_localized_revisions_id_fk" FOREIGN KEY ("localized_revision_id") REFERENCES "public"."localized_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_programs" ADD CONSTRAINT "research_programs_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_labels" ADD CONSTRAINT "tag_labels_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_closure" ADD CONSTRAINT "taxonomy_closure_ancestor_id_taxonomy_nodes_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_closure" ADD CONSTRAINT "taxonomy_closure_descendant_id_taxonomy_nodes_id_fk" FOREIGN KEY ("descendant_id") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_node_labels" ADD CONSTRAINT "taxonomy_node_labels_node_id_taxonomy_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_placements" ADD CONSTRAINT "taxonomy_placements_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_placements" ADD CONSTRAINT "taxonomy_placements_node_id_taxonomy_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_provider_key_uidx" ON "assets" USING btree ("storage_provider","storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_revision_key_uidx" ON "claims" USING btree ("localized_revision_id","stable_key");--> statement-breakpoint
CREATE UNIQUE INDEX "content_relations_edge_uidx" ON "content_relations" USING btree ("from_content_id","to_content_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_content_number_uidx" ON "content_revisions" USING btree ("content_id","revision_number");--> statement-breakpoint
CREATE INDEX "content_revisions_content_created_idx" ON "content_revisions" USING btree ("content_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contents_canonical_key_uidx" ON "contents" USING btree ("canonical_key");--> statement-breakpoint
CREATE INDEX "definition_ledger_program_term_idx" ON "definition_ledger" USING btree ("research_program_id","term");--> statement-breakpoint
CREATE UNIQUE INDEX "hypotheses_program_key_uidx" ON "hypotheses" USING btree ("research_program_id","stable_key");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "localized_revisions_revision_locale_uidx" ON "localized_revisions" USING btree ("revision_id","locale");--> statement-breakpoint
CREATE INDEX "localized_revisions_slug_locale_idx" ON "localized_revisions" USING btree ("locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "navigation_spaces_space_locale_uidx" ON "navigation_spaces" USING btree ("space","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_aggregate_version_uidx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id","aggregate_version");--> statement-breakpoint
CREATE INDEX "outbox_events_dispatch_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_pointers_locale_path_uidx" ON "publication_pointers" USING btree ("locale","path");--> statement-breakpoint
CREATE UNIQUE INDEX "redirect_history_locale_from_uidx" ON "redirect_history" USING btree ("locale","from_path");--> statement-breakpoint
CREATE UNIQUE INDEX "render_artifacts_input_uidx" ON "render_artifacts" USING btree ("localized_revision_id","compiler_version","source_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_stable_key_uidx" ON "tags" USING btree ("stable_key");--> statement-breakpoint
CREATE INDEX "taxonomy_closure_descendant_idx" ON "taxonomy_closure" USING btree ("descendant_id","depth");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_node_labels_locale_slug_uidx" ON "taxonomy_node_labels" USING btree ("locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_nodes_stable_key_uidx" ON "taxonomy_nodes" USING btree ("stable_key");