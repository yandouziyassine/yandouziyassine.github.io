import { test, expect } from "@playwright/test";

const pages = ["/", "/demos/", "/projects/", "/projects/anomaly-detection-patchcore/", "/projects/slipstream/", "/resume/", "/contact/"];

for (const url of pages) {
  test(`${url} loads without console errors`, async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !m.location().url.includes("hf.space")) errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(url);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("project filter hides other topics", async ({ page }) => {
  await page.goto("/projects/");
  const total = await page.locator(".card").count();
  await page.locator(".filters button").nth(1).click();
  const visible = await page.locator(".card:visible").count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(total);
});
