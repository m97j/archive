import { test, expect, type APIRequestContext } from "@playwright/test";

const fixtureControl = "http://127.0.0.1:17761/__fixtures/mode";
async function setFixtureMode(request: APIRequestContext, mode: "normal" | "empty" | "offline") {
  expect((await request.post(`${fixtureControl}?mode=${mode}`)).ok()).toBe(true);
}
test.beforeEach(async ({ page, request }) => {
  await setFixtureMode(request, "normal");
  await page.route("https://**/*", (route) => route.abort());
});
test.afterEach(async ({ request }) => {
  await setFixtureMode(request, "normal");
});

test("localized home exposes the lead project, repositories and a keyboard skip link", async ({
  page,
}) => {
  await page.goto("/ko");
  await expect(page.getByRole("heading", { level: 1, name: "생각이 움직이는 곳." })).toBeVisible();
  const signature = page.getByRole("img", { name: "민재의 서명", exact: true });
  await expect(signature).toBeVisible();
  await expect
    .poll(() =>
      signature.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await expect(page.locator('link[rel="icon"][href="/favicon.png"]')).toHaveAttribute(
    "type",
    "image/png",
  );
  await expect(page.getByRole("heading", { name: "Axiom World" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Axiom World" })).toHaveAttribute(
    "href",
    "https://github.com/m97j/axiom-world",
  );
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "본문으로 바로 가기" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("theme choice persists and language control leads to an existing localized home", async ({
  page,
}) => {
  await page.goto("/ko");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "어두운 테마로 변경" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "English home" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { level: 1, name: "Curiosity, in motion." }),
  ).toBeVisible();
});

test("search filters remain visible, survive pagination and can be removed individually", async ({
  page,
}) => {
  await page.goto("/ko/archive");
  await page.getByRole("searchbox", { name: "제목과 문서 본문 검색" }).fill("retrieval");
  await page.getByLabel("문서 유형", { exact: true }).selectOption("DOC");
  await page.getByRole("combobox", { name: "컬렉션", exact: true }).selectOption("RESEARCH");
  await page.getByRole("textbox", { name: "태그", exact: true }).fill("NLP");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByRole("link", { name: "다음 페이지" }).click();
  await expect(page).toHaveURL(/cursor=fixture-next/);
  const query = new URL(page.url()).searchParams;
  for (const [key, value] of Object.entries({
    q: "retrieval",
    kind: "DOC",
    space: "RESEARCH",
    tag: "NLP",
    cursor: "fixture-next",
  }))
    expect(query.get(key)).toBe(value);
  await page.getByRole("link", { name: "필터 해제: NLP", exact: true }).click();
  await expect(page).not.toHaveURL(/(?:tag|cursor)=/);
  expect(new URL(page.url()).searchParams.has("tag")).toBe(false);
  expect(new URL(page.url()).searchParams.get("kind")).toBe("DOC");
  expect(new URL(page.url()).searchParams.has("cursor")).toBe(false);
});

test("empty results and an offline backend are distinguished without hiding the portfolio", async ({
  page,
  request,
}) => {
  await page.goto("/ko/archive?q=none");
  await expect(page.getByText("조건에 맞는 글이 없습니다.")).toBeVisible();
  await page.goto("/ko/archive?q=offline");
  await expect(page.locator(".notice-title")).toHaveText("문서 서비스에 잠시 연결할 수 없습니다.");
  await setFixtureMode(request, "empty");
  await page.goto("/ko");
  await expect(page.locator(".notice-title")).toHaveText("아직 공개한 글이 없습니다.");
  await setFixtureMode(request, "offline");
  await page.goto("/en");
  await expect(page.locator(".notice-title")).toHaveText("The notebook is temporarily offline.");
  await expect(page.getByRole("link", { name: "Axiom World" })).toBeVisible();
});

test("document headings, tables, math and navigation remain usable at narrow widths", async ({
  page,
}) => {
  await page.goto("/ko/reading-fixture");
  await page
    .getByRole("navigation", { name: "이 문서의 목차" })
    .getByRole("link", { name: "방법", exact: true })
    .click();
  await expect(page).toHaveURL(/#%EB%B0%A9%EB%B2%95$/);
  await expect(page.locator("#방법")).toBeInViewport();
  await expect(page.getByRole("table", { name: "가로 스크롤 가능한 표" })).toHaveAttribute(
    "tabindex",
    "0",
  );
  expect(
    await page.locator(".prose table").evaluate((table) => table.scrollWidth > table.clientWidth),
  ).toBe(true);
  await expect(page.locator(".katex-display")).toBeVisible();
  await expect(page.locator(".mermaid svg")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "맨 위로 ↑" }).click();
  await expect(page.locator(".document-page > header h1")).toBeInViewport();
});

test("collections expose active navigation and private authoring still requires sign-in", async ({
  page,
}) => {
  await page.goto("/ko/spaces/work");
  const menuButton = page.getByRole("button", { name: "메뉴 열기" });
  if (await menuButton.isVisible()) await menuButton.click();
  await expect(page.locator('.primary-nav:visible [aria-current="page"]')).toHaveText("프로젝트");
  await expect(page.getByRole("link", { name: "Axiom World" })).toBeVisible();
  await page.goto("/ko/admin/new");
  await expect(page).toHaveURL(/\/ko\/admin\/login$/);
});

test("missing records offer useful navigation without exposing private source", async ({
  page,
}) => {
  await page.goto("/ko/does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("이 글을 확인할 수 없습니다.");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await page.locator(".page-error").getByRole("link", { name: "검색", exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/archive$/);
});

test("archive keyboard shortcuts navigate without intercepting editable controls", async ({
  page,
}) => {
  await page.goto("/ko");
  await expect(page.getByRole("button", { name: "어두운 테마로 변경" })).toBeEnabled();
  await page.keyboard.press("Control+k");
  await expect(page).toHaveURL(/\/ko\/archive$/);
  await page.goto("/ko");
  await expect(page.getByRole("button", { name: "어두운 테마로 변경" })).toBeEnabled();
  await page.keyboard.press("Meta+k");
  await expect(page).toHaveURL(/\/ko\/archive$/);
  await page.goto("/ko/archive?q=preserved");
  const input = page.getByRole("searchbox", { name: "제목과 문서 본문 검색" });
  await input.fill("draft query");
  await page.keyboard.press("Control+k");
  await expect(input).toHaveValue("draft query");
  await expect(page).toHaveURL(/\/ko\/archive\?q=preserved$/);
});

test("mobile navigation dismisses on Escape and restores its trigger focus", async ({ page }) => {
  await page.goto("/ko");
  const menuButton = page.getByRole("button", { name: "메뉴 열기" });
  if (!(await menuButton.isVisible())) {
    await expect(
      page.locator(".primary-nav:visible").getByRole("link", { name: "프로젝트" }),
    ).toBeVisible();
    return;
  }
  await menuButton.click();
  await expect(page.getByRole("button", { name: "메뉴 닫기" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.locator(".primary-nav:visible").getByRole("link", { name: "프로젝트" }).focus();
  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();
  await expect(page.locator(".primary-nav:visible")).toHaveCount(0);
});

test("the ambient field respects reduced motion while keeping its destinations usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ko");
  await expect(page.locator(".home-hero svg g").first()).toHaveCSS("animation-name", "none");
  const navigation = page.getByRole("navigation", { name: "아카이브 둘러보기" });
  await expect(navigation.getByRole("link", { name: "연구", exact: true })).toHaveAttribute(
    "href",
    "/ko/spaces/research",
  );
  await expect(navigation.getByRole("link", { name: "시스템", exact: true })).toHaveAttribute(
    "href",
    "/ko/spaces/work",
  );
  await navigation.getByRole("link", { name: "노트", exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/archive\?space=LOGS$/);
});

test("home identity and real navigation remain discoverable with JavaScript disabled", async ({
  browser,
  page,
}) => {
  const isolated = await browser.newContext({
    baseURL: "http://127.0.0.1:3010",
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: page.viewportSize() ?? { width: 1280, height: 720 },
  });
  try {
    await isolated.route("https://**/*", (route) => route.abort());
    const staticPage = await isolated.newPage();
    await staticPage.bringToFront();
    await staticPage.goto("/ko");
    await expect(
      staticPage.getByRole("heading", { level: 1, name: "생각이 움직이는 곳." }),
    ).toBeVisible();
    const signature = staticPage.getByRole("img", { name: "민재의 서명", exact: true });
    await expect(signature).toBeVisible();
    await expect
      .poll(() =>
        signature.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    await expect(staticPage.getByRole("navigation", { name: "아카이브 둘러보기" })).toBeVisible();
    await staticPage.getByRole("link", { name: "작업 둘러보기", exact: true }).click();
    await expect(staticPage).toHaveURL(/\/ko\/spaces\/work$/);
  } finally {
    await isolated.close();
  }
});

test("localized home has no horizontal overflow at 200 percent text size down to 320px", async ({
  page,
}) => {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  for (const width of new Set([viewport.width, 390, 320])) {
    await page.setViewportSize({ width, height: viewport.height });
    for (const locale of ["ko", "en"] as const) {
      await page.goto(`/${locale}`);
      await page.evaluate(async () => {
        document.documentElement.style.fontSize = "200%";
        await document.fonts.ready;
      });
      await expect(page.locator("html")).toHaveCSS("font-size", "32px");
      const dimensions = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(
        dimensions.pageWidth,
        `200% text must fit the ${width}px viewport without page-level horizontal scrolling`,
      ).toBeLessThanOrEqual(dimensions.viewportWidth);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: locale === "ko" ? "생각이 움직이는 곳." : "Curiosity, in motion.",
        }),
      ).toBeVisible();
    }
  }
});
