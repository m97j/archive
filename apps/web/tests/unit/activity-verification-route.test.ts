import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/activity-verification.server", () => ({ verifyActivityStorage: mocks.verify }));
import { POST } from "@/app/api/privacy/verification/route";

const secret = "a".repeat(64);
function request(body: unknown, authorization = `Bearer ${secret}`) {
  return new Request("https://site.test/api/privacy/verification", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", secret);
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

it("conceals the endpoint and never writes without valid operator authorization", async () => {
  expect((await POST(request({}, ""))).status).toBe(404);
  expect((await POST(request({}, "Bearer incorrect"))).status).toBe(404);
  expect(mocks.verify).not.toHaveBeenCalled();
});
it("rejects unrecognized or primitive bodies before any storage operation", async () => {
  for (const value of [true, 1, null, [], { cursor: "not-allowed" }])
    expect((await POST(request(value))).status).toBe(400);
  expect(mocks.verify).not.toHaveBeenCalled();
});
it("exposes only a sanitized failure and never caches operator results", async () => {
  mocks.verify.mockRejectedValue(new Error("private provider details"));
  const result = await POST(request({}));
  expect(result.status).toBe(503);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(await result.json()).toEqual({ verified: false });
});
