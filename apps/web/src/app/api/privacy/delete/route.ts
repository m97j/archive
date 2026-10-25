import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACTIVITY_SESSION_COOKIE,
  PRIVACY_COOKIE,
  activityRequestBudget,
  boundedRequestText,
  decodeActivitySession,
  encodePrivacyChoice,
  privacyCookieOptions,
  privacySettings,
  sameOriginRequest,
  validDeleteCode,
} from "@/lib/privacy.server";
import { deleteActivityForCode, hfActivityStore } from "@/lib/hf-activity-storage.server";

export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json({ error: "Same origin required" }, { status: 403, headers });
  if (!activityRequestBudget("delete", 60))
    return NextResponse.json({ error: "Try later" }, { status: 429, headers });
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(await boundedRequestText(request, 256)) as Record<string, unknown>;
    if (!input || Array.isArray(input) || Object.keys(input).some((key) => key !== "deleteCode"))
      throw new Error("INVALID_BODY");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  }
  const session = decodeActivitySession((await cookies()).get(ACTIVITY_SESSION_COOKIE)?.value);
  const code = input.deleteCode ?? session?.deleteCode;
  if (!validDeleteCode(code))
    return NextResponse.json({ error: "Deletion capability required" }, { status: 403, headers });
  try {
    const result = await deleteActivityForCode(hfActivityStore(), code);
    const response = NextResponse.json(
      { requested: result.requested, complete: result.complete },
      { status: result.complete ? 200 : 202, headers },
    );
    // An old-session recovery request does not end an unrelated current session.
    if (code === session?.deleteCode) {
      if (privacySettings().secret)
        response.cookies.set(
          PRIVACY_COOKIE,
          encodePrivacyChoice({ sessionPersonalization: false, modelImprovement: false }),
          privacyCookieOptions(),
        );
      if (result.complete)
        response.cookies.set(ACTIVITY_SESSION_COOKIE, "", { ...privacyCookieOptions(), maxAge: 0 });
    }
    return response;
  } catch {
    return NextResponse.json(
      { requested: false, complete: false, error: "Deletion not confirmed; retry" },
      { status: 503, headers },
    );
  }
}
