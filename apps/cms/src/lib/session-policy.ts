import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_POLICY_COOKIE = "archive-cms-session-policy";
export interface SessionPolicy {
  version: 1;
  subject: string;
  remembered: boolean;
  issuedAt: number;
  lastSeenAt: number;
  expiresAt: number;
}
const day = 86_400_000;
const numberWithin = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback;
};
export function sessionLimits(remembered: boolean) {
  return remembered
    ? {
        absoluteMs: numberWithin(process.env.CMS_REMEMBER_DAYS, 180, 365) * day,
        idleMs: numberWithin(process.env.CMS_IDLE_DAYS, 90, 180) * day,
      }
    : { absoluteMs: 8 * 3_600_000, idleMs: 8 * 3_600_000 };
}
function signingSecret(): string | undefined {
  const configured = process.env.CMS_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  return process.env.NODE_ENV === "production"
    ? undefined
    : "local-development-session-key-not-for-deployment";
}
export function createSessionPolicy(
  subject: string,
  remembered: boolean,
  now = Date.now(),
): SessionPolicy {
  return {
    version: 1,
    subject,
    remembered,
    issuedAt: now,
    lastSeenAt: now,
    expiresAt: now + sessionLimits(remembered).absoluteMs,
  };
}
export function encodeSessionPolicy(policy: SessionPolicy): string {
  const secret = signingSecret();
  if (!secret) throw new Error("CMS session signing is not configured");
  const payload = Buffer.from(JSON.stringify(policy)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function decodeSessionPolicy(
  value: string | undefined,
  now = Date.now(),
): SessionPolicy | undefined {
  const secret = signingSecret();
  if (!value || !secret || value.length > 2048) return undefined;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return undefined;
  const actual = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  try {
    const policy = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPolicy;
    if (
      policy.version !== 1 ||
      typeof policy.subject !== "string" ||
      !policy.subject ||
      typeof policy.remembered !== "boolean" ||
      !Number.isFinite(policy.issuedAt) ||
      !Number.isFinite(policy.lastSeenAt) ||
      !Number.isFinite(policy.expiresAt)
    )
      return undefined;
    const limits = sessionLimits(policy.remembered);
    if (
      policy.issuedAt > now ||
      policy.lastSeenAt < policy.issuedAt ||
      policy.lastSeenAt > now ||
      policy.expiresAt <= now ||
      policy.expiresAt <= policy.issuedAt ||
      policy.expiresAt - policy.issuedAt > limits.absoluteMs ||
      now - policy.lastSeenAt > limits.idleMs
    )
      return undefined;
    return policy;
  } catch {
    return undefined;
  }
}
