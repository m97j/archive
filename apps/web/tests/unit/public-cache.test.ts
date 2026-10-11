// @vitest-environment node

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../src/app/api/revalidate/route";
import { publicCacheTag } from "../../src/lib/public-cache";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/cache", () => cache);

const webhookSecret = "public-cache-unit-test-only";
const publication = {
  type: "REVISION_PUBLISHED",
  payload: { locale: "ko", path: "/ko/new-record", previousPath: "/ko/old-record" },
};

function signatureFor(body: string, secret = webhookSecret) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function requestFor(event: unknown, secret = webhookSecret) {
  const body = JSON.stringify(event);
  return new Request("https://archive.test/api/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-archive-signature": signatureFor(body, secret),
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OUTBOX_WEBHOOK_SECRET", webhookSecret);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("locale-scoped public cache invalidation", () => {
  it("keeps all supported locale tags distinct", () => {
    const locales = ["ko", "en", "ja", "zh", "es", "fr", "de"] as const;
    const tags = locales.map(publicCacheTag);
    expect(publicCacheTag("ko")).toBe("archive:public:ko");
    expect(publicCacheTag("en")).toBe("archive:public:en");
    expect(new Set(tags).size).toBe(locales.length);
  });

  it("immediately expires the signed publication locale and invalidates literal current and previous paths", async () => {
    const response = await POST(requestFor(publication));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      revalidated: ["/ko/new-record", "/ko/old-record"],
    });
    expect(cache.revalidateTag.mock.calls).toEqual([["archive:public:ko", { expire: 0 }]]);
    expect(cache.revalidatePath.mock.calls).toEqual([
      ["/ko"],
      ["/ko/archive"],
      ["/ko/new-record"],
      ["/ko/old-record"],
    ]);
  });

  it("immediately expires access changes without invalidating another locale", async () => {
    const response = await POST(
      requestFor({
        type: "CONTENT_ACCESS_CHANGED",
        payload: { locale: "en", path: "/en/record", archived: true },
      }),
    );

    expect(response.status).toBe(200);
    expect(cache.revalidateTag.mock.calls).toEqual([["archive:public:en", { expire: 0 }]]);
    expect(cache.revalidatePath.mock.calls).toEqual([["/en"], ["/en/archive"], ["/en/record"]]);
  });

  it.each([null, "sha256=not-a-digest", `sha256=${"0".repeat(64)}`])(
    "does not invalidate caches for a missing or invalid signature (%s)",
    async (signature) => {
      const headers = new Headers({ "content-type": "application/json" });
      if (signature !== null) headers.set("x-archive-signature", signature);
      const response = await POST(
        new Request("https://archive.test/api/revalidate", {
          method: "POST",
          headers,
          body: JSON.stringify(publication),
        }),
      );

      expect(response.status).toBe(401);
      expect(cache.revalidateTag).not.toHaveBeenCalled();
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each(["DOCUMENT_COMPILED", "REVISION_CREATED"])(
    "accepts signed %s delivery without public invalidation",
    async (type) => {
      const response = await POST(requestFor({ ...publication, type }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ accepted: true, revalidated: [] });
      expect(cache.revalidateTag).not.toHaveBeenCalled();
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("does not invalidate an unsupported locale even with a valid signature", async () => {
    const response = await POST(
      requestFor({
        type: "REVISION_PUBLISHED",
        payload: { locale: "unknown", path: "/unknown/record" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, revalidated: [] });
    expect(cache.revalidateTag).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects signed invalid JSON without invalidation", async () => {
    const body = "{invalid-json";
    const response = await POST(
      new Request("https://archive.test/api/revalidate", {
        method: "POST",
        headers: { "x-archive-signature": signatureFor(body) },
        body,
      }),
    );

    expect(response.status).toBe(400);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("requires webhook configuration before any invalidation", async () => {
    vi.stubEnv("OUTBOX_WEBHOOK_SECRET", undefined);
    const response = await POST(requestFor(publication));

    expect(response.status).toBe(503);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
