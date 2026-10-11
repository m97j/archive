import { describe, expect, it, vi } from "vitest";
import { AuthenticationError, buildApp } from "../src/app.js";

const contentId = "10000000-0000-4000-8000-000000000002";
const actor = { id: "10000000-0000-4000-8000-000000000001" };

describe("content preservation API", () => {
  it("requires administrator authentication for archive and source reads", async () => {
    const updateContentAccess = vi.fn();
    const getAdminDraft = vi.fn();
    const app = buildApp({
      authenticate: async () => {
        throw new AuthenticationError();
      },
      publisher: { publish: vi.fn() },
      updateContentAccess,
      getAdminDraft,
    });
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/contents/${contentId}/access`,
          payload: { archived: true },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: `/v1/admin/contents/${contentId}/draft?locale=ko` }))
        .statusCode,
    ).toBe(401);
    expect(updateContentAccess).not.toHaveBeenCalled();
    expect(getAdminDraft).not.toHaveBeenCalled();
    await app.close();
  });

  it("archives without issuing destructive deletion and returns private source only to an administrator", async () => {
    const updateContentAccess = vi.fn().mockResolvedValue({
      contentId,
      visibility: "PUBLIC",
      archived: true,
      updatedAt: "2026-10-11T00:00:00.000Z",
    });
    const getAdminDraft = vi.fn().mockResolvedValue({
      contentId,
      revisionId: actor.id,
      locale: "ko",
      title: "기록",
      slug: "record",
      sourceMarkdown: "# 원문",
    });
    const app = buildApp({
      authenticate: async () => actor,
      publisher: { publish: vi.fn() },
      updateContentAccess,
      getAdminDraft,
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/contents/${contentId}/access`,
      payload: { archived: true },
    });
    expect(response.statusCode).toBe(200);
    expect(updateContentAccess).toHaveBeenCalledWith(contentId, { archived: true }, actor);
    const source = await app.inject({
      method: "GET",
      url: `/v1/admin/contents/${contentId}/draft?locale=ko`,
    });
    expect(source.statusCode).toBe(200);
    expect(source.json().sourceMarkdown).toBe("# 원문");
    await app.close();
  });
});
