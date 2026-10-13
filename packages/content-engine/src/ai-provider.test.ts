import { describe, expect, it, vi } from "vitest";
import {
  aggregateEmbeddings,
  createKnowledgeProvider,
  knowledgeProviderFromEnvironment,
  validateEmbeddingResponse,
} from "./ai-provider.js";
const response = {
  model: "fixture/model@revision",
  dimension: 2,
  embeddings: [{ dense: [1, 0], sparse: { "42": 1 } }],
};
describe("bounded knowledge provider", () => {
  it("is disabled without explicit activation and refuses missing secrets", () => {
    expect(knowledgeProviderFromEnvironment({})).toBeUndefined();
    expect(() => knowledgeProviderFromEnvironment({ AI_PROVIDER_ENABLED: "true" })).toThrow(
      "PROVIDER_CONFIG_INVALID",
    );
  });
  it("sends only the established protocol with authorization and no redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(response));
    const provider = createKnowledgeProvider({
      baseUrl: "https://example.test",
      apiKey: "k".repeat(32),
      fetcher,
    });
    expect(await provider.embeddings(["public text"])).toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://example.test/api/v1/archive/embeddings"),
      expect.objectContaining({
        redirect: "error",
        cache: "no-store",
        body: JSON.stringify({ texts: ["public text"] }),
        headers: expect.objectContaining({ authorization: `Bearer ${"k".repeat(32)}` }),
      }),
    );
  });
  it("rejects invalid/nonfinite/misaligned vectors and adversarial sparse keys", () => {
    expect(() => validateEmbeddingResponse({ ...response, dimension: 1 }, 1)).toThrow(
      "PROVIDER_RESPONSE_INVALID",
    );
    expect(() =>
      validateEmbeddingResponse({ ...response, embeddings: [{ dense: [NaN, 0], sparse: {} }] }, 1),
    ).toThrow();
    expect(() =>
      validateEmbeddingResponse(
        { ...response, embeddings: [{ dense: [1, 0], sparse: { __proto__: 1, invalid: 1 } }] },
        1,
      ),
    ).toThrow();
  });
  it("opens the circuit and never exposes upstream response content", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => new Response("secret private error", { status: 503 }));
    const provider = createKnowledgeProvider({
      baseUrl: "https://example.test",
      apiKey: "k".repeat(32),
      fetcher,
    });
    for (let i = 0; i < 3; i++)
      await expect(provider.embeddings(["text"])).rejects.toThrow("PROVIDER_UNAVAILABLE");
    await expect(provider.embeddings(["text"])).rejects.toThrow("PROVIDER_CIRCUIT_OPEN");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects oversized inputs before making a request", async () => {
    const fetcher = vi.fn();
    const provider = createKnowledgeProvider({
      baseUrl: "https://example.test",
      apiKey: "k".repeat(32),
      fetcher,
    });
    await expect(provider.embeddings(["x".repeat(8001)])).rejects.toThrow("PROVIDER_INPUT_LIMIT");
    await expect(
      provider.embeddings(Array(20).fill("한".repeat(2000)) as string[]),
    ).rejects.toThrow("PROVIDER_INPUT_LIMIT");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("aborts timed out calls with a sanitized error code", async () => {
    const fetcher: typeof fetch = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("sensitive transport detail")),
            { once: true },
          );
        }),
    );
    const provider = createKnowledgeProvider({
      baseUrl: "https://example.test",
      apiKey: "k".repeat(32),
      timeoutMs: 100,
      fetcher,
    });
    await expect(provider.embeddings(["text"])).rejects.toThrow("PROVIDER_TIMEOUT");
  });
  it("normalizes pooled vectors and preserves tokenizer IDs", () => {
    const vector = aggregateEmbeddings([
      { dense: [2, 0], sparse: { "12": 3 } },
      { dense: [0, 2], sparse: { "13": 4 } },
    ]);
    expect(Math.hypot(...vector.dense)).toBeCloseTo(1);
    expect(vector.sparse).toEqual({ "12": 0.6, "13": 0.8 });
  });
});
