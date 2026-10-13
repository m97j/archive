// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionPolicy,
  decodeSessionPolicy,
  encodeSessionPolicy,
  sessionLimits,
} from "../../src/lib/session-policy";
import { acceptsOrigin } from "../../src/lib/csrf.server";
const now = 1_800_000_000_000;
const day = 86_400_000;
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CMS_SESSION_SECRET", "fixture-secret-minimum-thirty-two-characters");
  vi.stubEnv("CMS_REMEMBER_DAYS", "");
  vi.stubEnv("CMS_IDLE_DAYS", "");
  vi.stubEnv("CMS_PUBLIC_URL", "https://m97j-archive-core.hf.space");
});
afterEach(() => vi.unstubAllEnvs());
describe("signed browser persistence policy", () => {
  it("bounds a remembered session separately from the short-lived provider JWT", () => {
    const policy = createSessionPolicy("owner", true, now);
    expect(policy.expiresAt - now).toBe(180 * day);
    expect(decodeSessionPolicy(encodeSessionPolicy(policy), now)).toEqual(policy);
    expect(sessionLimits(true).idleMs).toBe(90 * day);
  });
  it("expires after inactivity and never slides beyond its absolute maximum", () => {
    const policy = createSessionPolicy("owner", true, now);
    expect(decodeSessionPolicy(encodeSessionPolicy(policy), now + 90 * day + 1)).toBeUndefined();
    const touched = { ...policy, lastSeenAt: now + 179 * day };
    expect(decodeSessionPolicy(encodeSessionPolicy(touched), now + 179 * day)).toEqual(touched);
    expect(decodeSessionPolicy(encodeSessionPolicy(touched), now + 180 * day)).toBeUndefined();
  });
  it("limits the non-remembered policy to eight hours", () => {
    const policy = createSessionPolicy("owner", false, now);
    expect(sessionLimits(false).absoluteMs).toBe(8 * 3_600_000);
    expect(decodeSessionPolicy(encodeSessionPolicy(policy), now + 8 * 3_600_000)).toBeUndefined();
  });
  it("rejects unsigned, modified, malformed and future cookies", () => {
    const policy = createSessionPolicy("owner", true, now);
    const encoded = encodeSessionPolicy(policy);
    expect(decodeSessionPolicy(`${encoded}.extra`, now)).toBeUndefined();
    expect(decodeSessionPolicy(encoded.replace(/.$/, "!"), now)).toBeUndefined();
    expect(decodeSessionPolicy("not-signed", now)).toBeUndefined();
    expect(
      decodeSessionPolicy(encodeSessionPolicy({ ...policy, issuedAt: now + 1 }), now),
    ).toBeUndefined();
    expect(
      decodeSessionPolicy(encodeSessionPolicy({ ...policy, lastSeenAt: now - 1 }), now),
    ).toBeUndefined();
  });
  it("fails closed without a production signing secret", () => {
    vi.stubEnv("CMS_SESSION_SECRET", "");
    expect(() => encodeSessionPolicy(createSessionPolicy("owner", true, now))).toThrow();
    expect(decodeSessionPolicy("anything", now)).toBeUndefined();
  });
  it("validates configured retention bounds", () => {
    vi.stubEnv("CMS_REMEMBER_DAYS", "9999");
    vi.stubEnv("CMS_IDLE_DAYS", "-1");
    expect(sessionLimits(true)).toEqual({ absoluteMs: 180 * day, idleMs: 90 * day });
    vi.stubEnv("CMS_REMEMBER_DAYS", "120");
    vi.stubEnv("CMS_IDLE_DAYS", "60");
    expect(sessionLimits(true)).toEqual({ absoluteMs: 120 * day, idleMs: 60 * day });
  });
});
describe("embedded studio CSRF boundary", () => {
  it("accepts only the configured app origin, not the HF frame parent", () => {
    expect(acceptsOrigin("https://m97j-archive-core.hf.space")).toBe(true);
    for (const origin of [
      null,
      "null",
      "https://huggingface.co",
      "http://m97j-archive-core.hf.space",
      "https://attacker.example.test",
    ])
      expect(acceptsOrigin(origin)).toBe(false);
  });
  it("fails closed if production origin is missing", () => {
    vi.stubEnv("CMS_PUBLIC_URL", "");
    expect(
      acceptsOrigin("https://m97j-archive-core.hf.space", "https://m97j-archive-core.hf.space/foo"),
    ).toBe(false);
  });
});
