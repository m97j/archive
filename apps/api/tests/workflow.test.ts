import type { BuildAppOptions } from "../src/app.js";
import { buildApp } from "../src/app.js";
import { describe, expect, it, vi } from "vitest";

const actor = { id: "10000000-0000-4000-8000-000000000001" };

function workflow(): NonNullable<BuildAppOptions["workflow"]> {
  return {
    createContent: vi.fn(),
    createRevision: vi.fn(),
    reviewRevision: vi.fn(),
    reviewTranslation: vi.fn(),
  };
}

describe("revision workflow API", () => {
  it("creates a localized draft revision through the authenticated workflow", async () => {
    const service = workflow();
    vi.mocked(service.createRevision).mockResolvedValue({
      revisionId: "10000000-0000-4000-8000-000000000003",
      revisionNumber: 1,
      localizedRevisions: [
        {
          id: "10000000-0000-4000-8000-000000000004",
          locale: "ko",
          compileJobId: "10000000-0000-4000-8000-000000000005",
          sourceHash: "a".repeat(64),
        },
      ],
      createdAt: "2026-09-02T00:00:00.000Z",
    });
    const app = buildApp({
      authenticate: async () => actor,
      publisher: { publish: vi.fn() },
      workflow: service,
    });
    const payload = {
      changeSummary: "Initial research note",
      translations: [{ locale: "ko", title: "연구", slug: "research", sourceMarkdown: "# 연구" }],
    };
    const response = await app.inject({
      method: "POST",
      url: "/v1/contents/10000000-0000-4000-8000-000000000002/revisions",
      payload,
    });
    expect(response.statusCode).toBe(201);
    expect(service.createRevision).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000002",
      payload,
      actor,
    );
    await app.close();
  });

  it("serves public documents without invoking administrative authentication", async () => {
    const authenticate = vi.fn();
    const resolvePublic = vi.fn().mockResolvedValue({
      type: "redirect",
      locale: "en",
      fromPath: "/en/old",
      toPath: "/en/new",
      status: 308,
    });
    const app = buildApp({ authenticate, publisher: { publish: vi.fn() }, resolvePublic });
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/resolve?locale=en&path=%2Fen%2Fold",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ type: "redirect", toPath: "/en/new" });
    expect(authenticate).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 404 for unpublished paths", async () => {
    const app = buildApp({
      authenticate: vi.fn(),
      publisher: { publish: vi.fn() },
      resolvePublic: vi.fn().mockResolvedValue(undefined),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/resolve?locale=en&path=%2Fen%2Fmissing",
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
