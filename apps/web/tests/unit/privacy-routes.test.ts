import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_SESSION_COOKIE,
  PRIVACY_COOKIE,
  createActivitySession,
  decodePrivacyChoice,
  encodeActivitySession,
  encodePrivacyChoice,
} from "@/lib/privacy.server";
import { reviewedActivitySettings } from "./activity-test-settings";

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  verify: vi.fn(),
  deleted: vi.fn(),
  revoked: vi.fn(),
  normalized: vi.fn(),
  preserved: vi.fn(),
  healthy: vi.fn(),
  isRevoked: vi.fn(),
  sweep: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.jar.get(name);
      return value ? { value } : undefined;
    },
  }),
}));
vi.mock("@/lib/hf-activity-storage.server", () => ({
  hfActivityStore: () => ({ verifyPrivate: mocks.verify }),
  deleteActivityForCode: mocks.deleted,
  revokeActivitySession: mocks.revoked,
  normalizePublicActivity: mocks.normalized,
  preserveActivityBatch: mocks.preserved,
  activityMaintenanceHealthy: mocks.healthy,
  isActivityRevoked: mocks.isRevoked,
  sweepActivityRetention: mocks.sweep,
}));
import { GET as getPrivacy, POST as setPrivacy } from "@/app/api/privacy/route";
import { POST as startSession } from "@/app/api/telemetry/session/route";
import { POST as capture } from "@/app/api/telemetry/route";
import { POST as deleteActivity } from "@/app/api/privacy/delete/route";
import { POST as recovery } from "@/app/api/privacy/recovery/route";
import { GET as checkMaintenance, POST as maintenance } from "@/app/api/privacy/maintenance/route";

