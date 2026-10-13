import { describe, expect, it, vi } from "vitest";
import { AuthenticationError, buildApp } from "../src/app.js";
const id = "10000000-0000-4000-8000-000000000001";
const job = {
  id,
  type: "EMBED_PUBLICATION",
  status: "PENDING",
  attempts: 0,
  maxAttempts: 3,
  createdAt: "2026-10-13T00:00:00Z",
  updatedAt: "2026-10-13T00:00:00Z",
};
describe("AI management routes", () => {
  it("requires independent admin authentication for all management jobs", async () => {
    const ai = { enqueueEmbedding: vi.fn(), enqueueTranslation: vi.fn(), listJobs: vi.fn() };
    const app = buildApp({
      publisher: { publish: vi.fn() },
      authenticate: async () => {
        throw new AuthenticationError("Denied");
      },
      ai,
    });
    for (const request of [
      { method: "POST", url: "/v1/admin/ai/embeddings", payload: { contentId: id } },
      {
        method: "POST",
        url: "/v1/admin/ai/translations",
        payload: { contentId: id, sourceLocale: "ko", targetLocale: "en" },
      },
      { method: "GET", url: "/v1/admin/jobs" },
    ] as const)
      expect((await app.inject(request)).statusCode).toBe(401);
    expect(ai.enqueueEmbedding).not.toHaveBeenCalled();
    await app.close();
  });
  it("returns accepted jobs and fails closed when providers are disabled", async () => {
    const enqueueEmbedding = vi.fn().mockResolvedValue(job);
    const app = buildApp({
      publisher: { publish: vi.fn() },
      authenticate: async () => ({ id }),
      ai: {
        enqueueEmbedding,
        enqueueTranslation: vi.fn(),
        listJobs: async () => ({ items: [job as never] }),
      },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/admin/ai/embeddings",
          payload: { contentId: id },
        })
      ).statusCode,
    ).toBe(202);
    await app.close();
    const disabled = buildApp({
      publisher: { publish: vi.fn() },
      authenticate: async () => ({ id }),
    });
    expect(
      (
        await disabled.inject({
          method: "POST",
          url: "/v1/admin/ai/embeddings",
          payload: { contentId: id },
        })
      ).statusCode,
    ).toBe(503);
    await disabled.close();
  });
  it("reserves management paths and exposes only bounded public search", async () => {
    const resolvePublic = vi.fn();
    const search = vi
      .fn()
      .mockResolvedValue({ items: [], mode: "lexical", providerAvailable: false });
    const app = buildApp({
      publisher: { publish: vi.fn() },
      authenticate: async () => ({ id }),
      resolvePublic,
      search,
    });
    expect(
      (await app.inject({ method: "GET", url: "/v1/public/resolve?locale=ko&path=%2Fko%2Fadmin" }))
        .statusCode,
    ).toBe(404);
    expect(resolvePublic).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/public/search",
          payload: { locale: "ko", q: "q".repeat(201) },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/public/search",
          payload: { locale: "ko", q: "query" },
        })
      ).statusCode,
    ).toBe(200);
    await app.close();
  });
});
