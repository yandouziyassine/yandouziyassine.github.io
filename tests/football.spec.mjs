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

  test("each option lists its reasons; ghosts are off by default, shown on request and remembered", async ({ page }) => {
    const r = fx.frames.find((f) => f.half === 0 && f.ghosts.runs.length && f.ghosts.defence.length && !f.explanations[0].fragile);
    const n = r.ghosts.runs.length + r.ghosts.defence.length;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover();
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-options", String(r.options.length));
    const why = root.locator("[data-options] .why");
    await expect(why).toHaveCount(r.options.length);
    await expect(why.first()).toHaveText(`Why: ${r.explanations[0].phrases.join(" · ")}`);
    const first = root.locator("[data-options] button").first();
    expect(await first.getAttribute("aria-describedby")).toContain("fr-why-0"); // screen readers read the reasons with the option
    await first.focus(); // the reasons also show over the pitch on focus
    await expect(root.locator("[data-tip]")).toContainText(r.explanations[0].phrases[0]);
    const toggle = root.getByRole("button", { name: "Show ghosts" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(root).toHaveAttribute("data-ghosts", "off");
    await expect(root.locator("[data-ghost-legend]")).toBeHidden();
    await toggle.click();
    await expect(root).toHaveAttribute("data-ghosts", String(n));
    await expect(root.locator("[data-ghost-legend]")).toContainText("only 3 % of the predicted gain was still there at the pass");
    await expect(root.locator("[data-ghost-list] li")).toHaveCount(n);
    await expect(root.getByRole("button", { name: "Hide ghosts" })).toHaveAttribute("aria-pressed", "true");
    await page.reload(); // remembered in localStorage
    await root.hover();
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-ghosts", String(n));
    await root.getByRole("button", { name: "Hide ghosts" }).click();
    await expect(root).toHaveAttribute("data-ghosts", "off");
    // playing hides them and computes nothing
    await root.getByRole("button", { name: "Show ghosts" }).click();
    await root.getByRole("button", { name: "Play" }).click();
    await expect(root.locator("[data-ghost-legend]")).toBeHidden();
    await expect(root).toHaveAttribute("data-ghosts", "off");
    expect(errors).toEqual([]);
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
  test("pausing on a ball carrier shows the carrier's card; hovering or focusing a pass option shows the target's", async ({ page }) => {
    const r = fx.frames.find((f) => f.half === 0 && f.options.some((o) => o.kind === "pass"));
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover();
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-options", String(r.options.length));
    const cards = root.locator("[data-cards]"), carrier = root.locator("[data-card=carrier]"), target = root.locator("[data-card=target]");
    const text = /Passing:|No history for this player in the other matches\./;
    await expect(cards).toBeVisible();
    await expect(cards).toHaveAttribute("aria-label", /do not change the advice/);
    await expect(carrier.locator("[data-card-who]")).toContainText("ball carrier");
    await expect(carrier).toContainText(text);
    await expect(target).toBeHidden();
    const pass = root.locator("[data-options] li").filter({ hasText: "Pass to" }).first();
    await pass.hover();
    await expect(target.locator("[data-card-who]")).toContainText("pass target");
    await expect(target).toContainText(text);
    await root.locator("[data-time]").hover();
    await expect(target).toBeHidden();
    await pass.locator("button").focus(); // keyboard: the focus shows it too, and a screen reader reads it as the description
    await expect(target).toBeVisible();
    const desc = (await pass.locator("button").getAttribute("aria-describedby")).split(" ").pop(); // the reasons come first, then the card
    await expect(page.locator(`#${desc}`)).toContainText("pass target");
    await root.locator("[data-time]").focus();
    await expect(target).toBeHidden();
    await root.getByRole("button", { name: "Play" }).click();
    await expect(cards).toBeHidden();
  });

  test("without profiles.json there are no cards and the coach still works", async ({ page }) => {
    const r = fx.frames.find((f) => f.half === 0);
    await page.route("**/football/profiles.json", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover();
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-options", String(r.options.length));
    await expect(root.locator("[data-cards]")).toBeHidden();
  });
});
