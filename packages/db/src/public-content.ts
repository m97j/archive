import type { PublicResolution, RenderBlock, Heading } from "@archive/contracts";
import { and, eq, isNull } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import {
  contentRevisions,
  contents,
  localizedRevisions,
  publicationPointers,
  redirectHistory,
  renderArtifacts,
} from "./schema/index.js";

export async function resolvePublicContent(
  db: ArchiveDatabase,
  locale: "en" | "ko" | "ja" | "zh" | "es" | "fr" | "de",
  path: string,
): Promise<PublicResolution | undefined> {
  const [document] = await db
    .select({
      contentId: contents.id,
      kind: contents.kind,
      title: localizedRevisions.title,
      description: localizedRevisions.description,
      revisionNumber: contentRevisions.revisionNumber,
      publishedAt: publicationPointers.publishedAt,
      schemaVersion: renderArtifacts.schemaVersion,
      sourceHash: renderArtifacts.sourceHash,
      html: renderArtifacts.html,
      blocks: renderArtifacts.blocks,
      toc: renderArtifacts.toc,
      searchText: renderArtifacts.searchText,
      frontmatter: renderArtifacts.frontmatter,
    })
    .from(publicationPointers)
    .innerJoin(contents, eq(contents.id, publicationPointers.contentId))
    .innerJoin(
      localizedRevisions,
      eq(localizedRevisions.id, publicationPointers.localizedRevisionId),
    )
    .innerJoin(contentRevisions, eq(contentRevisions.id, localizedRevisions.revisionId))
    .innerJoin(renderArtifacts, eq(renderArtifacts.id, publicationPointers.artifactId))
    .where(
      and(
        eq(publicationPointers.locale, locale),
        eq(publicationPointers.path, path),
        eq(contents.visibility, "PUBLIC"),
        isNull(contents.archivedAt),
      ),
    )
    .limit(1);
  if (document !== undefined) {
    if (document.schemaVersion !== 1) {
      throw new Error(`Unsupported render artifact schema version ${document.schemaVersion}`);
    }
    return {
      type: "document",
      contentId: document.contentId,
      kind: document.kind,
      locale,
      path,
      title: document.title,
      ...(document.description === null ? {} : { description: document.description }),
      revisionNumber: document.revisionNumber,
      publishedAt: document.publishedAt.toISOString(),
      artifact: {
        schemaVersion: 1,
        locale,
        title: document.title,
        ...(document.description === null ? {} : { description: document.description }),
        sourceHash: document.sourceHash,
        html: document.html,
        blocks: document.blocks as RenderBlock[],
        toc: document.toc as Heading[],
        searchText: document.searchText,
        frontmatter: document.frontmatter,
      },
    };
  }
  const [redirect] = await db
    .select({ toPath: redirectHistory.toPath, status: redirectHistory.httpStatus })
    .from(redirectHistory)
    .innerJoin(contents, eq(contents.id, redirectHistory.toContentId))
    .where(
      and(
        eq(redirectHistory.locale, locale),
        eq(redirectHistory.fromPath, path),
        eq(contents.visibility, "PUBLIC"),
        isNull(contents.archivedAt),
      ),
    )
    .limit(1);
  return redirect === undefined
    ? undefined
    : {
        type: "redirect",
        locale,
        fromPath: path,
        toPath: redirect.toPath,
        status: redirect.status,
      };
}
