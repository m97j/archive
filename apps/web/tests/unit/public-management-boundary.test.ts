// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const resolve = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));
vi.mock("@/lib/archive-api.server", () => ({ resolvePublicDocument: resolve }));
vi.mock("@/components/document-enhancer", () => ({ DocumentEnhancer: () => null }));
import AdminPage from "../../src/app/admin/page";
import LoginPage from "../../src/app/login/page";
import { generateMetadata } from "../../src/app/[locale]/[...slug]/page";
afterEach(() => vi.clearAllMocks());
describe("public application has no authoring entry points", () => {
  it("returns not-found for short admin and login entries", () => {
    expect(AdminPage).toThrow("NOT_FOUND");
    expect(LoginPage).toThrow("NOT_FOUND");
  });
  it.each([
    "admin",
    "admin/new",
    "login",
    "sign-in",
    "cms",
    "auth/callback",
    "new",
    "api/admin",
    "%61dmin",
    "ＡＤＭＩＮ",
  ])("rejects a reserved document path before upstream resolution: %s", async (path) => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "ko", slug: path.split("/") }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(resolve).not.toHaveBeenCalled();
  });
});
