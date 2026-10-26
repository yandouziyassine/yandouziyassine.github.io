// Screenshots each dist/og/<slug>/index.html card (src/pages/og/) to dist/og/<slug>.jpg (1200x630), then removes
// the HTML so the templates are not served as pages.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { DIST, serveDist } from "./lib/serve-dist.mjs";

const OG = path.join(DIST, "og");
const slugs = fs.readdirSync(OG, { recursive: true })
  .filter((f) => path.basename(f) === "index.html")
  .map((f) => path.dirname(f).split(path.sep).join("/"));

const server = await serveDist();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const slug of slugs) {
  await page.goto(`${server.origin}/og/${slug}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(OG, `${slug}.jpg`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: "jpeg", quality: 86 });
}
await browser.close();
server.close();
for (const slug of slugs) fs.rmSync(path.join(OG, slug, "index.html"));
for (const dir of fs.readdirSync(OG, { recursive: true }).map((f) => path.join(OG, f)).sort().reverse())
  if (fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
console.log(`OG cards: ${slugs.length} written to dist/og/`);
