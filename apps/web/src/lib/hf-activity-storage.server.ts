import { createCipheriv, randomBytes, createHash, randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { ActivityEvent, ActivitySession } from "./privacy.server";
import {
  activitySubjectKey,
  privacySettings,
  PRIVACY_UUID,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
} from "./privacy.server";
import { resolvePublicDocument } from "./archive-api.server";
import type { Heading, Locale, PublicResolution } from "@archive/contracts";

const ROOT = "activity/v2/";
const SUBJECT = /^[a-f0-9]{64}$/;
export interface StoredObject {
  key: string;
  modifiedAt: number;
}
export interface ActivityObjectStore {
  verifyPrivate(): Promise<void>;
  put(key: string, value: string, onlyIfAbsent?: boolean): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  list(prefix: string, cursor?: string): Promise<{ objects: StoredObject[]; cursor?: string }>;
}
export interface NormalizedActivity {
  type: ActivityEvent["type"];
  locale: Locale;
  contentId: string;
  revisionNumber: number;
  seconds?: number;
  sectionOrdinal?: number;
}

/** A path is only an input locator: no visitor-supplied path, query, ID or heading text is persisted. */
export async function normalizePublicActivity(
  events: ActivityEvent[],
  resolve: (
    locale: Locale,
    path: string,
  ) => Promise<PublicResolution | undefined> = resolvePublicDocument,
): Promise<NormalizedActivity[]> {
  const candidates = events.filter(
    (event) =>
      !/^\/(?:ko|en|ja|zh|es|fr|de)(?:\/(?:archive|privacy|spaces(?:\/[\w-]+)?))?$/.test(
        event.path,
      ),
  );
  const resolved = new Map<string, PublicResolution | undefined>();
  if (new Set(candidates.map((event) => event.path)).size > 8)
    throw new Error("ACTIVITY_PUBLIC_DOCUMENT_REQUIRED");
  for (const path of new Set(candidates.map((event) => event.path))) {
    const locale = path.split("/")[1] as Locale;
    resolved.set(path, await resolve(locale, path));
  }
  const sectionCount = (headings: Heading[]): number =>
    headings.reduce(
      (count, heading) =>
        count + ([2, 3].includes(heading.depth) ? 1 : 0) + sectionCount(heading.children),
      0,
    );
  return candidates.flatMap((event) => {
    const document = resolved.get(event.path);
    if (
      document?.type !== "document" ||
      document.path !== event.path ||
      !PRIVACY_UUID.test(document.contentId)
    )
      throw new Error("ACTIVITY_PUBLIC_DOCUMENT_REQUIRED");
    const ordinal = event.sectionId ? Number(event.sectionId.slice(2)) : undefined;
    // The tab may still display an older publication. Never label its section ordinal
    // with a newer revision's heading; skip it without stopping other valid events.
    if (
      (event.revisionNumber !== undefined && event.revisionNumber !== document.revisionNumber) ||
      (ordinal !== undefined && event.revisionNumber === undefined)
    )
      return [];
    if (ordinal !== undefined && ordinal > sectionCount(document.artifact.toc))
      throw new Error("ACTIVITY_SECTION_REQUIRED");
    return [
      {
        type: event.type,
        locale: document.locale,
        contentId: document.contentId,
        revisionNumber: document.revisionNumber,
        ...(event.seconds === undefined ? {} : { seconds: Math.floor(event.seconds / 5) * 5 }),
        ...(ordinal === undefined ? {} : { sectionOrdinal: ordinal }),
      },
    ];
  });
}

function missing(error: unknown) {
  const value = error as { $metadata?: { httpStatusCode?: number }; name?: string };
  return (
    value.$metadata?.httpStatusCode === 404 ||
    value.name === "NotFound" ||
    value.name === "NoSuchKey"
  );
}
function precondition(error: unknown) {
  const value = error as { $metadata?: { httpStatusCode?: number }; name?: string };
  return value.$metadata?.httpStatusCode === 412 || value.name === "PreconditionFailed";
}

/** Uses only the documented HF S3 subset; never downloads through the JS SDK's 302 path. */
export function hfActivityStore(): ActivityObjectStore {
  const repository = process.env.ACTIVITY_HF_BUCKET ?? "";
  if (!/^[\w-]+\/[\w-]+$/.test(repository))
    throw new Error("ACTIVITY_STORAGE_CONFIGURATION_REQUIRED");
  const [namespace, bucket] = repository.split("/") as [string, string];
  const token = process.env.ACTIVITY_HF_HUB_TOKEN;
  const accessKeyId = process.env.ACTIVITY_HF_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.ACTIVITY_HF_S3_SECRET_ACCESS_KEY;
  if (!token || !accessKeyId || !secretAccessKey)
    throw new Error("ACTIVITY_STORAGE_CONFIGURATION_REQUIRED");
  const client = new S3Client({
    endpoint: `https://s3.hf.co/${namespace}`,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 2,
  });
  const sendOptions = () => ({ abortSignal: AbortSignal.timeout(8000) });
  const checkKey = (key: string) => {
    if (!key.startsWith(ROOT) || key.includes("..") || !/^[a-zA-Z0-9_./-]+$/.test(key))
      throw new Error("ACTIVITY_KEY_REJECTED");
  };
  return {
    async verifyPrivate() {
      const response = await fetch(`https://huggingface.co/api/buckets/${repository}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("ACTIVITY_PRIVATE_BUCKET_UNAVAILABLE");
      const metadata = (await response.json()) as {
        private?: boolean;
        id?: string;
        repoType?: string;
      };
      if (
        metadata.private !== true ||
        metadata.id !== repository ||
        (metadata.repoType !== undefined && metadata.repoType !== "bucket")
      )
        throw new Error("ACTIVITY_PRIVATE_BUCKET_REQUIRED");
    },
    async put(key, value, onlyIfAbsent = true) {
      checkKey(key);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: value,
            ContentType: "application/json",
            ...(onlyIfAbsent ? { IfNoneMatch: "*" } : {}),
          }),
          sendOptions(),
        );
        return true;
      } catch (error) {
        if (onlyIfAbsent && precondition(error)) return false;
        throw new Error("ACTIVITY_STORAGE_UNAVAILABLE");
      }
    },
    async exists(key) {
      checkKey(key);
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), sendOptions());
        return true;
      } catch (error) {
        if (missing(error)) return false;
        throw new Error("ACTIVITY_STORAGE_UNAVAILABLE");
      }
    },
    async remove(key) {
      checkKey(key);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), sendOptions());
      } catch {
        throw new Error("ACTIVITY_STORAGE_UNAVAILABLE");
      }
    },
    async list(prefix, cursor) {
      checkKey(prefix);
      try {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            MaxKeys: 8,
            ...(cursor ? { ContinuationToken: cursor } : {}),
          }),
          sendOptions(),
        );
        if (result.IsTruncated && !result.NextContinuationToken)
          throw new Error("ACTIVITY_STORAGE_PAGINATION_REQUIRED");
        return {
          objects: (result.Contents ?? []).map((object) => ({
            key: object.Key ?? "",
            modifiedAt: object.LastModified?.getTime() ?? NaN,
          })),
          ...(result.IsTruncated && result.NextContinuationToken
            ? { cursor: result.NextContinuationToken }
            : {}),
        };
      } catch {
        throw new Error("ACTIVITY_STORAGE_UNAVAILABLE");
      }
    },
  };
}

function control(kind: "deleted" | "revoked", subject: string) {
  if (!SUBJECT.test(subject)) throw new Error("ACTIVITY_SUBJECT_REJECTED");
  return `${ROOT}control/${kind}/${subject}.json`;
}
export async function isActivityRevoked(store: ActivityObjectStore, subject: string) {
  return (
    (await store.exists(control("deleted", subject))) ||
    (await store.exists(control("revoked", subject)))
  );
}
export async function activityMaintenanceHealthy(store: ActivityObjectStore, now = Date.now()) {
  const key = `${ROOT}control/maintenance/last-success.json`;
  const result = await store.list(key);
  const heartbeat = result.objects.find((object) => object.key === key);
  return Boolean(
    heartbeat &&
    Number.isFinite(heartbeat.modifiedAt) &&
    heartbeat.modifiedAt <= now + 60_000 &&
    now - heartbeat.modifiedAt <= 2 * 3600_000,
  );
}
export async function revokeActivitySession(store: ActivityObjectStore, code: string) {
  await store.verifyPrivate();
  await store.put(
    control("revoked", activitySubjectKey(code)),
    JSON.stringify({ schemaVersion: 2, revoked: true }),
  );
}

export function encryptActivityRaw(value: unknown) {
  const key = privacySettings().rawKey;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error("ACTIVITY_ENCRYPTION_REQUIRED");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), nonce);
  cipher.setAAD(Buffer.from("archive:activity-raw:v2"));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({
    schemaVersion: 2,
    algorithm: "AES-256-GCM",
    nonce: nonce.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: body.toString("base64url"),
  });
}

/** Conditional create is idempotent: retries never overwrite the accepted batch, including its expiry. */
export async function preserveActivityBatch(
  store: ActivityObjectStore,
  session: ActivitySession,
  batchId: string,
  events: NormalizedActivity[],
  now = Date.now(),
) {
  if (
    !PRIVACY_UUID.test(batchId) ||
    !events.length ||
    events.length > 24 ||
    !(session.sessionPersonalization || session.modelImprovement)
  )
    throw new Error("ACTIVITY_BATCH_REJECTED");
  const settings = privacySettings();
  if (!settings.enabled) throw new Error("ACTIVITY_DISABLED");
  if (
    session.version !== settings.version ||
    now - session.lastActiveAt >= SESSION_IDLE_MS ||
    now - session.issuedAt >= SESSION_MAX_MS
  )
    throw new Error("ACTIVITY_SESSION_EXPIRED");
  const subject = activitySubjectKey(session.deleteCode);
  await store.verifyPrivate();
  if (!(await activityMaintenanceHealthy(store, now)))
    throw new Error("ACTIVITY_MAINTENANCE_STALE");
  if (await isActivityRevoked(store, subject)) throw new Error("ACTIVITY_REVOKED");
  const batchKey = createHash("sha256").update(batchId).digest("hex");
  const purposes = [
    ...(session.sessionPersonalization ? ["session" as const] : []),
    ...(session.modelImprovement ? ["model" as const] : []),
  ];
  // TTL is stamped into the owned key, so future settings never extend old consent's retention.
  const ttls = purposes.map((purpose) =>
    purpose === "model"
      ? session.retention.modelDays * 86400
      : session.retention.sessionHours * 3600,
  );
  const keys = purposes.map(
    (purpose, index) => `${ROOT}raw/${purpose}/${subject}/${ttls[index]}-${batchKey}.json.enc`,
  );
  const existing = await Promise.all(keys.map((key) => store.exists(key)));
  if (existing.every(Boolean)) {
    if (await isActivityRevoked(store, subject)) throw new Error("ACTIVITY_REVOKED");
    return { duplicate: true };
  }
  // One new batch per five-second slot per session, shared across server instances.
  if (
    !existing.some(Boolean) &&
    !(await store.put(`${ROOT}control/rate/${subject}/${Math.floor(now / 5000)}.json`, "{}"))
  )
    throw new Error("ACTIVITY_RATE_LIMIT");
  const lease = `${ROOT}control/leases/${subject}/${now + 120_000}-${randomUUID()}.json`;
  await store.put(lease, "{}");
  let safeToRelease = false;
  try {
    if (await isActivityRevoked(store, subject)) {
      safeToRelease = true;
      throw new Error("ACTIVITY_REVOKED");
    }
    for (let index = 0; index < purposes.length; index++) {
      const purpose = purposes[index]!;
      const ttl = ttls[index]! * 1000;
      await store.put(
        keys[index]!,
        encryptActivityRaw({
          schemaVersion: 2,
          purpose,
          policyVersion: session.version,
          sessionId: subject,
          consentedPurposes: {
            sessionPersonalization: session.sessionPersonalization,
            modelImprovement: session.modelImprovement,
          },
          receivedAt: new Date(Math.floor(now / 60_000) * 60_000).toISOString(),
          expiresAt: new Date(now + ttl).toISOString(),
          events,
        }),
      );
    }
    if (await isActivityRevoked(store, subject)) {
      await Promise.all(keys.map((key) => store.remove(key)));
      safeToRelease = true;
      throw new Error("ACTIVITY_REVOKED");
    }
    safeToRelease = true;
    return { duplicate: false };
  } finally {
    // A timed-out PUT might have reached the provider. Keep its lease for the bounded
    // safety interval instead of telling a concurrent deletion there is no writer.
    if (safeToRelease) await store.remove(lease);
  }
}

/** Tombstone precedes deletion; any in-flight writer must erase its own late write. */
export async function deleteActivityForCode(
  store: ActivityObjectStore,
  code: string,
  now = Date.now(),
) {
  const subject = activitySubjectKey(code);
  await store.verifyPrivate();
  await store.put(
    control("deleted", subject),
    JSON.stringify({ schemaVersion: 2, deletionRequested: true }),
  );
  let complete = true;
  let removed = 0;
  for (const purpose of ["session", "model"] as const) {
    let cursor: string | undefined;
    let pages = 0;
    do {
      const result = await store.list(`${ROOT}raw/${purpose}/${subject}/`, cursor);
      for (let index = 0; index < result.objects.length; index += 4)
        await Promise.all(
          result.objects.slice(index, index + 4).map(async (object) => {
            await store.remove(object.key);
            removed++;
          }),
        );
      cursor = result.cursor;
      if (++pages >= 1 && cursor) {
        complete = false;
        break;
      }
    } while (cursor);
  }
  const leases = await store.list(`${ROOT}control/leases/${subject}/`);
  if (
    leases.cursor ||
    leases.objects.some((object) => Number(object.key.split("/").at(-1)?.split("-")[0]) > now)
  )
    complete = false;
  return { requested: true, complete, removed };
}

/** Physical expiry is this job's responsibility; expiry fields alone do not erase stored objects. */
export async function sweepActivityRetention(
  store: ActivityObjectStore,
  cursor?: string,
  now = Date.now(),
) {
  await store.verifyPrivate();
  const result = await store.list(ROOT, cursor);
  let removed = 0;
  let skipped = 0;
  async function inspect(object: StoredObject) {
    if (object.key === `${ROOT}control/maintenance/last-success.json`) return;
    const raw =
      /^activity\/v2\/raw\/(session|model)\/([a-f0-9]{64})\/(\d+)-[a-f0-9]{64}\.json\.enc$/.exec(
        object.key,
      );
    const marker = /^activity\/v2\/control\/(deleted|revoked)\/[a-f0-9]{64}\.json$/.test(
      object.key,
    );
    const lease = /^activity\/v2\/control\/leases\/[a-f0-9]{64}\/(\d+)-[\w-]+\.json$/.exec(
      object.key,
    );
    const rate = /^activity\/v2\/control\/rate\/[a-f0-9]{64}\/\d+\.json$/.test(object.key);
    let erase = false;
    if (raw && Number.isFinite(object.modifiedAt)) {
      const seconds = Number(raw[3]);
      const maximum = raw[1] === "model" ? 90 * 86400 : 24 * 3600;
      if (!Number.isSafeInteger(seconds) || seconds < 3600 || seconds > maximum) {
        skipped++;
        return;
      }
      erase =
        object.modifiedAt + seconds * 1000 <= now ||
        (await store.exists(control("deleted", raw[2]!)));
    } else if (lease) erase = Number(lease[1]) <= now;
    else if ((marker || rate) && Number.isFinite(object.modifiedAt))
      erase = object.modifiedAt + (marker ? 91 : 1) * 86400_000 <= now;
    else skipped++;
    if (erase) {
      await store.remove(object.key);
      removed++;
    }
  }
  for (let index = 0; index < result.objects.length; index += 4)
    await Promise.all(result.objects.slice(index, index + 4).map(inspect));
  if (!result.cursor && !skipped)
    await store.put(
      `${ROOT}control/maintenance/last-success.json`,
      JSON.stringify({ schemaVersion: 2, completedAt: new Date(now).toISOString() }),
      false,
    );
  return {
    removed,
    skipped,
    scanned: result.objects.length,
    complete: !result.cursor,
    ...(result.cursor ? { cursor: result.cursor } : {}),
  };
}
