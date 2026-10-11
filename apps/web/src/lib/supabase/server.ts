import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseBrowserConfig } from "./config";

export async function createSupabaseServerClient() {
  const config = supabaseBrowserConfig();
  if (!config) throw new Error("Supabase SSR configuration is unavailable");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. The admin proxy refreshes them instead.
        }
      },
    },
  });
}
