import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth.server";
import { requireLocale } from "@/lib/routing";
export const dynamic = "force-dynamic";
export default async function Integrations({ params }: { params: Promise<{ locale: string }> }) {
  const locale = requireLocale((await params).locale);
  if (!(await getAdminSession())) redirect(`/${locale}/admin/login`);
  const entries = [
    {
      name: "Archive API",
      configured: Boolean(process.env.ARCHIVE_API_BASE_URL),
      purpose: "Content, revisions, review and publication",
    },
    {
      name: "Supabase Auth",
      configured: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      purpose: "Signed administrator claims and rotating sessions",
    },
    {
      name: "Public archive",
      configured: Boolean(process.env.ARCHIVE_PUBLIC_SITE_URL),
      purpose: "Published document links",
    },
  ];
  return (
    <section>
      <p className="eyebrow">Connections</p>
      <h1>{locale === "ko" ? "연결 설정" : "Connections"}</h1>
      <p className="section-intro">
        {locale === "ko"
          ? "비밀값은 Space Secrets에서 관리합니다. 이 화면은 설정 유무만 표시하며 연결 성공을 보증하지 않습니다."
          : "Secrets are managed in Space settings. These indicators show configuration presence, not connection health."}
      </p>
      <div className="connection-grid">
        {entries.map((entry) => (
          <article key={entry.name}>
            <span className="eyebrow">{entry.configured ? "CONFIGURED" : "NOT SET"}</span>
            <h2>{entry.name}</h2>
            <p>{entry.purpose}</p>
          </article>
        ))}
      </div>
      <div className="studio-note">
        {locale === "ko"
          ? "AI 제공자·R2·private dataset 연결은 API/worker 환경에서 관리합니다. 사이트 배치 편집과 행동 분석은 아직 구현하지 않았으며 별도 발행 모델과 동의 정책이 필요합니다."
          : "AI providers, R2 and private datasets are configured in the API/worker environment. Layout editing and behavioral analysis are not implemented; they require a separate release model and consent policy."}
      </div>
    </section>
  );
}
