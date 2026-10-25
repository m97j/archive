import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACTIVITY_SESSION_COOKIE,
  PRIVACY_COOKIE,
  PRIVACY_UUID,
  activityCookieOptions,
  activityRequestBudget,
  activitySubjectKey,
  boundedRequestText,
  decodeActivitySession,
  decodePrivacyChoice,
  encodeActivitySession,
  privacySettings,
  safeActivityEvents,
  sameOriginRequest,
} from "@/lib/privacy.server";
import {
  hfActivityStore,
  normalizePublicActivity,
  preserveActivityBatch,
} from "@/lib/hf-activity-storage.server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!privacySettings().enabled) return new NextResponse(null, { status: 404, headers });
  if (!sameOriginRequest(request)) return new NextResponse(null, { status: 403, headers });
  const jar = await cookies();
  const choice = decodePrivacyChoice(jar.get(PRIVACY_COOKIE)?.value);
  const session = decodeActivitySession(jar.get(ACTIVITY_SESSION_COOKIE)?.value);
  if (
    !choice ||
    !session ||
    !(choice.sessionPersonalization || choice.modelImprovement) ||
    session.sessionPersonalization !== choice.sessionPersonalization ||
    session.modelImprovement !== choice.modelImprovement
  )
    return new NextResponse(null, { status: 403, headers });
  if (!activityRequestBudget(activitySubjectKey(session.deleteCode), 24))
    return new NextResponse(null, { status: 429, headers });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await boundedRequestText(request, 16384)) as Record<string, unknown>;
    if (
      !body ||
      Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !PRIVACY_UUID.test(String(body.batchId))
    )
      throw new Error("INVALID_BATCH");
  } catch {
    return new NextResponse(null, { status: 400, headers });
  }
  const events = safeActivityEvents(body.events);
  if (!events) return new NextResponse(null, { status: 400, headers });
  try {
    const normalized = await normalizePublicActivity(events);
    if (!normalized.length) return new NextResponse(null, { status: 204, headers });
    const result = await preserveActivityBatch(
      hfActivityStore(),
      session,
      String(body.batchId),
      normalized,
    );
    const refreshed = { ...session, lastActiveAt: Date.now() };
    const response = NextResponse.json(
      { preserved: true, duplicate: result.duplicate },
      { status: 201, headers },
    );
    response.cookies.set(
      ACTIVITY_SESSION_COOKIE,
      encodeActivitySession(refreshed),
      activityCookieOptions(refreshed),
    );
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const status =
      reason === "ACTIVITY_RATE_LIMIT"
        ? 429
        : reason === "ACTIVITY_REVOKED"
          ? 403
          : reason.startsWith("ACTIVITY_PUBLIC") || reason === "ACTIVITY_SECTION_REQUIRED"
            ? 400
            : 503;
    return new NextResponse(null, { status, headers });
  }
}
