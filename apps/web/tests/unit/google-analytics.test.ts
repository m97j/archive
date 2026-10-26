import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleAnalyticsSettings } from "@/lib/google-analytics-settings";

let api: typeof import("@/lib/google-analytics");
const settings = { enabled: true, measurementId: "G-TEST000000", origin: "http://localhost:3000" };
let controllers: ReturnType<typeof api.createAnalyticsController>[] = [];
const target = () => window as unknown as Record<string, unknown>;
const commands = () =>
  ((target().dataLayer ?? []) as ArrayLike<unknown>[]).map((item) => Array.from(item));
const events = () => commands().filter((item) => item[0] === "event");
function marker(path = "/ko/docs/public") {
  window.history.replaceState({}, "", `${path}?q=secret-query&token=secret-token#private-fragment`);
  document.body.innerHTML = `<main id="main-content"><article data-analytics-path="${path}" data-analytics-title="Public document" data-analytics-document="true"><div data-compiled-document>Published body</div></article></main>`;
}
function controller(reload = vi.fn()) {
  const value = api.createAnalyticsController(settings, reload);
  controllers.push(value);
  return value;
}
beforeEach(async () => {
  vi.resetModules();
  api = await import("@/lib/google-analytics");
  localStorage.clear();
  document.head.innerHTML = "";
  marker();
  delete target().archiveAnalyticsRuntime;
  delete target().dataLayer;
  delete target().gtag;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => {
  controllers.forEach((value) => value.dispose());
  controllers = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  document.cookie = "_ga=; Max-Age=0; Path=/";
});

describe("basic opt-in Google measurement", () => {
  it("loads no script or commands before consent and after an explicit refusal", () => {
    const value = controller();
    value.page();
    expect(document.querySelector("script")).toBeNull();
    expect(commands()).toEqual([]);
    api.saveAnalyticsChoice(false);
    value.page();
    expect(document.querySelector("script")).toBeNull();
    expect(commands()).toEqual([]);
    const preference = JSON.parse(localStorage.getItem(api.ANALYTICS_CHOICE_KEY)!);
    expect(Object.keys(preference).sort()).toEqual(["expiresAt", "granted", "version"]);
  });
  it("denies advertising, disables automatic pageviews, and removes query/hash/referrer", () => {
    api.saveAnalyticsChoice(true);
    controller().page();
    const script = document.querySelector<HTMLScriptElement>("script")!;
    expect(script.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-TEST000000");
    expect(script.referrerPolicy).toBe("no-referrer");
    expect(commands()[0]).toEqual([
      "consent",
      "default",
      {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
    expect(commands().find((item) => item[0] === "config")?.[2]).toMatchObject({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_update: false,
      page_referrer: "",
    });
    expect(events()).toEqual([
      [
        "event",
        "page_view",
        {
          send_to: settings.measurementId,
          page_location: settings.origin + "/ko/docs/public",
          page_title: "Public document",
          page_referrer: "",
        },
      ],
    ]);
    expect(JSON.stringify(commands())).not.toMatch(/secret-query|secret-token|private-fragment/);
  });
  it("counts committed public paths once, including Strict Mode remounts", () => {
    api.saveAnalyticsChoice(true);
    const first = controller();
    first.page();
    first.page();
    first.dispose();
    const next = controller();
    next.page();
    expect(events()).toHaveLength(1);
    window.history.pushState({}, "", "/ko/docs/next?q=not-sent");
    next.page();
    expect(events()).toHaveLength(1); // old DOM cannot label a new route
    marker("/ko/docs/next");
    next.page();
    next.page();
    expect(events()).toHaveLength(2);
    expect(document.querySelectorAll("script")).toHaveLength(1);
  });
  it("never measures unmarked error, login, admin, privacy or API paths", () => {
    api.saveAnalyticsChoice(true);
    const value = controller();
    for (const path of ["/ko/missing", "/ko/admin", "/ko/login", "/ko/privacy", "/api/secret"]) {
      marker(path);
      if (path === "/ko/missing")
        document.querySelector("article")?.removeAttribute("data-analytics-path");
      value.page();
    }
    expect(events()).toEqual([]);
    expect(document.querySelector("script")).toBeNull();
  });
  it("revokes immediately, erases GA cookies and reloads an already loaded runtime", () => {
    api.saveAnalyticsChoice(true);
    const reload = vi.fn();
    controller(reload).page();
    document.cookie = "_ga=synthetic; Path=/";
    document.cookie = "_ga_TEST000000=synthetic; Path=/";
    api.saveAnalyticsChoice(false);
    expect(target()["ga-disable-G-TEST000000"]).toBe(true);
    expect(commands()).toEqual([]);
    expect(document.querySelector("script")).toBeNull();
    expect(document.cookie).not.toContain("_ga");
    expect(reload).toHaveBeenCalledOnce();
  });
  it("defers a full reload until other-purpose withdrawal can finish", () => {
    api.saveAnalyticsChoice(true);
    const reload = vi.fn();
    controller(reload).page();
    api.saveAnalyticsChoice(false, true);
    expect(target()["ga-disable-G-TEST000000"]).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(document.querySelector("script")).toBeNull();
    api.saveAnalyticsChoice(true);
    expect(reload).toHaveBeenCalledOnce(); // a discarded runtime cannot be reused
  });
  it("honors another tab's persisted withdrawal", () => {
    api.saveAnalyticsChoice(true);
    const reload = vi.fn();
    controller(reload).page();
    localStorage.setItem(
      api.ANALYTICS_CHOICE_KEY,
      JSON.stringify({ version: 1, granted: false, expiresAt: Date.now() + 1000 }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: api.ANALYTICS_CHOICE_KEY }));
    expect(target()["ga-disable-G-TEST000000"]).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });
  it("expires consent in an open tab without refreshing its deadline", () => {
    vi.useFakeTimers();
    const now = Date.now();
    api.saveAnalyticsChoice(true);
    const saved = localStorage.getItem(api.ANALYTICS_CHOICE_KEY);
    const reload = vi.fn();
    controller(reload).page();
    vi.setSystemTime(now + 91 * 86400_000);
    vi.advanceTimersByTime(30_000);
    expect(api.analyticsChoice()).toBe("unknown");
    expect(reload).toHaveBeenCalledOnce();
    expect(localStorage.getItem(api.ANALYTICS_CHOICE_KEY)).toBe(saved);
  });
  it("does not enable measurement if storage rejects saving permission", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    expect(api.saveAnalyticsChoice(true)).toBe(false);
    controller().page();
    expect(api.analyticsChoice()).toBe("denied");
    expect(document.querySelector("script")).toBeNull();
  });
  it("still stops a loaded tag if persisting a withdrawal fails", () => {
    api.saveAnalyticsChoice(true);
    const reload = vi.fn();
    controller(reload).page();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    expect(api.saveAnalyticsChoice(false)).toBe(false);
    expect(target()["ga-disable-G-TEST000000"]).toBe(true);
    expect(events()).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });
  it("sends one content-depth scroll only while visible and outside a dialog", () => {
    api.saveAnalyticsChoice(true);
    controller().page();
    const body = document.querySelector<HTMLElement>("[data-compiled-document]")!;
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({ top: 0, height: 100 } as DOMRect);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    window.dispatchEvent(new Event("scroll"));
    expect(events()).toHaveLength(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    expect(events().map((event) => event[1])).toEqual(["page_view", "scroll"]);
    expect(events()[1]?.[2]).toMatchObject({ percent_scrolled: 90 });
  });
  it("does not load the production tag on a different host", () => {
    api.saveAnalyticsChoice(true);
    const value = api.createAnalyticsController(
      { ...settings, origin: "https://marchivej.vercel.app" },
      vi.fn(),
    );
    controllers.push(value);
    value.page();
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("deployment switches", () => {
  it("requires a valid ID, canonical origin and explicit production permission", () => {
    vi.stubEnv("GA4_ENABLED", "true");
    vi.stubEnv("GA4_MEASUREMENT_ID", "G-TR89YBY78L");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marchivej.vercel.app");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(googleAnalyticsSettings().enabled).toBe(true);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(googleAnalyticsSettings().enabled).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("GA4_MEASUREMENT_ID", "<script>");
    expect(googleAnalyticsSettings().enabled).toBe(false);
  });
});
