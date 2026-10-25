import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const PRIVACY_COOKIE = "archive-privacy-v2";
export const ACTIVITY_SESSION_COOKIE = "archive-activity-session-v2";
export const PRIVACY_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX_KEY = /^[a-f0-9]{64}$/i;
const CODE = /^[A-Za-z0-9_-]{43}$/;
const PREFERENCE_AGE = 90 * 86400;
export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_MAX_MS = 12 * 3600_000;

export interface PrivacyChoice {
  version: string;
  sessionPersonalization: boolean;
  modelImprovement: boolean;
  decidedAt: string;
}
export interface ActivitySession {
  version: string;
  sessionPersonalization: boolean;
  modelImprovement: boolean;
  issuedAt: number;
  lastActiveAt: number;
  deleteCode: string;
  retention: { sessionHours: number; modelDays: number };
}
export interface ActivityEvent {
  id: string;
  type: "page_view" | "page_leave" | "navigation" | "section_dwell";
  path: string;
  seconds?: number;
  sectionId?: string;
  revisionNumber?: number;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  if (!value) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= maximum ? number : undefined;
}

/** Operator flags are necessary, not proof that a provider contract has been reviewed. */
export function privacySettings() {
  const version = process.env.ACTIVITY_POLICY_VERSION ?? "2026-10-14";
  const secret = process.env.ACTIVITY_COOKIE_SIGNING_SECRET;
  const sessionKey = process.env.ACTIVITY_SESSION_ENCRYPTION_KEY;
  const deleteKey = process.env.ACTIVITY_DELETE_HMAC_SECRET;
  const rawKey = process.env.ACTIVITY_RAW_ENCRYPTION_KEY;
  const modelDays = positiveInteger(process.env.ACTIVITY_MODEL_RETENTION_DAYS, 90, 90);
  const sessionHours = positiveInteger(process.env.ACTIVITY_SESSION_RETENTION_HOURS, 2, 24);
  const keys = [secret, sessionKey, deleteKey, rawKey, process.env.CRON_SECRET];
  const validKeys =
    keys.every((key) => key && HEX_KEY.test(key)) &&
    new Set(keys.map((key) => key?.toLowerCase())).size === 5;
  const configured = Boolean(
    validKeys &&
    /^[\w-]+\/[\w-]+$/.test(process.env.ACTIVITY_HF_BUCKET ?? "") &&
    process.env.ACTIVITY_HF_HUB_TOKEN &&
    process.env.ACTIVITY_HF_S3_ACCESS_KEY_ID?.startsWith("HFAK") &&
    process.env.ACTIVITY_HF_S3_SECRET_ACCESS_KEY &&
    modelDays &&
    sessionHours &&
    /^[\w.-]{1,40}$/.test(version),
  );
  const enabled =
    process.env.ACTIVITY_COLLECTION_ENABLED === "true" &&
    process.env.ACTIVITY_POLICY_REVIEWED === "true" &&
    process.env.ACTIVITY_RETENTION_SCHEDULER_REVIEWED === "true" &&
    configured;
  return {
    version,
    secret: secret && HEX_KEY.test(secret) ? secret : undefined,
    sessionKey,
    deleteKey,
    rawKey,
    enabled,
    configured,
    retention: { sessionHours: sessionHours ?? 2, modelDays: modelDays ?? 90 },
    operator: process.env.ACTIVITY_OPERATOR_NAME ?? "marchivej",
    contact: process.env.ACTIVITY_CONTACT_EMAIL ?? "mmnkjiae@gmail.com",
  };
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update("archive:privacy:v2\0")
    .update(payload)
    .digest("hex");
}

export function validPrivacyInput(
  value: unknown,
): value is Pick<PrivacyChoice, "sessionPersonalization" | "modelImprovement"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record.sessionPersonalization === "boolean" &&
    typeof record.modelImprovement === "boolean"
  );
}

