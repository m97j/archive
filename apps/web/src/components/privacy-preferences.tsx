"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface Preferences {
  enabled: boolean;
  analytics: boolean;
  decided: boolean;
  version: string;
}
interface Activity {
  id: string;
  type: "page_view" | "page_leave" | "navigation";
  path: string;
  seconds?: number;
}

function publicPath(path: string): boolean {
  return (
    /^\/(?:ko|en|ja|zh|es|fr|de)(?:\/[\w\-/.%]+)?$/.test(path) &&
    !path
      .split("/")
      .some((part) => ["admin", "login", "api", "cms", "studio"].includes(part.toLowerCase())) &&
    !path.includes("..") &&
    !/%(?:2f|5c|2e|25)/i.test(path)
  );
}

/** No identifier or activity listener is created until optional collection is both enabled and accepted. */
export function PrivacyPreferences({ locale }: { locale: string }) {
  const korean = locale === "ko";
  const pathname = usePathname();
  const [preferences, setPreferences] = useState<Preferences>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const collecting = useRef(false);
  const visitId = useRef<string | undefined>(undefined);
  useEffect(() => {
    collecting.current = Boolean(preferences?.enabled && preferences.analytics);
  }, [preferences?.enabled, preferences?.analytics]);
  useEffect(() => {
    let active = true;
    fetch("/api/privacy", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: Preferences) => {
        if (active) {
          setPreferences(value);
          if (value.enabled && !value.decided) setOpen(true);
        }
      })
      .catch(() => {
        /* Unavailable preferences never enable tracking. */
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    if (!preferences?.enabled || !preferences.analytics) {
      visitId.current = undefined;
      return;
    }
    if (!publicPath(pathname)) return;
    const sessionId = visitId.current ?? (visitId.current = crypto.randomUUID());
    let events: Activity[] = [];
    let saving = false;
    const started = performance.now();
    const add = (type: Activity["type"], path: string, seconds?: number) => {
      if (!publicPath(path) || events.length >= 48) return;
      events.push({
        id: crypto.randomUUID(),
        type,
        path,
        ...(seconds === undefined ? {} : { seconds }),
      });
    };
    const flush = async () => {
      if (saving || !events.length) return;
      saving = true;
      const pending = events;
      events = [];
      try {
        await fetch("/api/telemetry", {
          method: "POST",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ batchId: crypto.randomUUID(), sessionId, events: pending }),
        });
      } catch {
        /* Optional measurements do not block the reader. */
      } finally {
        saving = false;
      }
    };
    add("page_view", pathname);
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = new URL(anchor.href);
      if (destination.origin === location.origin) add("navigation", destination.pathname);
    };
    const leave = () => {
      if (document.visibilityState !== "hidden") return;
      add(
        "page_leave",
        pathname,
        Math.min(600, Math.max(0, Math.round((performance.now() - started) / 1000))),
      );
      void flush();
    };
    document.addEventListener("click", click);
    document.addEventListener("visibilitychange", leave);
    const timer = setInterval(() => {
      void flush();
    }, 60_000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("click", click);
      document.removeEventListener("visibilitychange", leave);
      if (collecting.current) {
        add(
          "page_leave",
          pathname,
          Math.min(600, Math.max(0, Math.round((performance.now() - started) / 1000))),
        );
        void flush();
      } else events = [];
    };
  }, [pathname, preferences?.enabled, preferences?.analytics]);

  async function choose(analytics: boolean) {
    setBusy(true);
    setError(false);
    // Stop activity listeners immediately, before the preference request completes.
    if (!analytics) {
      collecting.current = false;
      setPreferences((value) => (value ? { ...value, analytics: false } : value));
    }
    try {
      const response = await fetch("/api/privacy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analytics }),
      });
      if (!response.ok) throw new Error("PREFERENCE_FAILED");
      setPreferences((await response.json()) as Preferences);
      setOpen(false);
      trigger.current?.focus();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="privacy-trigger" ref={trigger} onClick={() => setOpen(true)}>
        {korean ? "개인정보 설정" : "Privacy settings"}
      </button>
      <dialog
        className="privacy-dialog"
        ref={dialog}
        aria-labelledby="privacy-title"
        onCancel={() => setOpen(false)}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <h2 id="privacy-title">
          {korean
            ? "읽기는 자유롭게, 분석은 선택적으로."
            : "Reading is open. Measurement is optional."}
        </h2>
        <p>
          {korean
            ? "화면 설정 등 필요한 저장 기능과 선택적 행동 분석을 구분합니다. 거부해도 문서를 읽을 수 있습니다."
            : "Necessary preferences are separate from optional activity analysis. Declining does not restrict reading."}
        </p>
        {preferences?.enabled ? (
          <p>
            {korean
              ? "동의하면 공개 페이지 경로·이동·대략적인 읽기 시간을 임의의 브라우저 식별자로 묶어 비공개 저장소에 보관합니다. 검색어·입력 내용·IP·이메일은 이 분석 파이프라인에 저장하지 않습니다. 모델 학습에는 별도 정책과 승인이 필요합니다."
              : "With consent, public paths, navigation and approximate reading time are grouped with a random browser identifier in private storage. This analysis pipeline does not store queries, form text, IPs or email. Model training requires a separate policy and authorization."}
          </p>
        ) : (
          <p role="status">
            {korean
              ? "현재 선택적 행동 분석은 비활성화되어 있으며 활동을 수집하지 않습니다."
              : "Optional activity analysis is currently disabled. No activity is collected by this feature."}
          </p>
        )}
        <p className="privacy-detail">
          {korean
            ? "임의 ID는 가명 식별자이며 완전한 익명화를 의미하지 않습니다. 플랫폼 보안 로그와 외부 이미지·영상 제공자의 처리는 별개입니다."
            : "A random identifier is pseudonymous, not necessarily anonymous. Platform security logs and external media providers are separate."}
        </p>
        {error ? (
          <p role="alert">
            {korean
              ? "설정을 저장하지 못했습니다. 분석은 시작하지 않습니다."
              : "Could not save. Analysis will not start."}
          </p>
        ) : null}
        <div className="privacy-actions">
          <button disabled={busy} onClick={() => void choose(false)}>
            {korean ? "분석 거부 / 동의 철회" : "Decline / withdraw"}
          </button>
          {preferences?.enabled ? (
            <button disabled={busy} onClick={() => void choose(true)}>
              {korean ? "선택적 분석 동의" : "Accept optional analysis"}
            </button>
          ) : (
            <button onClick={() => setOpen(false)}>{korean ? "닫기" : "Close"}</button>
          )}
        </div>
      </dialog>
    </>
  );
}
