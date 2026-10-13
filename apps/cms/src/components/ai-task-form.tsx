"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LOCALES, type Locale, type AdminContentSummary } from "@archive/contracts";
import { queueAiAction } from "@/app/[locale]/admin/jobs/actions";
function Submit({ locale }: { locale: Locale }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}>
      {pending ? "…" : locale === "ko" ? "작업 요청" : "Queue task"}
    </button>
  );
}
export function AiTaskForm({
  locale,
  contents,
}: {
  locale: Locale;
  contents: AdminContentSummary[];
}) {
  const [state, action] = useActionState(queueAiAction, {});
  return (
    <form action={action} className="task-form">
      <input type="hidden" name="locale" value={locale} />
      <label>
        <span>{locale === "ko" ? "콘텐츠" : "Content"}</span>
        <select name="contentId" required>
          <option value="">—</option>
          {contents.map((item) => (
            <option value={item.id} key={item.id}>
              {item.canonicalKey}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{locale === "ko" ? "작업" : "Task"}</span>
        <select name="intent">
          <option value="embeddings">Embedding</option>
          <option value="translations">Translation → draft</option>
        </select>
      </label>
      <div className="editor-row">
        <label>
          <span>Source locale</span>
          <select name="sourceLocale" defaultValue={locale}>
            {LOCALES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Target locale</span>
          <select name="targetLocale" defaultValue={locale === "en" ? "ko" : "en"}>
            {LOCALES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <Submit locale={locale} />
      <p className="form-hint">
        {locale === "ko"
          ? "현재 기본 번역 연결은 한국어 ↔ 영어만 지원합니다. 다른 언어 조합은 제공자 지원 여부에 따라 실패할 수 있습니다. 번역은 자동 발행하지 않습니다."
          : "The initial translation provider supports Korean ↔ English only. Other pairs may fail unless supported by the configured provider. Translation never publishes automatically."}
      </p>
      {state.message ? (
        <p role="status" className={state.error ? "error" : "success"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
