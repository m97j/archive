import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import type { ArchiveDatabase } from "../../src/index.js";
import * as schema from "../../src/schema/index.js";
import { updateContentAccess } from "../../src/content-access.js";
import { resolvePublicContent } from "../../src/public-content.js";
import { listPublicContent } from "../../src/catalog.js";
import { getPublicNavigation } from "../../src/navigation.js";
import { getAdminDraft } from "../../src/admin-content.js";

describe("reversible content lifecycle", () => {
  it("hides archived/private content everywhere while preserving all original source and publication rows", async () => {
    const client = new PGlite();
    try {
      const migrationRoot = new URL("../../../../supabase/migrations/", import.meta.url);
      const journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", migrationRoot), "utf8"),
      ) as { entries: { tag: string }[] };
      for (const entry of journal.entries)
        await client.exec(await readFile(new URL(`${entry.tag}.sql`, migrationRoot), "utf8"));
      const db = drizzle(client, { schema }) as unknown as ArchiveDatabase;
      const [content] = await db
        .insert(schema.contents)
        .values({ canonicalKey: "test.record", kind: "DOC", visibility: "PUBLIC" })
        .returning();
      if (!content) throw new Error("Content fixture was not inserted");
      const [revision] = await db
        .insert(schema.contentRevisions)
        .values({ contentId: content.id, revisionNumber: 1 })
        .returning();
      if (!revision) throw new Error("Revision fixture was not inserted");
      const [localized] = await db
        .insert(schema.localizedRevisions)
        .values({
          revisionId: revision.id,
          locale: "ko",
          title: "원문",
          slug: "record",
          sourceMarkdown: "# 보존할 원문",
          sourceHash: "a".repeat(64),
        })
        .returning();
      if (!localized) throw new Error("Localized fixture was not inserted");
      const [artifact] = await db
        .insert(schema.renderArtifacts)
        .values({
          localizedRevisionId: localized.id,
          compilerVersion: "test",
          sourceHash: "a".repeat(64),
          html: "<h1>원문</h1>",
          searchText: "원문",
        })
        .returning();
      if (!artifact) throw new Error("Artifact fixture was not inserted");
      await db.insert(schema.publicationPointers).values({
        contentId: content.id,
        locale: "ko",
        localizedRevisionId: localized.id,
        artifactId: artifact.id,
        path: "/ko/record",
      });
      const [node] = await db
        .insert(schema.taxonomyNodes)
        .values({ stableKey: "test.node", space: "DOCS" })
        .returning();
      if (!node) throw new Error("Navigation fixture was not inserted");
      await db
        .insert(schema.taxonomyNodeLabels)
        .values({ nodeId: node.id, locale: "ko", label: "기록", slug: "record" });
      await db
        .insert(schema.taxonomyClosure)
        .values({ ancestorId: node.id, descendantId: node.id, depth: 0 });
      await db.insert(schema.taxonomyPlacements).values({ contentId: content.id, nodeId: node.id });
      expect((await listPublicContent(db, { locale: "ko" })).items).toHaveLength(1);
      expect((await getPublicNavigation(db, { locale: "ko", space: "DOCS" })).nodes).toHaveLength(
        1,
      );
      expect((await getAdminDraft(db, content.id, "ko"))?.sourceMarkdown).toBe("# 보존할 원문");
      const first = await updateContentAccess(db, content.id, { archived: true }, content.id);
      expect(first.archived).toBe(true);
      expect(await resolvePublicContent(db, "ko", "/ko/record")).toBeUndefined();
      expect((await listPublicContent(db, { locale: "ko" })).items).toHaveLength(0);
      expect((await getPublicNavigation(db, { locale: "ko", space: "DOCS" })).nodes).toHaveLength(
        0,
      );
      expect(await getAdminDraft(db, content.id, "ko")).toBeUndefined();
      const repeat = await updateContentAccess(db, content.id, { archived: true }, content.id);
      expect(repeat.updatedAt).toBe(first.updatedAt);
      expect(await db.select().from(schema.outboxEvents)).toHaveLength(1);
      await updateContentAccess(db, content.id, { archived: false }, content.id);
      expect((await resolvePublicContent(db, "ko", "/ko/record"))?.type).toBe("document");
      await updateContentAccess(db, content.id, { visibility: "PRIVATE" }, content.id);
      expect(await resolvePublicContent(db, "ko", "/ko/record")).toBeUndefined();
      expect((await listPublicContent(db, { locale: "ko" })).items).toHaveLength(0);
      expect((await getPublicNavigation(db, { locale: "ko", space: "DOCS" })).nodes).toHaveLength(
        0,
      );
      expect((await db.select().from(schema.localizedRevisions))[0]?.sourceMarkdown).toBe(
        "# 보존할 원문",
      );
      expect(await db.select().from(schema.contentRevisions)).toHaveLength(1);
      expect(await db.select().from(schema.publicationPointers)).toHaveLength(1);
      expect(await db.select().from(schema.outboxEvents)).toHaveLength(3);
    } finally {
      await client.close();
    }
  }, 30000);
});
