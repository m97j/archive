"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ANALYTICS_CHOICE_DAYS,
  analyticsChoice,
  createAnalyticsController,
  onAnalyticsChoiceChange,
  saveAnalyticsChoice,
  type AnalyticsChoice,
} from "@/lib/google-analytics";
import type { GoogleAnalyticsSettings } from "@/lib/google-analytics-settings";

export function GoogleAnalytics({
  settings,
  locale,
}: {
  settings: GoogleAnalyticsSettings;
  locale: string;
}) {
  const banner = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const { enabled, measurementId, origin } = settings;
  const controller = useRef<ReturnType<typeof createAnalyticsController> | null>(null);
  const [choice, setChoice] = useState<AnalyticsChoice>("denied");
  const [storageError, setStorageError] = useState(false);
  const ko = locale === "ko";
  useEffect(() => {
    if (!enabled || window.location.origin !== origin) return;
    const update = () => setChoice(analyticsChoice());
    update();
    const unsubscribe = onAnalyticsChoiceChange(update);
    controller.current = createAnalyticsController({ enabled, measurementId, origin });
    controller.current.page();
    const observer = new MutationObserver(() => controller.current?.page());
    const main = document.getElementById("main-content");
    if (main)
      observer.observe(main, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-analytics-path"],
      });
    return () => {
      observer.disconnect();
      unsubscribe();
      controller.current?.dispose();
      controller.current = null;
    };
  }, [enabled, measurementId, origin]);
  useEffect(() => {
    controller.current?.page();
  }, [pathname]);
  useEffect(() => {
    if (choice !== "unknown" || !enabled || !banner.current) return;
    const node = banner.current;
    const update = () =>
      document.documentElement.style.setProperty(
        "--analytics-banner-offset",
        `${Math.ceil(node.getBoundingClientRect().height) + 32}px`,
      );
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : undefined;
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty("--analytics-banner-offset");
    };
  }, [choice, enabled]);
  const decide = (granted: boolean) => setStorageError(!saveAnalyticsChoice(granted));
  if (!settings.enabled || choice !== "unknown") return null;
  return (
    <aside
      ref={banner}
      className="analytics-banner"
      aria-label={ko ? "선택적 방문 분석" : "Optional visit analytics"}
    >
      <div>
        <strong>
          {ko ? "읽기는 그대로, 분석은 선택으로." : "Open reading. Optional analytics."}
        </strong>
        <p>
          {ko
            ? "허용하면 Google Analytics가 쿠키로 공개 페이지 조회와 읽기 참여를 분석합니다. 미국 등 국외에서 처리되며, 거부해도 모든 공개 문서를 이용할 수 있습니다."
            : "If allowed, Google Analytics uses cookies to measure public page views and reading engagement, processed overseas including the US. Declining keeps all public reading available."}
        </p>
        <a href={`/${locale}/privacy#google-analytics`}>
          {ko ? "항목·보관·국외 처리 안내" : "Data, retention and overseas processing"}
        </a>
        {storageError && (
          <p role="status">
            {ko
              ? "선택을 저장할 수 없어 분석을 켜지 않았습니다."
              : "Could not save your choice; analytics stays off."}
          </p>
        )}
      </div>
      <div className="analytics-banner-actions">
        <button onClick={() => decide(false)}>{ko ? "분석 거부" : "Decline analytics"}</button>
        <button onClick={() => decide(true)}>{ko ? "분석 허용" : "Allow analytics"}</button>
        <button onClick={() => window.dispatchEvent(new Event("archive:privacy-open"))}>
          {ko ? "선택 설정" : "Manage choices"}
        </button>
      </div>
    </aside>
  );
}

export function GoogleAnalyticsPreference({
  locale,
  enabled,
}: {
  locale: string;
  enabled: boolean;
}) {
  const [choice, setChoice] = useState<AnalyticsChoice>("unknown");
  const [error, setError] = useState(false);
  const ko = locale === "ko";
  useEffect(() => {
    const update = () => setChoice(analyticsChoice());
    update();
    return onAnalyticsChoiceChange(update);
  }, []);
  return (
    <fieldset className="privacy-options" disabled={!enabled}>
      <legend className="privacy-detail">
        {ko ? "별도로 선택하는 사이트 분석" : "Independent site analytics choice"}
      </legend>
      <label>
        <input
          type="checkbox"
          checked={choice === "granted"}
          onChange={(event) => setError(!saveAnalyticsChoice(event.target.checked))}
        />
        <span>
          <strong>{ko ? "Google Analytics 분석 허용" : "Allow Google Analytics"}</strong>
          <small>
            {ko
              ? `허용할 때만 Google 태그와 쿠키를 사용해 공개 페이지 조회·읽기 참여를 분석합니다. 미국 등 국외 처리, 이벤트 보관 2개월, 선택 기록 최대 ${ANALYTICS_CHOICE_DAYS}일. 브라우저 안의 맞춤·HF 보관과 독립이며 광고에는 동의하지 않습니다. 끄면 즉시 측정을 차단하고 Google 태그가 실행된 화면은 새로고침합니다.`
              : `Only consent loads Google tags and cookies for public page views and reading engagement. Overseas processing includes the US; event retention is 2 months and the choice lasts up to ${ANALYTICS_CHOICE_DAYS} days. Independent of tab-only adaptation and HF retention. No advertising consent. Switching off blocks measurement and reloads a page where the tag ran.`}
          </small>
        </span>
      </label>
      {error && (
        <p role="status">
          {ko
            ? "선택을 저장하지 못해 분석을 켜지 않았습니다."
            : "Choice could not be saved; analytics stays off."}
        </p>
      )}
    </fieldset>
  );
}
