import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import type { PublicContentPage, PublicContentSummary, PublicDocument } from "@archive/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recommendationCacheKey,
  safeRecommendationPath,
  selectDocumentRecommendations,
} from "../../src/lib/document-recommendations";
import {
  readRecommendationCatalogue,
  getDocumentRecommendations,
} from "../../src/lib/document-recommendations.server";
import { DocumentRecommendations } from "../../src/components/document-recommendations";
import {
  ReadingSuggestion,
  SessionRecommendationStatus,
  READING_HINT_PREFERENCE,
  READING_HINT_DISMISSED,
} from "../../src/components/reading-suggestion";

const mocks = vi.hoisted(() => ({ cache: vi.fn(), list: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (callback: () => Promise<unknown>, keys: string[], options: unknown) => {
    mocks.cache(keys, options);
    return callback;
  },
}));
vi.mock("../../src/lib/archive-api.server", () => ({ listPublicDocuments: mocks.list }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    void _prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

const source: PublicDocument = {
  type: "document",
  contentId: "00000000-0000-4000-8000-000000000001",
  kind: "DOC",
  locale: "ko",
  path: "/ko/docs/retrieval",
  title: "검색 모델",
  revisionNumber: 2,
  publishedAt: "2026-10-14T00:00:00.000Z",
  artifact: {
    schemaVersion: 1,
    locale: "ko",
    sourceHash: "a".repeat(64),
    html: "<h2>원문</h2>",
    blocks: [],
    toc: [],
    searchText: "원문",
    frontmatter: { tags: ["retrieval"] },
  },
};
function candidate(
  index: number,
  overrides: Partial<PublicContentSummary> = {},
): PublicContentSummary {
  return {
    contentId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind: "DOC",
    locale: "ko",
    path: `/ko/docs/${index}`,
    title: `연결 문서 ${index}`,
    description: "관련 내용을 더 읽습니다.",
    publishedAt: "2026-10-14T00:00:00.000Z",
    tags: ["retrieval"],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("public-only recommendation selection", () => {
  it("ranks real shared tags and uses the published catalogue's tags", () => {
    const current = candidate(1, { path: source.path, tags: ["search", "vector"] });
    const result = selectDocumentRecommendations(source, [
      current,
      candidate(2, { tags: ["search"] }),
      candidate(3, { tags: ["search", "vector"] }),
      candidate(4),
    ]);
    expect(result.related.map((item) => item.document.contentId)).toEqual([
      candidate(3).contentId,
      candidate(2).contentId,
    ]);
    expect(result.related[0]?.sharedTags).toEqual(["search", "vector"]);
  });
  it("does not invent relationships from matching kind or title when tags are absent", () => {
    const empty = { ...source, artifact: { ...source.artifact, frontmatter: {} } };
    expect(selectDocumentRecommendations(empty, [candidate(2, { tags: [] })]).related).toEqual([]);
  });
  it("intersects explicit editorial links with current public candidates", () => {
    const editorial = {
      ...source,
      artifact: {
        ...source.artifact,
        frontmatter: { relatedContentIds: [candidate(3).contentId, candidate(99).contentId] },
      },
    };
    expect(
      selectDocumentRecommendations(editorial, [candidate(3, { tags: [] })]).related,
    ).toMatchObject([{ reason: "editorial", document: { contentId: candidate(3).contentId } }]);
  });
  it("excludes self, another locale, private, unlisted, archived and redirects", () => {
    const items = [
      candidate(1),
      candidate(2, { locale: "en", path: "/en/docs/2" }),
      { ...candidate(3), visibility: "PRIVATE" },
      { ...candidate(4), visibility: "UNLISTED" },
      { ...candidate(5), archivedAt: "2026-10-13" },
      { ...candidate(6), type: "redirect" },
      candidate(7, { path: source.path }),
    ];
    expect(selectDocumentRecommendations(source, items).related).toEqual([]);
  });
  it.each([
    "https://evil.example/ko/docs/x",
    "//evil.example/ko/x",
    "/en/docs/x",
    "/ko/login",
    "/ko/docs/admin/x",
    "/ko/%61dmin/x",
    "/ko/%2561dmin/x",
    "/ko/docs/%2e%2e/x",
    "/ko/docs//x",
    "/ko/docs/x?token=x",
    "/ko/docs/x#anchor",
    "/ko/docs/%0ax",
    "/ko/docs\\x",
  ])("rejects unsafe path %s", (path) => {
    expect(safeRecommendationPath(path, "ko")).toBe(false);
  });
  it("accepts local Unicode slugs and removes duplicate IDs/paths with a fixed display limit", () => {
    expect(safeRecommendationPath("/ko/docs/%ED%91%9C%ED%98%84", "ko")).toBe(true);
    const result = selectDocumentRecommendations(source, [
      candidate(3),
      candidate(2),
      candidate(3),
      candidate(4, { path: candidate(2).path }),
      candidate(5),
      candidate(6),
    ]);
    expect(result.related.map((item) => item.document.path)).toEqual([
      candidate(2).path,
      candidate(3).path,
      candidate(5).path,
    ]);
  });
  it("cannot turn arbitrary popularity frontmatter into visitor statistics", () => {
    const document = {
      ...source,
      artifact: {
        ...source.artifact,
        frontmatter: {
          ...source.artifact.frontmatter,
          nextRead: [{ contentId: candidate(2).contentId, count: 999 }],
        },
      },
    };
    expect(selectDocumentRecommendations(document, [candidate(2)]).nextRead).toEqual([]);
  });
  it("requires a revision-matched aggregate and a cohort, then intersects public IDs", () => {
    const snapshot = {
      locale: "ko" as const,
      sourceContentId: source.contentId,
      sourceRevisionNumber: 2,
      generatedAt: "2026-10-14T01:00:00.000Z",
      items: [
        { contentId: candidate(2).contentId, sessionCount: 10 },
        { contentId: candidate(3).contentId, sessionCount: 9 },
        { contentId: candidate(99).contentId, sessionCount: 50 },
      ],
    };
    const result = selectDocumentRecommendations(source, [candidate(2), candidate(3)], snapshot);
    expect(result.nextRead).toMatchObject([{ document: { contentId: candidate(2).contentId } }]);
    expect(result.aggregateUpdatedAt).toBe(snapshot.generatedAt);
    expect(
      selectDocumentRecommendations(source, [candidate(2)], {
        ...snapshot,
        sourceRevisionNumber: 1,
      }).nextRead,
    ).toEqual([]);
    expect(
      selectDocumentRecommendations(source, [candidate(2)], { ...snapshot, locale: "en" }).nextRead,
    ).toEqual([]);
  });
  it("keys caches by algorithm, locale, content, publication revision and source hash without changing HTML", () => {
    const original = JSON.stringify(source);
    expect(recommendationCacheKey(source)).not.toEqual(
      recommendationCacheKey({ ...source, revisionNumber: 3 }),
    );
    expect(recommendationCacheKey(source)).not.toEqual(
      recommendationCacheKey({ ...source, locale: "en" }),
    );
    expect(recommendationCacheKey(source)).not.toEqual(
      recommendationCacheKey({
        ...source,
        artifact: { ...source.artifact, sourceHash: "b".repeat(64) },
      }),
    );
    selectDocumentRecommendations(source, [candidate(2)]);
    expect(JSON.stringify(source)).toBe(original);
  });
});

describe("bounded public recommendation cache", () => {
  it("limits cold catalogue traversal to four bounded pages", async () => {
    let calls = 0;
    const read = vi.fn(async (): Promise<PublicContentPage> => ({
      items: Array.from({ length: 120 }, (_, index) => candidate(++calls * 1_000 + index)),
      nextCursor: `page-${calls}`,
    }));
    expect(await readRecommendationCatalogue("ko", read)).toHaveLength(400);
    expect(read).toHaveBeenCalledTimes(4);
    expect(read.mock.calls[0]).toEqual([{ locale: "ko", limit: 100 }, { revalidate: 300 }]);
  });
  it("stops at a repeated cursor rather than following a loop", async () => {
    const read = vi.fn(async (): Promise<PublicContentPage> => ({
      items: [candidate(2)],
      nextCursor: "repeat",
    }));
    await readRecommendationCatalogue("ko", read);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("uses the existing publication invalidation tag for both selection and catalogue", async () => {
    mocks.list.mockResolvedValue({ items: [candidate(2)] });
    expect((await getDocumentRecommendations(source)).related).toHaveLength(1);
    expect(mocks.cache.mock.calls).toEqual([
      [recommendationCacheKey(source), { revalidate: 300, tags: ["archive:public:ko"] }],
      [
        ["editorial-v1", "public-catalogue", "ko"],
        { revalidate: 300, tags: ["archive:public:ko"] },
      ],
    ]);
  });
  it("keeps optional catalogue failure separate from document rendering", async () => {
    mocks.list.mockRejectedValue(new Error("unavailable"));
    expect(await getDocumentRecommendations(source)).toEqual({
      related: [],
      nextRead: [],
      available: false,
    });
  });
});

describe("honest recommendation interface", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: false, sessionPersonalization: false }),
      }),
    );
  });
  it("does not fabricate popular or personalized results", async () => {
    render(
      <DocumentRecommendations
        locale="ko"
        recommendations={selectDocumentRecommendations(source, [candidate(2)])}
      />,
    );
    expect(screen.getByRole("link", { name: /연결 문서 2/ })).toHaveAttribute(
      "href",
      candidate(2).path,
    );
    expect(screen.getByText("검증된 읽기 흐름 집계가 아직 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("현재 행동 기반 맞춤 추천을 사용하지 않습니다.")).toBeInTheDocument();
    await act(() => Promise.resolve());
    expect(fetch).toHaveBeenCalledWith("/api/privacy", { cache: "no-store" });
  });
  it("responds to separate session consent but never claims a model is running", async () => {
    render(<SessionRecommendationStatus locale="ko" />);
    await act(() => Promise.resolve());
    act(() =>
      window.dispatchEvent(
        new CustomEvent("archive:privacy-change", {
          detail: { enabled: true, sessionPersonalization: true, modelImprovement: false },
        }),
      ),
    );
    expect(screen.getByText(/개인화 모델은 아직 연결하지 않았습니다/)).toBeInTheDocument();
    act(() =>
      window.dispatchEvent(
        new CustomEvent("archive:privacy-change", {
          detail: { enabled: true, sessionPersonalization: false, modelImprovement: true },
        }),
      ),
    );
    expect(screen.getByText("현재 행동 기반 맞춤 추천을 사용하지 않습니다.")).toBeInTheDocument();
  });
});

