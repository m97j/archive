import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { importLegacy } from "../../../packages/db/scripts/import-legacy-core.mjs";

test(
  "legacy import preserves originals and complete Markdown as private, idempotent drafts",
  { timeout: 60000 },
  async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE "Post"(id text primary key, slug text,title text,"contentMd" text,category text,language text,visibility text,"createdAt" timestamptz,"updatedAt" timestamptz);
      CREATE TABLE "Tag"(id text primary key,emoji text,label text,description text,"createdAt" timestamptz);
      CREATE TABLE "TagOnPost"(id text primary key,"postId" text,"tagId" text);
      CREATE TABLE "_prisma_migrations"(id text primary key);
      INSERT INTO "Post" VALUES('old-post','old-slug','Synthetic preserved title','Original Markdown with code','notes','ko','public',now(),now());
      INSERT INTO "Tag" VALUES('old-tag','X','Synthetic tag','Preserved description',now());
      INSERT INTO "TagOnPost" VALUES('old-link','old-post','old-tag');`);
      const directory = new URL("../../../supabase/migrations/", import.meta.url);
      const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", directory), "utf8"));
      for (const entry of journal.entries)
        await db.exec(readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8"));
      const adapter = { query: (sql, parameters) => db.query(sql, parameters) };
      const result = await importLegacy(adapter);
      assert.equal(result.imported, 1);
      assert.equal(result.originalsDeleted, false);
      assert.equal(result.autoPublished, false);
      assert.equal((await db.query('SELECT count(*) FROM "Post"')).rows[0].count, 1);
      const row = (
        await db.query(
          "SELECT c.visibility,l.source_markdown,r.metadata FROM contents c JOIN content_revisions r ON r.content_id=c.id JOIN localized_revisions l ON l.revision_id=r.id",
        )
      ).rows[0];
      assert.equal(row.visibility, "PRIVATE");
      assert.equal(row.source_markdown, "Original Markdown with code");
      assert.equal(row.metadata.legacy.tags[0].description, "Preserved description");
      assert.equal((await db.query("SELECT count(*) FROM content_tags")).rows[0].count, 1);
      assert.equal((await importLegacy(adapter)).skipped, 1);
      assert.equal((await db.query("SELECT count(*) FROM contents")).rows[0].count, 1);
    } finally {
      await db.close();
    }
  },
);
