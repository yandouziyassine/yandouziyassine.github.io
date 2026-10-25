// One-off: turn legacy/data/projects.js + the CV library READMEs into one Markdown file per project.
// Usage: node scripts/migrate-projects.mjs [path-to-COMPUTER-VISION-PROJECT-LIBRARY]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { dump } from "js-yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIB = path.resolve(process.argv[2] || path.join(ROOT, "..", "COMPUTER-VISION-PROJECT-LIBRARY"));
const CVLIB = "https://github.com/yandouziyassine/COMPUTER-VISION-PROJECT-LIBRARY";
const OUT = path.join(ROOT, "src", "content", "projects");
const MEDIA = path.join(ROOT, "public", "media", "projects");

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "legacy", "data", "projects.js"), "utf8"), ctx);
const { FEATURED, PROJECTS, MORE } = ctx.window;

const FEATURED_CV = new Set(["13", "14", "20"]);    // shown on the home page

function write(slug, data, body) {
  fs.mkdirSync(OUT, { recursive: true });
  const clean = JSON.parse(JSON.stringify(data));     // drop undefined
  fs.writeFileSync(path.join(OUT, `${slug}.md`), `---\n${dump(clean, { lineWidth: 120 })}---\n\n${body.trim()}\n`);
}

// README body: drop the H1, copy images to /media/projects/<slug>/, turn other relative links into GitHub links.
function readmeBody(folder, slug) {
  // CRLF first: in JS regexes "." does not match "\r", so the title line would survive on Windows clones.
  const src = fs.readFileSync(path.join(LIB, folder, "README.md"), "utf8").replace(/\r\n/g, "\n").replace(/^# .*\n/, "");
  const media = path.join(MEDIA, slug);
  const isImage = (p) => /\.(png|jpe?g|gif|svg|webp)$/i.test(p);
  const rewrite = (target) => {
    if (/^(https?:|#|mailto:)/.test(target)) return target;
    const clean = target.replace(/^\.\//, "");
    if (isImage(clean)) {
      const from = path.join(LIB, folder, clean);
      if (fs.existsSync(from)) {
        fs.mkdirSync(media, { recursive: true });
        fs.copyFileSync(from, path.join(media, path.basename(clean)));
        return `/media/projects/${slug}/${path.basename(clean)}`;
      }
    }
    const resolved = path.posix.normalize(path.posix.join(folder, clean));
    return `${CVLIB}/${clean.endsWith("/") || !path.extname(clean) ? "tree" : "blob"}/main/${resolved}`;
  };
  return src
    .replace(/(!?\[[^\]]*\]\()([^)\s]+)(\))/g, (_, a, t, b) => a + rewrite(t) + b)
    .replace(/(<img[^>]*src=")([^"]+)(")/g, (_, a, t, b) => a + rewrite(t) + b);
}

const slugOf = (folder) => folder.replace(/^\d+-/, "");

for (const p of PROJECTS) {
  const folder = p.links[0].href.split("/tree/main/")[1];
  const slug = slugOf(folder);
  const demo = (p.links || []).find((l) => /demo/i.test(l.label));
  write(slug, {
    title: p.title, kind: "cv", number: p.n, area: p.area, depth: p.depth,
    featured: FEATURED_CV.has(p.n), order: Number(p.n), metric: p.metric, summary: p.summary,
    cover: p.image ? `/${p.image}` : undefined,
    links: { code: `${CVLIB}/tree/main/${folder}`, demo: demo?.href },
  }, readmeBody(folder, slug));
}

const software = [
  ...FEATURED.map((f, i) => ({ ...f, order: 200 + i })),
  ...MORE.map((m, i) => ({ title: m.title, kicker: m.when, summary: m.summary, stack: m.stack,
    links: [{ label: "Repository", href: m.href }], order: 300 + i })),
];
for (const s of software) {
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const code = (s.links || []).find((l) => /^https/.test(l.href))?.href;
  const body = [`*${s.kicker || ""}*`, "", s.summary, "", s.stack?.length ? `**Stack:** ${s.stack.join(" · ")}` : "",
    "", code ? `[Code and README on GitHub](${code})` : ""].join("\n");
  write(slug, {
    title: s.title, kind: "software", area: (s.tags && s.tags[0]) || "Software", order: s.order,
    metric: s.metric, summary: s.summary, stack: s.stack || [],
    cover: s.image ? `/${s.image}` : undefined, links: { code },
  }, body);
}
console.log(`wrote ${PROJECTS.length + software.length} projects to ${path.relative(ROOT, OUT)}`);
