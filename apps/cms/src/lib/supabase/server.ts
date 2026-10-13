import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseBrowserConfig } from "./config";
import { supabaseCookieOptions } from "./cookie-options";
import { decodeSessionPolicy, SESSION_POLICY_COOKIE, sessionLimits } from "../session-policy";

export async function createSupabaseServerClient(remembered?: boolean) {
  const config = supabaseBrowserConfig();
  if (!config) throw new Error("Supabase SSR configuration is unavailable");
  const cookieStore = await cookies();
  const policy = decodeSessionPolicy(cookieStore.get(SESSION_POLICY_COOKIE)?.value);
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const persist = remembered ?? policy?.remembered ?? false;
            const nextOptions = { ...options, ...supabaseCookieOptions() };
            if (value && options.maxAge !== 0) {
              if (!persist) {
                delete nextOptions.maxAge;
                delete nextOptions.expires;
              } else {
                delete nextOptions.expires;
                nextOptions.maxAge = Math.max(
                  0,
                  Math.floor(
                    (policy ? policy.expiresAt - Date.now() : sessionLimits(true).absoluteMs) /
                      1000,
                  ),
                );
              }
            }
            cookieStore.set(name, value, nextOptions);
          });
        } catch {
          // Server Components cannot write cookies. The admin proxy refreshes them instead.
        }
      },
    },
  });
}
