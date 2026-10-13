import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PRIVACY_COOKIE,
  PRIVACY_UUID,
  boundedRequestText,
  decodePrivacyChoice,
  privacySettings,
  safeActivityEvents,
} from "@/lib/privacy.server";

export async function POST(request: Request) {
  const settings = privacySettings();
  if (!settings.enabled || !settings.secret) return new NextResponse(null, { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new NextResponse(null, { status: 403 });
  const choice = decodePrivacyChoice((await cookies()).get(PRIVACY_COOKIE)?.value);
  if (!choice?.analytics || !choice.subjectId) return new NextResponse(null, { status: 403 });
  try {
    const supplied = JSON.parse(await boundedRequestText(request, 32768)) as Record<
      string,
      unknown
    >;
    const events = safeActivityEvents(supplied.events);
    if (
      !PRIVACY_UUID.test(String(supplied.batchId)) ||
      !PRIVACY_UUID.test(String(supplied.sessionId)) ||
      !events
    )
      return new NextResponse(null, { status: 400 });
    const body = JSON.stringify({
      schemaVersion: 1,
      policyVersion: choice.version,
      subjectId: choice.subjectId,
      sessionId: supplied.sessionId,
      batchId: supplied.batchId,
      consentedAt: choice.decidedAt,
      events,
    });
    const base = process.env.ARCHIVE_API_BASE_URL;
    const gateway = process.env.ARCHIVE_API_UPSTREAM_BEARER_TOKEN;
    if (!base || !gateway) return new NextResponse(null, { status: 503 });
    const result = await fetch(`${base.replace(/\/$/, "")}/v1/telemetry/batches`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(40_000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${gateway}`,
        "x-archive-activity-signature": createHmac("sha256", settings.secret)
          .update("archive:telemetry:v1\0")
          .update(body)
          .digest("hex"),
      },
      body,
    });
    return new NextResponse(null, {
      status: result.ok ? 201 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
