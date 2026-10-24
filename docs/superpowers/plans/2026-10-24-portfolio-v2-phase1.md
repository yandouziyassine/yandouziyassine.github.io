# Portfolio v2 · Phase 1 (Site) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the new multi-page Astro portfolio (home, demos, projects, one case study per project, résumé + PDF, contact, 404) on AWS S3 + CloudFront under a custom domain, deployed by GitHub Actions, with automated tests.

**Architecture:** Astro static site in the existing repo, developed on branch `v2` so the current GitHub Pages site stays online. Every project is one Markdown file in a content collection, generated once by a migration script from the old `data/projects.js` and the CV library READMEs. Infrastructure is three CloudFormation templates (bootstrap in us-east-1: GitHub OIDC deploy role + budget; certificate in us-east-1; site in ca-central-1: S3 + CloudFront + Route 53 records). A deploy workflow builds, tests and syncs `dist/` to S3.

**Tech Stack:** Node 24, Astro 7.4.2, js-yaml 5, Vitest 5, Playwright 1.64 (smoke tests + PDF printing), linkinator 8 (internal links), @lhci/cli 0.15 (Lighthouse budget), @astrojs/sitemap 3.7, AWS CloudFormation, GitHub Actions (`aws-actions/configure-aws-credentials@v4`).

**Facts the engineer needs:**
- Repo: `C:\Users\yando\Code\yandouziyassine.github.io` (GitHub `yandouziyassine/yandouziyassine.github.io`). CV library clone (source of READMEs and figures): `C:\Users\yando\Code\COMPUTER-VISION-PROJECT-LIBRARY`.
- Push with `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push` (Windows credential manager hangs).
- **Privacy rule (hard):** the owner's phone number and personal email must never appear in the repo, the built site or the PDF. Tests must use generic regexes only, never the real values.
- Design tokens to keep from the old site: `--bg #0d0e10`, `--bg-2 #141518`, `--panel #17191d`, `--line #262930`, `--line-2 #33373f`, `--ink #ecebe6`, `--ink-2 #a9a8a2`, `--ink-3 #6f6e6a`, `--signal #ff5b1f`, `--ok #7fd18b`; fonts Instrument Serif / Geist / Geist Mono (Google Fonts); the detection box drawn around the name.
- Phase 1 has no live painter yet (phase 2). The home hero's live demo slot embeds the existing PatchCore Space (`https://yandyassine-patchcore-defect-detection.static.hf.space/index.html`) until then.
- The AWS account, domain purchase and stack creation are done **by the owner** (console or the AWS MCP connector under the owner's sign-in). Nobody stores AWS keys: GitHub assumes a role through OIDC.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json`, `astro.config.mjs`, `tsconfig.json` | Astro project, scripts |
| `src/styles/global.css` | Tokens, base, grid background, shared components (cards, metric, buttons, detection box) |
| `src/layouts/Base.astro` | `<head>` (meta, OG, fonts, favicon), nav, footer, slot |
| `src/components/Nav.astro`, `Footer.astro` | Site navigation, footer links |
| `src/components/DetectionBox.astro` | Name inside the animated orange box with the "person 0.99" label |
| `src/components/Metric.astro` | Instrument-style number + unit |
| `src/components/ProjectCard.astro` | Card used on home and `/projects` |
| `src/content.config.ts` | `projects` collection schema |
| `src/content/projects/*.md` | One file per project (generated, then hand-editable) |
| `public/media/projects/<slug>/*` | Figures used by case studies (copied from the library) |
| `public/images/*` | Card covers (moved from the old site) |
| `src/data/resume.yaml` | Résumé content (no phone, no email) |
| `src/lib/resume.ts` | Loads and types `resume.yaml` |
| `src/pages/index.astro`, `demos.astro`, `projects/index.astro`, `projects/[slug].astro`, `resume.astro`, `contact.astro`, `404.astro` | Pages |
| `scripts/migrate-projects.mjs` | One-off generator: old data + READMEs → Markdown + figures |
| `scripts/build-pdf.mjs` | Prints `/resume/` to `dist/cv/Yassine_Yandouzi_CV.pdf` |
| `tests/privacy.test.mjs` | Vitest: no phone / email patterns in `dist/` and `resume.yaml` |
| `tests/content.test.mjs` | Vitest: every project has a page, every figure link resolves |
| `tests/smoke.spec.mjs`, `playwright.config.mjs` | Every page loads, no console errors |
| `lighthouserc.json` | Lighthouse budget |
| `infra/bootstrap.yaml`, `infra/certificate.yaml`, `infra/site.yaml`, `infra/README.md` | AWS infrastructure + owner instructions |
| `.github/workflows/ci.yml`, `deploy.yml` | Test on every push; deploy `main` to AWS |
| `legacy/` | The old static site (kept until go-live, then removed) |

---

### Task 1: Branch, scaffold Astro, park the old site

**Files:** Create `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro` (temporary); Move `index.html`, `assets/`, `data/` → `legacy/`; Move `images/` → `public/images/`.

- [ ] **Step 1: Create the branch and move files**

```bash
cd C:\Users\yando\Code\yandouziyassine.github.io
git checkout -b v2
mkdir legacy public
git mv index.html legacy/index.html
git mv assets legacy/assets
git mv data legacy/data
git mv images public/images
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "yandouziyassine-portfolio",
  "type": "module",
  "private": true,
  "engines": { "node": ">=22.23.4" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && node scripts/build-pdf.mjs",
    "preview": "astro preview --port 4321",
    "migrate": "node scripts/migrate-projects.mjs",
    "test": "vitest run",
    "test:links": "linkinator dist --recurse --skip \"^(?!http://localhost)\" --verbosity error",
    "test:smoke": "playwright test",
    "test:lhci": "lhci autorun"
  },
  "dependencies": {
    "astro": "7.4.2",
    "@astrojs/sitemap": "3.7.4",
    "js-yaml": "5.5.0"
  },
  "devDependencies": {
    "@lhci/cli": "0.15.1",
    "@playwright/test": "1.64.1",
    "linkinator": "8.1.0",
    "vitest": "5.0.5"
  }
}
```

- [ ] **Step 3: Write `astro.config.mjs`**

```js
// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// SITE_URL is set by the deploy workflow (custom domain); local builds use the CloudFront-less default.
export default defineConfig({
  site: process.env.SITE_URL || "https://yandouziyassine.github.io",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap()],
});
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist", "legacy"] }
```

- [ ] **Step 5: Temporary home page `src/pages/index.astro`**

```astro
---
---
<h1>Portfolio v2 (work in progress)</h1>
```

- [ ] **Step 6: Install and build**

Run: `npm install` then `npx astro build`
Expected: `1 page(s) built`, `dist/index.html` exists. Add `node_modules/`, `dist/`, `.astro/`, `.lighthouseci/`, `test-results/`, `playwright-report/` to `.gitignore`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "v2: scaffold Astro, park the old site in legacy/"
```

---

### Task 2: Design system, base layout, navigation, footer

**Files:** Create `src/styles/global.css`, `src/layouts/Base.astro`, `src/components/Nav.astro`, `src/components/Footer.astro`, `src/components/DetectionBox.astro`, `src/components/Metric.astro`.

- [ ] **Step 1: `src/styles/global.css`**

```css
:root {
  --bg: #0d0e10; --bg-2: #141518; --panel: #17191d; --line: #262930; --line-2: #33373f;
  --ink: #ecebe6; --ink-2: #a9a8a2; --ink-3: #6f6e6a;
  --signal: #ff5b1f; --signal-soft: rgba(255, 91, 31, 0.12); --ok: #7fd18b;
  --serif: "Instrument Serif", Georgia, serif; --sans: "Geist", ui-sans-serif, sans-serif;
  --mono: "Geist Mono", ui-monospace, monospace;
  --radius: 4px; --max: 1180px; color-scheme: dark;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--bg); color: var(--ink); font: 400 16px/1.6 var(--sans); -webkit-font-smoothing: antialiased;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 64px 64px; background-position: -1px -1px; background-attachment: fixed;
}
body::before { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: -1;
  background: radial-gradient(120% 80% at 50% 0%, transparent 30%, var(--bg) 75%); }
