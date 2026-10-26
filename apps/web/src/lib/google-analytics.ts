import { LOCALES, isReservedPublicationPath } from "@archive/contracts";
import type { GoogleAnalyticsSettings } from "./google-analytics-settings";

export const ANALYTICS_CHOICE_KEY = "archive:google-analytics-choice:v1";
export const ANALYTICS_CHOICE_EVENT = "archive:google-analytics-choice";
export const ANALYTICS_CHOICE_DAYS = 90;
export type AnalyticsChoice = "unknown" | "granted" | "denied";
const MAX_AGE = ANALYTICS_CHOICE_DAYS * 86400_000;
let forcedDenied = false;
let storageWriteFailed = false;
let deferReload = false;
interface AnalyticsRuntime {
  measurementId: string;
  script?: HTMLScriptElement | undefined;
  lastPath: string;
  scrolled: boolean;
  needsReload?: boolean;
}
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  archiveAnalyticsRuntime?: AnalyticsRuntime;
};
const analyticsWindow = () => window as unknown as AnalyticsWindow & Record<string, unknown>;

export function analyticsChoice(now = Date.now()): AnalyticsChoice {
  if (forcedDenied) return "denied";
  try {
    const text = localStorage.getItem(ANALYTICS_CHOICE_KEY);
    if (!text || text.length > 256) return "unknown";
    const value = JSON.parse(text) as { version?: unknown; granted?: unknown; expiresAt?: unknown };
    if (
      value?.version !== 1 ||
      typeof value.granted !== "boolean" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= now ||
      value.expiresAt > now + MAX_AGE
    )
      return "unknown";
    return value.granted ? "granted" : "denied";
  } catch {
    return "unknown";
  }
}

/** A preference only: never a client ID or an activity history. Storage failure stays closed. */
export function saveAnalyticsChoice(granted: boolean, waitForOtherWithdrawal = false): boolean {
  let saved = false;
  forcedDenied = !granted;
  storageWriteFailed = false;
  try {
    localStorage.setItem(
      ANALYTICS_CHOICE_KEY,
      JSON.stringify({
        version: 1,
        granted,
        expiresAt: Date.now() + MAX_AGE,
      }),
    );
    saved = true;
  } catch {
    storageWriteFailed = true;
    forcedDenied = true;
  }
  deferReload = waitForOtherWithdrawal;
  window.dispatchEvent(new Event(ANALYTICS_CHOICE_EVENT));
  deferReload = false;
  return saved;
}

export function onAnalyticsChoiceChange(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CHOICE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(ANALYTICS_CHOICE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(ANALYTICS_CHOICE_EVENT, listener);
  };
}

