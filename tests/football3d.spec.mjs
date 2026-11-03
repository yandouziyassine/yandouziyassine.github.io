// The football replay's 3D view (phase 3) with the shipped match:
// - nothing 3D loads until asked
// - the toggle opens the 3D view on the same moment
// - cameras switch with the radio group, the C key and the "Whose eyes" menu
// - pausing on a ball carrier still lists the options in the DOM and labels the arrows in 3D
// - V goes back to 2D and removes the 3D canvas
// - the visitor steers: drag to look around in a player's eyes (and Q/E R/F, 0, the re-centre button, the wheel), orbit in
//   the stadium, pan the tactical view; a drag is not a click. The camera offsets are read from data-camera-* on the stage.
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

  test("steering: free look in a player's eyes, orbit, pan, re-centre", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover();
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    test.skip((await root.getAttribute("data-webgl")) !== "true", "no WebGL 2 in this browser");
    await root.getByRole("button", { name: "3D view" }).click();
    await expect(root).toHaveAttribute("data-view", "3d", { timeout: 20_000 });
    const r = fx.frames.find((f) => f.half === 0);
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-options", String(r.options.length));
    const stage = root.locator("[data-stage3d]"), canvas = stage.locator("canvas"), hint = root.locator("[data-hint3d]");
    const num = async (name) => Number(await stage.getAttribute(`data-camera-${name}`));
    const centre = async () => { // a point on the canvas that is inside the window
      await canvas.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const b = await canvas.boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
    };
    const drag = async (dx, dy) => {
      const { x, y } = await centre();
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 8 });
      await page.mouse.up();
    };

    // the player's eyes
    await root.getByRole("radio", { name: "Player's eyes" }).check();
    await expect(root).toHaveAttribute("data-camera", "eyes");
    await expect(hint).toHaveText("Drag to look around · Q/E R/F · 0 re-centres");
    await expect(stage).toHaveAttribute("data-camera-yaw", "0");
    const label = await canvas.getAttribute("aria-label");
    const player = await root.getByLabel("Whose eyes").inputValue();
    await drag(-160, 0); // the scene follows the pointer: dragging left turns the head right
    await expect.poll(() => num("yaw")).toBeLessThan(-10);
    await drag(0, -120); // dragging up looks down
    await expect.poll(() => num("pitch")).toBeLessThan(-5);
    await drag(0, 4000); // pitch stops at +45°
    await expect.poll(() => num("pitch")).toBe(45);
    expect(await canvas.getAttribute("aria-label")).toBe(label);
    expect(await root.getByLabel("Whose eyes").inputValue()).toBe(player); // a drag does not select anyone
    await expect(root).toHaveAttribute("data-camera", "eyes");
    await stage.focus();
    await page.keyboard.press("0");
    await expect(stage).toHaveAttribute("data-camera-yaw", "0");
    await expect(stage).toHaveAttribute("data-camera-pitch", "0");
    await page.keyboard.press("q"); // 5° to the left
    await expect(stage).toHaveAttribute("data-camera-yaw", "5");
    await page.keyboard.press("f"); // F looks down here: it does not follow the coach
    await expect(stage).toHaveAttribute("data-camera-pitch", "-5");
    await expect(root.locator("[data-tally-decisions]")).toHaveText("0");
    await page.keyboard.press("e");
    await page.keyboard.press("e");
    await expect(stage).toHaveAttribute("data-camera-yaw", "-5");
    const c = await centre();
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -400); // wheel up: narrower field of view
    await expect.poll(() => num("fov")).toBeLessThan(60);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 300); // wheel down: wider, up to 90°
    await expect.poll(() => num("fov")).toBe(90);
    await root.getByRole("button", { name: "Re-centre view" }).click();
    await expect(stage).toHaveAttribute("data-camera-yaw", "0");
    await expect(stage).toHaveAttribute("data-camera-pitch", "0");
    await expect(stage).toHaveAttribute("data-camera-fov", "70");

    // the stadium camera orbits, double click re-centres
    await root.getByRole("radio", { name: "Stadium" }).check();
    await expect(hint).toContainText("Drag to orbit");
    await expect(stage).toHaveAttribute("data-camera-azimuth", "0");
    await drag(120, 0);
    await expect.poll(() => num("azimuth")).toBeLessThan(-5);
    await drag(0, 4000); // down raises the camera, up to 85° overhead
    await expect.poll(() => num("elevation")).toBeGreaterThan(20);
    const over = await centre(); // the drag ended far below the canvas
    await page.mouse.move(over.x, over.y);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => num("zoom")).toBeLessThan(1);
    await expect(root).toHaveAttribute("data-camera", "broadcast"); // no click was taken for a selection
    const m = await centre();
    await page.mouse.dblclick(m.x, m.y); // a double click is a reset, not two selections
    await expect(stage).toHaveAttribute("data-camera-azimuth", "0");
    await expect(stage).toHaveAttribute("data-camera-elevation", "0");
    await expect(stage).toHaveAttribute("data-camera-zoom", "1");

    // the tactical view zooms and pans, and stops at the edge of the pitch
    await root.getByRole("radio", { name: "Tactical" }).check();
    await expect(hint).toContainText("Drag to pan");
    await drag(200, 100);
    await expect(stage).toHaveAttribute("data-camera-panx", "0"); // the whole pitch is in view: nothing to pan to
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -300);
    await expect.poll(() => num("tzoom")).toBeGreaterThan(2);
    await drag(100, 0);
    await expect.poll(() => num("panx")).toBeLessThan(-3);
    await page.keyboard.press("0");
    await expect(stage).toHaveAttribute("data-camera-tzoom", "1");
    await expect(stage).toHaveAttribute("data-camera-panx", "0");
    expect(errors).toEqual([]);
  });
});
