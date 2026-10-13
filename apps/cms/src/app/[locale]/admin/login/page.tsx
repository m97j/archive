import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin-login-form";
import { getAdminSession } from "@/lib/admin-auth.server";
import { requireLocale } from "@/lib/routing";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = requireLocale((await params).locale);
  if (await getAdminSession()) redirect(`/${locale}/admin`);
  return (
    <section className="admin-login-page">
      <div>
        <p className="eyebrow">Private studio</p>
        <h1>{locale === "ko" ? "다시 만나 반갑습니다." : "Welcome back."}</h1>
        <p>
          {locale === "ko"
            ? "HF 접근 권한과 별도로 관리자 계정의 권한을 확인합니다. DB 비밀번호가 아닌 사이트 로그인 비밀번호를 사용하세요."
            : "Use your site administrator account, not the database password. HF access does not replace the administrator role check."}
        </p>
        <a href={process.env.CMS_PUBLIC_URL || "/"} target="_blank" rel="noopener noreferrer">
          {locale === "ko"
            ? "쿠키가 차단되면 앱을 새 탭에서 열기 ↗"
            : "If embedded cookies are blocked, open the app in a new tab ↗"}
        </a>
      </div>
      <AdminLoginForm locale={locale} />
    </section>
  );
}
