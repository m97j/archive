import type { ClaimedOutboxEvent } from "@archive/db";
import { describe, expect, it, vi } from "vitest";

import { runOutboxBatch, type OutboxRepository } from "../src/jobs/run-outbox.js";

const event: ClaimedOutboxEvent = {
  id: "10000000-0000-4000-8000-000000000001",
  eventType: "REVISION_PUBLISHED",
  aggregateType: "CONTENT_PUBLICATION_KO",
  aggregateId: "10000000-0000-4000-8000-000000000002",
  aggregateVersion: 2,
  payload: { path: "/ko/research" },
  attempts: 1,
  maxAttempts: 8,
  occurredAt: new Date("2026-09-02T00:00:00.000Z"),
};

function repositoryFor(events: ClaimedOutboxEvent[]) {
  return {
    claim: vi.fn().mockResolvedValue(events),
    markPublished: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
  } satisfies OutboxRepository;
}

describe("runOutboxBatch", () => {
  it("acknowledges events only after a handler succeeds", async () => {
    const repository = repositoryFor([event]);
    const handler = vi.fn().mockResolvedValue(undefined);
    const result = await runOutboxBatch(repository, { REVISION_PUBLISHED: handler });
    expect(result).toEqual({ claimed: 1, published: 1, failed: 0 });
    expect(handler).toHaveBeenCalledWith(event);
    expect(repository.markPublished).toHaveBeenCalledWith(event.id, expect.any(Date));
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it("schedules a bounded retry when delivery fails", async () => {
    const repository = repositoryFor([{ ...event, attempts: 3 }]);
    const now = new Date("2026-09-02T00:00:00.000Z");
    const result = await runOutboxBatch(
      repository,
      { REVISION_PUBLISHED: vi.fn().mockRejectedValue(new Error("network down")) },
      { now, random: () => 0.5 },
    );
    expect(result).toEqual({ claimed: 1, published: 0, failed: 1 });
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: event.id }),
      "network down",
      new Date("2026-09-02T00:00:04.000Z"),
    );
  });

  it("does not silently acknowledge unknown event types", async () => {
    const repository = repositoryFor([{ ...event, eventType: "UNKNOWN" }]);
    await runOutboxBatch(repository, {});
    expect(repository.markPublished).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      "No outbox handler for UNKNOWN",
      expect.any(Date),
    );
  });
});
