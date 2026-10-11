import { createHmac } from "node:crypto";

import type { OutboxHandler } from "./run-outbox.js";

export interface SignedWebhookOptions {
  url: string;
  secret: string;
  fetch?: typeof globalThis.fetch;
}

export function createSignedWebhookHandler(options: SignedWebhookOptions): OutboxHandler {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  return async (event) => {
    const body = JSON.stringify({
      id: event.id,
      type: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload,
    });
    const signature = createHmac("sha256", options.secret).update(body).digest("hex");
    const response = await fetchImplementation(options.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": event.id,
        "x-archive-signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000);
      throw new Error(`Webhook returned ${response.status}: ${responseBody}`);
    }
  };
}
