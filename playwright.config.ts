import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
      testMatch: /visual\.spec\.ts/,
    },
  ],
  webServer: {
    command: "pnpm dev",
    env: {
      ...process.env,
      APP_URL: baseURL,
      AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
    },
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
