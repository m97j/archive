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
        <p className="eyebrow">Authoring access</p>
        <h1>Sign in</h1>
        <p>Use an account with the archive_admin role.</p>
      </div>
      <AdminLoginForm locale={locale} />
    </section>
  );
}
