import { Buffer } from "node:buffer";

import type { PublicContentPage, PublicContentQuery } from "@archive/contracts";
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import {
  contents,
  contentTags,
  localizedRevisions,
  publicationPointers,
  renderArtifacts,
  tagLabels,
  tags,
  taxonomyNodes,
  taxonomyPlacements,
} from "./schema/index.js";
import { ArchiveInvariantError } from "./taxonomy.js";

interface CatalogCursor {
  publishedAt: string;
  contentId: string;
}

function decodeCursor(cursor: string): CatalogCursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      typeof value !== "object" ||
      value === null ||
      !("publishedAt" in value) ||
      typeof value.publishedAt !== "string" ||
      Number.isNaN(Date.parse(value.publishedAt)) ||
      !("contentId" in value) ||
      typeof value.contentId !== "string"
    ) {
      throw new Error("invalid cursor shape");
    }
    return { publishedAt: value.publishedAt, contentId: value.contentId };
  } catch {
    throw new ArchiveInvariantError("INVALID_CURSOR", "Catalog cursor is invalid");
  }
}

const encodeCursor = (cursor: CatalogCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

export async function listPublicContent(
  db: ArchiveDatabase,
  query: PublicContentQuery,
): Promise<PublicContentPage> {
  const limit = query.limit ?? 20;
  const conditions: SQL[] = [
    eq(publicationPointers.locale, query.locale),
    eq(contents.visibility, "PUBLIC"),
    isNull(contents.archivedAt),
  ];
  if (query.kind !== undefined) conditions.push(eq(contents.kind, query.kind));
  if (query.q !== undefined) {
    conditions.push(
      sql`to_tsvector('simple', ${renderArtifacts.searchText}) @@ websearch_to_tsquery('simple', ${query.q})`,
    );
  }
  if (query.tag !== undefined) {
    conditions.push(sql`exists (
      select 1 from ${contentTags} ct
      inner join ${tags} t on t.id = ct.tag_id
      where ct.content_id = ${contents.id} and t.stable_key = ${query.tag}
    )`);
  }
  if (query.space !== undefined) {
    conditions.push(sql`exists (
      select 1 from ${taxonomyPlacements} tp
      inner join ${taxonomyNodes} tn on tn.id = tp.node_id
      where tp.content_id = ${contents.id} and tn.space = ${query.space}
    )`);
  }
  if (query.taxonomy !== undefined) {
    conditions.push(sql`exists (
      select 1 from ${taxonomyPlacements} tp
      inner join ${taxonomyNodes} tn on tn.id = tp.node_id
      where tp.content_id = ${contents.id} and tn.stable_key = ${query.taxonomy}
    )`);
  }
  if (query.cursor !== undefined) {
    const cursor = decodeCursor(query.cursor);
    const publishedAt = new Date(cursor.publishedAt);
    const cursorCondition = or(
      sql`${publicationPointers.publishedAt} < ${publishedAt}`,
      and(
        eq(publicationPointers.publishedAt, publishedAt),
        sql`${publicationPointers.contentId} < ${cursor.contentId}::uuid`,
      ),
    );
    if (cursorCondition !== undefined) conditions.push(cursorCondition);
  }

  const rows = await db
    .select({
      contentId: contents.id,
      kind: contents.kind,
      path: publicationPointers.path,
      title: localizedRevisions.title,
      description: localizedRevisions.description,
      publishedAt: publicationPointers.publishedAt,
      tags: sql<string[]>`coalesce(
        array_agg(distinct ${tagLabels.label}) filter (where ${tagLabels.locale} = ${query.locale}),
        array[]::text[]
      )`,
    })
    .from(publicationPointers)
    .innerJoin(contents, eq(contents.id, publicationPointers.contentId))
    .innerJoin(
      localizedRevisions,
      eq(localizedRevisions.id, publicationPointers.localizedRevisionId),
    )
    .innerJoin(renderArtifacts, eq(renderArtifacts.id, publicationPointers.artifactId))
    .leftJoin(contentTags, eq(contentTags.contentId, contents.id))
    .leftJoin(tags, eq(tags.id, contentTags.tagId))
    .leftJoin(tagLabels, eq(tagLabels.tagId, tags.id))
    .where(and(...conditions))
    .groupBy(
      contents.id,
      contents.kind,
      publicationPointers.path,
      localizedRevisions.title,
      localizedRevisions.description,
      publicationPointers.publishedAt,
    )
    .orderBy(desc(publicationPointers.publishedAt), desc(contents.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => ({
      contentId: row.contentId,
      kind: row.kind,
      locale: query.locale,
      path: row.path,
      title: row.title,
      ...(row.description === null ? {} : { description: row.description }),
      publishedAt: row.publishedAt.toISOString(),
      tags: row.tags,
    })),
    ...(hasMore && last !== undefined
      ? {
          nextCursor: encodeCursor({
            publishedAt: last.publishedAt.toISOString(),
            contentId: last.contentId,
          }),
        }
      : {}),
  };
}
