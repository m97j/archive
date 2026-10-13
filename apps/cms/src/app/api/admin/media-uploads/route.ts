import type { CreateMediaUploadInput, MediaUploadTicket } from "@archive/contracts";
import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth.server";
import { ArchiveApiError, archiveApiRequest } from "@/lib/archive-api.server";
import { acceptsOrigin } from "@/lib/csrf.server";

export async function POST(request: Request) {
  // Unlike Server Actions, Route Handlers do not get Next.js's automatic Origin check.
  // This cookie-authenticated endpoint is used only by the same-origin browser editor.
  if (!acceptsOrigin(request.headers.get("origin"), request.url)) {
    return NextResponse.json({ error: "Same-origin request required" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "JSON request required" }, { status: 415 });
  }
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let input: CreateMediaUploadInput;
  try {
    input = (await request.json()) as CreateMediaUploadInput;
  } catch {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }
  try {
    const ticket = await archiveApiRequest<MediaUploadTicket>("/v1/media/uploads", {
      method: "POST",
      accessToken: session.accessToken,
      body: JSON.stringify(input),
    });
    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    const status = error instanceof ArchiveApiError ? error.status : 502;
    return NextResponse.json({ error: "Unable to prepare media upload" }, { status });
  }
}
