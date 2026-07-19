import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("registration, email verification, login, and organization creation", async ({
  page,
}) => {
  const email = `playwright-${Date.now()}@example.test`;
  const password = "Playwright-Strong-42!";
  const emailDirectory = path.resolve(".local/emails");
  await mkdir(".artifacts/screens", { recursive: true });
  const before = new Set(await readdir(emailDirectory).catch(() => []));

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Playwright User");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  expect(page.url()).not.toContain(password);

  let emailFile: string | undefined;
  await expect
    .poll(async () => {
      const files = await readdir(emailDirectory).catch(() => []);
      const candidates = files.filter((file) => !before.has(file));
      if (!candidates.length) return false;
      const withTimes = await Promise.all(
        candidates.map(async (file) => ({
          file,
          modified: (await stat(path.join(emailDirectory, file))).mtimeMs,
        })),
      );
      emailFile = withTimes.sort((a, b) => b.modified - a.modified)[0]?.file;
      return Boolean(emailFile);
    })
    .toBe(true);

  const message = await readFile(path.join(emailDirectory, emailFile!), "utf8");
  const encodedUrl = message.match(
    /href="([^"]*\/verify-email\?token=[^"]+)"/,
  )?.[1];
  expect(encodedUrl).toBeTruthy();
  await page.goto(encodedUrl!.replaceAll("&amp;", "&"));
  await expect(
    page.getByText("Your email address has been verified."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue to login" }).click();

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Create your first organization")).toBeVisible();

  await page.getByRole("link", { name: /Create organization/ }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText("Name your organization")).toBeVisible();
  await page.screenshot({ path: ".artifacts/screens/onboarding-chromium.png", fullPage: true });
  await page
    .getByLabel("Organization name")
    .fill(`Playwright Organization ${Date.now()}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText("Workspace found")).toBeVisible();
  await page.getByRole("link", { name: "Open dashboard" }).click();
  await expect(page.getByText("Organization overview")).toBeVisible();
  await page.screenshot({ path: ".artifacts/screens/dashboard-chromium.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({ path: ".artifacts/screens/dashboard-mobile-chromium.png", fullPage: true });
});
