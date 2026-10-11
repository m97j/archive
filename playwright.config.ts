import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://127.0.0.1:3010",
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command:
      "node apps/web/tests/e2e/start-ui-server.mjs" +
      (process.env.ARCHIVE_E2E_PRODUCTION === "1" ? " --production" : ""),
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3010",
  },
});
