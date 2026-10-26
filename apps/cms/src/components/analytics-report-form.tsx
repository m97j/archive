"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Locale, AnalyticsReport } from "@archive/contracts";
import { loadAnalyticsReport } from "@/app/[locale]/admin/analytics/actions";
function Submit({ ko, ready }: { ko: boolean; ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={!ready || pending}>
      {pending
        ? ko
          ? "집계 확인 중…"
          : "Loading…"
        : ko
          ? "최근 28일 집계 불러오기"
          : "Load last 28 days"}
    </button>
  );
}
function download(report: AnalyticsReport) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "marchivej-aggregate-report.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AnalyticsReportForm({ locale, ready }: { locale: Locale; ready: boolean }) {
  const ko = locale === "ko";
  const [state, action] = useActionState(loadAnalyticsReport, {});
  const report = state.report;
  return (
    <div className="analytics-report">
      <form action={action}>
        <input type="hidden" name="locale" value={locale} />
        <Submit ko={ko} ready={ready} />
        {!ready && (
          <p className="form-hint">
            {ko
              ? "연결 설정 전에는 Google에 집계 요청을 보내지 않습니다. 현재 GA4 웹 측정과 실시간 보고서는 계속 사용할 수 있습니다."
              : "No report requests are sent before configuration. Existing GA4 web measurement and Realtime remain available."}
          </p>
        )}
      </form>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {report && (
        <section aria-label={ko ? "GA4 집계 결과" : "GA4 aggregate results"}>
          <div className="analytics-report-heading">
            <h2>{ko ? "공개 페이지 집계" : "Public-page aggregates"}</h2>
            <button type="button" onClick={() => download(report)}>
              {ko ? "JSON 요약 저장" : "Download JSON summary"}
            </button>
          </div>
          <p role="status" className="form-hint">
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(report.generatedAt),
            )}
            {" · "}
            {report.cached
              ? ko
                ? "10분 이내 저장 집계"
                : "Cached within 10 minutes"
              : ko
                ? "새로 조회한 집계"
                : "Fresh report"}
          </p>
          {report.quality.length > 0 && (
            <p className="studio-note">
              {ko
                ? "일부 자료가 표본 추출·개인정보 임계값·행 축약의 영향을 받습니다. 정확한 전체 건수로 해석하지 마세요."
                : "Sampling, privacy thresholds or cardinality reduction affect this report; it is not an exact exhaustive count."}{" "}
              ({report.quality.join(", ")})
            </p>
          )}
          {report.pages.length ? (
            <div className="analytics-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{ko ? "공개 경로" : "Public path"}</th>
                    <th>{ko ? "조회" : "Views"}</th>
                    <th>{ko ? "활성 사용자" : "Active users"}</th>
                    <th>{ko ? "사용자당 참여 시간" : "Engagement per active user"}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pages.map((row) => (
                    <tr key={row.path}>
                      <th>{row.path}</th>
                      <td>{row.views.toLocaleString(locale)}</td>
                      <td>{row.activeUsers.toLocaleString(locale)}</td>
                      <td>{Math.round(row.engagementSeconds / row.activeUsers)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">
              {ko
                ? "조건을 충족하는 공개 페이지 집계가 아직 없습니다. 전체 방문이 0이라는 뜻은 아닙니다."
                : "No eligible public-page rows yet. This does not mean total traffic is zero."}
            </p>
          )}
          <p className="form-hint">
            {ko
              ? `소규모 집계·비공개 경로 등으로 제외한 행: ${report.omittedRows}. Google이 집계를 처리하는 시간은 실시간 보고서와 다릅니다.`
              : `Rows omitted for small groups or ineligible paths: ${report.omittedRows}. Processing latency differs from Realtime.`}
          </p>
        </section>
      )}
    </div>
  );
}
