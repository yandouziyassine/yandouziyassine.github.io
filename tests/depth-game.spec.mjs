import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Runs once the project 14 public pair set has been copied in (scripts/depth-game.mjs); before that the page says "coming soon".
test.skip(!fs.existsSync("src/data/depth-game.json"), "depth game data not copied yet");
test("game round", async ({ page }) => {
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demos/");
  await page.getByRole("link", { name: "▶ Play" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  for (let i = 0; i < 12; i++) {  // the page plays 12-pair rounds
    await expect(page.locator("[data-progress]")).toContainText(`${i + 1} / 12`);
    await page.keyboard.press(i % 2 ? "b" : "a");
    await expect(page.locator("[data-feedback]")).toBeVisible();
    await page.locator("[data-next]").click();
  }
  await expect(page.locator("[data-score]")).toContainText(/You: \d+ \/ 12/);
  expect(errors).toEqual([]);
});
test("glance hides the image", async ({ page }) => {
  await page.goto("/demos/depth-challenge/");
  await page.getByLabel(/Quick glance/).check();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator("[data-veil]")).toBeVisible({ timeout: 3000 });
  await expect(page.locator("[data-img]")).toBeHidden();
});
