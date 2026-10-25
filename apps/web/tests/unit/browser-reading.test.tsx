import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PublicContentSummary } from "@archive/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserReadingSnapshot,
  setBrowserReadingEnabled,
  rememberBrowserReading,
  rankBrowserReading,
  BROWSER_READING_LIFETIME_MS,
} from "@/lib/browser-reading";
import { BrowserReadingPreference, BrowserReadingSuggestions } from "@/components/browser-reading";

const source = { path: "/ko/docs/a", locale: "ko" as const, tags: ["retrieval"] };
const candidate = (path: string, tags = ["retrieval"]): PublicContentSummary => ({
  contentId: path,
  locale: "ko",
  path,
  title: path,
  kind: "DOC",
  description: "",
  publishedAt: "2026-10-25T00:00:00Z",
  tags,
});
beforeEach(() => {
  vi.useFakeTimers();
  setBrowserReadingEnabled(false);
});
afterEach(() => {
  cleanup();
  setBrowserReadingEnabled(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("tab-memory reading adaptation", () => {
  it("issues no identifier and persists or uploads nothing, including after opt-in", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const random = vi.spyOn(crypto, "randomUUID");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    rememberBrowserReading(source);
    expect(browserReadingSnapshot().readPaths).toEqual([]);
    render(<BrowserReadingPreference locale="ko" />);
    const checkbox = screen.getByLabelText(/이 탭에서만 이어 읽기 맞춤/);
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    act(() => rememberBrowserReading(source));
    expect(browserReadingSnapshot().readPaths).toEqual([source.path]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "탭 맞춤 끄고 정보 지우기" }));
    expect(browserReadingSnapshot()).toEqual({ enabled: false, tags: [], readPaths: [] });
  });
  it("expires bounded interest counters and choice without a persistent visitor key", () => {
    setBrowserReadingEnabled(true);
    rememberBrowserReading(source);
    vi.advanceTimersByTime(BROWSER_READING_LIFETIME_MS - 1);
    expect(browserReadingSnapshot().enabled).toBe(true);
    vi.advanceTimersByTime(1);
    expect(browserReadingSnapshot()).toEqual({ enabled: false, tags: [], readPaths: [] });
  });
  it("does not treat global server consent as browser-only consent", () => {
    render(<BrowserReadingSuggestions locale="ko" />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent("archive:privacy-change", {
          detail: { enabled: true, sessionPersonalization: true },
        }),
      ),
    );
    expect(browserReadingSnapshot().enabled).toBe(false);
    expect(screen.getByText(/브라우저 내 맞춤은 꺼져 있습니다/)).toBeInTheDocument();
  });
  it("bounds the state and rejects reserved paths and off-language recommendations", () => {
    setBrowserReadingEnabled(true);
    rememberBrowserReading({ ...source, path: "/ko/admin/private" });
    expect(browserReadingSnapshot().readPaths).toEqual([]);
    for (let n = 0; n < 60; n++)
      rememberBrowserReading({ ...source, path: `/ko/docs/${n}`, tags: [`tag${n}`] });
    expect(browserReadingSnapshot().readPaths).toHaveLength(24);
    expect(browserReadingSnapshot().tags.length).toBeLessThanOrEqual(48);
    setBrowserReadingEnabled(true);
    rememberBrowserReading(source);
    const items = rankBrowserReading(
      browserReadingSnapshot(),
      [
        candidate(source.path),
        candidate("/ko/docs/b"),
        candidate("/ko/docs/b"),
        candidate("/ko/admin/x"),
        { ...candidate("/en/docs/c"), locale: "en" },
        candidate("https://example.com"),
      ],
      source.path,
      "ko",
    );
    expect(items.map((i) => i.document.path)).toEqual(["/ko/docs/b"]);
  });
  it("ranks actual shared public tags and excludes already read pages", () => {
    setBrowserReadingEnabled(true);
    rememberBrowserReading(source);
    rememberBrowserReading({ ...source, path: "/ko/docs/second", tags: ["retrieval", "nlp"] });
    const items = rankBrowserReading(
      browserReadingSnapshot(),
      [
        candidate("/ko/docs/unrelated", ["other"]),
        candidate("/ko/docs/one", ["nlp"]),
        candidate("/ko/docs/two", ["retrieval", "nlp"]),
        candidate(source.path),
      ],
      "/ko/docs/current",
      "ko",
    );
    expect(items.map((i) => i.document.path)).toEqual(["/ko/docs/two", "/ko/docs/one"]);
  });
  it("learns only after visible reading and never after opting out", () => {
    const article = document.createElement("article");
    article.dataset.compiledDocument = "";
    document.body.append(article);
    vi.spyOn(article, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 600 } as DOMRect);
    let visibility = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility as DocumentVisibilityState,
    );
    setBrowserReadingEnabled(true);
    render(
      <BrowserReadingSuggestions
        locale="ko"
        source={source}
        candidates={[candidate("/ko/docs/b")]}
      />,
    );
    act(() => vi.advanceTimersByTime(20_000));
    expect(browserReadingSnapshot().readPaths).toEqual([]);
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(16_000));
    expect(browserReadingSnapshot().readPaths).toEqual([source.path]);
    expect(screen.getByRole("link", { name: /\/ko\/docs\/b/ })).toHaveAttribute(
      "href",
      "/ko/docs/b",
    );
    act(() => setBrowserReadingEnabled(false));
    act(() => vi.advanceTimersByTime(20_000));
    expect(browserReadingSnapshot().readPaths).toEqual([]);
    article.remove();
  });
});
