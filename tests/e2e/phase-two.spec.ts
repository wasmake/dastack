import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import { createAuthenticatedWorkspace } from "./helpers/auth";
import { heartbeatE2eWorker } from "./helpers/worker";

test("creates a project and an environment when worker capacity is online", async ({
  page,
}) => {
  await heartbeatE2eWorker();
  await createAuthenticatedWorkspace(page);
  await mkdir(".artifacts/screens", { recursive: true });
  await page.goto("/dashboard/projects");

  const projectName = `Web platform ${Date.now()}`;
  await page.getByRole("button", { name: "Create project" }).first().click();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Description").fill("Production web platform");
  const workerResponse = page.waitForResponse((response) =>
    response.url().includes("/api/workers?organizationId="),
  );
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/dashboard\/projects\//);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await workerResponse;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
  await page.setViewportSize({ width: 1280, height: 800 });

  await heartbeatE2eWorker();
  await page.getByRole("button", { name: "Create environment" }).click();
  await expect(
    page.getByText(
      /No online worker reports a region|Worker regions are unavailable/,
    ),
  ).toHaveCount(0);
  await expect(page.getByLabel("Region")).toHaveValue("local-1");

  const environmentName = `Preview ${Date.now()}`;
  await page.getByLabel("Environment name").fill(environmentName);
  await page.getByLabel("Type").selectOption("preview");
  await page
    .getByRole("button", { name: "Create environment", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: environmentName }),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/screens/project-environment-chromium.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".artifacts/screens/project-environment-mobile-chromium.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dashboard/infrastructure/workers");
  await expect(
    page.getByText(process.env.PLAYWRIGHT_WORKER_NAME!),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/screens/worker-nodes-chromium.png",
    fullPage: true,
  });
  await page.goto("/dashboard/resources");
  await expect(
    page.getByText(/Entitlement counters are unavailable|Organization quota/),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/screens/resource-limits-chromium.png",
    fullPage: true,
  });
  await page.goto("/dashboard");
  await expect(page.getByText("Organization overview")).toBeVisible();
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
  await page.screenshot({
    path: ".artifacts/screens/dashboard-phase2-chromium.png",
    fullPage: true,
  });
});

test("shows the operator-facing empty service catalog state", async ({
  page,
}) => {
  await createAuthenticatedWorkspace(page);
  await mkdir(".artifacts/screens", { recursive: true });
  await page.goto("/dashboard/services/catalog");

  await expect(
    page.getByRole("heading", { name: "No published templates" }),
  ).toBeVisible();
  await expect(
    page.getByText(/operator must import and publish service manifests/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /deploy/i })).toHaveCount(0);
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
  await page.screenshot({
    path: ".artifacts/screens/service-catalog-empty-chromium.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
});
