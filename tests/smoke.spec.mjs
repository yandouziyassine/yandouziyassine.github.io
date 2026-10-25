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

// The painter with Chromium's built-in fake camera: the self-hosted wasm and hand model must load,
// and the "starting" overlay must go away (it stays up with an error message if anything fails).
test.describe("painter", () => {
  test.use({
    permissions: ["camera"],
  });
  test("starts with a fake camera on /demos/", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/demos/");
    const start = page.getByRole("button", { name: "Start camera" });
    test.skip((await page.locator("[data-painter]").count()) === 0, "painter not live yet (src/data/flags.ts)");
    await start.click();
    await expect(page.locator(".vp-msg")).toBeHidden({ timeout: 90_000 });
    expect(errors).toEqual([]);
  });
});
