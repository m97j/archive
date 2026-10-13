CREATE TABLE "publication_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"model" varchar(240) NOT NULL,
	"dimension" integer NOT NULL,
	"dense" jsonb NOT NULL,
	"sparse" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_embeddings_hash_format" CHECK ("publication_embeddings"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "publication_embeddings_dimension_range" CHECK ("publication_embeddings"."dimension" between 1 and 4096),
	CONSTRAINT "publication_embeddings_dense_shape" CHECK (jsonb_typeof("publication_embeddings"."dense") = 'array' and jsonb_array_length("publication_embeddings"."dense") = "publication_embeddings"."dimension"),
	CONSTRAINT "publication_embeddings_sparse_shape" CHECK (jsonb_typeof("publication_embeddings"."sparse") = 'object')
);
--> statement-breakpoint
ALTER TABLE "publication_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "publication_embeddings" ADD CONSTRAINT "publication_embeddings_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_embeddings" ADD CONSTRAINT "publication_embeddings_artifact_id_render_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."render_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publication_embeddings_input_uidx" ON "publication_embeddings" USING btree ("artifact_id","model");--> statement-breakpoint
CREATE INDEX "publication_embeddings_locale_idx" ON "publication_embeddings" USING btree ("locale","content_id");
--> statement-breakpoint
-- Derived publication vectors are server-only, immutable and never contain visitor queries.
REVOKE ALL ON TABLE public.publication_embeddings FROM PUBLIC;
--> statement-breakpoint
DO $archive_embedding_access$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.publication_embeddings FROM %I', role_name);
    END IF;
  END LOOP;
END;
$archive_embedding_access$;
--> statement-breakpoint
CREATE TRIGGER publication_embeddings_immutable
BEFORE UPDATE OR DELETE ON public.publication_embeddings
FOR EACH ROW EXECUTE FUNCTION public.archive_prevent_immutable_history_mutation();
