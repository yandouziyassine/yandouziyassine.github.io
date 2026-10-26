// Lighthouse performance + accessibility (one mobile run each) on every built page, or on those matching the extra
// arguments: node scripts/lighthouse-all.mjs <dir for the JSON report> [path filter ...]. Run after npm run build.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DIST, serveDist } from "./lib/serve-dist.mjs";
const run = promisify(execFile);
const out = process.argv[2];
const only = process.argv.slice(3);
const all = fs.readdirSync(DIST, { recursive: true }).map(String).filter((f) => f.endsWith("index.html"))
  .map((f) => `/${path.dirname(f).split(path.sep).join("/")}/`.replace("/./", "/"));
const pages = only.length ? all.filter((u) => only.some((o) => u.includes(o))) : all;
const server = await serveDist();
for (const u of pages) {
  const json = path.join(out, "lh.json");
  try {
    await run(process.execPath, ["node_modules/lighthouse/cli/index.js", server.origin + u, "--only-categories=performance,accessibility",
      "--output=json", `--output-path=${json}`, "--quiet", "--chrome-flags=--headless=new"], { timeout: 120000 });
    const l = JSON.parse(fs.readFileSync(json, "utf8"));
    const bad = l.categories.accessibility.auditRefs.map((r) => l.audits[r.id]).filter((a) => a.score !== null && a.score < 1).map((a) => a.id);
    console.log(`${u} perf ${l.categories.performance.score} a11y ${l.categories.accessibility.score} LCP ${l.audits["largest-contentful-paint"].displayValue} ${bad.join(",")}`);
  } catch (e) { console.log(`${u} ERROR ${e.message.slice(0, 80)}`); }
}
server.close();
