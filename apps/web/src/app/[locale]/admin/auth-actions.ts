"use server";

import { LOCALES } from "@archive/contracts";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

const safeLocale = (value: FormDataEntryValue | null): string =>
  typeof value === "string" && LOCALES.some((locale) => locale === value) ? value : "ko";

export async function loginAction(_state: LoginState, form: FormData): Promise<LoginState> {
  const email = form.get("email");
  const password = form.get("password");
  const locale = safeLocale(form.get("locale"));
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Email and password are required." };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "The email or password was not accepted." };
  } catch {
    return { error: "Supabase sign-in is not configured." };
  }
  redirect(`/${locale}/admin`);
}

export async function logoutAction(form: FormData): Promise<void> {
  const locale = safeLocale(form.get("locale"));
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // An unavailable session is already effectively signed out.
  }
  redirect(`/${locale}/admin/login`);
}
