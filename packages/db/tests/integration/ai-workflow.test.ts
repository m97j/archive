import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { ArchiveDatabase } from "../../src/index.js";
import * as schema from "../../src/schema/index.js";
import {
  completeEmbedding,
  completeTranslation,
  enqueueEmbedding,
  enqueueTranslation,
  loadPublishedAiSource,
  loadSearchCandidates,
} from "../../src/ai.js";
import { claimJobs } from "../../src/jobs.js";
import { publishLocalizedRevision } from "../../src/publication.js";

async function fixture(skipEmbeddingMigration = false) {
  const client = new PGlite();
  const root = new URL("../../../../supabase/migrations/", import.meta.url);
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", root), "utf8")) as {
    entries: { tag: string }[];
  };
  for (const entry of journal.entries) {
    if (skipEmbeddingMigration && entry.tag === "0008_publication_embeddings") continue;
    await client.exec(await readFile(new URL(`${entry.tag}.sql`, root), "utf8"));
  }
  const db = drizzle(client, { schema }) as unknown as ArchiveDatabase;
  const [content] = await db
    .insert(schema.contents)
    .values({ canonicalKey: "ai.test", kind: "DOC", visibility: "PUBLIC" })
    .returning();
  if (!content) throw new Error("fixture");
  const [revision] = await db
    .insert(schema.contentRevisions)
    .values({ contentId: content.id, revisionNumber: 1 })
    .returning();
  if (!revision) throw new Error("fixture");
  const [localized] = await db
    .insert(schema.localizedRevisions)
    .values({
      revisionId: revision.id,
      locale: "ko",
      title: "보존",
      slug: "preserved",
      sourceMarkdown: "# 보존\n\n`code`",
      sourceHash: "a".repeat(64),
    })
    .returning();
  if (!localized) throw new Error("fixture");
  const [artifact] = await db
    .insert(schema.renderArtifacts)
    .values({
      localizedRevisionId: localized.id,
      compilerVersion: "test",
      sourceHash: "a".repeat(64),
      html: "<h1>보존</h1>",
      searchText: "보존 원문",
    })
    .returning();
  if (!artifact) throw new Error("fixture");
  await db.insert(schema.publicationPointers).values({
    contentId: content.id,
    locale: "ko",
    localizedRevisionId: localized.id,
    artifactId: artifact.id,
    path: "/ko/preserved",
  });
  const source = await loadPublishedAiSource(db, content.id, "ko");
  if (!source) throw new Error("fixture");
  return { client, db, content, revision, localized, artifact, source };
}
describe("AI source lineage and publication isolation", () => {
  it("additive migration preserves existing data and closes default Supabase role grants", async () => {
    const f = await fixture(true);
    try {
      const before = await f.db.select().from(schema.localizedRevisions);
      await f.client.exec(
        "CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;",
      );
      await f.client.exec(
        await readFile(
          new URL(
            "../../../../supabase/migrations/0008_publication_embeddings.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      expect(await f.db.select().from(schema.localizedRevisions)).toEqual(before);
      expect(
        (
          await f.client.query(
            "SELECT relrowsecurity FROM pg_catalog.pg_class WHERE relname='publication_embeddings'",
          )
        ).rows,
      ).toEqual([{ relrowsecurity: true }]);
      await f.client.exec("SET ROLE anon");
      await expect(
        f.client.query("SELECT * FROM public.publication_embeddings"),
      ).rejects.toMatchObject({ code: "42501" });
      await f.client.exec("RESET ROLE; SET ROLE authenticated");
      await expect(
        f.client.query("SELECT * FROM public.publication_embeddings"),
      ).rejects.toMatchObject({ code: "42501" });
      await f.client.exec("RESET ROLE");
    } finally {
      await f.client.close();
    }
  }, 30000);
  it("deduplicates queued jobs and preserves immutable vectors while filtering hidden sources", async () => {
    const f = await fixture();
    try {
      const first = await enqueueEmbedding(f.db, f.content.id, "ko", f.content.id);
      expect((await enqueueEmbedding(f.db, f.content.id, "ko", f.content.id)).id).toBe(first.id);
      const [job] = await claimJobs(f.db, "worker", "EMBED_PUBLICATION", 1);
      if (!job) throw new Error("fixture");
      await completeEmbedding(
        f.db,
        job.id,
        "worker",
        f.source,
        { dense: [1, 0], sparse: { "2": 1 } },
        "test/model@revision",
      );
      expect(await loadSearchCandidates(f.db, "ko")).toHaveLength(1);
      await expect(
        f.client.exec("UPDATE public.publication_embeddings SET model='changed'"),
      ).rejects.toMatchObject({ code: "55000" });
      await f.db
        .update(schema.contents)
        .set({ visibility: "PRIVATE" })
        .where(eq(schema.contents.id, f.content.id));
      expect(await loadSearchCandidates(f.db, "ko")).toEqual([]);
      await expect(enqueueEmbedding(f.db, f.content.id, "ko", f.content.id)).rejects.toMatchObject({
        code: "PUBLIC_SOURCE_REQUIRED",
      });
      expect((await f.db.select().from(schema.localizedRevisions))[0]?.sourceMarkdown).toBe(
        f.localized.sourceMarkdown,
      );
    } finally {
      await f.client.close();
    }
  }, 30000);
  it("translation creates new drafts without changing any old source or publication", async () => {
    const f = await fixture();
    try {
      const pointers = await f.db.select().from(schema.publicationPointers);
      const request = await enqueueTranslation(
        f.db,
        { contentId: f.content.id, sourceLocale: "ko", targetLocale: "en" },
        f.content.id,
      );
      const [job] = await claimJobs(f.db, "worker", "TRANSLATE_PUBLICATION", 1);
      if (!job) throw new Error("fixture");
      await completeTranslation(f.db, request.id, "worker", f.source, {
        targetLocale: "en",
        title: "Preserved",
        markdown: "# Preserved\n\n`code`",
        model: "test/mt",
        actorId: f.content.id,
        compilerVersion: "test",
      });
      const revisions = await f.db.select().from(schema.contentRevisions);
      expect(revisions).toHaveLength(2);
      expect(revisions[0]).toEqual(f.revision);
      expect(revisions[1]?.status).toBe("DRAFT");
      expect(revisions[1]?.sourceRevisionId).toBe(f.revision.id);
      const translated = (await f.db.select().from(schema.localizedRevisions)).find(
        (item) => item.locale === "en",
      );
      expect(translated?.translationStatus).toBe("DRAFT");
      expect(translated?.sourceLocalizedRevisionId).toBe(f.localized.id);
      expect(await f.db.select().from(schema.publicationPointers)).toEqual(pointers);
      expect(
        (await f.db.select().from(schema.jobs)).find((item) => item.id === job.id)?.result,
      ).toMatchObject({ reviewRequired: true });
    } finally {
      await f.client.close();
    }
  }, 30000);
  it("rejects management publication paths before modifying database state", async () => {
    const f = await fixture();
    try {
      const pointers = await f.db.select().from(schema.publicationPointers);
      await expect(
        publishLocalizedRevision(f.db, {
          contentId: f.content.id,
          locale: "ko",
          artifactId: f.artifact.id,
          localizedRevisionId: f.localized.id,
          path: "/ko/%61dmin",
        }),
      ).rejects.toMatchObject({ code: "RESERVED_PUBLICATION_PATH" });
      expect(await f.db.select().from(schema.publicationPointers)).toEqual(pointers);
    } finally {
      await f.client.close();
    }
  }, 30000);
});
