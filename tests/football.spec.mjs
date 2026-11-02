// The football replay with the shipped match (public/football, committed): it loads, plays and pauses; on a frame
// where a player has the ball (the first parity frame) it shows the coach's options; "Follow" updates the tally; on
// resume the pro's choice is revealed.
import { test, expect } from "@playwright/test";
import fs from "node:fs";

const FX = "tests/fixtures/coach-parity.json";
const live = fs.existsSync("public/football/models.json") && fs.existsSync(FX);
const fx = live ? JSON.parse(fs.readFileSync(FX, "utf8")) : null;

test.describe("football replay", () => {
  test.skip(!live, "football data or parity fixture not here");
  test.setTimeout(60_000);

  test("the demos page links to the replay", async ({ page }) => {
    await page.goto("/demos/");
    await page.getByRole("link", { name: "▶ Watch and coach" }).click();
    await expect(page).toHaveURL(/\/demos\/football\/$/);
    await expect(page.locator("h1")).toHaveText("Pause the match. Ask the coach.");
  });

  test("loads, plays and pauses", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover(); // the data loads on first hover / focus, not on page load
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    const clock = root.locator("[data-clock]");
    await expect(clock).toHaveText("00:00");
    await root.getByRole("button", { name: "4×" }).click();
    await root.getByRole("button", { name: "Play" }).click();
    await expect(clock).not.toHaveText("00:00", { timeout: 5_000 });
    await page.keyboard.press("Space"); // focus is on the Play/Pause button: Space presses it
    await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("pausing on a ball carrier shows the options; Follow updates the tally; resuming reveals the pro", async ({ page }) => {
    const r = fx.frames.find((f) => f.half === 0);
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover(); // the data loads on first hover / focus, not on page load
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-options", String(r.options.length));
    await expect(root.locator("[data-options] button").first())
      .toContainText({ pass: "Pass to", carry: "Carry", shot: "Shoot" }[r.options[0].kind]);
    await root.getByRole("button", { name: "Follow the coach" }).click();
    await expect(root.locator("[data-tally-decisions]")).toHaveText("1");
    await expect(root.locator("[data-tally-coach]")).toHaveText(await root.locator("[data-tally-viewer]").innerText());
    await root.getByRole("button", { name: "4×" }).click();
    await root.getByRole("button", { name: "Play" }).click();
    await expect(root.locator("[data-reveal]")).toContainText("Outcome within 15 s", { timeout: 10_000 });
  });

  test("pausing in open play snaps to the nearest moment someone has the ball", async ({ page }) => {
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover();
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    const clock = root.locator("[data-clock]"), status = root.locator("[data-status]");
    const seconds = async () => { const [m, s] = (await clock.innerText()).split(":").map(Number); return 60 * m + s; };
    // Several pauses a few seconds apart: the ball is between players at most instants, yet each pause must end on a
    // moment with options, and whenever it moved the status says by how much.
    let moved = 0;
    for (const at of [3, 6, 9]) { // the ball is in play for the first 12 s
      await root.getByRole("button", { name: "Play" }).click();
      await expect.poll(seconds, { timeout: 20_000 }).toBeGreaterThanOrEqual(at);
      await root.getByRole("button", { name: "Pause" }).click();
      await expect(root).not.toHaveAttribute("data-options", "0");
      const text = await status.innerText();
      if (/^Paused \d\.\d s (earlier|later), when #\d+ .* had the ball: \d+ options/.test(text)) moved++;
      else expect(text).toMatch(/^Paused\. #\d+ .* has the ball: \d+ options/);
    }
    expect(moved).toBeGreaterThan(0); // at 3 s, 6 s and 9 s of this match the ball is between players
  });

  test("Jump to a shot lands where the shooter has the ball", async ({ page }) => {
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover();
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await root.locator("[data-jump]").selectOption({ index: 1 });
    await expect(root).not.toHaveAttribute("data-options", "0", { timeout: 10_000 });
    await expect(root.locator("[data-options] button").first()).toBeVisible();
  });
});
