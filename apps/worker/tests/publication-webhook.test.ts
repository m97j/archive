import { createHmac } from "node:crypto";

import type { ClaimedOutboxEvent } from "@archive/db";
import { describe, expect, it, vi } from "vitest";

import { createSignedWebhookHandler } from "../src/jobs/publication-webhook.js";

const event: ClaimedOutboxEvent = {
  id: "10000000-0000-4000-8000-000000000001",
  eventType: "REVISION_PUBLISHED",
  aggregateType: "CONTENT_PUBLICATION_EN",
  aggregateId: "10000000-0000-4000-8000-000000000002",
  aggregateVersion: 1,
  payload: { path: "/en/work/demo" },
  attempts: 1,
  maxAttempts: 8,
  occurredAt: new Date("2026-09-02T00:00:00.000Z"),
};

describe("signed publication webhook", () => {
  it("sends a stable idempotency key and HMAC signature", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const handler = createSignedWebhookHandler({
      url: "https://example.com/archive-events",
      secret: "test-secret",
      fetch,
    });
    await handler(event);

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/archive-events");
    const body = String(init.body);
    const signature = createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(init.headers).toMatchObject({
      "idempotency-key": event.id,
      "x-archive-signature": `sha256=${signature}`,
    });
  });

  it("rejects non-success responses so the event is retried", async () => {
    const handler = createSignedWebhookHandler({
      url: "https://example.com/archive-events",
      secret: "test-secret",
      fetch: vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    });
    await expect(handler(event)).rejects.toThrow("Webhook returned 503: unavailable");
  });
});
