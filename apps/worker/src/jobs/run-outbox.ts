import type { ClaimedOutboxEvent } from "@archive/db";

export type OutboxHandler = (event: ClaimedOutboxEvent) => Promise<void>;

export interface OutboxRepository {
  claim(limit: number, now: Date): Promise<ClaimedOutboxEvent[]>;
  markPublished(eventId: string, now: Date): Promise<boolean>;
  markFailed(
    event: Pick<ClaimedOutboxEvent, "id" | "attempts" | "maxAttempts">,
    error: string,
    retryAt: Date,
  ): Promise<boolean>;
}

export interface RunOutboxOptions {
  batchSize?: number;
  now?: Date;
  random?: () => number;
}

export interface OutboxBatchResult {
  claimed: number;
  published: number;
  failed: number;
}

function retryDelayMilliseconds(attempts: number, random: () => number): number {
  const exponential = Math.min(5 * 60_000, 1_000 * 2 ** Math.min(attempts - 1, 8));
  return Math.round(exponential * (0.8 + random() * 0.4));
}

export async function runOutboxBatch(
  repository: OutboxRepository,
  handlers: Readonly<Record<string, OutboxHandler>>,
  options: RunOutboxOptions = {},
): Promise<OutboxBatchResult> {
  const now = options.now ?? new Date();
  const events = await repository.claim(options.batchSize ?? 20, now);
  let published = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const handler = handlers[event.eventType];
      if (handler === undefined) throw new Error(`No outbox handler for ${event.eventType}`);
      await handler(event);
      if (!(await repository.markPublished(event.id, now))) {
        throw new Error(`Outbox lease was lost for ${event.id}`);
      }
      published += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const delay = retryDelayMilliseconds(event.attempts, options.random ?? Math.random);
      await repository.markFailed(event, message, new Date(now.getTime() + delay));
      failed += 1;
    }
  }

  return { claimed: events.length, published, failed };
}
