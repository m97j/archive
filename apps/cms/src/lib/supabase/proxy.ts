import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { supabaseBrowserConfig } from "./config";
import { supabaseCookieOptions } from "./cookie-options";
import { decodeSessionPolicy, encodeSessionPolicy, SESSION_POLICY_COOKIE } from "../session-policy";
import { hasAdminRole } from "../admin-auth.server";

export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const config = supabaseBrowserConfig();
  if (!config) return NextResponse.next({ request });
  const policy = decodeSessionPolicy(request.cookies.get(SESSION_POLICY_COOKIE)?.value);
  if (!policy) {
    const names = request.cookies
      .getAll()
      .filter((cookie) => cookie.name.startsWith("sb-") || cookie.name === SESSION_POLICY_COOKIE)
      .map((cookie) => cookie.name);
    names.forEach((name) => request.cookies.delete(name));
    const expired = NextResponse.next({ request });
    names.forEach((name) =>
      expired.cookies.set(name, "", { ...supabaseCookieOptions(), maxAge: 0 }),
    );
    expired.headers.set("Cache-Control", "private, no-store");
    return expired;
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          const nextOptions = { ...options, ...supabaseCookieOptions() };
          if (value && options.maxAge !== 0) {
            if (!policy.remembered) {
              delete nextOptions.maxAge;
              delete nextOptions.expires;
            } else
              nextOptions.maxAge = Math.max(0, Math.floor((policy.expiresAt - Date.now()) / 1000));
          }
          response.cookies.set(name, value, nextOptions);
        });
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  if (!error && data?.claims && hasAdminRole(data.claims) && data.claims.sub === policy.subject) {
    const value = encodeSessionPolicy({ ...policy, lastSeenAt: Date.now() });
    request.cookies.set(SESSION_POLICY_COOKIE, value);
    response.cookies.set(SESSION_POLICY_COOKIE, value, {
      ...supabaseCookieOptions(),
      ...(policy.remembered
        ? { maxAge: Math.max(0, Math.floor((policy.expiresAt - Date.now()) / 1000)) }
        : {}),
    });
  } else {
    request.cookies.delete(SESSION_POLICY_COOKIE);
    response.cookies.set(SESSION_POLICY_COOKIE, "", { ...supabaseCookieOptions(), maxAge: 0 });
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
