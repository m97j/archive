"use server";

import { LOCALES } from "@archive/contracts";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { hasAdminRole } from "@/lib/admin-auth.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseCookieOptions } from "@/lib/supabase/cookie-options";
import { assertSameOriginAction } from "@/lib/csrf.server";
import {
  createSessionPolicy,
  encodeSessionPolicy,
  SESSION_POLICY_COOKIE,
} from "@/lib/session-policy";

export interface LoginState {
  error?: string;
}

const safeLocale = (value: FormDataEntryValue | null): string =>
  typeof value === "string" && LOCALES.some((locale) => locale === value) ? value : "ko";

export async function loginAction(_state: LoginState, form: FormData): Promise<LoginState> {
  await assertSameOriginAction();
  const email = form.get("email");
  const password = form.get("password");
  const locale = safeLocale(form.get("locale"));
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    email.trim().length > 254 ||
    !password ||
    password.length > 1024
  ) {
    return { error: "Email and password are required." };
  }
  try {
    const remembered = form.get("remember") === "on";
    const supabase = await createSupabaseServerClient(remembered);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: "The email or password was not accepted." };
    const { data, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || !data?.claims || !hasAdminRole(data.claims)) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "The email or password was not accepted." };
    }
    const subject = data.claims.sub;
    if (typeof subject !== "string" || !subject) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "The email or password was not accepted." };
    }
    const policy = createSessionPolicy(subject, remembered);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_POLICY_COOKIE, encodeSessionPolicy(policy), {
      ...supabaseCookieOptions(),
      ...(remembered ? { maxAge: Math.floor((policy.expiresAt - Date.now()) / 1000) } : {}),
    });
  } catch {
    return { error: "Supabase sign-in is not configured." };
  }
  redirect(`/${locale}/admin`);
}

export async function logoutAction(form: FormData): Promise<void> {
  await assertSameOriginAction();
  const locale = safeLocale(form.get("locale"));
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // An unavailable session is already effectively signed out.
  }
  (await cookies()).set(SESSION_POLICY_COOKIE, "", { ...supabaseCookieOptions(), maxAge: 0 });
  redirect(`/${locale}/admin/login`);
}
