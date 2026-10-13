import { compileDocument } from "@archive/content-engine";
import { LOCALES, type Locale } from "@archive/contracts";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth.server";
import { acceptsOrigin } from "@/lib/csrf.server";

export async function POST(request: Request) {
  if (!acceptsOrigin(request.headers.get("origin"), request.url))
    return NextResponse.json({ error: "Same-origin request required" }, { status: 403 });
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json")
    return NextResponse.json({ error: "JSON required" }, { status: 415 });
  if (!(await getAdminSession()))
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 200_000)
      return NextResponse.json({ error: "Preview too large" }, { status: 413 });
    const input = JSON.parse(text) as { source?: unknown; locale?: unknown };
    if (typeof input.source !== "string" || !LOCALES.includes(input.locale as Locale))
      return NextResponse.json({ error: "Invalid preview" }, { status: 400 });
    const document = await compileDocument(input.source, { locale: input.locale as Locale });
    return NextResponse.json(
      { html: document.html },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Preview could not be compiled" }, { status: 400 });
  }
}
