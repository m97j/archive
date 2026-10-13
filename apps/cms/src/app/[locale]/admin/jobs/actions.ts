"use server";
import { LOCALES } from "@archive/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth.server";
import { archiveApiRequest } from "@/lib/archive-api.server";
import { assertSameOriginAction } from "@/lib/csrf.server";

export interface JobActionState {
  message?: string;
  error?: boolean;
}
export async function queueAiAction(
  _state: JobActionState,
  form: FormData,
): Promise<JobActionState> {
  await assertSameOriginAction();
  const locale = String(form.get("locale") ?? "ko");
  const session = await getAdminSession();
  if (!session) redirect(`/${LOCALES.some((item) => item === locale) ? locale : "ko"}/admin/login`);
  const contentId = String(form.get("contentId") ?? "").trim();
  const intent = String(form.get("intent") ?? "");
  if (!contentId || !["embeddings", "translations"].includes(intent))
    return { error: true, message: "Select content and a supported task." };
  try {
    const sourceLocale = String(form.get("sourceLocale") ?? locale);
    const targetLocale = String(form.get("targetLocale") ?? "en");
    if (
      !LOCALES.some((item) => item === sourceLocale) ||
      !LOCALES.some((item) => item === targetLocale)
    )
      return { error: true, message: "Select supported locales." };
    await archiveApiRequest(`/v1/admin/ai/${intent}`, {
      method: "POST",
      accessToken: session.accessToken,
      body: JSON.stringify(
        intent === "embeddings"
          ? { contentId, locale: sourceLocale }
          : { contentId, sourceLocale, targetLocale },
      ),
    });
    revalidatePath(`/${locale}/admin/jobs`);
    return {
      message:
        locale === "ko"
          ? "작업을 큐에 추가했습니다. 번역 결과는 검토 전 비공개 초안입니다."
          : "Job queued. Translation results stay private drafts until review.",
    };
  } catch {
    return {
      error: true,
      message:
        locale === "ko"
          ? "작업을 시작하지 못했습니다. 연결 설정과 콘텐츠를 확인하세요."
          : "Could not queue the task. Check the connection and content.",
    };
  }
}
