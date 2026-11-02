// After npm run build: the football page must not load the 3D code (three.js + src/lib/football3d/scene.ts) up front,
// and the lazy 3D chunk's gzip size is reported (fails above BUNDLE_BUDGET_KB, default 200). Run: npm run test:bundle
// BUNDLE_DIST overrides dist/ (tests). Static imports are followed (import ... from "./x.js", import "./x.js");
// import("./x.js") is the lazy boundary. Markers: a three.js property name and the 3D scene's shader attribute.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIST = path.resolve(process.env.BUNDLE_DIST || path.join(import.meta.dirname, "..", "dist"));
const PAGE = path.join(DIST, "demos", "football", "index.html");
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB || 200);
const MARKERS = ["isWebGLRenderer", "aCell"];

if (!fs.existsSync(PAGE)) {
  console.log("bundle: no dist/demos/football/index.html (not built, or FOOTBALL_LIVE off), nothing checked");
  process.exit(0);
}
const read = (f) => fs.readFileSync(path.join(DIST, f), "utf8");
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(DIST, f)), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1);
const imports = (f) => [...read(f).matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+\.js)["']/g)]
  .map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
function closure(starts) {
  const seen = new Set(), todo = [...starts];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f) || !fs.existsSync(path.join(DIST, f))) continue;
    seen.add(f);
    todo.push(...imports(f));
  }
  return seen;
}

const html = fs.readFileSync(PAGE, "utf8");
const entries = [...html.matchAll(/<script\b[^>]*\bsrc="\/([^"]+\.js)"/g)].map((m) => m[1]);
const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const upfront = closure(entries);
const lazyEntry = fs.readdirSync(path.join(DIST, "_astro")).find((f) => /^view3d\..*\.js$/.test(f));
if (!lazyEntry) throw new Error("bundle: no _astro/view3d.*.js chunk (is the 3D view still loaded with import()?)");
const lazy = [...closure([`_astro/${lazyEntry}`])].filter((f) => !upfront.has(f)).sort();
const leaks = [...upfront].filter((f) => MARKERS.some((m) => read(f).includes(m)));
if (inline.some((s) => MARKERS.some((m) => s.includes(m)))) leaks.push("an inline <script>");
const upGz = [...upfront].reduce((s, f) => s + gz(f), 0), lazyGz = lazy.reduce((s, f) => s + gz(f), 0);

console.log(`bundle: /demos/football/ loads ${upfront.size} script(s) up front, ${kb(upGz)} kB gzip; ` +
  `the 3D view adds ${lazy.length} file(s), ${kb(lazyGz)} kB gzip, on first use`);
for (const f of lazy) console.log(`  ${f} ${kb(gz(f))} kB gzip`);
if (leaks.length) throw new Error(`bundle: 3D code is loaded up front in ${leaks.join(", ")}`);
if (lazyGz > BUDGET_KB * 1024) throw new Error(`bundle: the 3D code is ${kb(lazyGz)} kB gzip, over the ${BUDGET_KB} kB budget`);
