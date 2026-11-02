// The football replay's 3D view (phase 3) with the shipped match:
// - nothing 3D loads until asked
// - the toggle opens the 3D view on the same moment
// - cameras switch with the radio group, the C key and the "Whose eyes" menu
// - pausing on a ball carrier still lists the options in the DOM and labels the arrows in 3D
// - V goes back to 2D and removes the 3D canvas
// Skips when headless Chromium has no WebGL 2 (playwright.config.mjs asks for SwiftShader).
import { test, expect } from "@playwright/test";
import fs from "node:fs";

const FX = "tests/fixtures/coach-parity.json";
const live = fs.existsSync("public/football/models.json") && fs.existsSync(FX);
const fx = live ? JSON.parse(fs.readFileSync(FX, "utf8")) : null;

test.describe("football replay 3D", () => {
  test.skip(!live, "football data or parity fixture not here");
  test.setTimeout(90_000);

  test("3D on demand: toggle, cameras, options while paused, back to 2D", async ({ page }) => {
    const errors = [], urls = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => urls.push(r.url()));
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover(); // the data loads on first hover / focus
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    expect(urls.filter((u) => /view3d\.|\/z\d\.bin/.test(u))).toEqual([]); // no 3D code or ball height before the toggle
    const toggle = root.getByRole("button", { name: "3D view" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    test.skip((await root.getAttribute("data-webgl")) !== "true", "no WebGL 2 in this browser");
    await toggle.click();
    await expect(root).toHaveAttribute("data-view", "3d", { timeout: 20_000 });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const canvas3d = root.locator("[data-stage3d] canvas");
    await expect(canvas3d).toBeVisible();
    await expect(root.locator("[data-canvas]")).toBeHidden();
    expect(urls.some((u) => /view3d\./.test(u))).toBe(true);
    await expect.poll(async () => Number(await root.getAttribute("data-draw-calls"))).toBeGreaterThan(0);
    expect(Number(await root.getAttribute("data-draw-calls"))).toBeLessThanOrEqual(40);

    const r = fx.frames.find((f) => f.half === 0);
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-options", String(r.options.length));
    await expect(canvas3d).toHaveAttribute("aria-label", /^3D view \(stadium camera\), .* has the ball\.$/);

    await root.getByRole("radio", { name: "Tactical" }).check();
    await expect(root).toHaveAttribute("data-camera", "tactical");
    await expect(root.locator("[data-labels3d] span:not([hidden])").first()).toBeVisible();
    await page.keyboard.press("c"); // focus is on the radio group: C still cycles
    await expect(root).toHaveAttribute("data-camera", "eyes");
    const eyes = root.getByLabel("Whose eyes");
    await expect(eyes).toBeVisible();
    await expect(eyes).toHaveValue(String(r.carrier)); // paused on a carrier: his eyes first
    await eyes.selectOption({ index: 0 });
    await expect(canvas3d).toHaveAttribute("aria-label", /^3D view \(the eyes of #\d+ /);
    await root.getByRole("radio", { name: "Stadium" }).check();
    await expect(root).toHaveAttribute("data-camera", "broadcast");

    await root.getByRole("button", { name: "Follow the coach" }).click();
    await expect(root.locator("[data-tally-decisions]")).toHaveText("1");

    await page.keyboard.press("v");
    await expect(root).toHaveAttribute("data-view", "2d");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(canvas3d).toHaveCount(0);
    await expect(root.locator("[data-canvas]")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
