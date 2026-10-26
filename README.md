# yandouziyassine.github.io

Portfolio site: computer vision projects with their measured results, two demos that run in the visitor's
browser, and a web resume with a generated PDF. Built with [Astro](https://astro.build) and deployed to GitHub
Pages by a workflow on every push to `main`. Live at https://yandouziyassine.github.io.

## Pages

| Route | Source |
|---|---|
| `/` | `src/pages/index.astro`: hero with the live painter, featured projects, about |
| `/demos/` | `src/pages/demos.astro`: virtual painter (webcam) and hard-hat safety check (photo) |
| `/projects/`, `/projects/<slug>/` | `src/content/projects/*.md`, one Markdown file per project |
| `/resume/` + `/cv/Yassine_Yandouzi_CV.pdf` | `src/data/resume.yaml`; the PDF is printed from the page at build time |
| `/contact/`, `/404` | `src/pages/` |

## Add or edit a project

Edit or add a file in `src/content/projects/`. The frontmatter schema is in `src/content.config.ts` (title, area,
depth, metric, summary, stack, cover, links; `featured: true` puts it on the home page). The body is the case study.
Images go in `public/media/projects/<slug>/`; card covers in `public/images/`. WebP versions are generated at build
time (`scripts/thumbs.mjs` for cards, `scripts/media.mjs` for case-study figures; animated GIFs show their first
frame until the page has loaded).

`scripts/migrate-projects.mjs` regenerates the CV library pages from `legacy/data/projects.js` and the library
READMEs (`node scripts/migrate-projects.mjs [path-to-library]`). It overwrites hand edits, so review the diff.

## Demos

Both run entirely in the browser; nothing the visitor shows them is uploaded.

- **Virtual painter** (`src/components/Painter.astro`): vendored painter-web module (`src/vendor/painter/`) with
  MediaPipe's wasm runtime and hand model self-hosted in `public/mediapipe/` (Apache-2.0 notice there).
- **Hard-hat check** (`src/components/HardHat.astro`, `src/lib/ppe/`): the project 07 YOLO11n model
  (`public/models/ppe_yolo11n_fp16.onnx`) in ONNX Runtime Web; decode and NMS ported from the Python reference.

Ship switches are in `src/data/flags.ts`. Details: `docs/superpowers/plans/2026-10-25-portfolio-v2-phase2-demos.md`.

## Develop

```bash
npm ci
npm run dev          # http://localhost:4321
```

## Test

```bash
npm run build        # site + PDF resume in dist/
npm test             # Vitest: content, privacy (no phone or email anywhere), hard-hat decode
npm run test:links   # internal links in dist/
npm run test:smoke   # Playwright: pages, filter, painter with a fake camera, hard-hat parity (local only)
npm run test:lhci    # Lighthouse CI on 5 pages (3 runs each): performance and accessibility >= 0.9
npm run test:lh-all  # one Lighthouse run on every page (2026-10-26: performance 0.95-1.0, accessibility 1.0)
```

CI (`.github/workflows/ci.yml`) runs all of these on every branch except `main`; `pages.yml` builds, tests and
deploys `main`.

## Privacy rule

The owner's phone number and personal email never appear on the site, in the PDF or in this repo.
`tests/privacy.test.mjs` checks the built site with generic patterns.

The Hugging Face Space [yandyassine/cv-project-library](https://huggingface.co/spaces/yandyassine/cv-project-library) is
built from `hf-hub/` with `npm run build:hf` (output in `dist-hf/`, upload command in `scripts/build-hf-hub.mjs`).

The previous single-page site is kept in `legacy/` (its `data/projects.js` also feeds the migration script).
