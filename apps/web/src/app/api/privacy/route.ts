import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PRIVACY_COOKIE,
  boundedRequestText,
  decodePrivacyChoice,
  encodePrivacyChoice,
  privacyCookieOptions,
  privacySettings,
} from "@/lib/privacy.server";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const settings = privacySettings();
  const choice = decodePrivacyChoice((await cookies()).get(PRIVACY_COOKIE)?.value);
  return NextResponse.json(
    {
      enabled: settings.enabled,
      version: settings.version,
      analytics: settings.enabled && choice?.analytics === true,
      decided: Boolean(choice),
    },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Same origin required" }, { status: 403, headers: noStore });
  try {
    const body = JSON.parse(await boundedRequestText(request, 1024)) as { analytics?: unknown };
    if (typeof body.analytics !== "boolean")
      return NextResponse.json({ error: "Invalid preference" }, { status: 400, headers: noStore });
    const settings = privacySettings();
    const response = NextResponse.json(
      {
        analytics: settings.enabled && body.analytics,
        enabled: settings.enabled,
        version: settings.version,
        decided: true,
      },
      { headers: noStore },
    );
    if (settings.secret)
      response.cookies.set(
        PRIVACY_COOKIE,
        encodePrivacyChoice(body.analytics),
        privacyCookieOptions(),
      );
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid preference" }, { status: 400, headers: noStore });
  }
}
