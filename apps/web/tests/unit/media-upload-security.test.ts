// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminSession: vi.fn(), archiveApiRequest: vi.fn() }));
vi.mock("@/lib/admin-auth.server", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/archive-api.server", () => ({
  archiveApiRequest: mocks.archiveApiRequest,
  ArchiveApiError: class extends Error {
    constructor(readonly status: number) {
      super("fixture-provider-error");
    }
  },
}));

import { POST } from "@/app/api/admin/media-uploads/route";
import { ArchiveApiError } from "@/lib/archive-api.server";

const input = { filename: "fixture.png", contentType: "image/png", sizeBytes: 42 };
const ticket = { uploadUrl: "https://storage.example.test/fixture", headers: {} };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAdminSession.mockResolvedValue({ accessToken: "fixture-token", source: "supabase" });
  mocks.archiveApiRequest.mockResolvedValue(ticket);
});

function requestWith({
  origin = "https://archive.example.test",
  contentType = "application/json",
  body = JSON.stringify(input),
}: { origin?: string | null; contentType?: string; body?: string } = {}) {
  const headers = new Headers({ "content-type": contentType });
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://archive.example.test/api/admin/media-uploads", {
    method: "POST",
    headers,
    body,
  });
}

describe("cookie-authenticated media upload boundary", () => {
  it.each([null, "null", "https://attacker.example.test", "http://archive.example.test"])(
    "rejects missing, opaque or different origins before reading a session: %s",
    async (origin) => {
      const response = await POST(requestWith({ origin }));
      expect(response.status).toBe(403);
      expect(mocks.getAdminSession).not.toHaveBeenCalled();
      expect(mocks.archiveApiRequest).not.toHaveBeenCalled();
    },
  );

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"])(
    "rejects simple cross-site form content types: %s",
    async (contentType) => {
      const response = await POST(requestWith({ contentType }));
      expect(response.status).toBe(415);
      expect(mocks.getAdminSession).not.toHaveBeenCalled();
      expect(mocks.archiveApiRequest).not.toHaveBeenCalled();
    },
  );

  it("still requires an authorized admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(undefined);
    expect((await POST(requestWith())).status).toBe(401);
    expect(mocks.archiveApiRequest).not.toHaveBeenCalled();
  });

  it("accepts the editor's same-origin JSON request and forwards its verified token", async () => {
    const response = await POST(requestWith({ contentType: "application/json; charset=utf-8" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(ticket);
    expect(mocks.archiveApiRequest).toHaveBeenCalledWith("/v1/media/uploads", {
      method: "POST",
      accessToken: "fixture-token",
      body: JSON.stringify(input),
    });
  });

  it("does not forward malformed JSON or expose provider errors", async () => {
    expect((await POST(requestWith({ body: "{malformed" }))).status).toBe(400);
    expect(mocks.archiveApiRequest).not.toHaveBeenCalled();
    mocks.archiveApiRequest.mockRejectedValue(new ArchiveApiError(403, "fixture-provider-error"));
    const response = await POST(requestWith());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Unable to prepare media upload" });
  });
});
