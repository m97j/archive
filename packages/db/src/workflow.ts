import { createHash, randomUUID } from "node:crypto";

import type {
  ContentIdentity,
  CreateContentInput,
  CreatedRevision,
  CreateRevisionInput,
  RevisionReviewInput,
  TranslationReviewInput,
  WorkflowTransition,
} from "@archive/contracts";
import { and, eq, max, sql } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import {
  contentRevisions,
  contents,
  jobs,
  localizedRevisions,
  outboxEvents,
  revisionStatusEvents,
  translationStatusEvents,
} from "./schema/index.js";

export class WorkflowInvariantError extends Error {
  override readonly name = "WorkflowInvariantError";
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const hashSource = (source: string) => createHash("sha256").update(source, "utf8").digest("hex");

export async function createContentIdentity(
  db: ArchiveDatabase,
  input: CreateContentInput,
  actorId: string,
  now = new Date(),
): Promise<ContentIdentity> {
  const [created] = await db
    .insert(contents)
    .values({
      kind: input.kind,
      canonicalKey: input.canonicalKey,
      visibility: input.visibility ?? "PRIVATE",
      ownerId: actorId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (created === undefined) throw new Error("Unable to create content identity");
  return { ...created, createdAt: created.createdAt.toISOString() };
}

export async function createDraftRevision(
  db: ArchiveDatabase,
  contentId: string,
  input: CreateRevisionInput,
  actorId: string,
  compilerVersion: string,
  now = new Date(),
): Promise<CreatedRevision> {
  const localeSet = new Set(input.translations.map((translation) => translation.locale));
  if (localeSet.size !== input.translations.length) {
    throw new WorkflowInvariantError("DUPLICATE_LOCALE", "A revision can contain each locale once");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${contentId}, 0))`);
    const [content] = await tx
      .select({ id: contents.id, archivedAt: contents.archivedAt })
      .from(contents)
      .where(eq(contents.id, contentId))
      .limit(1);
    if (content === undefined || content.archivedAt !== null) {
      throw new WorkflowInvariantError(
        "CONTENT_NOT_FOUND",
        "Content does not exist or is archived",
      );
    }
    if (input.sourceRevisionId !== undefined) {
      const [source] = await tx
        .select({ id: contentRevisions.id })
        .from(contentRevisions)
        .where(
          and(
            eq(contentRevisions.id, input.sourceRevisionId),
            eq(contentRevisions.contentId, contentId),
          ),
        )
        .limit(1);
      if (source === undefined) {
        throw new WorkflowInvariantError("SOURCE_REVISION_MISMATCH", "Source revision is invalid");
      }
    }

    const [latest] = await tx
      .select({ revisionNumber: max(contentRevisions.revisionNumber) })
      .from(contentRevisions)
      .where(eq(contentRevisions.contentId, contentId));
    const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
    const revisionId = randomUUID();
    await tx.insert(contentRevisions).values({
      id: revisionId,
      contentId,
      revisionNumber,
      status: "DRAFT",
      ...(input.sourceRevisionId === undefined ? {} : { sourceRevisionId: input.sourceRevisionId }),
      authoredBy: actorId,
      ...(input.changeSummary === undefined ? {} : { changeSummary: input.changeSummary }),
      metadata: input.metadata ?? {},
      createdAt: now,
    });
    await tx.insert(revisionStatusEvents).values({
      revisionId,
      toStatus: "DRAFT",
      actorId,
      createdAt: now,
    });

    const createdTranslations: CreatedRevision["localizedRevisions"] = [];
    for (const translation of input.translations) {
      const localizedRevisionId = randomUUID();
      const compileJobId = randomUUID();
      const sourceHash = hashSource(translation.sourceMarkdown);
      await tx.insert(localizedRevisions).values({
        id: localizedRevisionId,
        revisionId,
        locale: translation.locale,
        translationStatus: "DRAFT",
        ...(translation.sourceLocale === undefined
          ? {}
          : { sourceLocale: translation.sourceLocale }),
        ...(translation.sourceLocalizedRevisionId === undefined
          ? {}
          : { sourceLocalizedRevisionId: translation.sourceLocalizedRevisionId }),
        title: translation.title,
        ...(translation.description === undefined ? {} : { description: translation.description }),
        slug: translation.slug,
        sourceMarkdown: translation.sourceMarkdown,
        sourceHash,
        frontmatter: translation.frontmatter ?? {},
        createdAt: now,
      });
      await tx.insert(translationStatusEvents).values({
        localizedRevisionId,
        toStatus: "DRAFT",
        actorId,
        createdAt: now,
      });
      await tx.insert(jobs).values({
        id: compileJobId,
        type: "COMPILE_DOCUMENT",
        payload: { localizedRevisionId, compilerVersion },
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      });
      createdTranslations.push({
        id: localizedRevisionId,
        locale: translation.locale,
        compileJobId,
        sourceHash,
      });
    }

    await tx.insert(outboxEvents).values({
      eventType: "REVISION_CREATED",
      aggregateType: "CONTENT_REVISION",
      aggregateId: contentId,
      aggregateVersion: revisionNumber,
      payload: { contentId, revisionId, revisionNumber },
      occurredAt: now,
      availableAt: now,
    });
    return {
      revisionId,
      revisionNumber,
      localizedRevisions: createdTranslations,
      createdAt: now.toISOString(),
    };
  });
}

const revisionTransitions: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["IN_REVIEW", "WITHDRAWN"],
  IN_REVIEW: ["APPROVED", "WITHDRAWN"],
  APPROVED: ["WITHDRAWN"],
};

export async function reviewRevision(
  db: ArchiveDatabase,
  revisionId: string,
  input: RevisionReviewInput,
  actorId: string,
  now = new Date(),
): Promise<WorkflowTransition> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: contentRevisions.status })
      .from(contentRevisions)
      .where(eq(contentRevisions.id, revisionId))
      .for("update")
      .limit(1);
    if (current === undefined)
      throw new WorkflowInvariantError("REVISION_NOT_FOUND", "Revision not found");
    if (!(revisionTransitions[current.status] ?? []).includes(input.status)) {
      throw new WorkflowInvariantError(
        "INVALID_REVISION_TRANSITION",
        `${current.status} cannot transition to ${input.status}`,
      );
    }
    await tx
      .update(contentRevisions)
      .set({ status: input.status })
      .where(eq(contentRevisions.id, revisionId));
    await tx.insert(revisionStatusEvents).values({
      revisionId,
      fromStatus: current.status,
      toStatus: input.status,
      actorId,
      ...(input.note === undefined ? {} : { note: input.note }),
      createdAt: now,
    });
    return {
      id: revisionId,
      previousStatus: current.status,
      status: input.status,
      changedAt: now.toISOString(),
    };
  });
}

const translationTransitions: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["REVIEWED"],
  REVIEWED: ["STALE"],
  STALE: ["DRAFT", "REVIEWED"],
};

export async function reviewTranslation(
  db: ArchiveDatabase,
  localizedRevisionId: string,
  input: TranslationReviewInput,
  actorId: string,
  now = new Date(),
): Promise<WorkflowTransition> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: localizedRevisions.translationStatus })
      .from(localizedRevisions)
      .where(eq(localizedRevisions.id, localizedRevisionId))
      .for("update")
      .limit(1);
    if (current === undefined)
      throw new WorkflowInvariantError("TRANSLATION_NOT_FOUND", "Translation not found");
    if (!(translationTransitions[current.status] ?? []).includes(input.status)) {
      throw new WorkflowInvariantError(
        "INVALID_TRANSLATION_TRANSITION",
        `${current.status} cannot transition to ${input.status}`,
      );
    }
    await tx
      .update(localizedRevisions)
      .set({ translationStatus: input.status })
      .where(eq(localizedRevisions.id, localizedRevisionId));
    await tx.insert(translationStatusEvents).values({
      localizedRevisionId,
      fromStatus: current.status,
      toStatus: input.status,
      actorId,
      ...(input.note === undefined ? {} : { note: input.note }),
      createdAt: now,
    });
    return {
      id: localizedRevisionId,
      previousStatus: current.status,
      status: input.status,
      changedAt: now.toISOString(),
    };
  });
}
