import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundedRequestText,
  decodePrivacyChoice,
  encodePrivacyChoice,
  privacySettings,
  safeActivityEvents,
} from "@/lib/privacy.server";
afterEach(() => vi.unstubAllEnvs());
const event = {
  id: "12345678-1234-4234-8234-123456789012",
  type: "page_view",
  path: "/ko/docs/test",
};
describe("consent and bounded optional activity", () => {
  it("requires both operator opt-ins", () => {
    vi.stubEnv("OUTBOX_WEBHOOK_SECRET", "s".repeat(64));
    vi.stubEnv("ANALYTICS_ENABLED", "true");
    vi.stubEnv("ANALYTICS_POLICY_REVIEWED", "false");
    expect(privacySettings().enabled).toBe(false);
    const choice = decodePrivacyChoice(encodePrivacyChoice(true));
    expect(choice?.analytics).toBe(false);
    expect(choice?.subjectId).toBeUndefined();
  });
  it("signs consent, rejects forgery and expiry", () => {
    vi.stubEnv("OUTBOX_WEBHOOK_SECRET", "s".repeat(64));
    vi.stubEnv("ANALYTICS_ENABLED", "true");
    vi.stubEnv("ANALYTICS_POLICY_REVIEWED", "true");
    const now = Date.now();
    const value = encodePrivacyChoice(true, now);
    expect(decodePrivacyChoice(value, now)?.analytics).toBe(true);
    expect(decodePrivacyChoice(`${value}a`, now)).toBeUndefined();
    expect(decodePrivacyChoice(value, now + 31 * 86400_000)).toBeUndefined();
    expect(decodePrivacyChoice(encodePrivacyChoice(false))?.subjectId).toBeUndefined();
  });
  it("only allows path-only whitelisted events", () => {
    expect(safeActivityEvents([event])).toEqual([event]);
    for (const bad of [
      { ...event, email: "private@example.test" },
      { ...event, path: "/ko/admin" },
      { ...event, path: "/ko/docs?query=secret" },
      { ...event, path: "/ko/%2e%2e/test" },
      { ...event, seconds: 601 },
      { ...event, id: "-".repeat(36) },
    ])
      expect(safeActivityEvents([bad])).toBeUndefined();
    expect(safeActivityEvents(Array(49).fill(event))).toBeUndefined();
  });
  it("enforces streaming body size without Content-Length", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "abcde" });
    await expect(boundedRequestText(request, 4)).rejects.toThrow("BODY_LIMIT");
  });
  it("bounds stalled request bodies", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream(),
    } as RequestInit);
    await expect(boundedRequestText(request, 1024, 5)).rejects.toThrow("BODY_TIMEOUT");
  });
});
