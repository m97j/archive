"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createActivityClock, isActivityPublicPath } from "@/lib/activity-clock";

export interface ActivityPreferences {
  enabled: boolean;
  sessionPersonalization: boolean;
  modelImprovement: boolean;
}
interface ActivityEvent {
  id: string;
  type: "page_view" | "page_leave" | "navigation" | "section_dwell";
  path: string;
  seconds?: number;
  sectionId?: string;
  revisionNumber?: number;
}

/** Activity listeners and random IDs exist only after an accepted optional purpose. */
export function SessionActivity({ preferences }: { preferences: ActivityPreferences | undefined }) {
  const pathname = usePathname();
  const [generation, setGeneration] = useState(0);
  const accepted = Boolean(
    preferences?.enabled && (preferences.sessionPersonalization || preferences.modelImprovement),
  );
  const latestAccepted = useRef(accepted);
  useEffect(() => {
    latestAccepted.current = accepted;
  }, [accepted]);
  useEffect(() => {
    const article = document.querySelector<HTMLElement>("[data-compiled-document]");
    if (!accepted || !isActivityPublicPath(pathname) || !article) return;
    const abort = new AbortController();
    let active = true;
    let expired = false;
    let teardown: (() => void) | undefined;
    void (async () => {
      try {
        const ready = await fetch("/api/telemetry/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          cache: "no-store",
          signal: abort.signal,
        });
        if (!ready.ok || !active) return;
        const session = (await ready.json()) as { active?: boolean; idleMinutes?: number };
        if (!session.active || !active) return;
        let queue: ActivityEvent[] = [];
        let pending: { batchId: string; events: ActivityEvent[] } | undefined;
        let saving = false;
        let lastInteraction = performance.now();
        const idleMs = Math.min(30, Math.max(1, session.idleMinutes ?? 30)) * 60_000;
        const readingVisible = () => {
          const bounds = article.getBoundingClientRect();
          return (
            document.visibilityState === "visible" &&
            !document.querySelector("dialog[open]") &&
            bounds.bottom > 0 &&
            bounds.top < window.innerHeight
          );
        };
        const clock = createActivityClock(performance.now(), readingVisible());
        const headings = Array.from(
          document.querySelectorAll("[data-compiled-document] h2, [data-compiled-document] h3"),
        );
        const sectionAtViewport = () => {
          let ordinal = -1;
          for (let index = 0; index < headings.length; index++)
            if (headings[index]!.getBoundingClientRect().top <= window.innerHeight * 0.45)
              ordinal = index;
          return ordinal < 0 ? undefined : `s-${ordinal + 1}`;
        };
        let sectionId = sectionAtViewport();
        const add = (
          type: ActivityEvent["type"],
          path = pathname,
          seconds?: number,
          section?: string,
        ) => {
          if (
            !active ||
            expired ||
            !latestAccepted.current ||
            !isActivityPublicPath(path) ||
            queue.length >= 24
          )
            return;
          queue.push({
            id: crypto.randomUUID(),
            type,
            path,
            ...(type !== "navigation" &&
            Number.isSafeInteger(Number(article.dataset.publicRevision)) &&
            Number(article.dataset.publicRevision) > 0
              ? { revisionNumber: Number(article.dataset.publicRevision) }
              : {}),
            ...(seconds === undefined ? {} : { seconds }),
            ...(section ? { sectionId: section } : {}),
          });
        };
        const recordDwell = () => {
          const seconds = clock.takeSeconds(performance.now());
          if (seconds)
            add(sectionId ? "section_dwell" : "page_leave", pathname, seconds, sectionId);
        };
        const flush = async (keepalive = false) => {
          if (!active || !latestAccepted.current || saving || (!pending && !queue.length)) return;
          saving = true;
          pending ??= { batchId: crypto.randomUUID(), events: queue.splice(0, 24) };
          try {
            const result = await fetch("/api/telemetry", {
              method: "POST",
              keepalive,
              headers: { "content-type": "application/json" },
              body: JSON.stringify(pending),
              cache: "no-store",
              ...(keepalive ? {} : { signal: abort.signal }),
            });
            if (result.ok) pending = undefined;
            else if ([400, 401, 403, 404, 410].includes(result.status)) {
              pending = undefined;
              queue = [];
              expired = true;
              abort.abort();
            }
          } catch {
            /* Bounded memory-only retry uses the same batch ID; reading never waits. */
          } finally {
            saving = false;
          }
        };
        const interaction = () => {
          if (!active) return;
          const at = performance.now();
          if (expired || at - lastInteraction > idleMs) {
            active = false;
            queue = [];
            pending = undefined;
            abort.abort();
            setGeneration((value) => value + 1);
            return;
          }
          lastInteraction = at;
          clock.setVisible(at, readingVisible());
          const next = sectionAtViewport();
          if (next !== sectionId) {
            recordDwell();
            clock.reset(at);
            sectionId = next;
          }
        };
        const click = (event: MouseEvent) => {
          interaction();
          const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
          if (!(anchor instanceof HTMLAnchorElement)) return;
          const destination = new URL(anchor.href);
          if (destination.origin === location.origin) {
            add("navigation", destination.pathname);
            recordDwell();
            void flush(true);
          }
        };
        const visibility = () => {
          const at = performance.now();
          clock.setVisible(at, readingVisible() && at - lastInteraction <= idleMs);
          if (document.visibilityState === "hidden") {
            recordDwell();
            void flush(true);
          }
        };
        const pagehide = () => {
          clock.setVisible(performance.now(), false);
          recordDwell();
          void flush(true);
        };
        const pageshow = (event: PageTransitionEvent) => {
          if (event.persisted && active && latestAccepted.current) {
            clock.reset(performance.now());
            active = false;
            setGeneration((value) => value + 1);
          }
        };
        const pause = () => {
          active = false;
          queue = [];
          pending = undefined;
          clock.setVisible(performance.now(), false);
          abort.abort();
        };
        const timer = setInterval(() => {
          if (performance.now() - lastInteraction > idleMs) {
            clock.setVisible(performance.now(), false);
            expired = true;
          }
          clock.setVisible(performance.now(), readingVisible() && !expired);
          recordDwell();
          void flush();
        }, 30_000);
        add("page_view");
        void flush();
        document.addEventListener("click", click);
        document.addEventListener("scroll", interaction, { passive: true });
        document.addEventListener("keydown", interaction);
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("pagehide", pagehide);
        window.addEventListener("pageshow", pageshow);
        window.addEventListener("archive:privacy-pause", pause);
        teardown = () => {
          clearInterval(timer);
          document.removeEventListener("click", click);
          document.removeEventListener("scroll", interaction);
          document.removeEventListener("keydown", interaction);
          document.removeEventListener("visibilitychange", visibility);
          window.removeEventListener("pagehide", pagehide);
          window.removeEventListener("pageshow", pageshow);
          window.removeEventListener("archive:privacy-pause", pause);
          if (latestAccepted.current) {
            recordDwell();
            void flush(true);
          }
          queue = [];
          pending = undefined;
        };
      } catch {
        /* Missing settings or unavailable storage never enable measurement. */
      }
    })();
    return () => {
      teardown?.();
      active = false;
      abort.abort();
    };
  }, [
    pathname,
    accepted,
    generation,
    preferences?.sessionPersonalization,
    preferences?.modelImprovement,
  ]);
  return null;
}
