import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifyActivityStorage } from "@/lib/activity-verification.server";
import type { ActivityObjectStore } from "@/lib/hf-activity-storage.server";
import { reviewedActivitySettings } from "./activity-test-settings";

beforeEach(() => {
  reviewedActivitySettings();
  vi.stubEnv("ACTIVITY_COLLECTION_ENABLED", "false");
  vi.stubEnv("ACTIVITY_POLICY_REVIEWED", "false");
  vi.stubEnv("ACTIVITY_RETENTION_SCHEDULER_REVIEWED", "false");
  vi.stubEnv("ACTIVITY_HF_BUCKET", "m97j/archive-activity");
});
afterEach(() => vi.unstubAllEnvs());

function fixture() {
  const objects = new Map<string, { value: string; modifiedAt: number }>();
  const removed: string[] = [];
  const store: ActivityObjectStore = {
    verifyPrivate: vi.fn(async () => {}),
    put: async (key, value, onlyIfAbsent = true) => {
      if (onlyIfAbsent && objects.has(key)) return false;
      objects.set(key, { value, modifiedAt: Date.now() });
      return true;
    },
    exists: async (key) => objects.has(key),
    remove: async (key) => {
      removed.push(key);
      objects.delete(key);
    },
    list: async (prefix) => ({
      objects: [...objects]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, modifiedAt: value.modifiedAt })),
    }),
  };
  return { store, objects, removed };
}

it("tests real store semantics only inside a fresh subject and never changes the real heartbeat", async () => {
  const { store, objects, removed } = fixture();
  const foreign =
    "activity/v2/raw/session/" + "e".repeat(64) + "/7200-" + "a".repeat(64) + ".json.enc";
  const heartbeat = "activity/v2/control/maintenance/last-success.json";
  objects.set(foreign, { value: "preserve", modifiedAt: 1 });
  objects.set(heartbeat, { value: "original", modifiedAt: 1 });
  expect(await verifyActivityStorage(store)).toMatchObject({
    expiryClockSimulated: true,
    deletionVerified: true,
    collectionEnabled: false,
    cleanupVerified: true,
  });
  expect(objects.size).toBe(2);
  expect(objects.get(foreign)?.value).toBe("preserve");
  expect(objects.get(heartbeat)?.value).toBe("original");
  expect(removed).not.toContain(foreign);
});

it("refuses active collection or a different Bucket before doing any storage operation", async () => {
  const { store } = fixture();
  for (const key of [
    "ACTIVITY_COLLECTION_ENABLED",
    "ACTIVITY_POLICY_REVIEWED",
    "ACTIVITY_RETENTION_SCHEDULER_REVIEWED",
  ]) {
    vi.stubEnv(key, "true");
    await expect(verifyActivityStorage(store)).rejects.toThrow("REQUIRES_DISABLED");
    vi.stubEnv(key, "false");
  }
  vi.stubEnv("ACTIVITY_HF_BUCKET", "m97j/other");
  await expect(verifyActivityStorage(store)).rejects.toThrow("REQUIRES_DISABLED");
  expect(store.verifyPrivate).not.toHaveBeenCalled();
});

it("cleans up its owned objects after a conditional-write verification failure", async () => {
  const { store, objects } = fixture();
  store.put = async (key, value) => {
    objects.set(key, { value, modifiedAt: Date.now() });
    return true;
  };
  await expect(verifyActivityStorage(store)).rejects.toThrow("VERIFICATION_FAILED");
  expect(objects.size).toBe(0);
});

it("tests each purpose independently even when the configured lifetimes are equal", async () => {
  vi.stubEnv("ACTIVITY_SESSION_RETENTION_HOURS", "24");
  vi.stubEnv("ACTIVITY_MODEL_RETENTION_DAYS", "1");
  const { store, objects } = fixture();
  expect(await verifyActivityStorage(store)).toMatchObject({
    expiryVerified: true,
    cleanupVerified: true,
  });
  expect(objects.size).toBe(0);
});
