import { redirect } from "next/navigation";
import type { AnalyticsConnection } from "@archive/contracts";
import { getAdminSession } from "@/lib/admin-auth.server";
import { archiveApiRequest } from "@/lib/archive-api.server";
import { requireLocale } from "@/lib/routing";
import { AnalyticsReportForm } from "@/components/analytics-report-form";

export const dynamic = "force-dynamic";
export default async function AnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = requireLocale((await params).locale);
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);
  const ko = locale === "ko";
  let connection: AnalyticsConnection | undefined;
  try {
    connection = await archiveApiRequest("/v1/admin/analytics", {
      accessToken: session.accessToken,
    });
  } catch {
    /* A missing connection never becomes a synthetic zero-traffic report. */
  }
  return (
    <section>
      <p className="eyebrow">AUDIENCE &amp; CONTENT</p>
      <h1>{ko ? "방문 분석" : "Visit analytics"}</h1>
      <p className="section-intro">
        {ko
          ? "GA4에 수신된 집계로 공개 콘텐츠의 읽기 흐름을 살펴봅니다. 자체 원로그 수집·모델 학습은 켜지 않습니다."
          : "Review public content through aggregates already measured by GA4. This does not enable first-party raw activity capture or model training."}
      </p>
      <div className="connection-grid">
        <article>
          <span className="eyebrow">GA4 DATA API</span>
          <h2>
            {connection?.enabled && connection.configured
              ? ko
                ? "조회 준비됨"
                : "Ready to query"
              : ko
                ? "연결 대기"
                : "Connection pending"}
          </h2>
          <p>
            {ko
              ? "Google 서비스 계정의 읽기 전용 권한으로 연결합니다. 이 화면을 여는 것만으로 보고서를 요청하지 않습니다."
              : "Uses a read-only Google service account. Opening this page does not request a report."}
          </p>
        </article>
        <article>
          <span className="eyebrow">AGGREGATES ONLY</span>
          <h2>{ko ? "지난 28일" : "Last 28 days"}</h2>
          <p>
            {ko
              ? "오늘을 제외한 공개 페이지별 집계만 조회합니다. 사용자·세션 ID, 검색어, 상세 이벤트 이력은 가져오지 않습니다."
              : "Public-page aggregates excluding today. No user/session IDs, search terms or individual event histories are requested."}
          </p>
        </article>
      </div>
      <AnalyticsReportForm
        locale={locale}
        ready={Boolean(connection?.enabled && connection.configured)}
      />
      <div className="studio-note">
        <p>
          {ko
            ? "행별 활성 사용자 5명 미만은 제외하며 집계는 메모리에 최대 10분만 유지합니다. 이 기준이 완전한 익명화를 보증하는 것은 아닙니다. 자료가 적으면 아직 표시할 행이 없을 수 있습니다."
            : "Rows with fewer than 5 active users are omitted; aggregates stay in memory for up to 10 minutes. This does not guarantee anonymity. Low traffic may leave no eligible rows."}
        </p>
        <p>
          {ko
            ? "긴 체류나 이탈은 검토할 단서입니다. 오타·기술적 오류의 증거나 방문자의 직업 판정은 아니며, 문서나 코드를 자동 수정하지 않습니다."
            : "Dwell and exits are review signals, not evidence of a typo, technical error or visitor occupation. No documents or code are edited automatically."}
        </p>
        <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">
          {ko ? "Google Analytics에서 보기" : "Open Google Analytics"} ↗
        </a>
        {" · "}
        <a
          href="https://github.com/m97j/archive/blob/main/docs/operations/google-analytics.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {ko ? "읽기 전용 연결 안내" : "Read-only connection guide"} ↗
        </a>
      </div>
    </section>
  );
}
