import { env } from "node:process";

import { createSupabaseServerClient } from "./supabase/server";

export interface AdminSession {
  accessToken: string;
  email?: string;
  source: "supabase" | "development";
}

/** Production deliberately has no shared admin credential fallback. */
export function getDevelopmentAdminToken(): string | undefined {
  if (env.NODE_ENV === "production") return undefined;
  const token = env.ARCHIVE_DEV_ADMIN_ACCESS_TOKEN?.trim();
  return token || undefined;
}

/** Only signed provider-controlled claims are trusted; user_metadata cannot grant access. */
export function hasAdminRole(claims: Record<string, unknown>): boolean {
  const requiredRole = env.PUBLISHER_ROLE?.trim() || "archive_admin";
  const roles = new Set<string>();
  if (typeof claims.role === "string") roles.add(claims.role);
  if (Array.isArray(claims.roles)) {
    for (const role of claims.roles) if (typeof role === "string") roles.add(role);
  }
  const metadata = claims.app_metadata;
  if (typeof metadata === "object" && metadata !== null && "roles" in metadata) {
    if (Array.isArray(metadata.roles)) {
      for (const role of metadata.roles) if (typeof role === "string") roles.add(role);
    }
  }
  return roles.has(requiredRole);
}

export async function getAdminSession(): Promise<AdminSession | undefined> {
  const developmentToken = getDevelopmentAdminToken();
  if (developmentToken) return { accessToken: developmentToken, source: "development" };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return undefined;
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims || !hasAdminRole(claimsData.claims)) return undefined;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return undefined;
  const email = claimsData.claims.email;
  return {
    accessToken,
    ...(typeof email === "string" ? { email } : {}),
    source: "supabase",
  };
}
