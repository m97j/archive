import type {
  AdminJob,
  Locale,
  PublicContentSummary,
  QueueTranslationInput,
} from "@archive/contracts";
import { isReservedPublicationPath } from "@archive/contracts";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { ArchiveDatabase } from "./index.js";
import {
  contents,
  contentRevisions,
  jobs,
  localizedRevisions,
  publicationEmbeddings,
  publicationPointers,
  renderArtifacts,
} from "./schema/index.js";
import { ArchiveInvariantError } from "./taxonomy.js";
import { createDraftRevision } from "./workflow.js";

export interface PublishedAiSource {
  contentId: string;
  artifactId: string;
  localizedRevisionId: string;
  revisionId: string;
  locale: Locale;
  sourceHash: string;
  sourceMarkdown: string;
  searchText: string;
  title: string;
  description: string | null;
  slug: string;
  frontmatter: Record<string, unknown>;
}
export async function loadPublishedAiSource(
  db: ArchiveDatabase,
  contentId: string,
  locale: Locale,
  artifactId?: string,
): Promise<PublishedAiSource | undefined> {
  const [source] = await db
    .select({
      contentId: contents.id,
      artifactId: renderArtifacts.id,
      localizedRevisionId: localizedRevisions.id,
      revisionId: contentRevisions.id,
      locale: publicationPointers.locale,
      sourceHash: renderArtifacts.sourceHash,
      sourceMarkdown: localizedRevisions.sourceMarkdown,
      searchText: renderArtifacts.searchText,
      title: localizedRevisions.title,
      description: localizedRevisions.description,
      slug: localizedRevisions.slug,
      frontmatter: localizedRevisions.frontmatter,
    })
    .from(publicationPointers)
    .innerJoin(contents, eq(contents.id, publicationPointers.contentId))
    .innerJoin(renderArtifacts, eq(renderArtifacts.id, publicationPointers.artifactId))
    .innerJoin(
      localizedRevisions,
      eq(localizedRevisions.id, publicationPointers.localizedRevisionId),
    )
    .innerJoin(contentRevisions, eq(contentRevisions.id, localizedRevisions.revisionId))
    .where(
      and(
        eq(contents.id, contentId),
        eq(publicationPointers.locale, locale),
        eq(contents.visibility, "PUBLIC"),
        isNull(contents.archivedAt),
        ...(artifactId ? [eq(renderArtifacts.id, artifactId)] : []),
      ),
    )
    .limit(1);
  return source;
}
async function enqueue(
  db: ArchiveDatabase,
  type: string,
  source: PublishedAiSource,
  actorId: string,
  targetLocale?: Locale,
): Promise<AdminJob> {
  return db.transaction(async (tx) => {
    const key = `${type}:${source.artifactId}:${targetLocale ?? source.locale}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    const [existing] = await tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.type, type),
          sql`${jobs.payload}->>'artifactId' = ${source.artifactId}`,
          ...(targetLocale ? [sql`${jobs.payload}->>'targetLocale' = ${targetLocale}`] : []),
          sql`${jobs.status} in ('PENDING', 'RUNNING')`,
        ),
      )
      .limit(1);
    if (existing) return jobSummary(existing);
    const [job] = await tx
      .insert(jobs)
      .values({
        type,
        maxAttempts: 3,
        payload: {
          contentId: source.contentId,
          locale: source.locale,
          artifactId: source.artifactId,
          sourceHash: source.sourceHash,
          actorId,
          ...(targetLocale ? { targetLocale } : {}),
        },
      })
      .returning();
    if (!job) throw new Error("AI_JOB_CREATE_FAILED");
    return jobSummary(job);
  });
}
export async function enqueueEmbedding(
  db: ArchiveDatabase,
  contentId: string,
  locale: Locale,
  actorId: string,
): Promise<AdminJob> {
  const source = await loadPublishedAiSource(db, contentId, locale);
  if (!source)
    throw new ArchiveInvariantError(
      "PUBLIC_SOURCE_REQUIRED",
      "Publish a public document before requesting an embedding",
    );
  return enqueue(db, "EMBED_PUBLICATION", source, actorId);
}
export async function enqueueTranslation(
  db: ArchiveDatabase,
  input: QueueTranslationInput,
  actorId: string,
): Promise<AdminJob> {
  if (input.sourceLocale === input.targetLocale)
    throw new ArchiveInvariantError("TRANSLATION_LOCALE_SAME", "Choose a different target locale");
  const source = await loadPublishedAiSource(db, input.contentId, input.sourceLocale);
  if (!source)
    throw new ArchiveInvariantError(
      "PUBLIC_SOURCE_REQUIRED",
      "Translation providers receive published public sources only",
    );
  return enqueue(db, "TRANSLATE_PUBLICATION", source, actorId, input.targetLocale);
}
function jobSummary(row: typeof jobs.$inferSelect): AdminJob {
  const errorCode =
    row.lastError && /^[A-Z0-9_]{1,80}$/.test(row.lastError) ? row.lastError : undefined;
  const result = row.result
    ? Object.fromEntries(
        Object.entries(row.result).filter(
          ([key, value]) =>
            [
              "artifactId",
              "revisionId",
              "sourceHash",
              "model",
              "dimension",
              "targetLocale",
              "reviewRequired",
            ].includes(key) && ["string", "number", "boolean"].includes(typeof value),
        ),
      )
    : undefined;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(result ? { result } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
}
export async function listAdminJobs(db: ArchiveDatabase): Promise<{ items: AdminJob[] }> {
  const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(100);
  return { items: rows.map(jobSummary) };
}
async function assertLease(tx: ArchiveDatabase, jobId: string, workerId: string): Promise<void> {
  const [lease] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "RUNNING"), eq(jobs.lockedBy, workerId)))
    .for("update")
    .limit(1);
  if (!lease) throw new ArchiveInvariantError("AI_LEASE_LOST", "AI job lease is no longer valid");
}
async function assertCurrentSource(tx: ArchiveDatabase, source: PublishedAiSource): Promise<void> {
  const [current] = await tx
    .select({ artifactId: publicationPointers.artifactId })
    .from(publicationPointers)
    .innerJoin(contents, eq(contents.id, publicationPointers.contentId))
    .where(
      and(
        eq(contents.id, source.contentId),
        eq(publicationPointers.locale, source.locale),
        eq(contents.visibility, "PUBLIC"),
        isNull(contents.archivedAt),
      ),
    )
    .for("update")
    .limit(1);
  if (current?.artifactId !== source.artifactId)
    throw new ArchiveInvariantError(
      "AI_SOURCE_STALE",
      "Publication changed while the job was running",
    );
}
export async function completeEmbedding(
  db: ArchiveDatabase,
  jobId: string,
  workerId: string,
  source: PublishedAiSource,
  vector: { dense: number[]; sparse: Record<string, number> },
  model: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const scoped = tx as unknown as ArchiveDatabase;
    await assertLease(scoped, jobId, workerId);
    await assertCurrentSource(scoped, source);
    await tx
      .insert(publicationEmbeddings)
      .values({
        contentId: source.contentId,
        artifactId: source.artifactId,
        locale: source.locale,
        sourceHash: source.sourceHash,
        model,
        dimension: vector.dense.length,
        ...vector,
      })
      .onConflictDoNothing();
    await tx
      .update(jobs)
      .set({
        status: "SUCCEEDED",
        result: {
          artifactId: source.artifactId,
          sourceHash: source.sourceHash,
          model,
          dimension: vector.dense.length,
        },
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  });
}
export async function completeTranslation(
  db: ArchiveDatabase,
  jobId: string,
  workerId: string,
  source: PublishedAiSource,
  input: {
    targetLocale: Locale;
    title: string;
    description?: string;
    markdown: string;
    model: string;
    actorId: string;
    compilerVersion: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const scoped = tx as unknown as ArchiveDatabase;
    await assertLease(scoped, jobId, workerId);
    await assertCurrentSource(scoped, source);
    const revision = await createDraftRevision(
      scoped,
      source.contentId,
      {
        sourceRevisionId: source.revisionId,
        changeSummary: `Machine translation draft (${source.locale} → ${input.targetLocale}); human review required`,
        metadata: {
          translation: {
            provider: "knowledge-engine",
            model: input.model,
            sourceHash: source.sourceHash,
            sourceArtifactId: source.artifactId,
            reviewRequired: true,
            generatedAt: new Date().toISOString(),
          },
        },
        translations: [
          {
            locale: source.locale,
            title: source.title,
            ...(source.description === null ? {} : { description: source.description }),
            slug: source.slug,
            sourceMarkdown: source.sourceMarkdown,
            frontmatter: source.frontmatter,
          },
          {
            locale: input.targetLocale,
            sourceLocale: source.locale,
            sourceLocalizedRevisionId: source.localizedRevisionId,
            title: input.title.slice(0, 500),
            ...(input.description === undefined
              ? {}
              : { description: input.description.slice(0, 2000) }),
            slug: source.slug,
            sourceMarkdown: input.markdown,
            frontmatter: { ...source.frontmatter, locale: input.targetLocale },
          },
        ],
      },
      input.actorId,
      input.compilerVersion,
    );
    await tx
      .update(jobs)
      .set({
        status: "SUCCEEDED",
        result: {
          revisionId: revision.revisionId,
          targetLocale: input.targetLocale,
          model: input.model,
          sourceHash: source.sourceHash,
          reviewRequired: true,
        },
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  });
}
export interface SearchCandidate {
  summary: PublicContentSummary;
  model: string;
  dimension: number;
  dense: number[];
  sparse: Record<string, number>;
}
export async function loadSearchCandidates(
  db: ArchiveDatabase,
  locale: Locale,
): Promise<SearchCandidate[]> {
  const rows = await db
    .select({
      contentId: contents.id,
      kind: contents.kind,
      locale: publicationPointers.locale,
      path: publicationPointers.path,
      title: localizedRevisions.title,
      description: localizedRevisions.description,
      publishedAt: publicationPointers.publishedAt,
      model: publicationEmbeddings.model,
      dimension: publicationEmbeddings.dimension,
      dense: publicationEmbeddings.dense,
      sparse: publicationEmbeddings.sparse,
    })
    .from(publicationPointers)
    .innerJoin(contents, eq(contents.id, publicationPointers.contentId))
    .innerJoin(
      localizedRevisions,
      eq(localizedRevisions.id, publicationPointers.localizedRevisionId),
    )
    .innerJoin(renderArtifacts, eq(renderArtifacts.id, publicationPointers.artifactId))
    .innerJoin(
      publicationEmbeddings,
      and(
        eq(publicationEmbeddings.artifactId, publicationPointers.artifactId),
        eq(publicationEmbeddings.sourceHash, renderArtifacts.sourceHash),
      ),
    )
    .where(
      and(
        eq(publicationPointers.locale, locale),
        eq(contents.visibility, "PUBLIC"),
        isNull(contents.archivedAt),
      ),
    )
    .orderBy(asc(contents.id), desc(publicationEmbeddings.createdAt))
    .limit(501);
  // Fall back to lexical search instead of silently searching a truncated corpus.
  if (rows.length > 500) return [];
  return rows
    .filter((row) => !isReservedPublicationPath(row.path))
    .map((row) => ({
      summary: {
        contentId: row.contentId,
        kind: row.kind,
        locale: row.locale,
        path: row.path,
        title: row.title,
        ...(row.description === null ? {} : { description: row.description }),
        publishedAt: row.publishedAt.toISOString(),
        tags: [],
      },
      model: row.model,
      dimension: row.dimension,
      dense: row.dense,
      sparse: row.sparse,
    }));
}
