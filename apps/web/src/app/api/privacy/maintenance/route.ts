import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { boundedRequestText } from "@/lib/privacy.server";
import {
  activityMaintenanceHealthy,
  hfActivityStore,
  sweepActivityRetention,
} from "@/lib/hf-activity-storage.server";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(
    secret &&
    /^[a-f0-9]{64}$/i.test(secret) &&
    Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)),
  );
}
/** Read-only readiness check; collection and scheduler review flags are not prerequisites. */
export async function GET(request: Request) {
  if (!authorized(request)) return new NextResponse(null, { status: 404, headers });
  try {
    const store = hfActivityStore();
    await store.verifyPrivate();
    return NextResponse.json(
      { privateVerified: true, maintenanceRecent: await activityMaintenanceHealthy(store) },
      { headers },
    );
  } catch {
    return NextResponse.json({ privateVerified: false }, { status: 503, headers });
  }
}
/** The scheduled caller must continue pagination until complete=true and alert on failure. */
export async function POST(request: Request) {
  if (!authorized(request)) return new NextResponse(null, { status: 404, headers });
  let cursor: string | undefined;
  try {
    const value = JSON.parse(await boundedRequestText(request, 4096)) as { cursor?: unknown };
    if (
      !value ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => key !== "cursor") ||
      (value.cursor !== undefined &&
        (typeof value.cursor !== "string" || value.cursor.length > 2048))
    )
      throw new Error("INVALID_CURSOR");
    cursor = value.cursor as string | undefined;
  } catch {
    return NextResponse.json({ error: "Invalid maintenance request" }, { status: 400, headers });
  }
  try {
    const result = await sweepActivityRetention(hfActivityStore(), cursor);
    return NextResponse.json(result, {
      status: result.skipped ? 503 : result.complete ? 200 : 202,
      headers,
    });
  } catch {
    return NextResponse.json(
      { complete: false, error: "Maintenance failed; alert and retry" },
      { status: 503, headers },
    );
  }
}
