"use server";
import { LOCALES, type AnalyticsReport } from "@archive/contracts";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth.server";
import { archiveApiRequest } from "@/lib/archive-api.server";
import { assertSameOriginAction } from "@/lib/csrf.server";

export interface AnalyticsActionState {
  report?: AnalyticsReport;
  error?: string;
}
export async function loadAnalyticsReport(
  _state: AnalyticsActionState,
  form: FormData,
): Promise<AnalyticsActionState> {
  await assertSameOriginAction();
  const value = String(form.get("locale") ?? "ko");
  const locale = LOCALES.find((item) => item === value) ?? "ko";
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);
  try {
    const report = await archiveApiRequest<AnalyticsReport>("/v1/admin/analytics/report", {
      method: "POST",
      accessToken: session.accessToken,
      body: "{}",
    });
    return { report };
  } catch {
    return {
      error:
        locale === "ko"
          ? "집계를 가져오지 못했습니다. 읽기 권한·API 활성화·연결 설정을 확인한 뒤 잠시 후 다시 시도해 주세요."
          : "Could not load aggregates. Check read permission, API activation and connection settings, then retry shortly.",
    };
  }
}
