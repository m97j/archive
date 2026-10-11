import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  publicationRevalidationScope,
  verifyWebhookSignature,
} from "@/lib/publication-webhook.server";

const MAX_WEBHOOK_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const secret = process.env.OUTBOX_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Webhook payload is too large" }, { status: 413 });
  }
  if (!verifyWebhookSignature(body, request.headers.get("x-archive-signature"), secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  if (typeof event !== "object" || event === null) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const scope = publicationRevalidationScope(event);
  if (scope) {
    // Invalidating the locale layout also refreshes its home, catalogs, spaces and documents.
    revalidatePath(`/${scope.locale}`, "layout");
  }
  return NextResponse.json({ accepted: true, revalidated: scope?.paths ?? [] });
}
