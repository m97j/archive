import { describe, expect, it, vi } from "vitest";
import type { PublicContentSummary } from "@archive/contracts";
import type { SearchCandidate } from "@archive/db";
import { createHybridSearch, fuseSearch } from "../src/services/hybrid-search.js";
const summary: PublicContentSummary = {
  contentId: "10000000-0000-4000-8000-000000000001",
  kind: "DOC",
  locale: "ko",
  path: "/ko/text",
  title: "Text",
  publishedAt: "2026-10-13T00:00:00Z",
  tags: [],
};
const candidate: SearchCandidate = {
  summary,
  model: "fixture",
  dimension: 2,
  dense: [1, 0],
  sparse: { "4": 1 },
};
describe("published-only hybrid search", () => {
  it("falls back to lexical search without an enabled provider", async () => {
    const lexical = vi.fn().mockResolvedValue([summary]);
    const candidates = vi.fn();
    expect(await createHybridSearch({ lexical, candidates })({ locale: "ko", q: "query" })).toEqual(
      { items: [summary], mode: "lexical", providerAvailable: false },
    );
    expect(candidates).not.toHaveBeenCalled();
  });
  it("falls back when model versions mismatch or inference fails", async () => {
    const provider = {
      embeddings: vi.fn().mockResolvedValue({
        model: "other",
        dimension: 2,
        embeddings: [{ dense: [1, 0], sparse: {} }],
      }),
      translate: vi.fn(),
    };
    const search = createHybridSearch({
      provider,
      lexical: async () => [summary],
      candidates: async () => [candidate],
    });
    expect((await search({ locale: "ko", q: "x" })).mode).toBe("lexical");
    provider.embeddings.mockRejectedValue(new Error("private upstream message"));
    expect((await search({ locale: "ko", q: "x" })).mode).toBe("lexical");
  });
  it("fuses independently ranked scores and deduplicates model/index duplicates", () => {
    expect(
      fuseSearch(
        [summary],
        [candidate, candidate],
        { dense: [1, 0], sparse: { "4": 1 } },
        "fixture",
        20,
      ),
    ).toEqual([summary]);
  });
});
