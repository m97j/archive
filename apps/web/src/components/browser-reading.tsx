"use client";

import Link from "next/link";
import type { Locale, PublicContentSummary } from "@archive/contracts";
import { useEffect, useSyncExternalStore } from "react";
import {
  browserReadingSnapshot,
  browserReadingServerSnapshot,
  subscribeBrowserReading,
  setBrowserReadingEnabled,
  rememberBrowserReading,
  rankBrowserReading,
  type BrowserReadingDocument,
} from "@/lib/browser-reading";
import styles from "./document-recommendations.module.css";

function useBrowserReading() {
  return useSyncExternalStore(
    subscribeBrowserReading,
    browserReadingSnapshot,
    browserReadingServerSnapshot,
  );
}
export function BrowserReadingPreference({ locale }: { locale: string }) {
  const state = useBrowserReading();
  const ko = locale === "ko";
  return (
    <fieldset className="privacy-options">
      <legend className="privacy-detail">
        {ko ? "브라우저 안에서만" : "Only inside this browser tab"}
      </legend>
      <label>
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(event) => setBrowserReadingEnabled(event.target.checked)}
        />
        <span>
          <strong>
            {ko ? "이 탭에서만 이어 읽기 맞춤" : "Adapt reading suggestions in this tab"}
          </strong>
          <small>
            {ko
              ? "선택은 즉시 적용됩니다. 화면에 보이는 공개 문서를 읽으면 태그를 이용해 다음 글을 정렬합니다. 선택과 읽은 문서·관심 태그는 탭 메모리에만 있으며 서버 전송, 쿠키·브라우저 저장소 기록, 방문자 ID 발급은 없습니다. 새로고침·탭 종료·끄기 또는 30분 동안 새 읽기 기록이 없으면 초기화합니다."
              : "Your choice takes effect immediately. Reading visible public documents reorders suggestions by their tags. The choice, read-document list and interest counters stay only in tab memory: no uploads, cookies, browser storage or visitor IDs. Reloading, closing the tab, switching off, or 30 minutes without a new reading record resets them."}
          </small>
        </span>
      </label>
      {state.enabled ? (
        <button
          type="button"
          className="privacy-local-reset"
          onClick={() => setBrowserReadingEnabled(false)}
        >
          {ko ? "탭 맞춤 끄고 정보 지우기" : "Turn off and clear this tab"}
        </button>
      ) : null}
    </fieldset>
  );
}
export function BrowserReadingSuggestions({
  locale,
  source,
  candidates = [],
}: {
  locale: Locale;
  source?: BrowserReadingDocument | undefined;
  candidates?: PublicContentSummary[] | undefined;
}) {
  const state = useBrowserReading();
  const ko = locale === "ko";
  useEffect(() => {
    if (!state.enabled || !source) return;
    const article = document.querySelector<HTMLElement>("[data-compiled-document]");
    if (!article) return;
    let previous = performance.now();
    let readingMs = 0;
    const tick = () => {
      const now = performance.now();
      const elapsed = now - previous;
      previous = now;
      const bounds = article.getBoundingClientRect();
      if (
        document.visibilityState !== "visible" ||
        document.querySelector("dialog[open]") ||
        bounds.bottom <= 0 ||
        bounds.top >= innerHeight ||
        elapsed > 5000
      )
        return;
      readingMs += Math.max(0, elapsed);
      if (readingMs >= 15_000) {
        clearInterval(timer);
        rememberBrowserReading(source);
      }
    };
    const visibility = () => {
      previous = performance.now();
    };
    const timer = setInterval(tick, 2000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [state.enabled, source]);
  const items = source ? rankBrowserReading(state, candidates, source.path, locale) : [];
  return (
    <>
      <p className={styles.empty} aria-live="polite">
        {!state.enabled
          ? ko
            ? "브라우저 내 맞춤은 꺼져 있습니다. 기본 읽기와 연결된 문서는 그대로 이용할 수 있습니다."
            : "Browser-only adaptation is off. Reading and connected documents remain available."
          : items.length
            ? ko
              ? "이 탭에서 읽은 공개 문서의 태그로 정렬했습니다. 서버 수집이나 개인화 모델을 사용하지 않습니다."
              : "Ordered from tags of public documents read in this tab. No server collection or personalization model is used."
            : ko
              ? "이 탭에서 문서를 읽으면 관심 태그가 겹치는 다음 글을 찾습니다. 아직 추천할 근거가 충분하지 않습니다."
              : "As you read in this tab, matching public-document tags can suggest a next read. There is not enough evidence yet."}
      </p>
      {items.length ? (
        <ol className={styles.popupLinks}>
          {items.map(({ document, sharedTags }) => (
            <li key={document.path}>
              <Link href={document.path} prefetch={false}>
                <span>
                  {document.title}
                  <small className={styles.browserReason}>
                    {sharedTags.slice(0, 2).join(" · ")}
                  </small>
                </span>
                <span aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      <button
        type="button"
        className={styles.textButton}
        onClick={() => window.dispatchEvent(new Event("archive:privacy-open"))}
      >
        {ko ? "브라우저 맞춤 설정" : "Browser-only preferences"}
        <span aria-hidden="true">↗</span>
      </button>
    </>
  );
}
