import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activityCookieOptions,
  activityRequestBudget,
  activitySubjectKey,
  boundedRequestText,
  createActivitySession,
  decodeActivitySession,
  decodePrivacyChoice,
  encodeActivitySession,
  encodePrivacyChoice,
  privacyCookieOptions,
  privacySettings,
  safeActivityEvents,
  sameOriginRequest,
  validDeleteCode,
  validPrivacyInput,
} from "@/lib/privacy.server";
import { reviewedActivitySettings } from "./activity-test-settings";

afterEach(() => vi.unstubAllEnvs());
const event = {
  id: "12345678-1234-4234-8234-123456789012",
  type: "page_view",
  path: "/ko/docs/test",
};
const accepted = { sessionPersonalization: true, modelImprovement: false };
describe("purpose-separated optional activity", () => {
  it("does not inherit the legacy outbox secret or analytics flags", () => {
    vi.stubEnv("OUTBOX_WEBHOOK_SECRET", "a".repeat(64));
    vi.stubEnv("ANALYTICS_ENABLED", "true");
    vi.stubEnv("ANALYTICS_POLICY_REVIEWED", "true");
    expect(privacySettings().enabled).toBe(false);
    expect(privacySettings().secret).toBeUndefined();
  });
  it("requires every independent operator gate, valid bounded retention and separate keys", () => {
    reviewedActivitySettings();
    expect(privacySettings().enabled).toBe(true);
    for (const flag of [
      "ACTIVITY_COLLECTION_ENABLED",
      "ACTIVITY_POLICY_REVIEWED",
      "ACTIVITY_RETENTION_SCHEDULER_REVIEWED",
    ]) {
      vi.stubEnv(flag, "false");
      expect(privacySettings().enabled).toBe(false);
      vi.stubEnv(flag, "true");
    }
    vi.stubEnv("ACTIVITY_MODEL_RETENTION_DAYS", "999");
    expect(privacySettings().enabled).toBe(false);
    vi.stubEnv("ACTIVITY_MODEL_RETENTION_DAYS", "90");
    vi.stubEnv("ACTIVITY_DELETE_HMAC_SECRET", "1".repeat(64));
    expect(privacySettings().enabled).toBe(false);
  });
  it("signs independent consent without a linkable identifier", () => {
    reviewedActivitySettings();
    for (const input of [accepted, { sessionPersonalization: false, modelImprovement: true }]) {
      const choice = decodePrivacyChoice(encodePrivacyChoice(input));
      expect(choice).toMatchObject(input);
      expect(Object.keys(choice!)).toEqual([
        "version",
        "sessionPersonalization",
        "modelImprovement",
        "decidedAt",
      ]);
    }
    expect(privacyCookieOptions().maxAge).toBe(90 * 86400);
  });
  it("rejects legacy, extra-property, missing and coercible consent", () => {
    for (const invalid of [
      { analytics: true },
      { ...accepted, subjectId: "x" },
      { sessionPersonalization: true },
      { ...accepted, modelImprovement: "true" },
      null,
    ])
      expect(validPrivacyInput(invalid)).toBe(false);
  });
  it("rejects consent forgery, expiry and policy change", () => {
    reviewedActivitySettings();
    const now = Date.now();
    const encoded = encodePrivacyChoice(accepted, now);
    expect(decodePrivacyChoice(`${encoded}a`, now)).toBeUndefined();
    expect(decodePrivacyChoice(encoded, now + 91 * 86400_000)).toBeUndefined();
    vi.stubEnv("ACTIVITY_POLICY_VERSION", "next-policy");
    expect(decodePrivacyChoice(encoded, now)).toBeUndefined();
  });
  it("stores refusal and masks choices when collection is disabled", () => {
    reviewedActivitySettings();
    vi.stubEnv("ACTIVITY_COLLECTION_ENABLED", "false");
    expect(decodePrivacyChoice(encodePrivacyChoice(accepted))).toMatchObject({
      sessionPersonalization: false,
      modelImprovement: false,
    });
    expect(() =>
      createActivitySession(decodePrivacyChoice(encodePrivacyChoice(accepted))!),
    ).toThrow("ACTIVITY_CONSENT_REQUIRED");
  });
  it("encrypts the deletion capability and bounds session idle/absolute age", () => {
    reviewedActivitySettings();
    const now = Date.now();
    const choice = decodePrivacyChoice(encodePrivacyChoice(accepted, now))!;
    const session = createActivitySession(choice, now);
    const encoded = encodeActivitySession(session);
    expect(encoded).not.toContain(session.deleteCode);
    expect(decodeActivitySession(encoded, now)).toEqual(session);
    expect(decodeActivitySession(`${encoded}x`, now)).toBeUndefined();
    expect(decodeActivitySession(encoded, now + 30 * 60_000)).toBeUndefined();
    const old = encodeActivitySession({ ...session, issuedAt: now - 12 * 3600_000 });
    expect(decodeActivitySession(old, now)).toBeUndefined();
    expect(activityCookieOptions(session, now).maxAge).toBe(1800);
    expect(
      activityCookieOptions({ ...session, issuedAt: now - 12 * 3600_000 + 5000 }, now).maxAge,
    ).toBe(5);
  });
  it("generates independent 256-bit capabilities with keyed verifiers", () => {
    reviewedActivitySettings();
    const choice = decodePrivacyChoice(encodePrivacyChoice(accepted))!;
    const first = createActivitySession(choice);
    const second = createActivitySession(choice);
    expect(validDeleteCode(first.deleteCode)).toBe(true);
    expect(validDeleteCode("short")).toBe(false);
    expect(activitySubjectKey(first.deleteCode)).toMatch(/^[a-f0-9]{64}$/);
    expect(activitySubjectKey(first.deleteCode)).not.toBe(activitySubjectKey(second.deleteCode));
  });
  it("permits only bounded path locators, known event fields and coarse section ordinals", () => {
    expect(safeActivityEvents([event])).toEqual([event]);
    expect(
      safeActivityEvents([{ ...event, type: "section_dwell", sectionId: "s-2", seconds: 10 }]),
    ).toBeDefined();
    for (const bad of [
      { ...event, email: "private@example.test" },
      { ...event, path: "/ko/admin" },
      { ...event, path: "/ko/docs?query=secret" },
      { ...event, path: "/ko/%2e%2e/test" },
      { ...event, seconds: 601 },
      { ...event, sectionId: "private-heading" },
      { ...event, id: "-".repeat(36) },
      { ...event, revisionNumber: "private" },
      { ...event, revisionNumber: 0 },
    ])
      expect(safeActivityEvents([bad])).toBeUndefined();
    expect(safeActivityEvents(Array(25).fill(event))).toBeUndefined();
    expect(safeActivityEvents([event, event])).toBeUndefined();
  });
  it("requires exact origin and denies cross-site mutations", () => {
    expect(
      sameOriginRequest(
        new Request("https://site.test/api/privacy", { headers: { origin: "https://site.test" } }),
      ),
    ).toBe(true);
    expect(
      sameOriginRequest(
        new Request("https://site.test/api/privacy", { headers: { origin: "https://evil.test" } }),
      ),
    ).toBe(false);
    expect(
      sameOriginRequest(
        new Request("https://site.test/api/privacy", {
          headers: { origin: "https://site.test", "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBe(false);
  });
  it("bounds request count without storing an IP", () => {
    expect(activityRequestBudget("synthetic-budget", 1, 1000)).toBe(true);
    expect(activityRequestBudget("synthetic-budget", 1, 1001)).toBe(false);
    expect(activityRequestBudget("synthetic-budget", 1, 61000)).toBe(true);
  });
  it("enforces streaming body size without Content-Length", async () => {
    await expect(
      boundedRequestText(new Request("https://example.test", { method: "POST", body: "abcde" }), 4),
    ).rejects.toThrow("BODY_LIMIT");
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
