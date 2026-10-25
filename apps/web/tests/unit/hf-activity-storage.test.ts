import { createDecipheriv } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicDocument } from "@archive/contracts";
import {
  activitySubjectKey,
  createActivitySession,
  decodePrivacyChoice,
  encodePrivacyChoice,
  type ActivityEvent,
} from "@/lib/privacy.server";
import {
  activityMaintenanceHealthy,
  deleteActivityForCode,
  hfActivityStore,
  isActivityRevoked,
  normalizePublicActivity,
  preserveActivityBatch,
  revokeActivitySession,
  sweepActivityRetention,
  type ActivityObjectStore,
  type NormalizedActivity,
} from "@/lib/hf-activity-storage.server";
import { reviewedActivitySettings } from "./activity-test-settings";

const now = Date.UTC(2026, 9, 14, 12);
const batchId = "12345678-1234-4234-8234-123456789012";
const contentId = "12345678-1234-4234-8234-123456789013";
const normalized: NormalizedActivity[] = [
  { type: "page_view", contentId, locale: "ko", revisionNumber: 1 },
];
class MemoryStore implements ActivityObjectStore {
  objects = new Map<string, { value: string; modifiedAt: number }>();
  private = true;
  clock = now;
  pageSize = 100;
  afterRawPut?: () => Promise<void>;
  async verifyPrivate() {
    if (!this.private) throw new Error("ACTIVITY_PRIVATE_BUCKET_REQUIRED");
  }
  async exists(key: string) {
    return this.objects.has(key);
  }
  async put(key: string, value: string, onlyIfAbsent = true) {
    if (onlyIfAbsent && this.objects.has(key)) return false;
    this.objects.set(key, { value, modifiedAt: this.clock });
    if (key.includes("/raw/")) await this.afterRawPut?.();
    return true;
  }
  async remove(key: string) {
    this.objects.delete(key);
  }
  async list(prefix: string, cursor?: string) {
    const keys = [...this.objects.keys()]
      .sort()
      .filter((key) => key.startsWith(prefix) && (!cursor || key > cursor));
    const page = keys.slice(0, this.pageSize);
    return {
      objects: page.map((key) => ({ key, modifiedAt: this.objects.get(key)!.modifiedAt })),
      ...(keys.length > page.length ? { cursor: page.at(-1)! } : {}),
    };
  }
  heartbeat() {
    this.objects.set("activity/v2/control/maintenance/last-success.json", {
      value: "{}",
      modifiedAt: this.clock,
    });
  }
  raw() {
    return [...this.objects.keys()].filter((key) => key.includes("/raw/"));
  }
}
function session(sessionPersonalization = true, modelImprovement = false) {
  return createActivitySession(
    decodePrivacyChoice(
      encodePrivacyChoice({ sessionPersonalization, modelImprovement }, now),
      now,
    )!,
    now,
  );
}
function decrypt(value: string) {
  const envelope = JSON.parse(value);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from("4".repeat(64), "hex"),
    Buffer.from(envelope.nonce, "base64url"),
  );
  decipher.setAAD(Buffer.from("archive:activity-raw:v2"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
beforeEach(() => reviewedActivitySettings());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("private Bucket capture and retention", () => {
  it("writes only the explicitly consented purpose with application encryption", async () => {
    for (const [personal, model, purpose] of [
      [true, false, "session"],
      [false, true, "model"],
    ] as const) {
      const store = new MemoryStore();
      store.heartbeat();
      const active = session(personal, model);
      await preserveActivityBatch(store, active, batchId, normalized, now);
      expect(store.raw()).toHaveLength(1);
      expect(store.raw()[0]).toContain(`/raw/${purpose}/`);
      const raw = store.objects.get(store.raw()[0]!)!.value;
      expect(raw).not.toContain(contentId);
      expect(raw).not.toContain(active.deleteCode);
      expect(decrypt(raw)).toMatchObject({ purpose, events: normalized });
    }
  });
  it("replays are idempotent and cannot overwrite accepted data or renew its retention", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const active = session(true, true);
    await preserveActivityBatch(store, active, batchId, normalized, now);
    const original = store.raw().map((key) => store.objects.get(key)!.value);
    expect(
      await preserveActivityBatch(
        store,
        active,
        batchId,
        [{ ...normalized[0]!, seconds: 50 }],
        now + 10000,
      ),
    ).toEqual({ duplicate: true });
    expect(store.raw().map((key) => store.objects.get(key)!.value)).toEqual(original);
  });
  it("refuses unreviewed, expired, public or stale-maintenance capture", async () => {
    const active = session();
    const store = new MemoryStore();
    await expect(preserveActivityBatch(store, active, batchId, normalized, now)).rejects.toThrow(
      "MAINTENANCE_STALE",
    );
    store.heartbeat();
    store.private = false;
    await expect(preserveActivityBatch(store, active, batchId, normalized, now)).rejects.toThrow(
      "PRIVATE_BUCKET_REQUIRED",
    );
    store.private = true;
    await expect(
      preserveActivityBatch(store, active, batchId, normalized, now + 30 * 60_000),
    ).rejects.toThrow("SESSION_EXPIRED");
    vi.stubEnv("ACTIVITY_COLLECTION_ENABLED", "false");
    await expect(preserveActivityBatch(store, active, batchId, normalized, now)).rejects.toThrow(
      "ACTIVITY_DISABLED",
    );
    expect(store.raw()).toHaveLength(0);
  });
  it("bounds new batches with a shared conditional-write rate slot", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const active = session();
    await preserveActivityBatch(store, active, batchId, normalized, now);
    await expect(preserveActivityBatch(store, active, contentId, normalized, now)).rejects.toThrow(
      "RATE_LIMIT",
    );
  });
  it("revocation denies late requests but adding a purpose need not erase old data", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const active = session();
    await preserveActivityBatch(store, active, batchId, normalized, now);
    await revokeActivitySession(store, active.deleteCode);
    expect(await isActivityRevoked(store, activitySubjectKey(active.deleteCode))).toBe(true);
    expect(store.raw()).toHaveLength(1);
    await expect(
      preserveActivityBatch(store, active, contentId, normalized, now + 5000),
    ).rejects.toThrow("ACTIVITY_REVOKED");
  });
  it("capability deletion spans both purposes and is idempotent even when capture is disabled", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const active = session(true, true);
    await preserveActivityBatch(store, active, batchId, normalized, now);
    vi.stubEnv("ACTIVITY_COLLECTION_ENABLED", "false");
    expect(await deleteActivityForCode(store, active.deleteCode, now)).toMatchObject({
      requested: true,
      complete: true,
      removed: 2,
    });
    expect(await deleteActivityForCode(store, active.deleteCode, now)).toMatchObject({
      complete: true,
      removed: 0,
    });
    expect(store.raw()).toHaveLength(0);
  });
  it("another random capability cannot delete an unrelated session", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const first = session();
    const other = session();
    await preserveActivityBatch(store, first, batchId, normalized, now);
    await deleteActivityForCode(store, other.deleteCode, now);
    expect(store.raw()).toHaveLength(1);
    await expect(deleteActivityForCode(store, "not-a-capability", now)).rejects.toThrow(
      "INVALID_DELETE_CAPABILITY",
    );
  });
  it("does not claim completion while a concurrent writer holds a lease; writer erases its late batch", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const active = session(true, true);
    let receipt;
    store.afterRawPut = async () => {
      receipt = await deleteActivityForCode(store, active.deleteCode, now);
    };
    await expect(preserveActivityBatch(store, active, batchId, normalized, now)).rejects.toThrow(
      "ACTIVITY_REVOKED",
    );
    expect(receipt).toMatchObject({ requested: true, complete: false });
    expect(store.raw()).toHaveLength(0);
    expect(await deleteActivityForCode(store, active.deleteCode, now)).toMatchObject({
      complete: true,
    });
  });
  it("retains an uncertainty lease after a PUT failure until a safe retry window passes", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const active = session();
    store.afterRawPut = async () => {
      throw new Error("uncertain provider acknowledgement");
    };
    await expect(preserveActivityBatch(store, active, batchId, normalized, now)).rejects.toThrow(
      "uncertain provider acknowledgement",
    );
    expect([...store.objects.keys()].some((key) => key.includes("/leases/"))).toBe(true);
    expect(await deleteActivityForCode(store, active.deleteCode, now)).toMatchObject({
      complete: false,
    });
    expect(await deleteActivityForCode(store, active.deleteCode, now + 121000)).toMatchObject({
      complete: true,
    });
  });
  it("sweeps expired raw data using its original TTL, not a later extended setting", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const active = session(true, true);
    await preserveActivityBatch(store, active, batchId, normalized, now);
    vi.stubEnv("ACTIVITY_SESSION_RETENTION_HOURS", "24");
    store.clock = now + 3 * 3600_000;
    expect(await sweepActivityRetention(store, undefined, store.clock)).toMatchObject({
      complete: true,
      skipped: 0,
      removed: 1,
    });
    expect(store.raw()).toHaveLength(1);
    expect(store.raw()[0]).toContain("/model/");
    expect(await activityMaintenanceHealthy(store, store.clock)).toBe(true);
    store.clock = now + 91 * 86400_000;
    await sweepActivityRetention(store, undefined, store.clock);
    expect(store.raw()).toHaveLength(0);
  });
  it("sweeper recovers a crash's tombstoned raw and never touches backups outside its namespace", async () => {
    const store = new MemoryStore();
    store.heartbeat();
    const active = session();
    await preserveActivityBatch(store, active, batchId, normalized, now);
    await store.put(
      `activity/v2/control/deleted/${activitySubjectKey(active.deleteCode)}.json`,
      "{}",
    );
    await store.put("encrypted-backups/preserved.enc", "original");
    await sweepActivityRetention(store, undefined, now);
    expect(store.raw()).toHaveLength(0);
    expect(store.objects.get("encrypted-backups/preserved.enc")!.value).toBe("original");
  });
  it("does not issue a fresh scheduler heartbeat after partial pagination or unknown owned files", async () => {
    const store = new MemoryStore();
    store.pageSize = 1;
    await store.put("activity/v2/unexpected-file", "{}");
    const result = await sweepActivityRetention(store, undefined, now);
    expect(result.skipped).toBe(1);
    expect(await activityMaintenanceHealthy(store, now)).toBe(false);
  });
  it("normalizes only public document IDs and h2/h3 ordinals across nested sections", async () => {
    const document: PublicDocument = {
      type: "document",
      path: "/ko/docs/test",
      contentId,
      locale: "ko",
      revisionNumber: 3,
      kind: "DOC",
      title: "Public fixture",
      publishedAt: new Date(now).toISOString(),
      artifact: {
        schemaVersion: 1,
        locale: "ko",
        sourceHash: "a".repeat(64),
        html: "<h2>Public</h2><h3>Subsection</h3>",
        blocks: [],
        searchText: "Public subsection",
        frontmatter: {},
        toc: [
          {
            id: "public",
            text: "Public",
            depth: 2,
            children: [{ id: "subsection", text: "Subsection", depth: 3, children: [] }],
          },
        ],
      },
    };
    const input: ActivityEvent[] = [
      {
        id: batchId,
        type: "section_dwell",
        path: document.path,
        sectionId: "s-2",
        seconds: 13,
        revisionNumber: 3,
      },
    ];
    const result = await normalizePublicActivity(
      [...input, { id: contentId, type: "navigation", path: "/ko/archive" }],
      async () => document,
    );
    expect(result).toEqual([
      {
        type: "section_dwell",
        contentId,
        locale: "ko",
        revisionNumber: 3,
        sectionOrdinal: 2,
        seconds: 10,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("/ko/docs/test");
    expect(
      await normalizePublicActivity([{ ...input[0]!, revisionNumber: 2 }], async () => document),
    ).toEqual([]);
    const missingRevision = { ...input[0]! };
    delete missingRevision.revisionNumber;
    expect(await normalizePublicActivity([missingRevision], async () => document)).toEqual([]);
    await expect(
      normalizePublicActivity([{ ...input[0]!, sectionId: "s-3" }], async () => document),
    ).rejects.toThrow("SECTION_REQUIRED");
    await expect(normalizePublicActivity(input, async () => undefined)).rejects.toThrow(
      "PUBLIC_DOCUMENT_REQUIRED",
    );
  });
  it("checks exact Bucket identity and private status with a distinct server-only Hub credential", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "example/private-activity", private: true }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(hfActivityStore().verifyPrivate()).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://huggingface.co/api/buckets/example/private-activity",
    );
    for (const payload of [
      { id: "example/private-activity", private: false },
      { id: "wrong/bucket", private: true },
      { id: "example/private-activity" },
    ]) {
      fetch.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
      await expect(hfActivityStore().verifyPrivate()).rejects.toThrow("PRIVATE_BUCKET_REQUIRED");
    }
  });
});