a { color: inherit; }
img { max-width: 100%; height: auto; }
::selection { background: var(--signal); color: #0d0e10; }
.wrap { max-width: var(--max); margin: 0 auto; padding: 0 clamp(16px, 4vw, 40px); }
.mono { font-family: var(--mono); letter-spacing: -0.01em; }
.eyebrow { font: 400 12px var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); }
h1, h2, h3 { font-weight: 400; }
.display { font: 400 clamp(40px, 7vw, 84px)/1 var(--serif); letter-spacing: -0.02em; margin: 0; }
.section { padding: clamp(56px, 9vw, 110px) 0 0; }
.section-head h2 { font: 400 clamp(34px, 5vw, 56px)/1 var(--serif); margin: 6px 0 10px; }
.lede { color: var(--ink-2); font-size: 18px; max-width: 680px; margin: 0; }
.btn { display: inline-flex; align-items: center; gap: 8px; font: 500 14px var(--mono); text-decoration: none;
  padding: 10px 16px; border: 1.5px solid var(--signal); border-radius: var(--radius); transition: background .2s, color .2s; }
.btn.primary, .btn:hover { background: var(--signal); color: #0d0e10; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font: 12px var(--mono); color: var(--ink-2); border: 1px solid var(--line-2); border-radius: 999px; padding: 3px 9px; }
.prose { max-width: 760px; font-size: 16.5px; }
.prose h2 { font: 400 32px/1.1 var(--serif); margin: 48px 0 12px; }
.prose h3 { font: 500 18px var(--sans); margin: 28px 0 8px; }
.prose p, .prose li { color: var(--ink-2); }
.prose a { text-decoration-color: var(--signal); text-underline-offset: 3px; }
.prose table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0; display: block; overflow-x: auto; }
.prose th, .prose td { border-bottom: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
.prose th { color: var(--ink); font-weight: 500; }
.prose img { border: 1px solid var(--line); border-radius: var(--radius); background: #fff; }
.prose code { font-family: var(--mono); font-size: .9em; background: var(--bg-2); padding: 1px 5px; border-radius: 3px; }
.prose pre { background: var(--bg-2); border: 1px solid var(--line); padding: 14px; overflow-x: auto; border-radius: var(--radius); }
.prose pre code { background: none; padding: 0; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
@media print {
  body { background: #fff; color: #111; background-image: none; }
  body::before, .site-nav, .site-footer, .no-print { display: none !important; }
}
```

- [ ] **Step 2: `src/components/DetectionBox.astro`**

```astro
---
interface Props { label?: string; score?: string }
const { label = "person", score = "0.99" } = Astro.props;
---
<span class="dbox">
  <span class="bbox" aria-hidden="true"><span class="bbox-label mono">{label} <b>{score}</b></span>
    <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i></span>
  <slot />
</span>
<style>
  .dbox { position: relative; display: inline-block; padding: .12em .22em .02em; }
  .bbox { position: absolute; inset: 0; border: 1.5px solid var(--signal); clip-path: inset(0 100% 100% 0);
    animation: draw 1.1s cubic-bezier(.7,0,.2,1) .4s forwards; }
  .bbox-label { position: absolute; left: -1.5px; bottom: 100%; transform: translateY(-2px); background: var(--signal);
    color: #0d0e10; font-size: 13px; line-height: 1; padding: 6px 8px; white-space: nowrap; }
  .c { position: absolute; width: 14px; height: 14px; border: 3px solid var(--signal); }
  .tl { top: -5px; left: -5px; border-right: 0; border-bottom: 0; } .tr { top: -5px; right: -5px; border-left: 0; border-bottom: 0; }
  .bl { bottom: -5px; left: -5px; border-right: 0; border-top: 0; } .br { bottom: -5px; right: -5px; border-left: 0; border-top: 0; }
  @keyframes draw { 0% { clip-path: inset(0 100% 100% 0); } 50% { clip-path: inset(0 0 100% 0); }
    100% { clip-path: inset(-40px -10px -10px -10px); } }
  @media (prefers-reduced-motion: reduce) { .bbox { clip-path: inset(-40px -10px -10px -10px); } }
</style>
```

- [ ] **Step 3: `src/components/Metric.astro`**

```astro
---
interface Props { value: string; unit: string }
const { value, unit } = Astro.props;
---
<div class="metric"><span class="v">{value}</span><span class="u mono">{unit}</span></div>
<style>
  .metric { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .v { font: 400 34px/1 var(--serif); color: var(--signal); }
  .u { font-size: 12.5px; color: var(--ink-2); }
</style>
```

- [ ] **Step 4: `src/components/Nav.astro`**

```astro
---
const links = [["/", "Home"], ["/demos/", "Demos"], ["/projects/", "Projects"], ["/resume/", "Résumé"], ["/contact/", "Contact"]];
const path = Astro.url.pathname;
const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
---
<header class="site-nav">
  <a class="mark" href="/" aria-label="Home"><span class="mark-box"></span><span class="mono">Yassine Yandouzi</span></a>
  <nav aria-label="Main">
    {links.map(([href, label]) => <a href={href} aria-current={active(href) ? "page" : undefined}>{label}</a>)}
    <a class="gh" href="https://github.com/yandouziyassine" target="_blank" rel="noopener">GitHub ↗</a>
  </nav>
</header>
<style>
  .site-nav { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; padding: 14px clamp(16px, 4vw, 40px); backdrop-filter: blur(10px);
    background: color-mix(in srgb, var(--bg) 80%, transparent); border-bottom: 1px solid var(--line); }
  .mark { display: flex; align-items: center; gap: 10px; text-decoration: none; font-size: 14px; }
  .mark-box { width: 16px; height: 16px; border: 2px solid var(--signal); position: relative; }
  .mark-box::after { content: ""; position: absolute; inset: 3px; background: var(--signal); }
  nav { display: flex; gap: clamp(14px, 2.5vw, 26px); font-size: 14px; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
  nav::-webkit-scrollbar { display: none; }
  nav a { text-decoration: none; color: var(--ink-2); padding: 2px 0; border-bottom: 1.5px solid transparent; }
  nav a:hover, nav a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--signal); }
  .gh { color: var(--signal) !important; }
  @media (max-width: 760px) { nav { width: 100%; order: 3; } }
</style>
```

- [ ] **Step 5: `src/components/Footer.astro`**

```astro
---
const year = new Date().getFullYear();
---
<footer class="site-footer wrap mono">
  <span>© {year} Yassine Yandouzi · Ottawa – Gatineau</span>
  <span>
    <a href="https://github.com/yandouziyassine" target="_blank" rel="noopener">GitHub</a> ·
    <a href="https://www.linkedin.com/in/yassine-yandouzi" target="_blank" rel="noopener">LinkedIn</a> ·
    <a href="https://huggingface.co/spaces/yandyassine/cv-project-library" target="_blank" rel="noopener">Hugging Face</a> ·
    <a href="/contact/">Contact</a>
  </span>
</footer>
<style>
  .site-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 110px;
    padding-top: 26px; padding-bottom: 40px; font-size: 12px; color: var(--ink-3); border-top: 1px solid var(--line); }
  .site-footer a { text-decoration: none; } .site-footer a:hover { color: var(--signal); }
</style>
```

- [ ] **Step 6: `src/layouts/Base.astro`**

```astro
---
import "../styles/global.css";
import Nav from "../components/Nav.astro";
import Footer from "../components/Footer.astro";
interface Props { title: string; description: string; image?: string }
const { title, description, image = "/images/cv-13.png" } = Astro.props;
const fullTitle = title === "Home" ? "Yassine Yandouzi · Computer Vision & ML" : `${title} · Yassine Yandouzi`;
const canonical = new URL(Astro.url.pathname, Astro.site);
const ogImage = new URL(image, Astro.site);
---
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={ogImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='3' y='3' width='26' height='26' fill='none' stroke='%23ff5b1f' stroke-width='3'/><rect x='11' y='11' width='10' height='10' fill='%23ff5b1f'/></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
</head>
<body>
  <Nav />
  <main id="main"><slot /></main>
  <Footer />
</body>
</html>
```

- [ ] **Step 7: Use the layout in the temporary home page and build**

`src/pages/index.astro`:
```astro
---
import Base from "../layouts/Base.astro";
import DetectionBox from "../components/DetectionBox.astro";
---
<Base title="Home" description="Portfolio v2 (work in progress)">
  <div class="wrap section"><h1 class="display"><DetectionBox>Yassine Yandouzi</DetectionBox></h1></div>
</Base>
```
Run: `npx astro build` → Expected: build completes, `dist/index.html` contains `class="site-nav"` and `person`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "v2: design tokens, base layout, nav, footer, detection box"
```

---

### Task 3: Projects content collection

**Files:** Create `src/content.config.ts`.

- [ ] **Step 1: Write the schema**

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projects = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    kind: z.enum(["cv", "software"]),          // CV library project or other software project
    number: z.string().optional(),              // "05" for CV library projects
    area: z.string(),
    depth: z.number().int().min(1).max(3).optional(),
    featured: z.boolean().default(false),
    order: z.number().default(100),
    metric: z.object({ value: z.string(), unit: z.string() }).optional(),
    summary: z.string(),
    stack: z.array(z.string()).default([]),
    cover: z.string().optional(),               // path under /public, e.g. /images/cv-13.png
    links: z.object({
      code: z.string().url().optional(),
      demo: z.string().url().optional(),
      huggingface: z.string().url().optional(),
    }).default({}),
  }),
});

export const collections = { projects };
```

- [ ] **Step 2: Commit**

```bash
git add src/content.config.ts
git commit -m "v2: projects content collection schema"
```

---

### Task 4: Migration script (old data + library READMEs → Markdown)

**Files:** Create `scripts/migrate-projects.mjs`; generates `src/content/projects/*.md` and `public/media/projects/<slug>/*`.

- [ ] **Step 1: Write `scripts/migrate-projects.mjs`**

```js
// One-off: turn legacy/data/projects.js + the CV library READMEs into one Markdown file per project.
// Usage: node scripts/migrate-projects.mjs [path-to-COMPUTER-VISION-PROJECT-LIBRARY]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import yaml from "js-yaml";

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
  fs.writeFileSync(path.join(OUT, `${slug}.md`), `---\n${yaml.dump(clean, { lineWidth: 120 })}---\n\n${body.trim()}\n`);
}

// README body: drop the H1, copy images to /media/projects/<slug>/, turn other relative links into GitHub links.
function readmeBody(folder, slug) {
  const src = fs.readFileSync(path.join(LIB, folder, "README.md"), "utf8").replace(/^# .*\n/, "");
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
```

- [ ] **Step 2: Run it**

Run: `node scripts/migrate-projects.mjs C:\Users\yando\Code\COMPUTER-VISION-PROJECT-LIBRARY`
Expected: `wrote 25 projects to src\content\projects`; `public/media/projects/` contains figure folders (e.g. `monocular-depth-3d/see_vs_infer.jpg`).

- [ ] **Step 3: Spot-check two files by eye**

Open `src/content/projects/anomaly-detection-patchcore.md` and `slipstream.md`: frontmatter valid YAML, images point to `/media/projects/...`, code links point to GitHub. Fix by hand if anything reads wrong (the script is one-off; the Markdown is now the source of truth).

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-projects.mjs src/content/projects public/media
git commit -m "v2: migrate all 25 projects to Markdown, with figures"
```

---

### Task 5: Project card, projects index, case-study pages

**Files:** Create `src/components/ProjectCard.astro`, `src/pages/projects/index.astro`, `src/pages/projects/[slug].astro`.

- [ ] **Step 1: `src/components/ProjectCard.astro`**

```astro
---
import type { CollectionEntry } from "astro:content";
import Metric from "./Metric.astro";
interface Props { p: CollectionEntry<"projects"> }
const { p } = Astro.props;
const d = p.data;
---
<article class="card" data-area={d.area}>
  <div class="media">
    {d.cover ? <img src={d.cover} alt="" loading="lazy" /> : <span class="empty">{d.title}</span>}
    {d.number && <span class="num mono">{d.number}</span>}
    {d.links.demo && <span class="live mono">Live demo</span>}
  </div>
  <div class="body">
    <span class="eyebrow">{d.area}</span>
    <h3><a class="stretch" href={`/projects/${p.id}/`}>{d.title}</a></h3>
    {d.metric && <Metric value={d.metric.value} unit={d.metric.unit} />}
    <p>{d.summary}</p>
    {d.links.demo && <a class="try mono" href={d.links.demo} target="_blank" rel="noopener">▶ Try it live</a>}
  </div>
</article>
<style>
  .card { position: relative; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); transition: border-color .2s, transform .2s; }
  .card:hover, .card:focus-within { border-color: var(--signal); transform: translateY(-2px); }
  .media { position: relative; aspect-ratio: 16 / 9; background: var(--bg-2); border-bottom: 1px solid var(--line); overflow: hidden; }
  .media img { width: 100%; height: 100%; object-fit: cover; object-position: top center; }
  .empty { display: grid; place-items: center; height: 100%; font: italic 400 24px var(--serif); color: var(--ink-3); }
  .num { position: absolute; top: 10px; left: 10px; font-size: 12px; background: var(--bg); border: 1px solid var(--line); padding: 2px 7px; }
  .live { position: absolute; top: 10px; right: 10px; font-size: 11px; background: var(--signal); color: #0d0e10; padding: 3px 8px;
    text-transform: uppercase; letter-spacing: .04em; border-radius: 3px; }
  .body { padding: 18px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
  h3 { margin: 0; font: 500 18px/1.25 var(--sans); }
  .stretch { text-decoration: none; } .stretch::after { content: ""; position: absolute; inset: 0; z-index: 1; }
  p { margin: 0; color: var(--ink-2); font-size: 14.5px; }
  .try { position: relative; z-index: 2; align-self: flex-start; font-size: 13px; color: var(--signal); text-decoration: none;
    border: 1px solid var(--signal); padding: 6px 12px; border-radius: var(--radius); }
  .try:hover { background: var(--signal); color: #0d0e10; }
</style>
```

- [ ] **Step 2: `src/pages/projects/index.astro`** (topic filter, no framework: plain script)

```astro
---
import Base from "../../layouts/Base.astro";
import ProjectCard from "../../components/ProjectCard.astro";
import { getCollection } from "astro:content";
const all = (await getCollection("projects")).sort((a, b) => a.data.order - b.data.order);
const areas = [...new Set(all.map((p) => p.data.area))].sort();
---
<Base title="Projects" description="Every project: 19 measured computer vision projects plus software and data work.">
  <div class="wrap section">
    <div class="section-head"><span class="eyebrow">Projects</span><h1 class="display">Everything I've built</h1>
      <p class="lede">{all.length} projects. Each computer vision project is measured on a real benchmark, with what didn't work.</p></div>
    <div class="filters" role="toolbar" aria-label="Filter by topic">
      <button class="chip" aria-pressed="true" data-f="*">All {all.length}</button>
      {areas.map((a) => <button class="chip" aria-pressed="false" data-f={a}>{a}</button>)}
    </div>
    <div class="grid">{all.map((p) => <ProjectCard p={p} />)}</div>
  </div>
</Base>
<script>
  const bar = document.querySelector(".filters")!;
  bar.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    bar.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    document.querySelectorAll<HTMLElement>(".card").forEach((c) => {
      c.hidden = b.dataset.f !== "*" && c.dataset.area !== b.dataset.f;
    });
  });
</script>
<style>
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 28px 0 22px; }
  .filters .chip { cursor: pointer; background: none; }
  .filters .chip[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 18px; }
</style>
```

- [ ] **Step 3: `src/pages/projects/[slug].astro`**

```astro
---
import Base from "../../layouts/Base.astro";
import Metric from "../../components/Metric.astro";
import { getCollection, render } from "astro:content";
export async function getStaticPaths() {
  const all = await getCollection("projects");
  return all.map((p) => ({ params: { slug: p.id }, props: { p } }));
}
const { p } = Astro.props;
const d = p.data;
const { Content } = await render(p);
---
<Base title={d.title} description={d.summary} image={d.cover}>
  <article class="wrap section">
    <a class="back mono" href="/projects/">← All projects</a>
    <header class="head">
      <span class="eyebrow">{d.number ? `Project ${d.number} · ` : ""}{d.area}</span>
      <h1 class="display">{d.title}</h1>
      <p class="lede">{d.summary}</p>
      {d.metric && <Metric value={d.metric.value} unit={d.metric.unit} />}
      <div class="actions">
        {d.links.demo && <a class="btn primary" href={d.links.demo} target="_blank" rel="noopener">▶ Try it live</a>}
        {d.links.code && <a class="btn" href={d.links.code} target="_blank" rel="noopener">Code on GitHub ↗</a>}
      </div>
      {d.stack.length > 0 && <div class="chips">{d.stack.map((s) => <span class="chip">{s}</span>)}</div>}
    </header>
    <div class="prose"><Content /></div>
  </article>
</Base>
<style>
  .back { font-size: 13px; color: var(--ink-3); text-decoration: none; } .back:hover { color: var(--signal); }
  .head { display: grid; gap: 16px; margin: 18px 0 30px; padding-bottom: 30px; border-bottom: 1px solid var(--line); }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
</style>
```

- [ ] **Step 4: Build**

Run: `npx astro build` → Expected: `27 page(s) built` or more (home + projects index + 25 case studies), no schema errors. If a migrated file fails the schema, fix that Markdown file.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "v2: project cards, projects index with topic filter, case-study pages"
```

---

### Task 6: Home page

**Files:** Modify `src/pages/index.astro`.

- [ ] **Step 1: Write the home page**

```astro
---
import Base from "../layouts/Base.astro";
import DetectionBox from "../components/DetectionBox.astro";
import ProjectCard from "../components/ProjectCard.astro";
import { getCollection } from "astro:content";
const all = await getCollection("projects");
const featured = all.filter((p) => p.data.featured).sort((a, b) => a.data.order - b.data.order);
const cvCount = all.filter((p) => p.data.kind === "cv").length;
const DEMO = "https://yandyassine-patchcore-defect-detection.static.hf.space/index.html";
---
<Base title="Home" description="Computer engineering student building computer vision you can try: measured projects and live demos.">
  <section class="wrap hero">
    <div class="intro">
      <p class="eyebrow"><span class="dot"></span> Computer engineering student · uOttawa · open to CV / ML internships</p>
      <h1 class="name"><DetectionBox>Yassine Yandouzi</DetectionBox></h1>
      <p class="pitch">I build computer vision you can try.</p>
      <p class="lede">{cvCount} measured computer vision projects, from classical OpenCV to foundation models, each with its
        benchmark number and what didn't work. Several run live, right here.</p>
      <div class="cta"><a class="btn primary" href="/demos/">▶ Try a demo</a><a class="btn" href="/resume/">Résumé</a></div>
    </div>
    <figure class="live panel">
      <figcaption class="mono"><span class="tag">LIVE</span> Defect detection running in your browser (PatchCore)</figcaption>
      <iframe src={DEMO} title="Live PatchCore defect detection demo" loading="lazy"></iframe>
    </figure>
  </section>

  <section class="wrap section">
    <div class="section-head"><span class="eyebrow">Featured</span><h2>Three projects, in depth</h2></div>
    <div class="grid">{featured.map((p) => <ProjectCard p={p} />)}</div>
    <p class="more"><a class="btn" href="/projects/">All {all.length} projects →</a></p>
  </section>

  <section class="wrap section about">
    <div class="section-head"><span class="eyebrow">About</span><h2>Measured, not just built</h2></div>
    <p class="lede">Third-year Computer Engineering (co-op) student at the University of Ottawa. I care about systems I can
      measure: a detector is only as good as its mAP on held-out data. Fluent in French and English, native Arabic.</p>
  </section>
</Base>
<style>
  .hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: clamp(24px, 4vw, 56px);
    align-items: center; padding-top: clamp(48px, 8vw, 96px); }
  .eyebrow { display: flex; align-items: center; gap: 10px; text-transform: none; letter-spacing: 0; font-size: 13px; color: var(--ink-2); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
  .name { font: 400 clamp(48px, 7.5vw, 104px)/0.95 var(--serif); margin: 34px 0 14px; letter-spacing: -0.02em; }
  .pitch { font: italic 400 clamp(24px, 3vw, 34px) var(--serif); color: var(--ink); margin: 0 0 12px; }
  .cta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
  .live { margin: 0; overflow: hidden; }
  .live figcaption { font-size: 12px; color: var(--ink-2); padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .tag { background: var(--signal); color: #0d0e10; padding: 2px 6px; border-radius: 3px; margin-right: 6px; }
  .live iframe { width: 100%; height: 560px; border: 0; display: block; background: var(--bg); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 18px; margin-top: 24px; }
  .more { margin-top: 24px; }
  @media (max-width: 900px) { .hero { grid-template-columns: 1fr; } .live iframe { height: 520px; } }
</style>
```

- [ ] **Step 2: Build and view**

Run: `npx astro dev`, open `http://localhost:4321/`. Expected: name in the orange box, the PatchCore demo loads in the right panel, 3 featured cards (13, 14, 20).

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "v2: demo-first home page"
```

---

### Task 7: Demos page

**Files:** Create `src/pages/demos.astro`.

- [ ] **Step 1: Write the page** (PatchCore live now; the three new demos are announced honestly with their phase)

```astro
---
import Base from "../layouts/Base.astro";
const demos = [
  { title: "Defect detection (PatchCore)", where: "Runs in your browser", status: "live",
    text: "Finds manufacturing defects without ever seeing one. Image AUROC 1.000 / 0.999 / 0.977 on MVTec AD.",
    href: "https://huggingface.co/spaces/yandyassine/patchcore-defect-detection",
    embed: "https://yandyassine-patchcore-defect-detection.static.hf.space/index.html", project: "/projects/anomaly-detection-patchcore/" },
  { title: "Virtual painter", where: "Will run in your browser (webcam)", status: "soon",
    text: "Draw in the air with your index finger: hand tracking with 21 landmarks and a gesture state machine.", project: "/projects/virtual-painter/" },
  { title: "Hard-hat safety check", where: "Will run in your browser", status: "soon",
    text: "Upload a site photo: 97.6 % of missing hard hats flagged at 96 % precision (2,001 test images).", project: "/projects/ppe-safety-monitor/" },
  { title: "License plate reader", where: "Will run on AWS", status: "soon",
    text: "Detects plates and reads them, with plate-format correction for O/0, I/1, S/5 confusions.", project: "/projects/license-plate-recognition/" },
];
---
<Base title="Demos" description="Computer vision demos you can try in your browser.">
  <div class="wrap section">
    <div class="section-head"><span class="eyebrow">Demos</span><h1 class="display">Try them</h1>
      <p class="lede">Browser demos run on your own device: your photos and webcam never leave it.</p></div>
    <div class="list">
      {demos.map((d) => (
        <section class="demo panel">
          <div class="meta">
            <span class={`status mono ${d.status}`}>{d.status === "live" ? "LIVE" : "COMING SOON"}</span>
            <h2>{d.title}</h2><p class="where mono">{d.where}</p><p>{d.text}</p>
            <p class="links"><a href={d.project}>Case study →</a>{d.href && <> · <a href={d.href} target="_blank" rel="noopener">Open full screen ↗</a></>}</p>
          </div>
          {d.embed && <iframe src={d.embed} title={d.title} loading="lazy"></iframe>}
        </section>
      ))}
    </div>
  </div>
</Base>
<style>
  .list { display: grid; gap: 18px; margin-top: 30px; }
  .demo { display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; }
  .meta { padding: 22px; } h2 { font: 400 30px/1.1 var(--serif); margin: 10px 0 4px; }
  .where { color: var(--ink-3); font-size: 12px; margin: 0 0 8px; } p { color: var(--ink-2); margin: 0 0 8px; }
  .status { font-size: 11px; padding: 3px 8px; border-radius: 3px; }
  .status.live { background: var(--signal); color: #0d0e10; } .status.soon { border: 1px solid var(--line-2); color: var(--ink-3); }
  iframe { width: 100%; height: 620px; border: 0; border-top: 1px solid var(--line); }
  .links a { color: var(--ink); text-decoration-color: var(--signal); }
</style>
```

- [ ] **Step 2: Check the project slugs exist**

Run: `ls src/content/projects` → Expected to include `anomaly-detection-patchcore.md`, `virtual-painter.md`, `ppe-safety-monitor.md`, `license-plate-recognition.md`. If a slug differs, update the `project` paths above.

- [ ] **Step 3: Commit**

```bash
git add src/pages/demos.astro
git commit -m "v2: demos page"
```

---

### Task 8: Résumé data and page

**Files:** Create `src/data/resume.yaml`, `src/lib/resume.ts`, `src/pages/resume.astro`.

- [ ] **Step 1: `src/data/resume.yaml`** (entries of the English CV dated 2026-09-28; no phone, no email)

```yaml
name: Yassine Yandouzi
headline: Computer Engineering student (co-op) · Computer vision, ML and AI security
location: Ottawa – Gatineau, ON / QC
links:
  - { label: Portfolio, url: "https://yandouziyassine.github.io" }
  - { label: GitHub, url: "https://github.com/yandouziyassine" }
  - { label: LinkedIn, url: "https://www.linkedin.com/in/yassine-yandouzi" }
education:
  - school: University of Ottawa
    degree: Bachelor of Applied Science, Computer Engineering (co-op), third year
    dates: Sep. 2024 – May 2028
    place: Ottawa, ON
    details: "Relevant coursework: Data Structures & Algorithms, Software Construction I & II, Computer Architecture I–III, Digital Systems I & II, Signals & Systems, Networking & Data Communication (CCNA track), Probability & Statistics"
projects:
  - name: Computer Vision Project Library
    dates: 2026
    stack: PyTorch, YOLO11, OpenVINO, ONNX, CLIP, SAM, OpenCV
    points:
      - "19 end-to-end computer vision projects, each measured on a public benchmark, e.g. PatchCore reimplemented from scratch (image AUROC 1.000 / 0.999 / 0.977 on MVTec AD)"
      - "Deployed detectors 17× faster on a laptop iGPU/NPU with OpenVINO and INT8; browser demo with ONNX Runtime Web"
  - name: JoBaI, AI-powered job application platform
    dates: 2025 – 2026
    stack: Next.js 16, React 19, Firebase, DeepSeek API, Stripe, MCP, Vercel
    points:
      - "Built and shipped a full-stack platform that tailors résumés and cover letters per posting and grades them with an ATS score (0–100 plus missing keywords)"
      - "Hardened every API route against IDOR with Firebase ID-token verification, Zod validation and default-deny Firestore rules; remote MCP server with OAuth 2.1 (PKCE + DCR)"
  - name: Universal File Converter
    dates: Dec. 2025
    stack: Java, Spring Boot, Apache POI, Docker, AWS/Railway
    points:
      - "Production REST API for batch conversion of 7+ file formats (PDF, DOCX, HEIC, TIFF) up to 1 GB per upload"
  - name: Financial Risk Analytics Dashboard, PolyFinance Datathon 2025
    dates: Nov. 2025
    stack: Python, FastAPI, React, scikit-learn, spaCy, Docker, AWS
    points:
      - "Top 10 finish: interactive risk dashboard over real financial datasets"
experience:
  - role: Crew Member
    org: Top Karting
    dates: May 2024 – Present
    place: Gatineau, QC
    points:
      - "Redesigned scheduling workflows and standardized reporting, improving operational efficiency by 35 %"
      - "Team of 10 serving 150+ customers per event; performance summaries and bottleneck analysis for management"
  - role: Student Painter
    org: Student Works Painting
    dates: Summer 2023
    place: Gatineau, QC
    points:
      - "Prepped and painted residential interiors and exteriors as part of a small crew"
  - role: Customer Service Attendant
    org: Couche-Tard
    dates: Oct. 2022 – May 2023
    place: Gatineau, QC
    points:
      - "Served customers at a busy convenience store, processing cash, card, fuel and lottery transactions accurately"
skills:
  - { group: Languages, items: "Python, Java, JavaScript, TypeScript, C, C++, SQL, HTML/CSS, Assembly, MATLAB" }
  - { group: Computer vision & ML, items: "PyTorch, YOLO, OpenCV, ONNX, OpenVINO, scikit-learn, Hugging Face" }
  - { group: Frameworks, items: "React, Next.js, Node.js, NestJS, FastAPI, Spring Boot, Flask, Django, Tailwind CSS" }
  - { group: Tools & platforms, items: "Git, Docker, GitHub Actions, CircleCI, AWS, Google Cloud, Azure, Vercel, Redis, Linux, Raspberry Pi, FPGA (Quartus II)" }
  - { group: AI & security, items: "MCP servers, OAuth 2.1 (PKCE), OpenAI/DeepSeek APIs, nmap, Wireshark, MITRE ATT&CK" }
languages: "French (fluent) · English (fluent) · Arabic (native)"
```

- [ ] **Step 2: `src/lib/resume.ts`**

```ts
import fs from "node:fs";
import yaml from "js-yaml";

export interface Entry { points?: string[]; dates: string; [key: string]: unknown }
export interface Resume {
  name: string; headline: string; location: string;
  links: { label: string; url: string }[];
  education: (Entry & { school: string; degree: string; place: string; details: string })[];
  projects: (Entry & { name: string; stack: string })[];
  experience: (Entry & { role: string; org: string; place: string })[];
  skills: { group: string; items: string }[];
  languages: string;
}

export function loadResume(): Resume {
  return yaml.load(fs.readFileSync(new URL("../data/resume.yaml", import.meta.url), "utf8")) as Resume;
}
```

- [ ] **Step 3: `src/pages/resume.astro`** (screen + print in one; the PDF is printed from this page)

```astro
---
import Base from "../layouts/Base.astro";
import { loadResume } from "../lib/resume";
const r = loadResume();
---
<Base title="Résumé" description={`${r.name}: ${r.headline}`}>
  <div class="wrap section cv">
    <header>
      <h1>{r.name}</h1>
      <p class="headline">{r.headline}</p>
      <p class="contact mono">{r.location} · {r.links.map((l, i) => <>{i > 0 && " · "}<a href={l.url}>{l.url.replace(/^https:\/\/(www\.)?/, "")}</a></>)}</p>
      <p class="no-print"><a class="btn primary" href="/cv/Yassine_Yandouzi_CV.pdf" download>Download PDF</a></p>
    </header>
    <section><h2>Education</h2>
      {r.education.map((e) => <div class="item"><div class="row"><b>{e.school}</b><span>{e.dates}</span></div>
        <div class="row sub"><i>{e.degree}</i><span>{e.place}</span></div><p>{e.details}</p></div>)}
    </section>
    <section><h2>Projects</h2>
      {r.projects.map((p) => <div class="item"><div class="row"><b>{p.name}</b><span>{p.dates}</span></div>
        <div class="sub"><i>{p.stack}</i></div><ul>{p.points?.map((x) => <li>{x}</li>)}</ul></div>)}
    </section>
    <section><h2>Experience</h2>
      {r.experience.map((e) => <div class="item"><div class="row"><b>{e.role}</b><span>{e.dates}</span></div>
        <div class="row sub"><i>{e.org}</i><span>{e.place}</span></div><ul>{e.points?.map((x) => <li>{x}</li>)}</ul></div>)}
    </section>
    <section><h2>Skills</h2>
      {r.skills.map((s) => <p><b>{s.group}:</b> {s.items}</p>)}
    </section>
    <section><h2>Languages</h2><p>{r.languages}</p></section>
  </div>
</Base>
<style>
  .cv { max-width: 860px; }
  h1 { font: 400 clamp(40px, 6vw, 64px)/1 var(--serif); margin: 0; }
  .headline { font: italic 400 22px var(--serif); color: var(--ink-2); margin: 6px 0; }
  .contact { font-size: 13px; color: var(--ink-3); } .contact a { color: var(--ink-2); }
  h2 { font: 500 13px var(--mono); text-transform: uppercase; letter-spacing: .08em; color: var(--signal);
    border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 34px 0 12px; }
  .item { margin-bottom: 16px; } .row { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .sub { color: var(--ink-2); font-size: 14.5px; } ul { margin: 6px 0 0; padding-left: 18px; } li, p { color: var(--ink-2); }
  @media print {
    .cv { max-width: none; padding: 0; } h1 { font-size: 30px; color: #111; } .headline { font-size: 15px; color: #333; }
    h2 { color: #b23a00; border-color: #ccc; margin: 14px 0 6px; font-size: 11px; }
    li, p, .sub, .contact, .contact a { color: #222; font-size: 10.5pt; } .item { margin-bottom: 8px; break-inside: avoid; }
    .section { padding-top: 0; }
  }
  @page { size: A4; margin: 14mm 14mm; }
</style>
```

- [ ] **Step 4: Build and view**

Run: `npx astro dev`, open `/resume/`. Expected: sections render; no phone, no email anywhere on the page.

- [ ] **Step 5: Commit**

```bash
git add src/data/resume.yaml src/lib/resume.ts src/pages/resume.astro
git commit -m "v2: résumé page from resume.yaml (no phone or email)"
```

---

### Task 9: PDF CV printed at build time

**Files:** Create `scripts/build-pdf.mjs`.

- [ ] **Step 1: Write the script**

```js
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
```

- [ ] **Step 2: Install the browser and build**

Run: `npx playwright install chromium` then `npm run build`
Expected: `PDF written: dist\cv\Yassine_Yandouzi_CV.pdf (... KB)`. Open the PDF: 1–2 A4 pages, no navigation, no phone or email.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-pdf.mjs
git commit -m "v2: print the résumé to PDF at build time"
```

---

### Task 10: Contact and 404 pages

**Files:** Create `src/pages/contact.astro`, `src/pages/404.astro`.

- [ ] **Step 1: `src/pages/contact.astro`** (phase 1: links only; the form arrives in phase 3)

```astro
---
import Base from "../layouts/Base.astro";
---
<Base title="Contact" description="How to reach Yassine Yandouzi.">
  <div class="wrap section">
    <div class="section-head"><span class="eyebrow">Contact</span><h1 class="display">Let's talk.</h1>
      <p class="lede">The fastest ways to reach me today. A contact form that forwards to my inbox is coming soon.</p></div>
    <div class="ways">
      <a class="btn primary" href="https://www.linkedin.com/in/yassine-yandouzi" target="_blank" rel="noopener">LinkedIn ↗</a>
      <a class="btn" href="https://github.com/yandouziyassine" target="_blank" rel="noopener">GitHub ↗</a>
    </div>
  </div>
</Base>
<style> .ways { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; } </style>
```

- [ ] **Step 2: `src/pages/404.astro`**

```astro
---
import Base from "../layouts/Base.astro";
import DetectionBox from "../components/DetectionBox.astro";
---
<Base title="Not found" description="Page not found.">
  <div class="wrap section">
    <h1 class="display"><DetectionBox label="page" score="0.00">404</DetectionBox></h1>
    <p class="lede" style="margin-top:24px">No object detected at this address. <a href="/">Back to the home page →</a></p>
  </div>
</Base>
```

- [ ] **Step 3: Build and commit**

Run: `npm run build` → Expected: `dist/404.html` and `dist/contact/index.html` exist.
```bash
git add src/pages/contact.astro src/pages/404.astro
git commit -m "v2: contact and 404 pages"
```

---

### Task 11: Tests (privacy, content, smoke, links, Lighthouse)

**Files:** Create `tests/privacy.test.mjs`, `tests/content.test.mjs`, `tests/smoke.spec.mjs`, `playwright.config.mjs`, `vitest.config.mjs`, `lighthouserc.json`.

- [ ] **Step 1: `vitest.config.mjs`** (Vitest must not pick up the Playwright spec)

```js
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.mjs"] } });
```

- [ ] **Step 2: `tests/privacy.test.mjs`** (generic patterns only: the real values must never be written in the repo)

```js
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const TEXT = new Set([".html", ".xml", ".txt", ".js", ".css", ".json", ".md"]);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

describe("no personal contact details are published", () => {
  it("resume.yaml has no phone number or email", () => {
    const src = fs.readFileSync("src/data/resume.yaml", "utf8");
    expect(src).not.toMatch(PHONE);
    expect(src).not.toMatch(EMAIL);
  });

  it("no built text file contains a phone number or an email address", () => {
    expect(fs.existsSync(DIST), "run npm run build first").toBe(true);
    const hits = files(DIST).filter((f) => TEXT.has(path.extname(f))).flatMap((f) => {
      const text = fs.readFileSync(f, "utf8");
      return [PHONE, EMAIL].filter((re) => re.test(text)).map((re) => `${path.relative(DIST, f)} matches ${re}`);
    });
    expect(hits).toEqual([]);
  });

  it("the PDF exists and is small (printed from the checked page, not a hand-made file)", () => {
    const pdf = path.join(DIST, "cv", "Yassine_Yandouzi_CV.pdf");
    expect(fs.existsSync(pdf)).toBe(true);
    expect(fs.statSync(pdf).size).toBeLessThan(2_000_000);
  });
});
```

- [ ] **Step 3: `tests/content.test.mjs`**

```js
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projects = fs.readdirSync("src/content/projects").filter((f) => f.endsWith(".md"));

describe("projects", () => {
  it("has the 25 migrated projects", () => {
    expect(projects.length).toBeGreaterThanOrEqual(25);
  });

  it("every project has a built case-study page", () => {
    const missing = projects.map((f) => f.replace(/\.md$/, "")).filter((s) => !fs.existsSync(path.join("dist", "projects", s, "index.html")));
    expect(missing).toEqual([]);
  });

  it("every local image a project links to exists in public/", () => {
    const broken = projects.flatMap((f) => {
      const md = fs.readFileSync(path.join("src/content/projects", f), "utf8");
      return [...md.matchAll(/(?:\]\(|src="|cover: )(\/(?:media|images)\/[^)"\s]+)/g)]
        .map((m) => m[1]).filter((p) => !fs.existsSync(path.join("public", p)));
    });
    expect(broken).toEqual([]);
  });
});
```

- [ ] **Step 4: `playwright.config.mjs` and `tests/smoke.spec.mjs`**

```js
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests", testMatch: "*.spec.mjs",
  use: { baseURL: "http://localhost:4321" },
  webServer: { command: "npm run preview", url: "http://localhost:4321", reuseExistingServer: true, timeout: 60_000 },
});
```

```js
import { test, expect } from "@playwright/test";

const pages = ["/", "/demos/", "/projects/", "/projects/anomaly-detection-patchcore/", "/projects/slipstream/", "/resume/", "/contact/"];

for (const url of pages) {
  test(`${url} loads without console errors`, async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !m.location().url.includes("hf.space")) errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(url);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("project filter hides other topics", async ({ page }) => {
  await page.goto("/projects/");
  const total = await page.locator(".card").count();
  await page.locator(".filters button").nth(1).click();
  const visible = await page.locator(".card:visible").count();
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(total);
});
```

- [ ] **Step 5: `lighthouserc.json`**

```json
{
  "ci": {
    "collect": { "staticDistDir": "./dist", "url": ["http://localhost/projects/", "http://localhost/resume/", "http://localhost/projects/monocular-depth-3d/"], "numberOfRuns": 1 },
    "assert": { "assertions": {
      "categories:performance": ["error", { "minScore": 0.9 }],
      "categories:accessibility": ["error", { "minScore": 0.9 }],
      "categories:seo": ["warn", { "minScore": 0.9 }]
    } }
  }
}
```

- [ ] **Step 6: Run everything**

Run: `npm run build; npm test; npm run test:links; npm run test:smoke; npm run test:lhci`
Expected: all pass. The home page is not in the Lighthouse list because the embedded Hugging Face demo is a third party; it is covered by the smoke test. Fix any accessibility failure (usually colour contrast or a missing `alt`/label) before committing.

- [ ] **Step 7: Commit**

```bash
git add tests vitest.config.mjs playwright.config.mjs lighthouserc.json
git commit -m "v2: privacy, content, smoke, link and Lighthouse tests"
```

---

### Task 12: CI workflow

**Files:** Create `.github/workflows/ci.yml`.

- [ ] **Step 1: Write the workflow**

```yaml
name: ci
on:
  push:
    branches-ignore: [main]
  pull_request:
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm test
      - run: npm run test:links
      - run: npm run test:smoke
      - run: npm run test:lhci
```

- [ ] **Step 2: Push the branch and check CI**

```bash
git add .github/workflows/ci.yml
git commit -m "v2: CI workflow"
git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -u origin v2
gh run watch -R yandouziyassine/yandouziyassine.github.io --exit-status
```
Expected: the `ci` run succeeds. GitHub Pages is unaffected (it still serves `main`).

---

### Task 13: AWS infrastructure templates

**Files:** Create `infra/bootstrap.yaml`, `infra/certificate.yaml`, `infra/site.yaml`.

- [ ] **Step 1: `infra/bootstrap.yaml`** (deploy in **us-east-1**: GitHub deploy role through OIDC + budget alerts)

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Portfolio bootstrap - GitHub OIDC deploy role and budget alerts
Parameters:
  GitHubRepo: { Type: String, Default: yandouziyassine/yandouziyassine.github.io }
  BucketName: { Type: String, Description: Name the site bucket will have (same value as in site.yaml) }
  AlertEmail: { Type: String, Description: Where AWS sends budget alerts (never stored in the repo) }
Resources:
  GitHubOidc:
    Type: AWS::IAM::OIDCProvider
    Properties:
      Url: https://token.actions.githubusercontent.com
      ClientIdList: [sts.amazonaws.com]
  DeployRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: portfolio-github-deploy
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal: { Federated: !Ref GitHubOidc }
            Action: sts:AssumeRoleWithWebIdentity
            Condition:
              StringEquals: { "token.actions.githubusercontent.com:aud": sts.amazonaws.com }
              StringLike: { "token.actions.githubusercontent.com:sub": !Sub "repo:${GitHubRepo}:ref:refs/heads/main" }
      Policies:
        - PolicyName: deploy-site
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action: [s3:ListBucket]
                Resource: !Sub arn:aws:s3:::${BucketName}
              - Effect: Allow
                Action: [s3:PutObject, s3:DeleteObject, s3:GetObject]
                Resource: !Sub arn:aws:s3:::${BucketName}/*
              - Effect: Allow
                Action: [cloudfront:CreateInvalidation]
                Resource: !Sub arn:aws:cloudfront::${AWS::AccountId}:distribution/*
  MonthlyBudget:
    Type: AWS::Budgets::Budget
    Properties:
      Budget:
        BudgetName: portfolio-monthly
        BudgetType: COST
        TimeUnit: MONTHLY
        BudgetLimit: { Amount: 20, Unit: USD }
      NotificationsWithSubscribers:
        - Notification: { NotificationType: ACTUAL, ComparisonOperator: GREATER_THAN, Threshold: 25 }
          Subscribers: [{ SubscriptionType: EMAIL, Address: !Ref AlertEmail }]
        - Notification: { NotificationType: ACTUAL, ComparisonOperator: GREATER_THAN, Threshold: 100 }
          Subscribers: [{ SubscriptionType: EMAIL, Address: !Ref AlertEmail }]
Outputs:
  DeployRoleArn: { Value: !GetAtt DeployRole.Arn }
```

(Thresholds are percent of $20: 25 % = $5, 100 % = $20.)

- [ ] **Step 2: `infra/certificate.yaml`** (deploy in **us-east-1**; CloudFront only accepts certificates from there)

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Portfolio TLS certificate for CloudFront
Parameters:
  DomainName: { Type: String, Description: "e.g. yassineyandouzi.dev" }
  HostedZoneId: { Type: AWS::Route53::HostedZone::Id }
Resources:
  Certificate:
    Type: AWS::CertificateManager::Certificate
    Properties:
      DomainName: !Ref DomainName
      SubjectAlternativeNames: [!Sub "www.${DomainName}"]
      ValidationMethod: DNS
      DomainValidationOptions:
        - { DomainName: !Ref DomainName, HostedZoneId: !Ref HostedZoneId }
        - { DomainName: !Sub "www.${DomainName}", HostedZoneId: !Ref HostedZoneId }
Outputs:
  CertificateArn: { Value: !Ref Certificate }
```

- [ ] **Step 3: `infra/site.yaml`** (deploy in **ca-central-1**; works without a domain first, then with it)

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Portfolio static site - private S3 bucket behind CloudFront, optional custom domain
Parameters:
  BucketName: { Type: String }
  DomainName: { Type: String, Default: "", Description: "Leave empty until the domain exists" }
  CertificateArn: { Type: String, Default: "" }
  HostedZoneId: { Type: String, Default: "" }
Conditions:
  HasDomain: !Not [!Equals [!Ref DomainName, ""]]
Resources:
  Bucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref BucketName
      PublicAccessBlockConfiguration:
        { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true }
      BucketEncryption:
        ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: AES256 } }]
  OriginAccessControl:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: !Sub "${BucketName}-oac"
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4
  IndexRewrite:
    Type: AWS::CloudFront::Function
    Properties:
      Name: !Sub "${AWS::StackName}-index"
      AutoPublish: true
      FunctionConfig: { Comment: "/path/ -> /path/index.html", Runtime: cloudfront-js-2.0 }
      FunctionCode: |
        function handler(event) {
          var r = event.request;
          if (r.uri.endsWith('/')) { r.uri += 'index.html'; }
          else if (r.uri.lastIndexOf('.') < r.uri.lastIndexOf('/')) { r.uri += '/index.html'; }
          return r;
        }
  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        HttpVersion: http2and3
        PriceClass: PriceClass_100
        DefaultRootObject: index.html
        Aliases: !If [HasDomain, [!Ref DomainName, !Sub "www.${DomainName}"], !Ref AWS::NoValue]
        ViewerCertificate: !If
          - HasDomain
          - { AcmCertificateArn: !Ref CertificateArn, SslSupportMethod: sni-only, MinimumProtocolVersion: TLSv1.2_2021 }
          - { CloudFrontDefaultCertificate: true }
        Origins:
          - Id: site
            DomainName: !GetAtt Bucket.RegionalDomainName
            OriginAccessControlId: !GetAtt OriginAccessControl.Id
            S3OriginConfig: { OriginAccessIdentity: "" }
        DefaultCacheBehavior:
          TargetOriginId: site
          ViewerProtocolPolicy: redirect-to-https
          Compress: true
          CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6          # Managed-CachingOptimized
          ResponseHeadersPolicyId: 67f7725c-6f97-4210-82d7-5512b31e9d03 # Managed-SecurityHeadersPolicy
          FunctionAssociations:
            - { EventType: viewer-request, FunctionARN: !GetAtt IndexRewrite.FunctionMetadata.FunctionARN }
        CustomErrorResponses:
          - { ErrorCode: 403, ResponseCode: 404, ResponsePagePath: /404.html }
          - { ErrorCode: 404, ResponseCode: 404, ResponsePagePath: /404.html }
  BucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref Bucket
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal: { Service: cloudfront.amazonaws.com }
            Action: s3:GetObject
            Resource: !Sub "${Bucket.Arn}/*"
            Condition: { StringEquals: { "AWS:SourceArn": !Sub "arn:aws:cloudfront::${AWS::AccountId}:distribution/${Distribution}" } }
  RecordApex:
    Type: AWS::Route53::RecordSetGroup
    Condition: HasDomain
    Properties:
      HostedZoneId: !Ref HostedZoneId
      RecordSets:
        - { Name: !Ref DomainName, Type: A, AliasTarget: { DNSName: !GetAtt Distribution.DomainName, HostedZoneId: Z2FDTNDATAQYW2 } }
        - { Name: !Ref DomainName, Type: AAAA, AliasTarget: { DNSName: !GetAtt Distribution.DomainName, HostedZoneId: Z2FDTNDATAQYW2 } }
        - { Name: !Sub "www.${DomainName}", Type: A, AliasTarget: { DNSName: !GetAtt Distribution.DomainName, HostedZoneId: Z2FDTNDATAQYW2 } }
        - { Name: !Sub "www.${DomainName}", Type: AAAA, AliasTarget: { DNSName: !GetAtt Distribution.DomainName, HostedZoneId: Z2FDTNDATAQYW2 } }
Outputs:
  BucketName: { Value: !Ref Bucket }
  DistributionId: { Value: !Ref Distribution }
  DistributionDomain: { Value: !GetAtt Distribution.DomainName }
```

- [ ] **Step 4: Validate the templates locally (no AWS account needed)**

```bash
pip install cfn-lint
cfn-lint infra/bootstrap.yaml infra/certificate.yaml infra/site.yaml
```
Expected: no errors (warnings about the managed policy IDs can be ignored).

- [ ] **Step 5: Commit**

```bash
git add infra
git commit -m "v2: CloudFormation for deploy role, budget, certificate and site"
```

---

### Task 14: Deploy workflow

**Files:** Create `.github/workflows/deploy.yml`.

- [ ] **Step 1: Write the workflow** (skips cleanly until the repo variables exist)

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  id-token: write
  contents: read
concurrency: { group: deploy, cancel-in-progress: false }
jobs:
  deploy:
    if: ${{ vars.AWS_ROLE_ARN != '' }}
    runs-on: ubuntu-latest
    env:
      SITE_URL: ${{ vars.SITE_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm test
      - run: npm run test:links
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_ROLE_ARN }}
          aws-region: ca-central-1
      - name: Upload hashed assets (cached for a year)
        run: aws s3 sync dist/_astro "s3://${{ vars.S3_BUCKET }}/_astro" --cache-control "public,max-age=31536000,immutable"
      - name: Upload everything else (cached 5 minutes)
        run: aws s3 sync dist "s3://${{ vars.S3_BUCKET }}" --delete --exclude "_astro/*" --cache-control "public,max-age=300"
      - name: Refresh CloudFront
        run: aws cloudfront create-invalidation --distribution-id "${{ vars.CF_DISTRIBUTION_ID }}" --paths "/*"
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/deploy.yml
git commit -m "v2: deploy workflow (GitHub OIDC -> S3 + CloudFront)"
git -c credential.helper= -c "credential.helper=!gh auth git-credential" push
```

---

### Task 15: Owner AWS setup (done with the owner, in their account)

**Files:** Create `infra/README.md`.

- [ ] **Step 1: Write `infra/README.md`**

```markdown
# AWS setup (one time, by the account owner)

Nothing here needs AWS keys on a computer: stacks are created from the AWS console (CloudFormation → Create stack →
Upload a template file), or through the AWS MCP connector while you are signed in.

1. **Domain:** Route 53 → Registered domains → register (e.g. `yassineyandouzi.dev`, ~$15/year). Route 53 creates
   the hosted zone; note its **Hosted zone ID**.
2. **Bootstrap** (region **us-east-1**): stack `portfolio-bootstrap` from `bootstrap.yaml`. Parameters: `BucketName`
   = `yandouzi-portfolio-<12-digit account id>`, `AlertEmail` = your address (stays in AWS only). Confirm the budget
   alert e-mail AWS sends you. Note output `DeployRoleArn`.
3. **Certificate** (region **us-east-1**): stack `portfolio-certificate` from `certificate.yaml` with `DomainName` and
   `HostedZoneId`. Wait for `CREATE_COMPLETE` (DNS validation is automatic, ~5 min). Note `CertificateArn`.
4. **Site** (region **ca-central-1**): stack `portfolio-site` from `site.yaml` with `BucketName`, `DomainName`,
   `CertificateArn`, `HostedZoneId`. Note `DistributionId`.
5. **GitHub** → repo Settings → Secrets and variables → Actions → **Variables** (not secrets, none are sensitive):
   `AWS_ROLE_ARN`, `S3_BUCKET`, `CF_DISTRIBUTION_ID`, `SITE_URL` (= `https://<your domain>`).
```

- [ ] **Step 2: Walk the owner through steps 1–5** (the owner performs purchases and sign-in; Claude may create the stacks through the AWS MCP connector only after the owner confirms each one). Then set the repo variables:

```bash
gh variable set AWS_ROLE_ARN -R yandouziyassine/yandouziyassine.github.io -b "<DeployRoleArn>"
gh variable set S3_BUCKET -R yandouziyassine/yandouziyassine.github.io -b "<BucketName>"
gh variable set CF_DISTRIBUTION_ID -R yandouziyassine/yandouziyassine.github.io -b "<DistributionId>"
gh variable set SITE_URL -R yandouziyassine/yandouziyassine.github.io -b "https://<domain>"
```

- [ ] **Step 3: Commit**

```bash
git add infra/README.md
git commit -m "v2: AWS setup instructions for the owner"
```

---

### Task 16: Go live

**Files:** Create `.github/workflows/pages-redirect.yml`, `redirect/index.html`; Delete `legacy/`.

- [ ] **Step 1: Redirect page for the old address** (`redirect/index.html`, `<domain>` replaced by the real one)

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Moved</title>
<meta http-equiv="refresh" content="0; url=https://<domain>/">
<link rel="canonical" href="https://<domain>/"></head>
<body><p>This portfolio moved to <a href="https://<domain>/">https://&lt;domain&gt;/</a>.</p></body></html>
```

- [ ] **Step 2: `.github/workflows/pages-redirect.yml`** (GitHub Pages now publishes only the redirect)

```yaml
name: pages-redirect
on:
  push:
    branches: [main]
    paths: [redirect/**]
  workflow_dispatch:
permissions: { pages: write, id-token: write, contents: read }
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with: { path: redirect }
      - uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Remove the old site, merge, switch Pages to Actions**

```bash
git rm -r legacy
git add redirect .github/workflows/pages-redirect.yml
git commit -m "v2: go live on AWS; GitHub Pages redirects to the custom domain"
git checkout main
git merge --no-ff v2 -m "Portfolio v2 phase 1"
git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main
gh api -X PUT repos/yandouziyassine/yandouziyassine.github.io/pages -f build_type=workflow
```
Expected: the `deploy` run uploads the site; `https://<domain>/` serves it over HTTPS; `https://yandouziyassine.github.io` redirects to it.

- [ ] **Step 4: Verify live**

Run: `curl -sI https://<domain>/ | head -1` → `HTTP/2 200`; `curl -sI https://<domain>/projects/slipstream/ | head -1` → 200; `curl -sI https://<domain>/nope/ | head -1` → 404; open `/cv/Yassine_Yandouzi_CV.pdf` and confirm no phone or email.

---

## Self-review notes

- Spec coverage (phase 1): pages `/`, `/demos`, `/projects`, `/projects/<slug>`, `/resume`, `/contact`, `/404` → Tasks 5–8, 10; content model → Tasks 3–4; résumé + PDF without contact details → Tasks 8–9, privacy tests Task 11; S3 + CloudFront + ACM + Route 53 + OIDC → Tasks 13–15; deploy on push → Task 14; GitHub Pages redirect after go-live → Task 16; testing (build, links, smoke, Lighthouse) → Tasks 11–12. Budget alarms are included now (spec listed them in phase 3) because they are cheap and protect the credits from day one.
- Deliberate phase-1 choices: the home hero embeds the PatchCore demo until the painter ships in phase 2; `/demos` labels the three new demos "coming soon"; `/contact` lists LinkedIn and GitHub until the form ships in phase 3.
- Names used across tasks: `loadResume` (Task 8), `ProjectCard` prop `p` (Tasks 5–6), slugs from `migrate-projects.mjs` = library folder name without the number (used in Tasks 7 and 11), repo variables `AWS_ROLE_ARN`, `S3_BUCKET`, `CF_DISTRIBUTION_ID`, `SITE_URL` (Tasks 14–15).