export interface AnalyticsPage {
  path: string;
  title: string;
  document: boolean;
}
/** The server emits this marker only for public index pages and resolved published documents. */
export function currentAnalyticsPage(): AnalyticsPage | undefined {
  const path = window.location.pathname.replace(/\/$/, "");
  if (
    path.length > 2048 ||
    /[?#\\]/.test(path) ||
    /%(?:25|2f|5c)/i.test(path) ||
    !LOCALES.some((locale) => path === `/${locale}` || path.startsWith(`/${locale}/`)) ||
    isReservedPublicationPath(path)
  )
    return;
  const marker = document.querySelector<HTMLElement>("#main-content [data-analytics-path]");
  if (!marker || marker.dataset.analyticsPath !== path) return;
  const title = marker.dataset.analyticsTitle;
  if (!title || title.length > 300) return;
  return { path, title, document: marker.dataset.analyticsDocument === "true" };
}

export function clearAnalyticsCookies() {
  for (const item of document.cookie.split(";")) {
    const name = item.split("=")[0]?.trim();
    if (!name || !/^_ga(?:_[A-Za-z0-9]+)?$/.test(name)) continue;
    // Our configuration uses host-only / cookies; also clear prior parent-domain cookies.
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    const labels = window.location.hostname.split(".");
    for (let index = 0; index < labels.length - 1; index++) {
      const domain = labels.slice(index).join(".");
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}; SameSite=Lax`;
    }
  }
}

/** No Google URL, preconnect, script or command executes before explicit consent. */
export function createAnalyticsController(
  settings: GoogleAnalyticsSettings,
  reload = () => window.location.reload(),
) {
  const target = analyticsWindow();
  const disableKey = `ga-disable-${settings.measurementId}`;
  const runtime = (target.archiveAnalyticsRuntime ??= {
    measurementId: settings.measurementId,
    lastPath: "",
    scrolled: false,
  });
  let active = false;
  const allowed = () =>
    settings.enabled &&
    window.location.origin === settings.origin &&
    analyticsChoice() === "granted";
  const command = (...args: unknown[]) => target.gtag?.(...args);
  const stop = (withdrawn: boolean) => {
    target[disableKey] = true;
    active = false;
    if (withdrawn) {
      const wasLoaded = Boolean(runtime.script);
      runtime.needsReload ||= wasLoaded;
      // Discard queued work and the loaded runtime before any further measurements.
      target.gtag = () => undefined;
      target.dataLayer = [];
      runtime.script?.remove();
      runtime.script = undefined;
      runtime.lastPath = "";
      clearAnalyticsCookies();
      if (wasLoaded && !storageWriteFailed && !deferReload) reload();
    }
  };
  const page = () => {
    if (!allowed()) {
      stop(analyticsChoice() !== "granted");
      return;
    }
    if (runtime.needsReload) {
      reload();
      return;
    }
    const current = currentAnalyticsPage();
    if (!current) {
      stop(false);
      runtime.lastPath = "";
      return;
    }
    target[disableKey] = false;
    active = true;
    if (runtime.script && runtime.lastPath === current.path) return;
    const location = settings.origin + current.path;
    if (!runtime.script) {
      target.dataLayer = [];
      target.gtag = function () {
        // Keep the Google tag's documented command-queue format.
        // eslint-disable-next-line prefer-rest-params
        target.dataLayer?.push(arguments);
      };
      command("consent", "default", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      command("set", "ads_data_redaction", true);
      command("set", "url_passthrough", false);
      command("js", new Date());
    }
    target[disableKey] = false;
    active = true;
    // Set sanitized defaults for automatic engagement/session events as well as page views.
    command("set", {
      page_location: location,
      page_referrer: "",
      page_title: current.title,
      campaign_source: "",
      campaign_medium: "",
      campaign_name: "",
      campaign_term: "",
      campaign_content: "",
    });
    if (!runtime.script) {
      command("consent", "update", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      command("config", settings.measurementId, {
        send_page_view: false,
        page_location: location,
        page_referrer: "",
        page_title: current.title,
        ignore_referrer: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_domain: "none",
        cookie_expires: ANALYTICS_CHOICE_DAYS * 86400,
        cookie_update: false,
        cookie_flags: "SameSite=Lax;Secure",
      });
      runtime.script = document.createElement("script");
      runtime.script.async = true;
      runtime.script.referrerPolicy = "no-referrer";
      runtime.script.dataset.archiveAnalytics = "google";
      runtime.script.src = `https://www.googletagmanager.com/gtag/js?id=${settings.measurementId}`;
      document.head.appendChild(runtime.script);
    }
    if (runtime.lastPath === current.path) return;
    runtime.lastPath = current.path;
    runtime.scrolled = false;
    command("event", "page_view", {
      send_to: settings.measurementId,
      page_location: location,
      page_referrer: "",
      page_title: current.title,
    });
  };
  const scroll = () => {
    if (!active || runtime.scrolled || !allowed() || document.visibilityState !== "visible") return;
    const current = currentAnalyticsPage();
    const body = document.querySelector<HTMLElement>("[data-compiled-document]");
    if (
      !current?.document ||
      current.path !== runtime.lastPath ||
      !body ||
      document.querySelector("dialog[open]")
    )
      return;
    const box = body.getBoundingClientRect();
    if (box.height < 1 || window.innerHeight < box.top + box.height * 0.9) return;
    runtime.scrolled = true;
    command("event", "scroll", {
      send_to: settings.measurementId,
      percent_scrolled: 90,
      page_location: settings.origin + current.path,
      page_referrer: "",
      page_title: current.title,
    });
  };
  const unsubscribe = onAnalyticsChoiceChange(page);
  const timer = window.setInterval(() => {
    if (active && !allowed()) page();
  }, 30_000);
  window.addEventListener("scroll", scroll, { passive: true });
  return {
    page,
    dispose() {
      stop(false);
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("scroll", scroll);
    },
  };
}
