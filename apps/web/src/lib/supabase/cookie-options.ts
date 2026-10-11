import type { CookieOptions } from "@supabase/ssr";

/** Authentication is server-only; no browser Supabase client needs to read these cookies. */
export function supabaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
