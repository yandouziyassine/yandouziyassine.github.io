import { test, expect } from "@playwright/test";
test("animation swaps in after load", async ({ page }) => {
  await page.goto("/projects/traffic-analytics/");
  await expect(page.locator(".prose img").first()).toHaveAttribute("src", /demo\.webp$/, { timeout: 15000 });
});
test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("stays on the first frame until clicked", async ({ page }) => {
    await page.goto("/projects/traffic-analytics/");
    const img = page.locator(".prose img").first();
    await page.waitForLoadState("load");
    await page.waitForTimeout(800);
    await expect(img).toHaveAttribute("src", /still\.webp$/);
    await img.click();
    await expect(img).toHaveAttribute("src", /demo\.webp$/);
  });
});