describe("reader-controlled end-of-article hint", () => {
  let intersect: (entries: { isIntersecting: boolean }[]) => void;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof intersect) {
          intersect = callback;
        }
        observe() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      },
    );
  });
  const items = selectDocumentRecommendations(source, [candidate(2), candidate(3)]).related;
  function showHint() {
    fireEvent.click(screen.getByRole("button", { name: /알림 받기/ }));
    act(() => intersect([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(15_000));
  }
  it("is off by default and never opens just because time passes", () => {
    render(<ReadingSuggestion locale="ko" items={items} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByRole("region", { name: "다음 글 안내" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 받기/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
  it("keeps the server snapshot off even when the browser has enabled the preference", () => {
    localStorage.setItem(READING_HINT_PREFERENCE, "on");
    const markup = renderToString(<ReadingSuggestion locale="ko" items={items} />);
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("읽기 끝에 다음 글 알림 받기");
    expect(markup).not.toContain('role="region"');
    render(<ReadingSuggestion locale="ko" items={items} />);
    expect(screen.getByRole("button", { name: /알림 끄기/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("needs explicit opt-in, visible dwell and the end sentinel without stealing focus", () => {
    render(<ReadingSuggestion locale="ko" items={items} />);
    const toggle = screen.getByRole("button", { name: /알림 받기/ });
    toggle.focus();
    showHint();
    expect(screen.getByRole("region", { name: "다음 글 안내" })).toBeInTheDocument();
    expect(document.activeElement).toBe(toggle);
    expect(document.querySelector("dialog")).toBeNull();
  });
  it("does not show away from the reading end or count hidden time", () => {
    render(<ReadingSuggestion locale="ko" items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /알림 받기/ }));
    act(() => intersect([{ isIntersecting: false }]));
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => intersect([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    hidden.mockRestore();
  });
  it("outside click suppresses this tab across document remounts", () => {
    const { unmount } = render(<ReadingSuggestion locale="ko" items={items} />);
    showHint();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(READING_HINT_DISMISSED)).toBe("yes");
    unmount();
    render(<ReadingSuggestion locale="ko" items={items} />);
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("supports Escape and returns keyboard focus when a focused popup is dismissed", () => {
    render(<ReadingSuggestion locale="ko" items={items} />);
    showHint();
    screen.getByRole("button", { name: "이번 탭에서 알림 닫기" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 끄기/ })).toHaveFocus();
  });
  it("can permanently disable the local preference", () => {
    render(<ReadingSuggestion locale="ko" items={items} />);
    showHint();
    fireEvent.click(screen.getByRole("button", { name: "이 기기에서 다시 표시하지 않기" }));
    expect(localStorage.getItem(READING_HINT_PREFERENCE)).toBe("off");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 받기/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
  it("synchronizes an explicit device preference change from another tab", () => {
    render(<ReadingSuggestion locale="ko" items={items} />);
    showHint();
    act(() => {
      localStorage.setItem(READING_HINT_PREFERENCE, "off");
      window.dispatchEvent(new StorageEvent("storage", { key: READING_HINT_PREFERENCE }));
    });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 받기/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
  it("keeps a manual preference memory-only when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<ReadingSuggestion locale="ko" items={items} />);
    showHint();
    expect(screen.getByRole("region", { name: "다음 글 안내" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 기기에서 다시 표시하지 않기" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("removes animation for the operating system reduced-motion preference", () => {
    const css = readFileSync("src/components/document-recommendations.module.css", "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/\.popup\s*\{\s*animation: none;/);
  });
});
