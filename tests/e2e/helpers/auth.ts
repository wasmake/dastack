import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export async function createAuthenticatedWorkspace(page: Page) {
  const timestamp = Date.now();
  const email = `phase-two-${timestamp}-${randomUUID()}@example.test`;
  const password = "Playwright-Strong-42!";
  const configuredEmailDirectory = process.env.EMAIL_DEV_DIR;
  if (!configuredEmailDirectory) {
    throw new Error("EMAIL_DEV_DIR is required by the E2E auth helper.");
  }
  const emailDirectory = path.resolve(configuredEmailDirectory);
  await mkdir(emailDirectory, { recursive: true });
  const before = new Set(await readdir(emailDirectory));

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Phase Two User");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);

  let emailFile: string | undefined;
  await expect
    .poll(async () => {
      const files = (await readdir(emailDirectory)).filter(
        (file) => !before.has(file),
      );
      const candidates = await Promise.all(
        files.map(async (file) => ({
          file,
          modified: (await stat(path.join(emailDirectory, file))).mtimeMs,
        })),
      );
      emailFile = candidates.sort(
        (left, right) => right.modified - left.modified,
      )[0]?.file;
      return Boolean(emailFile);
    })
    .toBe(true);

  const message = await readFile(path.join(emailDirectory, emailFile!), "utf8");
  const verificationUrl = message.match(
    /href="([^"]*\/verify-email\?token=[^"]+)"/,
  )?.[1];
  expect(verificationUrl).toBeTruthy();
  await page.goto(verificationUrl!.replaceAll("&amp;", "&"));
  await page.getByRole("link", { name: "Continue to login" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("link", { name: /Create organization/ }).click();
  await page.getByLabel("Organization name").fill(`Phase Two ${timestamp}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.getByRole("link", { name: "Open dashboard" }).click();
  await expect(page.getByText("Organization overview")).toBeVisible();
}
