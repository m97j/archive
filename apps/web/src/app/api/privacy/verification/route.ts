import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { boundedRequestText } from "@/lib/privacy.server";
import { verifyActivityStorage } from "@/lib/activity-verification.server";

export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };

/** Explicitly authorized, bounded synthetic writes; not a public collection endpoint. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    !/^[a-f0-9]{64}$/i.test(secret) ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return new NextResponse(null, { status: 404, headers });
  try {
    const value = JSON.parse(await boundedRequestText(request, 1024));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length)
      return new NextResponse(null, { status: 400, headers });
    return NextResponse.json(await verifyActivityStorage(), { headers });
  } catch {
    return NextResponse.json({ verified: false }, { status: 503, headers });
  }
}
