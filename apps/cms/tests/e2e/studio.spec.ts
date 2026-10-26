import { test, expect } from "@playwright/test";
const base = "http://127.0.0.1:3011";
test.beforeEach(async ({ request, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await request.post("http://127.0.0.1:17762/__fixtures/reset");
  await page.route("https://**/*", (route) => route.abort());
});
async function signIn(
  page: import("@playwright/test").Page,
  email = "owner@example.test",
  remember = false,
) {
  await page.goto(`${base}/ko/admin/login`);
  await page.getByLabel("관리자 이메일").fill(email);
  await page.getByLabel("로그인 비밀번호").fill("fixture-password");
  if (remember) await page.getByLabel("이 브라우저에서 로그인 유지").check();
  await page.getByRole("button", { name: "스튜디오 열기" }).click();
}
test("CMS requires a signed administrator role, not just a provider login", async ({ page }) => {
  await signIn(page, "reader@example.test");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/admin\/login$/);
  await expect(page.getByText("다음 이야기를 준비하세요.")).toHaveCount(0);
});
test("owner signs in through the actual form, with session-only cookies by default", async ({
  page,
  context,
}) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "다음 이야기를 준비하세요." })).toBeVisible();
  // Secure cookies on a trustworthy loopback origin are omitted by HTTP URL filtering.
  const cookies = await context.cookies();
  const policy = cookies.find((cookie) => cookie.name === "archive-cms-session-policy");
  expect(policy?.httpOnly).toBe(true);
  expect(policy?.expires).toBe(-1);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/admin\/login$/);
  await page.goto(`${base}/ko/admin`);
  await expect(page).toHaveURL(/admin\/login$/);
});
test("remembered owner edits, previews sanitized source, reviews and publishes without exposing a token", async ({
  page,
  context,
  request,
}) => {
  await signIn(page, "owner@example.test", true);
  await expect(page.getByRole("heading", { name: "다음 이야기를 준비하세요." })).toBeVisible();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "archive-cms-session-policy")
      ?.expires,
  ).toBeGreaterThan(Date.now() / 1000 + 170 * 86_400);
  await page.getByRole("link", { name: "새 초안", exact: true }).first().click();
  await page.getByLabel("Canonical key", { exact: true }).fill("fixture.record");
  await page.getByLabel("제목", { exact: true }).fill("브라우저 검증 기록");
  await page.getByLabel("Slug", { exact: true }).fill("fixture/record");
  const editor = page.getByRole("textbox", { name: "Markdown 원문 편집기" });
  await expect(editor).toBeVisible();
  await editor.fill("# Safe preview\n\n<script>window.injected=true</script>\n\nOriginal text.");
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.locator(".preview-pane h1")).toHaveText("Safe preview");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("studio-editor.png"), fullPage: true });
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.locator(".draft-result")).toBeVisible();
  await expect(page.getByLabel("제목", { exact: true })).toHaveValue("브라우저 검증 기록");
  await editor.fill("# Safe preview\n\nA preserved second revision.");
  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.locator(".editor-message").first()).toContainText("revision 2");
  await page
    .getByRole("navigation", { name: "스튜디오 탐색" })
    .getByRole("link", { name: /^콘텐츠/ })
    .click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByRole("button", { name: "Approve revision" }).click();
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Workflow updated.");
  await expect(page.getByRole("heading", { name: "fixture.record", exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("studio-library.png"), fullPage: true });
  const calls = await (await request.get("http://127.0.0.1:17762/__fixtures/requests")).json();
  expect(calls.requests.some((call: { path: string }) => call.path === "/v1/publications")).toBe(
    true,
  );
  expect(
    calls.requests.filter((call: { path: string }) => call.path === "/v1/contents"),
  ).toHaveLength(1);
  expect(await page.locator("body").textContent()).not.toContain("fixture-owner-refresh");
});
test("studio navigation, job requests and mobile layout remain usable", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "다음 이야기를 준비하세요." })).toBeVisible();
  await page.getByRole("link", { name: "작업 큐" }).click();
  await expect(page.getByRole("heading", { name: "작업 큐" })).toBeVisible();
  await page.getByRole("link", { name: "분류·태그" }).click();
  await expect(page.getByRole("heading", { name: "분류와 태그" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const response = await page.goto(`${base}/ko/admin/integrations`);
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'self' https://huggingface.co",
  );
  await expect(
    page.getByText("비밀값은 Space Secrets에서 관리합니다.", { exact: false }),
  ).toBeVisible();
});

test("analytics reports are private, manually requested and contain only page aggregates", async ({
  page,
  request,
}) => {
  await page.goto(`${base}/ko/admin/analytics`);
  await expect(page).toHaveURL(/admin\/login$/);
  await signIn(page);
  await page.getByRole("link", { name: /^방문 분석/ }).click();
  await expect(page.getByRole("heading", { name: "방문 분석", exact: true })).toBeVisible();
  let calls = await (await request.get("http://127.0.0.1:17762/__fixtures/requests")).json();
  expect(
    calls.requests.some((call: { path: string }) => call.path === "/v1/admin/analytics/report"),
  ).toBe(false);
  await page.getByRole("button", { name: "최근 28일 집계 불러오기" }).click();
  await expect(page.getByRole("region", { name: "GA4 집계 결과" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "120", exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 요약 저장" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("marchivej-aggregate-report.json");
  calls = await (await request.get("http://127.0.0.1:17762/__fixtures/requests")).json();
  expect(
    calls.requests.filter((call: { path: string }) => call.path === "/v1/admin/analytics/report"),
  ).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("studio-analytics.png"), fullPage: true });
});
