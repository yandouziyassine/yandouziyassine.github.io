// Prints dist/resume/index.html to dist/cv/Yassine_Yandouzi_CV.pdf with headless Chromium.
// A tiny static server is used because the built pages reference /_astro/... absolute paths.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const DIST = path.resolve(import.meta.dirname, "..", "dist");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (p.endsWith(path.sep) || !path.extname(p)) p = path.join(p, "index.html");
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/resume/`, { waitUntil: "networkidle" });
fs.mkdirSync(path.join(DIST, "cv"), { recursive: true });
const out = path.join(DIST, "cv", "Yassine_Yandouzi_CV.pdf");
await page.pdf({ path: out, format: "A4", printBackground: false, preferCSSPageSize: true });
await browser.close();
server.close();
console.log(`PDF written: ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
