import type { CookieOptions } from "@supabase/ssr";

/** Authentication is server-only; no browser Supabase client needs to read these cookies. */
export function supabaseCookieOptions(): CookieOptions {
  const embedded =
    process.env.NODE_ENV === "production" && process.env.CMS_COOKIE_MODE !== "top-level";
  return {
    httpOnly: true,
    sameSite: embedded ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(embedded ? { partitioned: true } : {}),
  };
}