function post(path: string, body: unknown = {}, origin = "https://site.test") {
  return new Request(`https://site.test${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function consent(personal = true, model = false) {
  const encoded = encodePrivacyChoice({
    sessionPersonalization: personal,
    modelImprovement: model,
  });
  mocks.jar.set(PRIVACY_COOKIE, encoded);
  const session = createActivitySession(decodePrivacyChoice(encoded)!);
  mocks.jar.set(ACTIVITY_SESSION_COOKIE, encodeActivitySession(session));
  return session;
}
beforeEach(() => {
  reviewedActivitySettings();
  mocks.jar.clear();
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue(undefined);
  mocks.deleted.mockResolvedValue({ requested: true, complete: true, removed: 1 });
  mocks.revoked.mockResolvedValue(undefined);
  mocks.healthy.mockResolvedValue(true);
  mocks.isRevoked.mockResolvedValue(false);
  mocks.normalized.mockResolvedValue([
    {
      type: "page_view",
      contentId: "12345678-1234-4234-8234-123456789012",
      locale: "ko",
      revisionNumber: 1,
    },
  ]);
  mocks.preserved.mockResolvedValue({ duplicate: false });
  mocks.sweep.mockResolvedValue({ scanned: 0, removed: 0, skipped: 0, complete: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("optional activity HTTP boundaries", () => {
  it("readiness does not mint an activity session or expose server keys", async () => {
    const response = await getPrivacy();
    const body = await response.json();
    expect(body).toMatchObject({
      enabled: true,
      decided: false,
      sessionPersonalization: false,
      modelImprovement: false,
      modelTrainingActive: false,
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(JSON.stringify(body)).not.toContain("synthetic-test");
  });
  it("rejects cross-origin and legacy single-purpose consent", async () => {
    expect(
      (
        await setPrivacy(
          post(
            "/api/privacy",
            { sessionPersonalization: true, modelImprovement: false },
            "https://evil.test",
          ),
        )
      ).status,
    ).toBe(403);
    expect((await setPrivacy(post("/api/privacy", { analytics: true }))).status).toBe(400);
    expect(mocks.deleted).not.toHaveBeenCalled();
  });
  it("refusal does not establish a session; short processing does not imply training", async () => {
    mocks.jar.set(
      PRIVACY_COOKIE,
      encodePrivacyChoice({ sessionPersonalization: false, modelImprovement: false }),
    );
    expect((await startSession(post("/api/telemetry/session"))).status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
    const response = await setPrivacy(
      post("/api/privacy", { sessionPersonalization: true, modelImprovement: false }),
    );
    expect(await response.json()).toMatchObject({
      sessionPersonalization: true,
      modelImprovement: false,
    });
  });
  it("gates session start on a verified private Bucket and a recent cleanup", async () => {
    consent(false, true);
    mocks.healthy.mockResolvedValue(false);
    expect((await startSession(post("/api/telemetry/session"))).status).toBe(503);
    mocks.healthy.mockResolvedValue(true);
    const response = await startSession(post("/api/telemetry/session"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ active: true, idleMinutes: 30 });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("does not accept client session IDs or store invalid request shapes", async () => {
    consent();
    const event = {
      id: "12345678-1234-4234-8234-123456789012",
      type: "page_view",
      path: "/ko/docs/test",
    };
    expect(
      (
        await capture(
          post("/api/telemetry", { batchId: event.id, sessionId: event.id, events: [event] }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.preserved).not.toHaveBeenCalled();
    const response = await capture(post("/api/telemetry", { batchId: event.id, events: [event] }));
    expect(response.status).toBe(201);
    expect(mocks.preserved).toHaveBeenCalledOnce();
  });
  it("withdrawal retains capability and reports202 while deletion is pending", async () => {
    consent(true, true);
    mocks.deleted.mockResolvedValue({ requested: true, complete: false, removed: 1 });
    const response = await setPrivacy(
      post("/api/privacy", { sessionPersonalization: false, modelImprovement: false }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      sessionPersonalization: false,
      modelImprovement: false,
      deletion: { complete: false },
    });
    expect(response.headers.get("set-cookie")).not.toContain(`${ACTIVITY_SESSION_COOKIE}=;`);
  });
  it("a withdrawal outage never claims successful deletion and keeps recovery possible", async () => {
    const active = consent();
    mocks.deleted.mockRejectedValue(new Error("private upstream credentials"));
    const response = await setPrivacy(
      post("/api/privacy", { sessionPersonalization: false, modelImprovement: false }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).not.toContain(`${ACTIVITY_SESSION_COOKIE}=;`);
    expect(await response.text()).not.toContain("credentials");
    expect(await (await recovery(post("/api/privacy/recovery"))).json()).toEqual({
      deleteCode: active.deleteCode,
    });
  });
  it("requires a current or saved capability, not an arbitrary session UUID", async () => {
    expect((await deleteActivity(post("/api/privacy/delete"))).status).toBe(403);
    expect(
      (
        await deleteActivity(
          post("/api/privacy/delete", { deleteCode: "12345678-1234-4234-8234-123456789012" }),
        )
      ).status,
    ).toBe(403);
    const active = consent();
    mocks.jar.delete(ACTIVITY_SESSION_COOKIE);
    vi.stubEnv("ACTIVITY_COLLECTION_ENABLED", "false");
    expect(
      (await deleteActivity(post("/api/privacy/delete", { deleteCode: active.deleteCode }))).status,
    ).toBe(200);
    expect(mocks.deleted).toHaveBeenCalledWith(expect.anything(), active.deleteCode);
  });
  it("recovery is explicit same-origin only and never appears in automatic readiness", async () => {
    const active = consent();
    expect((await recovery(post("/api/privacy/recovery", {}, "https://evil.test"))).status).toBe(
      403,
    );
    expect(await (await recovery(post("/api/privacy/recovery"))).json()).toEqual({
      deleteCode: active.deleteCode,
    });
    expect(await (await getPrivacy()).text()).not.toContain(active.deleteCode);
  });
  it("maintenance authenticates its dedicated bearer and works before activation", async () => {
    vi.stubEnv("ACTIVITY_COLLECTION_ENABLED", "false");
    const anonymous = new Request("https://site.test/api/privacy/maintenance");
    expect((await checkMaintenance(anonymous)).status).toBe(404);
    const request = new Request(anonymous.url, {
      headers: { authorization: `Bearer ${"5".repeat(64)}` },
    });
    expect(await (await checkMaintenance(request)).json()).toEqual({
      privateVerified: true,
      maintenanceRecent: true,
    });
    mocks.sweep.mockResolvedValue({
      scanned: 8,
      removed: 1,
      skipped: 0,
      complete: false,
      cursor: "opaque",
    });
    const mutation = new Request(anonymous.url, {
      method: "POST",
      headers: { authorization: `Bearer ${"5".repeat(64)}` },
      body: "{}",
    });
    expect((await maintenance(mutation)).status).toBe(202);
  });
});
