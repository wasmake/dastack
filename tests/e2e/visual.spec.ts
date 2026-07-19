import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("public workflows render without overflow", async ({ page }, testInfo) => {
  await mkdir(".artifacts/screens", { recursive: true });
  for (const route of ["/", "/login", "/register", "/pricing", "/status"]) {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    const name = route === "/" ? "landing" : route.slice(1);
    await page.screenshot({
      path: `.artifacts/screens/${name}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
});
