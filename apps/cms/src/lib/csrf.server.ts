import { headers } from "next/headers";

export function acceptsOrigin(origin: string | null, requestUrl?: string): boolean {
  if (!origin || origin === "null") return false;
  try {
    const configured = process.env.CMS_PUBLIC_URL?.trim();
    const expected = configured
      ? new URL(configured).origin
      : process.env.NODE_ENV !== "production" && requestUrl
        ? new URL(requestUrl).origin
        : undefined;
    return expected !== undefined && origin === expected;
  } catch {
    return false;
  }
}
export async function assertSameOriginAction(): Promise<void> {
  const incoming = await headers();
  const protocol = incoming.get("x-forwarded-proto") ?? "http";
  const host = incoming.get("host");
  if (!acceptsOrigin(incoming.get("origin"), host ? `${protocol}://${host}` : undefined)) {
    throw new Error("Same-origin request required");
  }
}
