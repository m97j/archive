import { randomUUID } from "node:crypto";

import type {
  PublishRevisionInput,
  PublishedRevision,
  RevisionPublishedPayload,
} from "@archive/contracts";
import { and, eq, sql } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import {
  contentRevisions,
  localizedRevisions,
  outboxEvents,
  publicationPointers,
  redirectHistory,
  renderArtifacts,
} from "./schema/index.js";

export type PublicationInvariantCode =
  | "REVISION_NOT_FOUND"
  | "CONTENT_MISMATCH"
  | "LOCALE_MISMATCH"
  | "REVISION_NOT_APPROVED"
  | "TRANSLATION_NOT_REVIEWED"
  | "ARTIFACT_SOURCE_MISMATCH"
  | "REVISION_ALREADY_PUBLISHED_AT_DIFFERENT_PATH";

export class PublicationInvariantError extends Error {
  override readonly name = "PublicationInvariantError";

  constructor(
    readonly code: PublicationInvariantCode,
    message: string,
  ) {
    super(message);
  }
}

export interface PublishRevisionOptions {
  actorId?: string;
  now?: Date;
}

/** Atomically moves a locale publication pointer and records redirect + outbox history. */
export async function publishLocalizedRevision(
  db: ArchiveDatabase,
  input: PublishRevisionInput,
  options: PublishRevisionOptions = {},
): Promise<PublishedRevision> {
  const now = options.now ?? new Date();

  return db.transaction(async (tx) => {
    // Locks even when a pointer does not exist yet, preventing first-publication races.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.contentId}:${input.locale}`}, 0))`,
    );

    const [candidate] = await tx
      .select({
        contentId: contentRevisions.contentId,
        revisionNumber: contentRevisions.revisionNumber,
        revisionStatus: contentRevisions.status,
        locale: localizedRevisions.locale,
        translationStatus: localizedRevisions.translationStatus,
        sourceHash: localizedRevisions.sourceHash,
        artifactSourceHash: renderArtifacts.sourceHash,
      })
      .from(localizedRevisions)
      .innerJoin(contentRevisions, eq(contentRevisions.id, localizedRevisions.revisionId))
      .innerJoin(
        renderArtifacts,
        and(
          eq(renderArtifacts.id, input.artifactId),
          eq(renderArtifacts.localizedRevisionId, localizedRevisions.id),
        ),
      )
      .where(eq(localizedRevisions.id, input.localizedRevisionId))
      .limit(1);

    if (candidate === undefined) {
      throw new PublicationInvariantError(
        "REVISION_NOT_FOUND",
        "The localized revision and render artifact pair does not exist",
      );
    }
    if (candidate.contentId !== input.contentId) {
      throw new PublicationInvariantError(
        "CONTENT_MISMATCH",
        "Revision belongs to another content",
      );
    }
    if (candidate.locale !== input.locale) {
      throw new PublicationInvariantError(
        "LOCALE_MISMATCH",
        "Revision locale does not match request",
      );
    }
    if (candidate.revisionStatus !== "APPROVED" && candidate.revisionStatus !== "PUBLISHED") {
      throw new PublicationInvariantError(
        "REVISION_NOT_APPROVED",
        "Only approved revisions can be published",
      );
    }
    if (candidate.translationStatus !== "REVIEWED" && candidate.translationStatus !== "PUBLISHED") {
      throw new PublicationInvariantError(
        "TRANSLATION_NOT_REVIEWED",
        "Only reviewed translations can be published",
      );
    }
    if (candidate.sourceHash !== candidate.artifactSourceHash) {
      throw new PublicationInvariantError(
        "ARTIFACT_SOURCE_MISMATCH",
        "Render artifact was compiled from a different source",
      );
    }

    const [previous] = await tx
      .select({
        path: publicationPointers.path,
        localizedRevisionId: publicationPointers.localizedRevisionId,
      })
      .from(publicationPointers)
      .where(
        and(
          eq(publicationPointers.contentId, input.contentId),
          eq(publicationPointers.locale, input.locale),
        ),
      )
      .limit(1);

    if (
      previous?.localizedRevisionId === input.localizedRevisionId &&
      previous.path !== input.path
    ) {
      throw new PublicationInvariantError(
        "REVISION_ALREADY_PUBLISHED_AT_DIFFERENT_PATH",
        "Create a new revision to change the canonical publication path",
      );
    }

    await tx
      .insert(publicationPointers)
      .values({
        contentId: input.contentId,
        locale: input.locale,
        localizedRevisionId: input.localizedRevisionId,
        artifactId: input.artifactId,
        path: input.path,
        publishedAt: now,
        ...(options.actorId === undefined ? {} : { publishedBy: options.actorId }),
      })
      .onConflictDoUpdate({
        target: [publicationPointers.contentId, publicationPointers.locale],
        set: {
          localizedRevisionId: input.localizedRevisionId,
          artifactId: input.artifactId,
          path: input.path,
          publishedAt: now,
          ...(options.actorId === undefined ? {} : { publishedBy: options.actorId }),
        },
      });

    if (previous !== undefined && previous.path !== input.path) {
      await tx
        .insert(redirectHistory)
        .values({
          locale: input.locale,
          fromPath: previous.path,
          toContentId: input.contentId,
          toPath: input.path,
          httpStatus: 308,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [redirectHistory.locale, redirectHistory.fromPath],
          set: { toContentId: input.contentId, toPath: input.path, httpStatus: 308 },
        });
    }

    const payload: RevisionPublishedPayload = {
      contentId: input.contentId,
      localizedRevisionId: input.localizedRevisionId,
      artifactId: input.artifactId,
      locale: input.locale,
      path: input.path,
      ...(previous === undefined ? {} : { previousPath: previous.path }),
      revisionNumber: candidate.revisionNumber,
      publishedAt: now.toISOString(),
    };
    const proposedEventId = randomUUID();
    const aggregateType = `CONTENT_PUBLICATION_${input.locale.toUpperCase()}`;
    const inserted = await tx
      .insert(outboxEvents)
      .values({
        id: proposedEventId,
        eventType: "REVISION_PUBLISHED",
        aggregateType,
        aggregateId: input.contentId,
        aggregateVersion: candidate.revisionNumber,
        payload,
        occurredAt: now,
        availableAt: now,
      })
      .onConflictDoNothing({
        target: [
          outboxEvents.aggregateType,
          outboxEvents.aggregateId,
          outboxEvents.aggregateVersion,
        ],
      })
      .returning({ id: outboxEvents.id });

    const eventId =
      inserted[0]?.id ??
      (
        await tx
          .select({ id: outboxEvents.id })
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.aggregateType, aggregateType),
              eq(outboxEvents.aggregateId, input.contentId),
              eq(outboxEvents.aggregateVersion, candidate.revisionNumber),
            ),
          )
          .limit(1)
      )[0]?.id;

    if (eventId === undefined) throw new Error("Unable to persist publication event");

    return {
      ...input,
      revisionNumber: candidate.revisionNumber,
      publishedAt: now.toISOString(),
      eventId,
    };
  });
}
