import { createHash } from "node:crypto";

import type { ClaimedJob } from "@archive/db";
import { describe, expect, it, vi } from "vitest";

import { runCompilationBatch, type CompilationJobRepository } from "../src/jobs/run-compile.js";

const job: ClaimedJob = {
  id: "10000000-0000-4000-8000-000000000001",
  type: "COMPILE_DOCUMENT",
  payload: {
    localizedRevisionId: "10000000-0000-4000-8000-000000000002",
    compilerVersion: "content-engine-v1",
  },
  attempts: 1,
  maxAttempts: 5,
};

function fakeRepository(): CompilationJobRepository {
  const markdown = "# Compiled";
  return {
    claim: vi.fn().mockResolvedValue([job]),
    load: vi.fn().mockResolvedValue({
      localizedRevisionId: job.payload.localizedRevisionId,
      locale: "en",
      sourceMarkdown: markdown,
      sourceHash: createHash("sha256").update(markdown).digest("hex"),
    }),
    complete: vi.fn().mockResolvedValue("10000000-0000-4000-8000-000000000003"),
    fail: vi.fn().mockResolvedValue(true),
  };
}

describe("runCompilationBatch", () => {
  it("compiles immutable source and completes the leased job", async () => {
    const repository = fakeRepository();
    const result = await runCompilationBatch(repository);
    expect(result).toEqual({ claimed: 1, compiled: 1, failed: 0 });
    expect(repository.complete).toHaveBeenCalledWith(
      job.id,
      job.payload.localizedRevisionId,
      "content-engine-v1",
      expect.objectContaining({ html: expect.stringContaining("Compiled") }),
      expect.any(Date),
    );
  });

  it("retries malformed jobs instead of acknowledging them", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.claim).mockResolvedValue([{ ...job, payload: {} }]);
    const result = await runCompilationBatch(repository, { now: new Date("2026-09-02T00:00:00Z") });
    expect(result.failed).toBe(1);
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ id: job.id }),
      "Compile job requires localizedRevisionId",
      new Date("2026-09-02T00:00:02.000Z"),
    );
  });
});
