import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const PRIVACY_COOKIE = "archive-privacy-v1";
const AGE = 30 * 86400;
const DOMAIN = "archive:privacy:v1\0";
export const PRIVACY_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function safeActivityEvents(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > 48) return undefined;
  const events: { id: string; type: string; path: string; seconds?: number }[] = [];
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const event = value as Record<string, unknown>;
    if (
      Object.keys(event).some((key) => !["id", "type", "path", "seconds"].includes(key)) ||
      typeof event.id !== "string" ||
      !PRIVACY_UUID.test(event.id) ||
      !["page_view", "page_leave", "navigation"].includes(String(event.type)) ||
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
          event.seconds > 600))
    )
      return undefined;
    events.push({
      id: event.id,
      type: String(event.type),
      path: event.path,
      ...(event.seconds === undefined ? {} : { seconds: event.seconds as number }),
    });
  }
  return events;
}

export interface PrivacyChoice {
  version: string;
  analytics: boolean;
  decidedAt: string;
  subjectId?: string;
}

export function privacySettings() {
  const version = process.env.ANALYTICS_POLICY_VERSION ?? "2026-10-13";
  const secret = process.env.OUTBOX_WEBHOOK_SECRET;
  const enabled =
    process.env.ANALYTICS_ENABLED === "true" &&
    process.env.ANALYTICS_POLICY_REVIEWED === "true" &&
    Boolean(secret);
  return { version, secret, enabled };
}

export function encodePrivacyChoice(analytics: boolean, now = Date.now()): string {
  const { version, secret, enabled } = privacySettings();
  if (!secret) throw new Error("PRIVACY_SECRET_REQUIRED");
  const choice: PrivacyChoice = {
    version,
    analytics: analytics && enabled,
    decidedAt: new Date(now).toISOString(),
    ...(analytics && enabled ? { subjectId: randomUUID() } : {}),
  };
  const payload = Buffer.from(JSON.stringify(choice)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(DOMAIN).update(payload).digest("hex")}`;
}

export function decodePrivacyChoice(
  value: string | undefined,
  now = Date.now(),
): PrivacyChoice | undefined {
  const { version, secret } = privacySettings();
  if (!secret || !value || value.length > 1024) return undefined;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) return undefined;
  const expected = createHmac("sha256", secret).update(DOMAIN).update(payload).digest("hex");
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex")))
    return undefined;
  try {
    const choice = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PrivacyChoice;
    const decided = Date.parse(choice.decidedAt);
    if (
      choice.version !== version ||
      typeof choice.analytics !== "boolean" ||
      !Number.isFinite(decided) ||
      decided > now + 60_000 ||
      now - decided > AGE * 1000 ||
      (choice.analytics && !PRIVACY_UUID.test(choice.subjectId ?? ""))
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
    sameSite: "lax" as const,
    path: "/",
    maxAge: AGE,
  };
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
  let deadline;
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => {
      reject(new Error("BODY_TIMEOUT"));
      void reader.cancel();
    }, deadlineMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.length;
      if (bytes > maximum) {
        await reader.cancel();
        throw new Error("BODY_LIMIT");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(deadline);
  }
  return Buffer.concat(chunks).toString("utf8");
}
