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

export async function getAdminSession(): Promise<AdminSession | undefined> {
  const developmentToken = getDevelopmentAdminToken();
  if (developmentToken) return { accessToken: developmentToken, source: "development" };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return undefined;
  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) return undefined;
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
