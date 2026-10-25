import { test, expect } from "@playwright/test";
import path from "node:path";

const cases = [
  ["research/hybrid-retrieval", "하이브리드 검색: 단어와 의미를 함께 읽기"],
  ["research/representation-learning", "표현 학습의 연구 질문"],
  ["work/archive-architecture", "읽기와 작성을 분리하는 아카이브"],
  ["docs/content-pipeline", "원문을 보존하는 문서 처리"],
  ["logs/evaluation-notes", "평가 기록: 좋아진 것과 남은 것"],
] as const;

test.beforeEach(async ({ page, request }) => {
  expect((await request.post("http://127.0.0.1:17761/__fixtures/mode?mode=normal")).ok()).toBe(
    true,
  );
  await page.route("https://**/*", (route) => route.abort());
});

test("representative detail documents preserve rendering and separate their navigation", async ({
  page,
}, testInfo) => {
  const captureCalls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/telemetry"))
      captureCalls.push(request.url());
  });
  for (const [slug, title] of cases) {
    await page.goto(`/ko/examples/${slug}`);
    await expect(page.locator(".document-page > header h1")).toHaveText(title);
    await expect(
      page.getByRole("heading", { name: "다음으로 이어 읽기", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("검증된 읽기 흐름 집계가 아직 없습니다.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (slug.includes("hybrid-retrieval")) {
      await expect(page.locator(".katex-display")).toBeVisible();
      await expect(page.locator(".mermaid svg")).toBeVisible();
      await expect(
        page.getByRole("link", { name: /원문을 보존하는 문서 처리/ }).last(),
      ).toBeVisible();
    }
    if (slug.includes("archive-architecture"))
      await expect(page.locator('[data-render-block="hf-demo"] iframe')).toHaveAttribute(
        "sandbox",
        "allow-forms allow-same-origin allow-scripts",
      );
    if (slug.includes("content-pipeline"))
      await expect(page.locator('[data-render-block="youtube"] iframe')).toHaveAttribute(
        "src",
        /youtube-nocookie/,
      );
    await page.screenshot({
      path: path.join(
        "_local",
        "ui-review",
        "session-consent-2026-10-14",
        testInfo.project.name,
        `${slug.replaceAll("/", "-")}.png`,
      ),
      fullPage: true,
    });
  }
  expect(captureCalls).toEqual([]);
});

test("end-of-reading hints are optional, non-modal and dismiss for the tab", async ({
  page,
}, testInfo) => {
  await page.goto("/ko/examples/research/hybrid-retrieval");
  const hint = page.getByRole("region", { name: "다음 글 안내", exact: true });
  await expect(hint).toHaveCount(0);
  await page.getByRole("button", { name: "읽기 끝에 다음 글 알림 받기" }).click();
  await page.keyboard.press("Tab");
  const focusBefore = await page.evaluate(() => document.activeElement?.outerHTML);
  await expect(hint).toBeVisible({ timeout: 25_000 });
  expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(focusBefore);
  await page.screenshot({
    path: path.join(
      "_local",
      "ui-review",
      "session-consent-2026-10-14",
      testInfo.project.name,
      "reading-hint.png",
    ),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "읽기 끝 알림 끄기" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("archive:reading-hint-dismissed"))).toBe(
    "yes",
  );
  await page.getByRole("button", { name: "읽기 끝 알림 끄기" }).click();
  expect(await page.evaluate(() => localStorage.getItem("archive:reading-hint"))).toBe("off");
});

test("privacy notice, controls and disabled capture remain honest", async ({ page }, testInfo) => {
  await page.goto("/ko/examples/research/hybrid-retrieval");
  await page.getByRole("button", { name: "개인정보 설정", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel(/이번 세션 맞춤 처리/)).toBeDisabled();
  await expect(page.getByLabel(/맞춤 기능 개선용 학습 자료 보관/)).toBeDisabled();
  await page.screenshot({
    path: path.join(
      "_local",
      "ui-review",
      "session-consent-2026-10-14",
      testInfo.project.name,
      "privacy-choices.png",
    ),
    fullPage: true,
  });
  await page.getByRole("button", { name: "개인정보 설정 닫기" }).click();
  await expect(page.getByRole("button", { name: "개인정보 설정", exact: true })).toBeFocused();
  await page.goto("/ko/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "읽기는 자유롭게. 선택은 명확하게.",
  );
  await expect(page.getByText("현재 수집 비활성화", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
