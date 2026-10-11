import type { CompiledDocument, Locale } from "@archive/contracts";
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import { jobs, localizedRevisions, outboxEvents, renderArtifacts } from "./schema/index.js";

export interface ClaimedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export interface CompilationSource {
  localizedRevisionId: string;
  locale: Locale;
  sourceMarkdown: string;
  sourceHash: string;
}

export async function claimJobs(
  db: ArchiveDatabase,
  workerId: string,
  type: string,
  limit = 10,
  now = new Date(),
): Promise<ClaimedJob[]> {
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, type),
          eq(jobs.status, "PENDING"),
          lte(jobs.availableAt, now),
          lt(jobs.attempts, jobs.maxAttempts),
        ),
      )
      .orderBy(asc(jobs.availableAt), asc(jobs.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    const claimed: ClaimedJob[] = [];
    for (const candidate of candidates) {
      const [job] = await tx
        .update(jobs)
        .set({
          status: "RUNNING",
          lockedAt: now,
          lockedBy: workerId,
          attempts: sql`${jobs.attempts} + 1`,
          updatedAt: now,
          lastError: null,
        })
        .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "PENDING")))
        .returning({
          id: jobs.id,
          type: jobs.type,
          payload: jobs.payload,
          attempts: jobs.attempts,
          maxAttempts: jobs.maxAttempts,
        });
      if (job !== undefined) claimed.push(job);
    }
    return claimed;
  });
}

export async function loadCompilationSource(
  db: ArchiveDatabase,
  localizedRevisionId: string,
): Promise<CompilationSource | undefined> {
  const [source] = await db
    .select({
      localizedRevisionId: localizedRevisions.id,
      locale: localizedRevisions.locale,
      sourceMarkdown: localizedRevisions.sourceMarkdown,
      sourceHash: localizedRevisions.sourceHash,
    })
    .from(localizedRevisions)
    .where(eq(localizedRevisions.id, localizedRevisionId))
    .limit(1);
  return source;
}

export async function completeCompilationJob(
  db: ArchiveDatabase,
  jobId: string,
  workerId: string,
  localizedRevisionId: string,
  compilerVersion: string,
  document: CompiledDocument,
  now = new Date(),
): Promise<string> {
  return db.transaction(async (tx) => {
    const [lease] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "RUNNING"), eq(jobs.lockedBy, workerId)))
      .for("update")
      .limit(1);
    if (lease === undefined) throw new Error(`Job lease was lost for ${jobId}`);
    const inserted = await tx
      .insert(renderArtifacts)
      .values({
        localizedRevisionId,
        compilerVersion,
        schemaVersion: document.schemaVersion,
        sourceHash: document.sourceHash,
        html: document.html,
        blocks: document.blocks,
        toc: document.toc,
        frontmatter: document.frontmatter,
        searchText: document.searchText,
        compiledAt: now,
      })
      .onConflictDoNothing({
        target: [
          renderArtifacts.localizedRevisionId,
          renderArtifacts.compilerVersion,
          renderArtifacts.sourceHash,
        ],
      })
      .returning({ id: renderArtifacts.id });
    const artifactId =
      inserted[0]?.id ??
      (
        await tx
          .select({ id: renderArtifacts.id })
          .from(renderArtifacts)
          .where(
            and(
              eq(renderArtifacts.localizedRevisionId, localizedRevisionId),
              eq(renderArtifacts.compilerVersion, compilerVersion),
              eq(renderArtifacts.sourceHash, document.sourceHash),
            ),
          )
          .limit(1)
      )[0]?.id;
    if (artifactId === undefined) throw new Error("Unable to persist render artifact");
    await tx
      .update(jobs)
      .set({
        status: "SUCCEEDED",
        result: { artifactId, sourceHash: document.sourceHash },
        lockedAt: null,
        lockedBy: null,
        updatedAt: now,
      })
      .where(eq(jobs.id, jobId));
    await tx
      .insert(outboxEvents)
      .values({
        eventType: "DOCUMENT_COMPILED",
        aggregateType: "RENDER_ARTIFACT",
        aggregateId: artifactId,
        aggregateVersion: document.schemaVersion,
        payload: {
          artifactId,
          localizedRevisionId,
          compilerVersion,
          sourceHash: document.sourceHash,
        },
        occurredAt: now,
        availableAt: now,
      })
      .onConflictDoNothing();
    return artifactId;
  });
}

export async function failJob(
  db: ArchiveDatabase,
  job: Pick<ClaimedJob, "id" | "attempts" | "maxAttempts">,
  workerId: string,
  error: string,
  retryAt: Date,
): Promise<boolean> {
  const [updated] = await db
    .update(jobs)
    .set({
      status: job.attempts >= job.maxAttempts ? "FAILED" : "PENDING",
      availableAt: retryAt,
      lockedAt: null,
      lockedBy: null,
      lastError: error.slice(0, 8_000),
      updatedAt: new Date(),
    })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, "RUNNING"), eq(jobs.lockedBy, workerId)))
    .returning({ id: jobs.id });
  return updated !== undefined;
}

/** Recover interrupted jobs only after their bounded lease has expired. */
export async function recoverStaleJobs(db: ArchiveDatabase, lockedBefore: Date): Promise<number> {
  const failed = await db
    .update(jobs)
    .set({ status: "FAILED", lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(
      and(
        eq(jobs.status, "RUNNING"),
        lt(jobs.lockedAt, lockedBefore),
        gte(jobs.attempts, jobs.maxAttempts),
      ),
    )
    .returning({ id: jobs.id });
  const retried = await db
    .update(jobs)
    .set({ status: "PENDING", lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(
      and(
        eq(jobs.status, "RUNNING"),
        lt(jobs.lockedAt, lockedBefore),
        lt(jobs.attempts, jobs.maxAttempts),
      ),
    )
    .returning({ id: jobs.id });
  return failed.length + retried.length;
}
