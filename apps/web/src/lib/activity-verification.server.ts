import { randomBytes } from "node:crypto";
import { activitySubjectKey, privacySettings } from "./privacy.server";
import {
  deleteActivityForCode,
  encryptActivityRaw,
  hfActivityStore,
  sweepActivityRetention,
  type ActivityObjectStore,
} from "./hf-activity-storage.server";

/** Operator-only synthetic checks. Never advance the clock for the real namespace. */
export async function verifyActivityStorage(store: ActivityObjectStore = hfActivityStore()) {
  const flags = [
    "ACTIVITY_COLLECTION_ENABLED",
    "ACTIVITY_POLICY_REVIEWED",
    "ACTIVITY_RETENTION_SCHEDULER_REVIEWED",
  ];
  const settings = privacySettings();
  if (
    flags.some((name) => process.env[name] !== "false") ||
    !settings.configured ||
    process.env.ACTIVITY_HF_BUCKET !== "m97j/archive-activity"
  )
    throw new Error("ACTIVITY_VERIFICATION_REQUIRES_DISABLED_REVIEWED_TARGET");
  await store.verifyPrivate();
  const code = randomBytes(32).toString("base64url");
  const subject = activitySubjectKey(code);
  const prefix = `activity/v2/raw/session/${subject}/`;
  const modelPrefix = `activity/v2/raw/model/${subject}/`;
  const ttl = settings.retention.sessionHours * 3600;
  const modelTtl = settings.retention.modelDays * 86400;
  const key = `${prefix}${ttl}-${randomBytes(32).toString("hex")}.json.enc`;
  const modelKey = `${modelPrefix}${modelTtl}-${randomBytes(32).toString("hex")}.json.enc`;
  const marker = `activity/v2/control/deleted/${subject}.json`;
  const heartbeat = "activity/v2/control/maintenance/last-success.json";
  const owned = new Set([key, modelKey, marker]);
  // Payload has no user data, session ID, document ID or deletion capability.
  const payload = encryptActivityRaw({ schemaVersion: 2, syntheticVerification: true });
  const assert = (condition: unknown) => {
    if (!condition) throw new Error("ACTIVITY_STORAGE_VERIFICATION_FAILED");
  };
  // Scope expiry simulation to this one random subject, not other activity objects.
  const scopedFor = (selectedPrefix: string, selectedKey: string): ActivityObjectStore => ({
    verifyPrivate: () => store.verifyPrivate(),
    exists: async (name) => {
      if (!owned.has(name)) throw new Error("ACTIVITY_VERIFICATION_SCOPE_REJECTED");
      return store.exists(name);
    },
    put: async (name) => {
      if (name !== heartbeat) throw new Error("ACTIVITY_VERIFICATION_SCOPE_REJECTED");
      return true; // Do not refresh the production cleanup heartbeat in a simulated sweep.
    },
    remove: async (name) => {
      if (!owned.has(name)) throw new Error("ACTIVITY_VERIFICATION_SCOPE_REJECTED");
      await store.remove(name);
    },
    list: async (name, cursor) => {
      if (name !== "activity/v2/") throw new Error("ACTIVITY_VERIFICATION_SCOPE_REJECTED");
      if (cursor) throw new Error("ACTIVITY_VERIFICATION_SCOPE_REJECTED");
      const result = await store.list(selectedPrefix);
      assert(!result.cursor && result.objects.every((object) => object.key === selectedKey));
      return result;
    },
  });
  try {
    assert(await store.put(key, payload));
    assert(await store.put(modelKey, payload));
    assert(!(await store.put(key, payload)));
    assert(await store.exists(key));
    const listed = await store.list(prefix);
    assert(!listed.cursor && listed.objects.length === 1);
    const modifiedAt = listed.objects[0]!.modifiedAt;
    assert(Number.isFinite(modifiedAt));
    const fresh = await sweepActivityRetention(
      scopedFor(prefix, key),
      undefined,
      modifiedAt + 1000,
    );
    assert(fresh.complete && fresh.skipped === 0 && fresh.removed === 0);
    assert(await store.exists(key));
    const expired = await sweepActivityRetention(
      scopedFor(prefix, key),
      undefined,
      modifiedAt + ttl * 1000 + 1000,
    );
    assert(expired.complete && expired.skipped === 0 && expired.removed === 1);
    assert(!(await store.exists(key)));
    assert(await store.exists(modelKey));
    const modelObjects = await store.list(modelPrefix);
    assert(modelObjects.objects.length === 1 && !modelObjects.cursor);
    const modelModified = modelObjects.objects[0]!.modifiedAt;
    assert(Number.isFinite(modelModified));
    const modelExpired = await sweepActivityRetention(
      scopedFor(modelPrefix, modelKey),
      undefined,
      modelModified + modelTtl * 1000 + 1000,
    );
    assert(modelExpired.complete && modelExpired.skipped === 0 && modelExpired.removed === 1);
    assert(!(await store.exists(modelKey)));
    assert(await store.put(key, payload));
    assert(await store.put(modelKey, payload));
    const deletion = await deleteActivityForCode(store, code);
    assert(
      deletion.complete &&
        deletion.removed === 2 &&
        !(await store.exists(key)) &&
        !(await store.exists(modelKey)),
    );
    assert(await store.exists(marker));
  } finally {
    // Only these exact, newly generated keys may be removed here.
    const results = await Promise.allSettled([...owned].map((name) => store.remove(name)));
    if (results.some((result) => result.status !== "fulfilled"))
      throw new Error("ACTIVITY_VERIFICATION_CLEANUP_REQUIRED");
  }
  assert(
    !(await store.exists(key)) && !(await store.exists(modelKey)) && !(await store.exists(marker)),
  );
  return {
    privateVerified: true,
    conditionalWriteVerified: true,
    listingVerified: true,
    deletionVerified: true,
    expiryVerified: true,
    expiryClockSimulated: true,
    cleanupVerified: true,
    collectionEnabled: false,
    retention: settings.retention,
  };
}
