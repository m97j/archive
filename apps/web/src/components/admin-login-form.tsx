"use client";

import type { Locale } from "@archive/contracts";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction } from "@/app/[locale]/admin/auth-actions";

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function AdminLoginForm({ locale }: { locale: Locale }) {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form className="admin-login-form" action={action}>
      <input type="hidden" name="locale" value={locale} />
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error ? (
        <p className="editor-message error" role="alert">
          {state.error}
        </p>
      ) : null}
      <SignInButton />
    </form>
  );
}
