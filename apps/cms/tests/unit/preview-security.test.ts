// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => vi.fn());
const compile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-auth.server", () => ({ getAdminSession: session }));
vi.mock("@archive/content-engine", () => ({ compileDocument: compile }));
import { POST } from "../../src/app/api/admin/preview/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CMS_PUBLIC_URL", "https://cms.example.test");
  session.mockResolvedValue({ accessToken: "fixture" });
  compile.mockResolvedValue({ html: "<p>Sanitized fixture</p>" });
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown, origin: string | null = "https://cms.example.test") =>
  new Request("https://cms.example.test/api/admin/preview", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
describe("server compiled private preview", () => {
  it.each([null, "null", "https://huggingface.co", "https://attacker.example.test"])(
    "rejects cross-origin preview before session evaluation: %s",
    async (origin) => {
      expect((await POST(request({ source: "hi", locale: "ko" }, origin))).status).toBe(403);
      expect(session).not.toHaveBeenCalled();
    },
  );
  it("requires administrator authorization", async () => {
    session.mockResolvedValue(undefined);
    expect((await POST(request({ source: "hi", locale: "ko" }))).status).toBe(401);
    expect(compile).not.toHaveBeenCalled();
  });
  it("uses the same sanitized content compiler and never persists a preview", async () => {
    const response = await POST(request({ source: "# Heading", locale: "ko" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ html: "<p>Sanitized fixture</p>" });
    expect(compile).toHaveBeenCalledWith("# Heading", { locale: "ko" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("bounds inputs and rejects unsupported locales", async () => {
    expect((await POST(request({ source: "hi", locale: "invalid" }))).status).toBe(400);
    expect((await POST(request({ source: "x".repeat(200_001), locale: "ko" }))).status).toBe(413);
    expect(compile).not.toHaveBeenCalled();
  });
});
