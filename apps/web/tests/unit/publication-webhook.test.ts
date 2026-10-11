import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  publicationRevalidationScope,
  verifyWebhookSignature,
} from "../../src/lib/publication-webhook.server";

describe("publication webhook", () => {
  it("accepts the worker's signed request format", () => {
    const body = JSON.stringify({ type: "REVISION_PUBLISHED", payload: {} });
    const signature = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
    expect(verifyWebhookSignature(body, signature, "test-secret")).toBe(true);
    expect(verifyWebhookSignature(`${body} `, signature, "test-secret")).toBe(false);
  });

  it("derives locale-wide publication invalidation data", () => {
    expect(
      publicationRevalidationScope({
        type: "REVISION_PUBLISHED",
        payload: { locale: "ko", path: "/ko/new", previousPath: "/ko/old" },
      }),
    ).toEqual({ locale: "ko", paths: ["/ko/new", "/ko/old"] });
  });

  it("ignores events that do not change a public publication pointer", () => {
    expect(
      publicationRevalidationScope({ type: "DOCUMENT_COMPILED", payload: { locale: "ko" } }),
    ).toBeUndefined();
    expect(
      publicationRevalidationScope({
        type: "REVISION_PUBLISHED",
        payload: { locale: "unknown", path: "relative" },
      }),
    ).toBeUndefined();
  });

  it("invalidates public pages after visibility or archive changes", () => {
    expect(
      publicationRevalidationScope({
        type: "CONTENT_ACCESS_CHANGED",
        payload: { locale: "ko", path: "/ko/record", archived: true },
      }),
    ).toEqual({ locale: "ko", paths: ["/ko/record"] });
  });
});
