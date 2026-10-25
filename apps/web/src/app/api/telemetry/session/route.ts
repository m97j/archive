import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACTIVITY_SESSION_COOKIE,
  PRIVACY_COOKIE,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  activityCookieOptions,
  activityRequestBudget,
  activitySubjectKey,
  boundedRequestText,
  createActivitySession,
  decodeActivitySession,
  decodePrivacyChoice,
  encodeActivitySession,
  privacySettings,
  sameOriginRequest,
} from "@/lib/privacy.server";
import {
  activityMaintenanceHealthy,
  hfActivityStore,
  isActivityRevoked,
} from "@/lib/hf-activity-storage.server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json({ active: false }, { status: 403, headers });
  if (!activityRequestBudget("session-start", 120))
    return NextResponse.json({ active: false }, { status: 429, headers });
  const settings = privacySettings();
  if (!settings.enabled) return NextResponse.json({ active: false }, { status: 404, headers });
  const jar = await cookies();
  const choice = decodePrivacyChoice(jar.get(PRIVACY_COOKIE)?.value);
  if (!choice || !(choice.sessionPersonalization || choice.modelImprovement))
    return NextResponse.json({ active: false }, { status: 403, headers });
  try {
    const body = await boundedRequestText(request, 128);
    if (body && JSON.stringify(JSON.parse(body)) !== "{}")
      return NextResponse.json({ active: false }, { status: 400, headers });
    const store = hfActivityStore();
    await store.verifyPrivate();
    if (!(await activityMaintenanceHealthy(store)))
      return NextResponse.json({ active: false }, { status: 503, headers });
    const existing = decodeActivitySession(jar.get(ACTIVITY_SESSION_COOKIE)?.value);
    const matches =
      existing &&
      existing.sessionPersonalization === choice.sessionPersonalization &&
      existing.modelImprovement === choice.modelImprovement;
    const usable =
      matches && !(await isActivityRevoked(store, activitySubjectKey(existing.deleteCode)));
    const session = usable
      ? { ...existing, lastActiveAt: Date.now() }
      : createActivitySession(choice);
    const response = NextResponse.json(
      {
        active: true,
        idleMinutes: 30,
        expiresAt: new Date(
          Math.min(session.lastActiveAt + SESSION_IDLE_MS, session.issuedAt + SESSION_MAX_MS),
        ).toISOString(),
      },
      { headers },
    );
    response.cookies.set(
      ACTIVITY_SESSION_COOKIE,
      encodeActivitySession(session),
      activityCookieOptions(session),
    );
    return response;
  } catch {
    return NextResponse.json({ active: false }, { status: 503, headers });
  }
}
