import type { AdminContentPage, AdminContentQuery, AdminDraft, Locale } from "@archive/contracts";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import { contentRevisions, contents, localizedRevisions, renderArtifacts } from "./schema/index.js";

export async function listAdminContent(
  db: ArchiveDatabase,
  query: AdminContentQuery,
): Promise<AdminContentPage> {
  const contentRows = await db
    .select({
      id: contents.id,
      kind: contents.kind,
      canonicalKey: contents.canonicalKey,
      visibility: contents.visibility,
      updatedAt: contents.updatedAt,
      archivedAt: contents.archivedAt,
    })
    .from(contents)
    .where(query.includeArchived ? undefined : isNull(contents.archivedAt))
    .orderBy(desc(contents.updatedAt), desc(contents.id))
    .limit(query.limit ?? 25);

  const items = await Promise.all(
    contentRows.map(async (content) => {
      const { archivedAt, ...identity } = content;
      const summary = {
        ...identity,
        ...(archivedAt === null ? {} : { archivedAt: archivedAt.toISOString() }),
        updatedAt: content.updatedAt.toISOString(),
      };
      const [revision] = await db
        .select({
          id: contentRevisions.id,
          revisionNumber: contentRevisions.revisionNumber,
          status: contentRevisions.status,
          createdAt: contentRevisions.createdAt,
        })
        .from(contentRevisions)
        .where(eq(contentRevisions.contentId, content.id))
        .orderBy(desc(contentRevisions.revisionNumber))
        .limit(1);
      if (revision === undefined) {
        return summary;
      }
      const translations = await db
        .select({
          id: localizedRevisions.id,
          locale: localizedRevisions.locale,
          title: localizedRevisions.title,
          slug: localizedRevisions.slug,
          translationStatus: localizedRevisions.translationStatus,
        })
        .from(localizedRevisions)
        .where(eq(localizedRevisions.revisionId, revision.id));
      const translationSummaries = await Promise.all(
        translations.map(async (translation) => {
          const [artifact] = await db
            .select({
              id: renderArtifacts.id,
              compilerVersion: renderArtifacts.compilerVersion,
              compiledAt: renderArtifacts.compiledAt,
            })
            .from(renderArtifacts)
            .where(eq(renderArtifacts.localizedRevisionId, translation.id))
            .orderBy(desc(renderArtifacts.compiledAt))
            .limit(1);
          return {
            ...translation,
            ...(artifact === undefined
              ? {}
              : {
                  artifact: {
                    ...artifact,
                    compiledAt: artifact.compiledAt.toISOString(),
                  },
                }),
          };
        }),
      );
      return {
        ...summary,
        latestRevision: {
          ...revision,
          createdAt: revision.createdAt.toISOString(),
          translations: translationSummaries,
        },
      };
    }),
  );
  return { items };
}

export async function getAdminDraft(
  db: ArchiveDatabase,
  contentId: string,
  locale: Locale,
): Promise<AdminDraft | undefined> {
  const [draft] = await db
    .select({
      contentId: contents.id,
      revisionId: contentRevisions.id,
      locale: localizedRevisions.locale,
      title: localizedRevisions.title,
      slug: localizedRevisions.slug,
      sourceMarkdown: localizedRevisions.sourceMarkdown,
      description: localizedRevisions.description,
    })
    .from(contents)
    .innerJoin(contentRevisions, eq(contentRevisions.contentId, contents.id))
    .innerJoin(localizedRevisions, eq(localizedRevisions.revisionId, contentRevisions.id))
    .where(
      and(
        eq(contents.id, contentId),
        eq(localizedRevisions.locale, locale),
        isNull(contents.archivedAt),
      ),
    )
    .orderBy(desc(contentRevisions.revisionNumber))
    .limit(1);
  if (!draft) return undefined;
  const { description, ...result } = draft;
  return { ...result, ...(description === null ? {} : { description }) };
}
