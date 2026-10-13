"use client";

import type { Locale } from "@archive/contracts";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction } from "@/app/[locale]/admin/auth-actions";

function SignInButton({ locale }: { locale: Locale }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending
        ? locale === "ko"
          ? "로그인 중…"
          : "Signing in…"
        : locale === "ko"
          ? "스튜디오 열기"
          : "Open studio"}
    </button>
  );
}

export function AdminLoginForm({ locale }: { locale: Locale }) {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form className="admin-login-form" action={action}>
      <input type="hidden" name="locale" value={locale} />
      <label>
        <span>{locale === "ko" ? "관리자 이메일" : "Admin email"}</span>
        <input name="email" type="email" autoComplete="username" maxLength={254} required />
      </label>
      <label>
        <span>{locale === "ko" ? "로그인 비밀번호" : "Login password"}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={1024}
          required
        />
      </label>
      <label className="remember-option">
        <input type="checkbox" name="remember" />
        <span>{locale === "ko" ? "이 브라우저에서 로그인 유지" : "Remember this browser"}</span>
      </label>
      <p className="form-hint">
        {locale === "ko"
          ? "개인 기기에서만 선택하세요. 쿠키로 유지되며 기기 자체에 고정되지 않습니다. 기본 90일 비활동 또는 180일 경과 시 재로그인합니다."
          : "Use only on a personal device. Cookie persistence is not hardware binding. Sign in again after 90 idle days or 180 days total by default."}
      </p>
      {state.error ? (
        <p className="editor-message error" role="alert">
          {state.error}
        </p>
      ) : null}
      <SignInButton locale={locale} />
    </form>
  );
}
