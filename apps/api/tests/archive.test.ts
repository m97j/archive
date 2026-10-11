import type { BuildAppOptions } from "../src/app.js";
import { buildApp } from "../src/app.js";
import { ArchiveInvariantError } from "@archive/db";
import { describe, expect, it, vi } from "vitest";

const actor = { id: "10000000-0000-4000-8000-000000000001" };

function archiveService(): NonNullable<BuildAppOptions["archive"]> {
  return {
    listContents: vi.fn(),
    createTaxonomyNode: vi.fn(),
    placeContent: vi.fn(),
    createTag: vi.fn(),
    attachTag: vi.fn(),
    createRelation: vi.fn(),
    createResearchProgram: vi.fn(),
    createHypothesis: vi.fn(),
    createClaim: vi.fn(),
    createEvidence: vi.fn(),
  };
}

describe("archive authoring and catalog API", () => {
  it("creates an authenticated direct-upload ticket", async () => {
    const createUpload = vi.fn().mockResolvedValue({
      method: "PUT",
      key: "images/2026/09/image.png",
      uploadUrl: "https://example.invalid/signed-upload",
      publicUrl: "https://media.example.invalid/images/2026/09/image.png",
      expiresInSeconds: 300,
      headers: { "content-type": "image/png" },
    });
    const authenticate = vi.fn().mockResolvedValue(actor);
    const app = buildApp({
      authenticate,
      publisher: { publish: vi.fn() },
      media: { createUpload },
    });
    const input = { filename: "diagram.png", contentType: "image/png", sizeBytes: 1024 };

    const response = await app.inject({ method: "POST", url: "/v1/media/uploads", payload: input });

    expect(response.statusCode).toBe(201);
    expect(createUpload).toHaveBeenCalledWith(input, actor);
    expect(response.json()).toMatchObject({ method: "PUT", expiresInSeconds: 300 });
    await app.close();
  });

  it("serves the public catalog without administrative authentication", async () => {
    const authenticate = vi.fn();
    const listPublic = vi.fn().mockResolvedValue({ items: [] });
    const app = buildApp({ authenticate, publisher: { publish: vi.fn() }, listPublic });

    const response = await app.inject({
      method: "GET",
      url: "/v1/public/contents?locale=ko&limit=10",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [] });
    expect(listPublic).toHaveBeenCalledWith({ locale: "ko", limit: 10 });
    expect(authenticate).not.toHaveBeenCalled();
    await app.close();
  });

  it("serves localized navigation without administrative authentication", async () => {
    const authenticate = vi.fn();
    const resolveNavigation = vi.fn().mockResolvedValue({
      locale: "ko",
      space: "RESEARCH",
      label: "연구",
      nodes: [],
    });
    const app = buildApp({
      authenticate,
      publisher: { publish: vi.fn() },
      resolveNavigation,
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/public/navigation?locale=ko&space=RESEARCH",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ locale: "ko", space: "RESEARCH" });
    expect(authenticate).not.toHaveBeenCalled();
    await app.close();
  });

  it("requires authentication before listing administrative content", async () => {
    const archive = archiveService();
    vi.mocked(archive.listContents).mockResolvedValue({ items: [] });
    const authenticate = vi.fn().mockResolvedValue(actor);
    const app = buildApp({ authenticate, publisher: { publish: vi.fn() }, archive });

    const response = await app.inject({ method: "GET", url: "/v1/admin/contents?limit=10" });

    expect(response.statusCode).toBe(200);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(archive.listContents).toHaveBeenCalledWith({ limit: 10 });
    await app.close();
  });

  it("creates taxonomy nodes only after authentication", async () => {
    const archive = archiveService();
    vi.mocked(archive.createTaxonomyNode).mockResolvedValue({
      id: "10000000-0000-4000-8000-000000000002",
      stableKey: "research.ml",
      space: "RESEARCH",
      labels: [{ locale: "ko", label: "기계 학습", slug: "machine-learning" }],
      createdAt: "2026-09-03T00:00:00.000Z",
    });
    const app = buildApp({
      authenticate: async () => actor,
      publisher: { publish: vi.fn() },
      archive,
    });
    const payload = {
      stableKey: "research.ml",
      space: "RESEARCH",
      labels: [{ locale: "ko", label: "기계 학습", slug: "machine-learning" }],
    };

    const response = await app.inject({ method: "POST", url: "/v1/taxonomy/nodes", payload });

    expect(response.statusCode).toBe(201);
    expect(archive.createTaxonomyNode).toHaveBeenCalledWith(payload, actor);
    await app.close();
  });

  it("maps evidence source invariant failures to a conflict response", async () => {
    const archive = archiveService();
    vi.mocked(archive.createEvidence).mockRejectedValue(
      new ArchiveInvariantError(
        "EVIDENCE_SOURCE_REQUIRED",
        "Evidence requires content, a citation, or a source URI",
      ),
    );
    const app = buildApp({
      authenticate: async () => actor,
      publisher: { publish: vi.fn() },
      archive,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/claims/10000000-0000-4000-8000-000000000002/evidence",
      payload: { relation: "SUPPORTS", strength: 0.8 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "EVIDENCE_SOURCE_REQUIRED" });
    expect(archive.createEvidence).toHaveBeenCalledOnce();
    await app.close();
  });
});
