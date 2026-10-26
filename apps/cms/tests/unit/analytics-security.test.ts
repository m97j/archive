import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  origin: vi.fn(),
  session: vi.fn(),
  request: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/csrf.server", () => ({ assertSameOriginAction: mocks.origin }));
vi.mock("@/lib/admin-auth.server", () => ({ getAdminSession: mocks.session }));
vi.mock("@/lib/archive-api.server", () => ({ archiveApiRequest: mocks.request }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { loadAnalyticsReport } from "@/app/[locale]/admin/analytics/actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.origin.mockResolvedValue(undefined);
  mocks.session.mockResolvedValue({ accessToken: "SERVER_ONLY_SESSION" });
  mocks.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
});
describe("private CMS aggregate-report action", () => {
  it("rejects cross-origin requests without contacting the API", async () => {
    mocks.origin.mockRejectedValue(new Error("Origin rejected"));
    await expect(loadAnalyticsReport({}, new FormData())).rejects.toThrow("Origin rejected");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("requires the existing signed administrator session", async () => {
    mocks.session.mockResolvedValue(undefined);
    await expect(loadAnalyticsReport({}, new FormData())).rejects.toThrow("REDIRECT");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("never passes client-selected properties, dimensions or dates to Google", async () => {
    const form = new FormData();
    form.set("locale", "ko");
    form.set("propertyId", "999999999");
    form.set("dimensions", "userId");
    const report = { generatedAt: "2026-10-26T00:00:00Z", rangeDays: 28, cached: false, pages: [] };
    mocks.request.mockResolvedValue(report);
    expect(await loadAnalyticsReport({}, form)).toEqual({ report });
    expect(mocks.request).toHaveBeenCalledWith("/v1/admin/analytics/report", {
      method: "POST",
      accessToken: "SERVER_ONLY_SESSION",
      body: "{}",
    });
    expect(JSON.stringify(await loadAnalyticsReport({}, form))).not.toContain(
      "SERVER_ONLY_SESSION",
    );
  });
  it("keeps upstream errors and credentials out of the browser result", async () => {
    mocks.request.mockRejectedValue(new Error("PRIVATE_GOOGLE_CREDENTIAL"));
    const value = await loadAnalyticsReport({}, new FormData());
    expect(value.error).toBeTruthy();
    expect(JSON.stringify(value)).not.toContain("PRIVATE_GOOGLE_CREDENTIAL");
  });
});
