// Prints dist/resume/index.html to dist/cv/Yassine_Yandouzi_CV.pdf with headless Chromium.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { DIST, serveDist } from "./lib/serve-dist.mjs";

const server = await serveDist();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${server.origin}/resume/`, { waitUntil: "networkidle" });
fs.mkdirSync(path.join(DIST, "cv"), { recursive: true });
const out = path.join(DIST, "cv", "Yassine_Yandouzi_CV.pdf");
await page.pdf({ path: out, format: "A4", printBackground: false, preferCSSPageSize: true });
await browser.close();
server.close();
console.log(`PDF written: ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
