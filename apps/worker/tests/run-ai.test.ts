import { describe, expect, it, vi } from "vitest";
import type { ClaimedJob, PublishedAiSource } from "@archive/db";
import { ProviderError } from "@archive/content-engine";
import { runAiBatch, type AiJobRepository } from "../src/jobs/run-ai.js";
const source: PublishedAiSource = {
  contentId: "content",
  artifactId: "artifact",
  localizedRevisionId: "localized",
  revisionId: "revision",
  locale: "ko",
  sourceHash: "a".repeat(64),
  sourceMarkdown: "# 원문\n\n`safe_code`",
  searchText: "원문",
  title: "제목",
  description: null,
  slug: "record",
  frontmatter: {},
};
const job: ClaimedJob = {
  id: "job",
  type: "EMBED_PUBLICATION",
  payload: {
    contentId: source.contentId,
    locale: "ko",
    artifactId: source.artifactId,
    sourceHash: source.sourceHash,
    actorId: "actor",
  },
  attempts: 1,
  maxAttempts: 3,
};
function fixture(): AiJobRepository {
  return {
    claim: vi.fn().mockResolvedValue([job]),
    load: vi.fn().mockResolvedValue(source),
    completeEmbedding: vi.fn(),
    completeTranslation: vi.fn(),
    fail: vi.fn().mockResolvedValue(true),
  };
}
const provider = () => ({
  embeddings: vi.fn().mockResolvedValue({
    model: "fixture",
    dimension: 2,
    embeddings: [{ dense: [1, 0], sparse: { "12": 1 } }],
  }),
  translate: vi.fn().mockImplementation(async (texts: string[]) => ({
    model: "fixture/mt",
    translations: texts.map(() => "English"),
  })),
});
describe("bounded durable AI jobs", () => {
  it("does not claim jobs when inference is disabled", async () => {
    const repo = fixture();
    expect((await runAiBatch(repo, undefined)).claimed).toBe(0);
    expect(repo.claim).not.toHaveBeenCalled();
  });
  it("indexes only the currently published source hash", async () => {
    const repo = fixture();
    expect((await runAiBatch(repo, provider())).succeeded).toBe(1);
    expect(repo.completeEmbedding).toHaveBeenCalledWith(
      job,
      source,
      { dense: [1, 0], sparse: { "12": 1 } },
      "fixture",
    );
  });
  it("never embeds a stale or missing publication", async () => {
    const repo = fixture();
    vi.mocked(repo.load).mockResolvedValue(undefined);
    const p = provider();
    expect((await runAiBatch(repo, p)).failed).toBe(1);
    expect(p.embeddings).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(job, "AI_SOURCE_STALE", expect.any(Date));
  });
  it("creates a review-required translated draft preserving literal code", async () => {
    const repo = fixture();
    vi.mocked(repo.claim).mockResolvedValue([
      { ...job, type: "TRANSLATE_PUBLICATION", payload: { ...job.payload, targetLocale: "en" } },
    ]);
    expect((await runAiBatch(repo, provider())).succeeded).toBe(1);
    expect(repo.completeTranslation).toHaveBeenCalledWith(
      expect.any(Object),
      source,
      expect.objectContaining({
        targetLocale: "en",
        markdown: expect.stringContaining("`safe_code`"),
        actorId: "actor",
      }),
    );
    expect(repo.completeEmbedding).not.toHaveBeenCalled();
  });
  it("stores only sanitized failure codes", async () => {
    const repo = fixture();
    const p = provider();
    p.embeddings.mockRejectedValue(new ProviderError("PROVIDER_TIMEOUT"));
    await runAiBatch(repo, p);
    expect(repo.fail).toHaveBeenCalledWith(job, "PROVIDER_TIMEOUT", expect.any(Date));
    p.embeddings.mockRejectedValue(new Error("password, prompt, private text"));
    await runAiBatch(repo, p);
    expect(repo.fail).toHaveBeenLastCalledWith(job, "AI_JOB_FAILED", expect.any(Date));
  });
});
