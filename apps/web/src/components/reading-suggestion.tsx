"use client";

import type { Locale } from "@archive/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DocumentRecommendation } from "@/lib/document-recommendations";
import styles from "./document-recommendations.module.css";

export const READING_HINT_PREFERENCE = "archive:reading-hint";
export const READING_HINT_DISMISSED = "archive:reading-hint-dismissed";
export const READING_HINT_VISIBLE_SECONDS = 15;
const READING_HINT_CHANGE = "archive:reading-hint-change";
const temporaryPreferences = new Map<string, string>();

interface SessionConsent {
  enabled: boolean;
  sessionPersonalization: boolean;
}

/** This status reads only consent. It neither infers a role nor installs activity tracking. */
export function SessionRecommendationStatus({ locale }: { locale: Locale }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    let changed = false;
    const apply = (value: SessionConsent) =>
      setAllowed(Boolean(value.enabled && value.sessionPersonalization));
    const change = (event: Event) => {
      changed = true;
      apply((event as CustomEvent<SessionConsent>).detail);
    };
    window.addEventListener("archive:privacy-change", change);
    void fetch("/api/privacy", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<SessionConsent>) : undefined))
      .then((value) => {
        if (active && !changed && value) apply(value);
      })
      .catch(() => {
        /* A missing preference never grants consent. */
      });
    return () => {
      active = false;
      window.removeEventListener("archive:privacy-change", change);
    };
  }, []);
  const korean = locale === "ko";
  return (
    <>
      <p className={styles.empty}>
        {allowed
          ? korean
            ? "세션 맞춤 처리는 허용했습니다. 개인화 모델은 아직 연결하지 않았습니다."
            : "Session processing is allowed. No personalization model is connected yet."
          : korean
            ? "현재 행동 기반 맞춤 추천을 사용하지 않습니다."
            : "Behavior-based personalization is not in use."}
      </p>
      <button
        type="button"
        className={styles.textButton}
        onClick={() => window.dispatchEvent(new Event("archive:privacy-open"))}
      >
        {korean ? "맞춤 처리 설정" : "Session preferences"}
        <span aria-hidden="true">↗</span>
      </button>
    </>
  );
}

function readStored(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return temporaryPreferences.get(`${storage}:${key}`) ?? null;
  }
}
function store(storage: "local" | "session", key: string, value: string): void {
  temporaryPreferences.set(`${storage}:${key}`, value);
  try {
    (storage === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    /* A blocked preference store does not affect reading. */
  }
}

function readingHintSnapshot(): string {
  return `${readStored("local", READING_HINT_PREFERENCE) === "on" ? "on" : "off"}:${readStored("session", READING_HINT_DISMISSED) === "yes" ? "yes" : "no"}`;
}

function serverReadingHintSnapshot(): string {
  return "off:no";
}

function subscribeReadingHint(callback: () => void): () => void {
  const changed = (event: StorageEvent) => {
    if (!event.key) {
      temporaryPreferences.clear();
      callback();
      return;
    }
    if ([READING_HINT_PREFERENCE, READING_HINT_DISMISSED].includes(event.key)) {
      const storage = event.key === READING_HINT_PREFERENCE ? "local" : "session";
      const fallbackKey = `${storage}:${event.key}`;
      if (event.newValue === null) temporaryPreferences.delete(fallbackKey);
      else temporaryPreferences.set(fallbackKey, event.newValue);
      callback();
    }
  };
  window.addEventListener(READING_HINT_CHANGE, callback);
  window.addEventListener("storage", changed);
  return () => {
    window.removeEventListener(READING_HINT_CHANGE, callback);
    window.removeEventListener("storage", changed);
  };
}

function notifyReadingHint(): void {
  window.dispatchEvent(new Event(READING_HINT_CHANGE));
}

/** A reader-controlled, non-modal end-of-article hint. No measurement leaves this component. */
export function ReadingSuggestion({
  locale,
  items,
}: {
  locale: Locale;
  items: DocumentRecommendation[];
}) {
  const korean = locale === "ko";
  const preferences = useSyncExternalStore(
    subscribeReadingHint,
    readingHintSnapshot,
    serverReadingHintSnapshot,
  );
  const enabled = preferences.startsWith("on:");
  const suppressed = preferences.endsWith(":yes");
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  function dismiss(permanent = false) {
    const focused = popup.current?.contains(document.activeElement);
    setOpen(false);
    store("session", READING_HINT_DISMISSED, "yes");
    if (permanent) {
      store("local", READING_HINT_PREFERENCE, "off");
    }
    notifyReadingHint();
    if (focused) toggle.current?.focus();
  }

  useEffect(() => {
    if (!enabled || suppressed || !items.length) return;
    const node = anchor.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let nearEnd = false;
    let visibleSeconds = 0;
    let lastTime = performance.now();
    const observer = new IntersectionObserver(
      ([entry]) => {
        nearEnd = Boolean(entry?.isIntersecting);
      },
      { threshold: 0.1 },
    );
    observer.observe(node.closest("[data-reading-end]") ?? node);
    const interval = setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === "visible")
        visibleSeconds += Math.min(1_000, now - lastTime) / 1_000;
      lastTime = now;
      if (
        nearEnd &&
        document.visibilityState === "visible" &&
        visibleSeconds >= READING_HINT_VISIBLE_SECONDS
      ) {
        setOpen(true);
        clearInterval(interval);
      }
    }, 1_000);
    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [enabled, suppressed, items.length]);

  useEffect(() => {
    if (!open || !enabled || suppressed) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !popup.current?.contains(event.target) &&
        !toggle.current?.contains(event.target)
      )
        dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", key);
    };
  }, [open, enabled, suppressed]);

  return (
    <div ref={anchor} className={styles.hintSetting}>
      <button
        ref={toggle}
        type="button"
        className={styles.textButton}
        aria-pressed={enabled}
        onClick={() => {
          const next = !enabled;
          setOpen(false);
          store("local", READING_HINT_PREFERENCE, next ? "on" : "off");
          store("session", READING_HINT_DISMISSED, "no");
          notifyReadingHint();
        }}
      >
        {enabled
          ? korean
            ? "읽기 끝 알림 끄기"
            : "Turn off end-of-reading hints"
          : korean
            ? "읽기 끝에 다음 글 알림 받기"
            : "Enable end-of-reading hints"}
        <span aria-hidden="true">{enabled ? "−" : "+"}</span>
      </button>
      <span className={styles.hintNote}>
        {korean
          ? "선택한 경우에만 · 이 기기의 화면 설정"
          : "Only if enabled · a preference on this device"}
      </span>
      {open && enabled && !suppressed ? (
        <aside
          ref={popup}
          className={styles.popup}
          role="region"
          aria-label={korean ? "다음 글 안내" : "Next reading suggestion"}
        >
          <div className={styles.popupHeading}>
            <p aria-live="polite">{korean ? "이어서 읽을 만한 글" : "A thread to follow next"}</p>
            <button
              type="button"
              className={styles.close}
              aria-label={korean ? "이번 탭에서 알림 닫기" : "Dismiss hints for this tab"}
              onClick={() => dismiss()}
            >
              ×
            </button>
          </div>
          <ol className={styles.popupLinks}>
            {items.slice(0, 2).map(({ document: item }) => (
              <li key={item.contentId}>
                <Link href={item.path} prefetch={false} onClick={() => dismiss()}>
                  {item.title}
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ol>
          <button type="button" className={styles.textButton} onClick={() => dismiss(true)}>
            {korean ? "이 기기에서 다시 표시하지 않기" : "Do not show again on this device"}
          </button>
        </aside>
      ) : null}
    </div>
  );
}
