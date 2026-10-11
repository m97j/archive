import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";

import type { ArchiveDatabase } from "./index.js";
import { outboxEvents } from "./schema/index.js";

export interface ClaimedOutboxEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  occurredAt: Date;
}

export async function claimOutboxEvents(
  db: ArchiveDatabase,
  workerId: string,
  limit = 20,
  now = new Date(),
): Promise<ClaimedOutboxEvent[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Outbox claim limit must be an integer between 1 and 100");
  }

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.status, "PENDING"),
          lte(outboxEvents.availableAt, now),
          lt(outboxEvents.attempts, outboxEvents.maxAttempts),
        ),
      )
      .orderBy(asc(outboxEvents.occurredAt), asc(outboxEvents.id))
      .limit(limit)
      .for("update", { skipLocked: true });

    const claimed: ClaimedOutboxEvent[] = [];
    for (const candidate of candidates) {
      const [event] = await tx
        .update(outboxEvents)
        .set({
          status: "PROCESSING",
          lockedAt: now,
          lockedBy: workerId,
          attempts: sql`${outboxEvents.attempts} + 1`,
          lastError: null,
        })
        .where(and(eq(outboxEvents.id, candidate.id), eq(outboxEvents.status, "PENDING")))
        .returning({
          id: outboxEvents.id,
          eventType: outboxEvents.eventType,
          aggregateType: outboxEvents.aggregateType,
          aggregateId: outboxEvents.aggregateId,
          aggregateVersion: outboxEvents.aggregateVersion,
          payload: outboxEvents.payload,
          attempts: outboxEvents.attempts,
          maxAttempts: outboxEvents.maxAttempts,
          occurredAt: outboxEvents.occurredAt,
        });
      if (event !== undefined) claimed.push(event);
    }
    return claimed;
  });
}

export async function markOutboxPublished(
  db: ArchiveDatabase,
  eventId: string,
  workerId: string,
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(outboxEvents)
    .set({ status: "PUBLISHED", publishedAt: now, lockedAt: null, lockedBy: null })
    .where(
      and(
        eq(outboxEvents.id, eventId),
        eq(outboxEvents.status, "PROCESSING"),
        eq(outboxEvents.lockedBy, workerId),
      ),
    )
    .returning({ id: outboxEvents.id });
  return rows.length === 1;
}

export async function markOutboxFailed(
  db: ArchiveDatabase,
  event: Pick<ClaimedOutboxEvent, "id" | "attempts" | "maxAttempts">,
  workerId: string,
  error: string,
  retryAt: Date,
): Promise<boolean> {
  const exhausted = event.attempts >= event.maxAttempts;
  const rows = await db
    .update(outboxEvents)
    .set({
      status: exhausted ? "FAILED" : "PENDING",
      availableAt: retryAt,
      lockedAt: null,
      lockedBy: null,
      lastError: error.slice(0, 8_000),
    })
    .where(
      and(
        eq(outboxEvents.id, event.id),
        eq(outboxEvents.status, "PROCESSING"),
        eq(outboxEvents.lockedBy, workerId),
      ),
    )
    .returning({ id: outboxEvents.id });
  return rows.length === 1;
}

export async function recoverStaleOutboxEvents(
  db: ArchiveDatabase,
  lockedBefore: Date,
): Promise<number> {
  const failed = await db
    .update(outboxEvents)
    .set({ status: "FAILED", lockedAt: null, lockedBy: null })
    .where(
      and(
        eq(outboxEvents.status, "PROCESSING"),
        lt(outboxEvents.lockedAt, lockedBefore),
        gte(outboxEvents.attempts, outboxEvents.maxAttempts),
      ),
    )
    .returning({ id: outboxEvents.id });
  const retried = await db
    .update(outboxEvents)
    .set({ status: "PENDING", lockedAt: null, lockedBy: null })
    .where(
      and(
        eq(outboxEvents.status, "PROCESSING"),
        lt(outboxEvents.lockedAt, lockedBefore),
        lt(outboxEvents.attempts, outboxEvents.maxAttempts),
      ),
    )
    .returning({ id: outboxEvents.id });
  return failed.length + retried.length;
}
