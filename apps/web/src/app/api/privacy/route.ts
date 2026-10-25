import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACTIVITY_SESSION_COOKIE,
  PRIVACY_COOKIE,
  activityRequestBudget,
  boundedRequestText,
  decodeActivitySession,
  decodePrivacyChoice,
  encodePrivacyChoice,
  privacyCookieOptions,
  privacySettings,
  sameOriginRequest,
  validPrivacyInput,
} from "@/lib/privacy.server";
import { privacyResponse } from "@/lib/privacy-response.server";
import {
  deleteActivityForCode,
  hfActivityStore,
  revokeActivitySession,
} from "@/lib/hf-activity-storage.server";

export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  return NextResponse.json(
    privacyResponse(decodePrivacyChoice((await cookies()).get(PRIVACY_COOKIE)?.value)),
    { headers },
  );
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json({ error: "Same origin required" }, { status: 403, headers });
  if (!activityRequestBudget("preferences", 120))
    return NextResponse.json({ error: "Try later" }, { status: 429, headers });
  let input: unknown;
  try {
    input = JSON.parse(await boundedRequestText(request, 1024));
  } catch {
    return NextResponse.json({ error: "Invalid preference" }, { status: 400, headers });
  }
  if (!validPrivacyInput(input))
    return NextResponse.json({ error: "Invalid preference" }, { status: 400, headers });
  const settings = privacySettings();
  const jar = await cookies();
  const current = decodeActivitySession(jar.get(ACTIVITY_SESSION_COOKIE)?.value);
  const changes =
    current &&
    (current.sessionPersonalization !== input.sessionPersonalization ||
      current.modelImprovement !== input.modelImprovement);
  const withdraws =
    current &&
    ((current.sessionPersonalization && !input.sessionPersonalization) ||
      (current.modelImprovement && !input.modelImprovement));
  let deletion: { requested: boolean; complete: boolean } | undefined;
  let failed = false;
  if (changes) {
    try {
      const store = hfActivityStore();
      if (withdraws) deletion = await deleteActivityForCode(store, current.deleteCode);
      else await revokeActivitySession(store, current.deleteCode);
    } catch {
      failed = true;
    }
  }
  const encoded = settings.secret ? encodePrivacyChoice(input) : undefined;
  const choice = encoded ? decodePrivacyChoice(encoded) : undefined;
  const response = NextResponse.json(
    {
      ...privacyResponse(choice),
      decided: true,
      ...(deletion ? { deletion } : {}),
      ...(failed ? { error: "Storage unavailable; deletion not confirmed" } : {}),
    },
    { status: failed ? 503 : deletion && !deletion.complete ? 202 : 200, headers },
  );
  if (encoded) response.cookies.set(PRIVACY_COOKIE, encoded, privacyCookieOptions());
  // An unavailable store must not discard the only current-session deletion capability.
  if (
    !failed &&
    (!deletion || deletion.complete) &&
    (changes || !settings.enabled || !(input.sessionPersonalization || input.modelImprovement))
  )
    response.cookies.set(ACTIVITY_SESSION_COOKIE, "", { ...privacyCookieOptions(), maxAge: 0 });
  response.cookies.set("archive-privacy-v1", "", { ...privacyCookieOptions(), maxAge: 0 });
  return response;
}
