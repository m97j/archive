import { createHmac, timingSafeEqual } from "node:crypto";

import { LOCALES, type Locale } from "@archive/contracts";

interface PublicationWebhookEvent {
  type?: unknown;
  payload?: unknown;
}

export interface PublicationRevalidationScope {
  locale: Locale;
  paths: string[];
}

export function verifyWebhookSignature(body: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const receivedHex = signature.slice("sha256=".length);
  if (!/^[a-f\d]{64}$/i.test(receivedHex)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(receivedHex, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function publicationRevalidationScope(
  event: PublicationWebhookEvent,
): PublicationRevalidationScope | undefined {
  if (event.type !== "REVISION_PUBLISHED" && event.type !== "CONTENT_ACCESS_CHANGED")
    return undefined;
  if (typeof event.payload !== "object" || event.payload === null) return undefined;
  const payload = event.payload as Record<string, unknown>;
  const locale = payload.locale;
  const path = payload.path;
  if (
    typeof locale !== "string" ||
    !LOCALES.some((candidate) => candidate === locale) ||
    typeof path !== "string" ||
    !path.startsWith("/")
  ) {
    return undefined;
  }
  const previousPath = payload.previousPath;
  const paths = [path];
  if (typeof previousPath === "string" && previousPath.startsWith("/")) paths.push(previousPath);
  return { locale: locale as Locale, paths: [...new Set(paths)] };
}
