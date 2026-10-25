import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACTIVITY_SESSION_COOKIE,
  activityRequestBudget,
  boundedRequestText,
  decodeActivitySession,
  sameOriginRequest,
} from "@/lib/privacy.server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
/** Explicit access only: never placed in a URL, localStorage, telemetry or automatic response. */
export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json({ error: "Same origin required" }, { status: 403, headers });
  if (!activityRequestBudget("recovery", 60))
    return NextResponse.json({ error: "Try later" }, { status: 429, headers });
  try {
    const body = await boundedRequestText(request, 128);
    if (body && JSON.stringify(JSON.parse(body)) !== "{}") throw new Error("INVALID_BODY");
    const session = decodeActivitySession((await cookies()).get(ACTIVITY_SESSION_COOKIE)?.value);
    if (!session)
      return NextResponse.json(
        { error: "No active session; use a saved code" },
        { status: 404, headers },
      );
    return NextResponse.json({ deleteCode: session.deleteCode }, { headers });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  }
}