export function encodePrivacyChoice(
  input: Pick<PrivacyChoice, "sessionPersonalization" | "modelImprovement">,
  now = Date.now(),
): string {
  const { version, secret, enabled } = privacySettings();
  if (!secret || !validPrivacyInput(input)) throw new Error("PRIVACY_CONFIGURATION_REQUIRED");
  const choice: PrivacyChoice = {
    version,
    sessionPersonalization: enabled && input.sessionPersonalization,
    modelImprovement: enabled && input.modelImprovement,
    decidedAt: new Date(now).toISOString(),
  };
  const payload = Buffer.from(JSON.stringify(choice)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function decodePrivacyChoice(value: string | undefined, now = Date.now()) {
  const { secret, version } = privacySettings();
  if (!secret || !value || value.length > 1024) return undefined;
  const [payload, supplied, extra] = value.split(".");
  if (!payload || !supplied || extra || !HEX_KEY.test(supplied)) return undefined;
  if (
    !timingSafeEqual(Buffer.from(signature(payload, secret), "hex"), Buffer.from(supplied, "hex"))
  )
    return undefined;
  try {
    const choice = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PrivacyChoice;
    const decided = Date.parse(choice.decidedAt);
    if (
      Object.keys(choice).length !== 4 ||
      choice.version !== version ||
      typeof choice.sessionPersonalization !== "boolean" ||
      typeof choice.modelImprovement !== "boolean" ||
      !Number.isFinite(decided) ||
      decided > now + 60_000 ||
      now - decided > PREFERENCE_AGE * 1000
    )
      return undefined;
    return choice;
  } catch {
    return undefined;
  }
}

export function privacyCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: PREFERENCE_AGE,
  };
}

export function activityCookieOptions(session: ActivitySession, now = Date.now()) {
  return {
    ...privacyCookieOptions(),
    maxAge: Math.max(
      0,
      Math.floor(Math.min(SESSION_IDLE_MS, session.issuedAt + SESSION_MAX_MS - now) / 1000),
    ),
  };
}

export function createActivitySession(choice: PrivacyChoice, now = Date.now()): ActivitySession {
  if (!(choice.sessionPersonalization || choice.modelImprovement))
    throw new Error("ACTIVITY_CONSENT_REQUIRED");
  return {
    version: choice.version,
    sessionPersonalization: choice.sessionPersonalization,
    modelImprovement: choice.modelImprovement,
    issuedAt: now,
    lastActiveAt: now,
    deleteCode: randomBytes(32).toString("base64url"),
    retention: privacySettings().retention,
  };
}

/** Encryption keeps the deletion capability out of readable signed payloads. */
export function encodeActivitySession(session: ActivitySession) {
  const key = privacySettings().sessionKey;
  if (!key || !HEX_KEY.test(key)) throw new Error("PRIVACY_CONFIGURATION_REQUIRED");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), nonce);
  cipher.setAAD(Buffer.from("archive:session:v2"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decodeActivitySession(value: string | undefined, now = Date.now()) {
  const { sessionKey, version } = privacySettings();
  if (
    !sessionKey ||
    !HEX_KEY.test(sessionKey) ||
    !value ||
    value.length > 2048 ||
    !/^[\w-]+$/.test(value)
  )
    return undefined;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return undefined;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(sessionKey, "hex"),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from("archive:session:v2"));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const session = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"),
    ) as ActivitySession;
    if (
      Object.keys(session).length !== 7 ||
      session.version !== version ||
      typeof session.sessionPersonalization !== "boolean" ||
      typeof session.modelImprovement !== "boolean" ||
      !(session.sessionPersonalization || session.modelImprovement) ||
      !Number.isSafeInteger(session.issuedAt) ||
      !Number.isSafeInteger(session.lastActiveAt) ||
      session.issuedAt > session.lastActiveAt ||
      session.lastActiveAt > now + 60_000 ||
      now - session.lastActiveAt >= SESSION_IDLE_MS ||
      now - session.issuedAt >= SESSION_MAX_MS ||
      !validDeleteCode(session.deleteCode) ||
      !session.retention ||
      !Number.isInteger(session.retention.sessionHours) ||
      session.retention.sessionHours < 1 ||
      session.retention.sessionHours > 24 ||
      !Number.isInteger(session.retention.modelDays) ||
      session.retention.modelDays < 1 ||
      session.retention.modelDays > 90
    )
      return undefined;
    return session;
  } catch {
    return undefined;
  }
}

