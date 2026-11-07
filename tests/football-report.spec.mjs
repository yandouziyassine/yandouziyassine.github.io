// The match report on /demos/football/: it renders from public/football/report.json when scrolled into view, a highlight
// seeks the replay to that decision, pauses and draws both the chosen and the coach's preferred option, and the section
// is hidden when report.json is absent.
import { test, expect } from "@playwright/test";
import fs from "node:fs";

const live = fs.existsSync("public/football/report.json") && fs.existsSync("public/football/match.json");
const report = live ? JSON.parse(fs.readFileSync("public/football/report.json", "utf8")) : null;

const ready = async (rp) => { await rp.scrollIntoViewIfNeeded(); await expect(rp).toHaveAttribute("data-ready", "true", { timeout: 15_000 }); };

test.describe("football match report", () => {
  test.skip(!live, "football report not here");
  test.setTimeout(60_000);

  test("renders the summary, the caveats, the player table and both highlight lists", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/demos/football/");
    const rp = page.locator("[data-report]");
    await ready(rp);
    await expect(rp.getByRole("heading", { name: /Match report/ })).toBeVisible();
    await expect(rp.locator("[data-rp-summary]")).toContainText(String(report.summary.n));
    await expect(rp.locator("[data-rp-summary]")).toContainText("6.7 %");
    await expect(rp.locator("[data-rp-summary]")).toContainText("20.0 %");
    await expect(rp.locator("[data-rp-caveats] li")).toHaveCount(report.caveats.length);
    await expect(rp.locator("[data-rp-caveats]")).toContainText("not that the player made a mistake");
    await expect(rp.locator("[data-rp-players] tbody tr")).toHaveCount(Object.keys(report.players).length);
    await expect(rp.locator("[data-rp-players] tbody td.rp-few").first()).toHaveText("fewer than 20 decisions");
    await expect(rp.locator("[data-rp-missed] button")).toHaveCount(10);
    await expect(rp.locator("[data-rp-best] button")).toHaveCount(10);
    expect(errors).toEqual([]);
  });

  test("the player table sorts from the keyboard and says how", async ({ page }) => {
    await page.goto("/demos/football/");
    const rp = page.locator("[data-report]");
    await ready(rp);
    const decisions = rp.locator("[data-rp-players] tbody tr td:nth-child(3)");
    const counts = async () => (await decisions.allInnerTexts()).map(Number);
    const sortBtn = () => rp.getByRole("button", { name: /^Decisions/ });
    let c = await counts(); // the default order: most decisions first
    expect(c).toEqual([...c].sort((a, b) => b - a));
    await sortBtn().focus();
    await page.keyboard.press("Enter"); // same column: reverses
    c = await counts();
    expect(c).toEqual([...c].sort((a, b) => a - b));
    await expect(rp.locator("th[aria-sort]").filter({ hasText: /^Decisions/ })).toHaveAttribute("aria-sort", "ascending");
    await expect(rp.locator("[data-rp-sort]")).toHaveText("Sorted by decisions, smallest first.");
    await expect(sortBtn()).toBeFocused(); // focus stays on the header
    await rp.getByRole("button", { name: /^Player/ }).press("Space");
    const names = (await rp.locator("[data-rp-players] tbody th").allInnerTexts()).map((n) => n.replace(/^#\d+ /, ""));
    expect(names.length).toBeGreaterThan(5);
    await expect(rp.locator("[data-rp-sort]")).toHaveText("Sorted by player, A to Z.");
  });

  test("a highlight seeks the replay, pauses and draws both options with a legend", async ({ page }) => {
    await page.goto("/demos/football/");
    const rp = page.locator("[data-report]"), root = page.locator("[data-football]");
    await ready(rp);
    const d = report.decisions[report.highlights.missed[0].decision];
    await rp.locator("[data-rp-missed] button").first().click(); // the replay is not loaded yet: the click loads it
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await expect(root).toHaveAttribute("data-spot", "true", { timeout: 15_000 });
    await expect(root.locator("[data-time]")).toHaveValue(String(d.frame));
    await expect(root.getByRole("button", { name: "Play" })).toBeVisible(); // paused
    const spot = root.locator("[data-spot]");
    await expect(spot).toBeVisible();
    await expect(spot).toContainText("Green:");
    await expect(spot).toContainText("Orange: the coach valued");
    await expect(root.locator("[data-options] button").first()).toBeVisible();
    await expect(async () => { // the replay is scrolled into view
      const top = await root.evaluate((e) => e.getBoundingClientRect().top);
      expect(top).toBeGreaterThanOrEqual(-5);
      expect(top).toBeLessThan(400);
    }).toPass({ timeout: 5_000 });
    // Both options are drawn on the canvas: the two arrow colours (orange signal, green ok) are present.
    const colours = await root.locator("[data-canvas]").evaluate((cv) => {
      const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let orange = 0, green = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2];
        if (r > 230 && g > 70 && g < 110 && b < 60) orange++;
        if (r > 100 && r < 150 && g > 190 && g < 230 && b > 120 && b < 160) green++;
      }
      return { orange, green };
    });
    expect(colours.orange).toBeGreaterThan(50);
    expect(colours.green).toBeGreaterThan(50);
    await root.getByRole("button", { name: "Play" }).click(); // playing removes them
    await expect(root).toHaveAttribute("data-spot", "false");
    await expect(spot).toBeHidden();
  });

  test("Enter on a best decision shows one arrow in the second half", async ({ page }) => {
    await page.goto("/demos/football/");
    const rp = page.locator("[data-report]"), root = page.locator("[data-football]");
    await ready(rp);
    const i = report.highlights.best.findIndex((h) => report.decisions[h.decision].half === 1);
    test.skip(i < 0, "no best decision in the second half");
    const d = report.decisions[report.highlights.best[i].decision];
    await rp.locator("[data-rp-best] button").nth(i).focus();
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("data-spot", "true", { timeout: 30_000 });
    await expect(root.locator("[data-time]")).toHaveValue(String(d.frame));
    await expect(root.locator("[data-half='1']")).toHaveAttribute("aria-pressed", "true");
    await expect(root.locator("[data-spot]")).toContainText("only one arrow");
  });

  test("every highlight finds both options in the replay", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/demos/football/");
    const rp = page.locator("[data-report]"), root = page.locator("[data-football]");
    await ready(rp);
    for (const list of ["missed", "best"]) {
      for (let i = 0; i < 10; i++) {
        await root.evaluate((e) => { e.dataset.spot = "pending"; });
        await rp.locator(`[data-rp-${list}] button`).nth(i).click();
        await expect(root, `${list} ${i}`).toHaveAttribute("data-spot", "true", { timeout: 20_000 });
      }
    }
  });

  test("without report.json the section is hidden and the replay still works", async ({ page }) => {
    await page.route("**/football/report.json", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/demos/football/");
    const rp = page.locator("[data-report]"), root = page.locator("[data-football]");
    await rp.scrollIntoViewIfNeeded();
    await expect(rp).toBeHidden({ timeout: 15_000 });
    await root.hover();
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  });

  test("the report downloads nothing until it is near the screen", async ({ page }) => {
    const seen = [];
    page.on("request", (r) => { if (/football\/(report|match)\.json/.test(r.url())) seen.push(r.url()); });
    await page.goto("/demos/football/");
    await page.waitForLoadState("networkidle");
    expect(seen).toEqual([]);
    await ready(page.locator("[data-report]"));
    expect(seen.some((u) => u.endsWith("report.json"))).toBe(true);
  });
});
