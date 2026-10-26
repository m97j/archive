import { expect, test } from "@playwright/test";

// Test streams and the downloaded tag are isolated; no real measurement leaves this browser.
test.beforeEach(async ({ context }) => {
  await context.route("https://www.googletagmanager.com/gtag/js?*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.__archiveTagLoaded = true;",
    }),
  );
  await context.route(/https:\/\/[^/]*(google-analytics\.com|analytics\.google\.com)\//, (route) =>
    route.abort(),
  );
});
const commands = async (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((item) =>
      Array.from(item),
    ),
  );

test("GA4 stays blocked until independent consent and sends sanitized public paths once", async ({
  page,
}) => {
  const google: string[] = [];
  const raw: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname.includes("google")) google.push(request.url());
    if (url.pathname.startsWith("/api/telemetry")) raw.push(url.pathname);
  });
  await page.goto(
    "/ko/examples/research/hybrid-retrieval?q=NEVER-SEND-QUERY&token=NEVER-SEND-TOKEN#secret",
  );
  const banner = page.getByRole("complementary", { name: "선택적 방문 분석" });
  await expect(banner).toBeVisible();
  expect(google).toEqual([]);
  await banner.getByRole("button", { name: "분석 거부", exact: true }).click();
  await expect(banner).toHaveCount(0);
  expect(google).toEqual([]);
  await page.getByRole("button", { name: "개인정보 설정", exact: true }).click();
  await expect(page.getByLabel(/이번 세션 맞춤 처리/)).toBeDisabled();
  await expect(page.getByLabel(/이 탭에서만 이어 읽기 맞춤/)).not.toBeChecked();
  await page.getByLabel(/^Google Analytics 분석 허용/).check();
  await expect.poll(() => google.length).toBe(1);
  await page.getByRole("button", { name: "개인정보 설정 닫기" }).click();
  let queue = await commands(page);
  expect(queue.filter((item) => item[0] === "event" && item[1] === "page_view")).toHaveLength(1);
  expect(JSON.stringify(queue)).not.toMatch(/NEVER-SEND|#secret/);
  await page.locator(".document-bottom a").first().click();
  await expect(page).toHaveURL(/\/ko\/archive$/);
  await expect
    .poll(
      async () =>
        (await commands(page)).filter((item) => item[0] === "event" && item[1] === "page_view")
          .length,
    )
    .toBe(2);
  queue = await commands(page);
  expect(JSON.stringify(queue)).not.toMatch(/NEVER-SEND|#secret/);
  expect(raw).toEqual([]);
});

test("withdrawing analytics survives reload, clears cookies and reaches other tabs", async ({
  page,
  context,
}) => {
  await page.goto("/ko");
  await page.getByRole("button", { name: "분석 허용", exact: true }).click();
  await expect(page.locator("script[data-archive-analytics]")).toHaveCount(1);
  await context.addCookies([{ name: "_ga", value: "synthetic", url: "http://127.0.0.1:3010" }]);
  const other = await context.newPage();
  await other.goto("/ko/archive");
  await expect(other.locator("script[data-archive-analytics]")).toHaveCount(1);
  await page.getByRole("button", { name: "개인정보 설정", exact: true }).click();
  await page.getByLabel(/^Google Analytics 분석 허용/).uncheck();
  await expect(page.locator("script[data-archive-analytics]")).toHaveCount(0);
  await expect(other.locator("script[data-archive-analytics]")).toHaveCount(0);
  expect((await context.cookies()).some((item) => item.name === "_ga")).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "개인정보 설정", exact: true }).click();
  await expect(page.getByLabel(/^Google Analytics 분석 허용/)).not.toBeChecked();
  expect((await page.request.get("/api/privacy")).ok()).toBe(true);
});