export function validDeleteCode(code: unknown): code is string {
  return (
    typeof code === "string" &&
    CODE.test(code) &&
    Buffer.from(code, "base64url").length === 32 &&
    Buffer.from(code, "base64url").toString("base64url") === code
  );
}

export function activitySubjectKey(code: string) {
  const key = privacySettings().deleteKey;
  if (!key || !HEX_KEY.test(key) || !validDeleteCode(code))
    throw new Error("INVALID_DELETE_CAPABILITY");
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update("archive:activity-delete:v2\0")
    .update(code)
    .digest("hex");
}

export function safeActivityEvents(input: unknown): ActivityEvent[] | undefined {
  if (!Array.isArray(input) || !input.length || input.length > 24) return undefined;
  const events: ActivityEvent[] = [];
  const ids = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const event = value as Record<string, unknown>;
    if (
      Object.keys(event).some(
        (key) => !["id", "type", "path", "seconds", "sectionId", "revisionNumber"].includes(key),
      ) ||
      typeof event.id !== "string" ||
      !PRIVACY_UUID.test(event.id) ||
      ids.has(event.id) ||
      !["page_view", "page_leave", "navigation", "section_dwell"].includes(String(event.type)) ||
      typeof event.path !== "string" ||
      event.path.length > 240 ||
      !/^\/(?:ko|en|ja|zh|es|fr|de)(?:\/[a-zA-Z0-9_\-/.%]+)?$/.test(event.path) ||
      event.path.includes("..") ||
      /%(?:2f|5c|2e|25)/i.test(event.path) ||
      event.path
        .split("/")
        .some((part) => ["admin", "login", "api", "cms", "studio"].includes(part.toLowerCase())) ||
      (event.seconds !== undefined &&
        (typeof event.seconds !== "number" ||
          !Number.isInteger(event.seconds) ||
          event.seconds < 0 ||
          event.seconds > 600)) ||
      (event.sectionId !== undefined &&
        (typeof event.sectionId !== "string" || !/^s-(?:[1-9]\d{0,2})$/.test(event.sectionId))) ||
      (event.type === "section_dwell" &&
        (event.sectionId === undefined || event.seconds === undefined)) ||
      (event.revisionNumber !== undefined &&
        (typeof event.revisionNumber !== "number" ||
          !Number.isInteger(event.revisionNumber) ||
          event.revisionNumber < 1 ||
          event.revisionNumber > 1_000_000))
    )
      return undefined;
    ids.add(event.id);
    events.push({
      id: event.id,
      type: event.type as ActivityEvent["type"],
      path: event.path,
      ...(event.seconds === undefined ? {} : { seconds: event.seconds as number }),
      ...(event.sectionId === undefined ? {} : { sectionId: event.sectionId as string }),
      ...(event.revisionNumber === undefined
        ? {}
        : { revisionNumber: event.revisionNumber as number }),
    });
  }
  return events;
}

export function sameOriginRequest(request: Request) {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    !["cross-site", "none"].includes(request.headers.get("sec-fetch-site") ?? "same-origin")
  );
}

/** Per-instance brake; production edge limits remain a separate activation requirement. */
const requestWindows = new Map<string, { count: number; until: number }>();
export function activityRequestBudget(key: string, maximum = 30, now = Date.now()) {
  for (const [id, window] of requestWindows) if (window.until <= now) requestWindows.delete(id);
  const current = requestWindows.get(key);
  if (current && current.count >= maximum) return false;
  if (!current && requestWindows.size >= 2048) return false;
  requestWindows.set(key, {
    count: (current?.count ?? 0) + 1,
    until: current?.until ?? now + 60_000,
  });
  return true;
}

export async function boundedRequestText(
  request: Request,
  maximum: number,
  deadlineMs = 5000,
): Promise<string> {
  if (Number(request.headers.get("content-length")) > maximum) throw new Error("BODY_LIMIT");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => {
      reject(new Error("BODY_TIMEOUT"));
      void reader.cancel().catch(() => {});
    }, deadlineMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.length;
      if (bytes > maximum) {
        void reader.cancel().catch(() => {});
        throw new Error("BODY_LIMIT");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(deadline);
  }
  return Buffer.concat(chunks).toString("utf8");
}
