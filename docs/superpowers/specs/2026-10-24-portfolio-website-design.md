# Portfolio website v2: demo-first, multi-page, on AWS

Date: 2026-10-24 · Status: approved by the owner

> **Scope change (owner decision, 2026-10-24):** the site stays on **GitHub Pages** at `yandouziyassine.github.io`
> (free, permanent). AWS is out of scope for now: the connected account is a training account whose organization
> blocks CloudFormation and S3, and no card charges are allowed. Consequences: no custom domain, no CloudFront/S3,
> **no plate-reader demo and no contact form** (contact = LinkedIn + GitHub links). Browser-only demos (painter,
> hard hats) stay. The AWS sections below are kept as the design to revisit if a credits-only AWS account is
> opened later; `infra/` and `deploy.yml` were removed from the repo (they remain in git history, commit 95e8534).

## Goal

Replace the current single-page GitHub Pages site with a professional, CV-like portfolio that wins **computer
vision / ML internship** recruiters: the first thing a visitor sees is a computer vision demo running live in
their browser, then measured projects, then a web résumé. Hosted on AWS (owner has $100 of credits) under a
custom domain, with a small serverless backend for the demos that cannot run in a browser.

## Decisions (made with the owner)

| Topic | Decision |
|---|---|
| Primary audience | CV / ML engineering internship recruiters and hiring engineers |
| Visual direction | Demo-first layout ("product page" feel) in the current site's palette: near-black background, orange `#ff5b1f` accent, Instrument Serif + Geist + Geist Mono, the detection-box motif as signature |
| Structure | Several pages: home, demos, projects index, one case-study page per project, résumé |
| Live demos (v2) | Virtual painter, hard-hat detector, plate reader, PatchCore (already on Hugging Face); a 4th demo is added later |
| Stack and hosting | Approach 1: Astro static site on S3 + CloudFront, browser-side demos, one small API Gateway + Lambda backend |
| Domain | Custom domain, bought by the owner (Route 53, ~$15/year). Until it exists, the CloudFront default URL is used |
| Privacy | The owner's **phone number and personal email are never published** anywhere: not on pages, not in the PDF CV, not in the repo. Contact goes through a form that forwards server-side |

## Pages

| Route | Content |
|---|---|
| `/` | Hero: name in the detection box, one-line pitch, the **virtual painter running inline** (webcam), "Try a demo" and "Résumé" buttons; 3 featured projects with headline numbers; short "about" (education, focus, languages); footer with GitHub, LinkedIn, contact |
| `/demos` | One panel per live demo: painter, hard hats, plate reader, PatchCore (embedded from Hugging Face). Each panel states where it runs ("in your browser" / "on AWS") and its measured accuracy |
| `/projects` | Every project: the 19 computer vision library projects plus Slipstream, JoBaI, the PolyFinance datathon dashboard, the Universal File Converter and OTAMS. Topic filter, depth rating, headline metric |
| `/projects/<slug>` | Case study generated from one Markdown file: problem, approach, results table, figures, embedded demo when one exists, what didn't work, links to code / demo / Hugging Face |
| `/resume` | Web CV: education, experience, projects summary, skills, hardware, coursework, languages; "Download PDF" |
| `/contact` | Contact form (name, email of the sender, message) + GitHub and LinkedIn links |
| `/404` | Detection-box themed "object not found" page |

## Content model

- `src/content/projects/<slug>.md`: one file per project. Frontmatter: `title`, `slug`, `area`, `depth` (1–3),
  `featured` (bool), `metric {value, unit}`, `summary`, `stack[]`, `image`, `links {code, demo, huggingface}`,
  `demo` (id of a demo component, optional), `order`. Body: the case study in Markdown.
- Case-study text is adapted from each library project's README (results tables and figures copied from the
  repo's `docs/` folders into `src/assets/projects/<slug>/`, optimized at build time).
- `src/content/resume.yaml`: education, experience, skills, hardware, coursework, languages. **Phase 1 uses exactly
  the entries of the English CV dated 2026-09-28** (`Yassine_Yandouzi_CV_EN.pdf`), minus phone and email; entries
  are added only when the owner asks.
- The PDF CV is generated from `resume.yaml` at build time (same data as `/resume`), so it can never contain
  contact details that the page does not.

## Live demos

| Demo | Runs | How |
|---|---|---|
| Virtual painter | Browser | MediaPipe Hand Landmarker (JS, WASM/WebGPU) on the webcam. Gesture state machine ported from project 01: fist = idle, index up = draw, two fingers = erase, two fingers over a swatch = pick colour; smoothing of the fingertip. Canvas drawing over the mirrored video |
| Hard hats | Browser | YOLO11n from project 07's full-data Kaggle model, exported to ONNX (~10 MB, served from S3/CloudFront), run with ONNX Runtime Web (WebGPU, fallback WASM). Photo upload; webcam optional. Shows boxes and the site alert |
| Plate reader | AWS | Browser sends the photo to API Gateway → Lambda (container image): project 06's YOLO plate detector + RapidOCR (ONNX) + plate-format correction. Returns plate boxes and text. Image processed in memory, never stored or logged |
| PatchCore | Hugging Face | Existing static Space embedded with an iframe, plus a link |

Shared demo rules: the page loads demo code and models only when the demo is opened (or scrolled into view on the
home page); every demo shows where it runs and its measured accuracy from the library.

## AWS architecture

- **Static site:** private S3 bucket (Origin Access Control) behind CloudFront; ACM certificate (us-east-1) for the
  custom domain; Route 53 hosted zone. Long cache for hashed assets, short cache for HTML.
- **Backend:** API Gateway HTTP API with throttling (2 requests/s, burst 5) and CORS restricted to the site's
  domain; two Lambdas: `plate-reader` (container image, ~2 GB memory, reserved concurrency 2) and `contact`
  (forwards to the owner's address through Amazon SES; the address is stored only as a Lambda environment
  variable set at deploy time from a GitHub secret, never in the repo or page).
- **Region:** ca-central-1 for S3, API Gateway and Lambda; us-east-1 only for the CloudFront certificate.
- **Infrastructure as code:** one AWS SAM template in `infra/` (bucket, distribution, API, Lambdas, budget alarms,
  log retention 7 days).
- **Deploy:** GitHub Actions on push to `main`: build Astro → `aws s3 sync` → CloudFront invalidation; `sam deploy`
  when `infra/` or `lambdas/` change. GitHub authenticates with an IAM role through OIDC (no long-lived AWS keys).
- **Guardrails:** AWS Budgets alerts at $5 and $20; Lambda reserved concurrency; API throttling; no WAF (cost).
- **Owner actions (Claude never handles credentials):** create/sign in to the AWS account, run the one-time
  bootstrap (OIDC provider + deploy role) with the provided commands, buy the domain, verify the SES address.
- **Estimated cost** at portfolio traffic: about $1–3 per month plus the domain.

## Repository

- Same repo, `yandouziyassine/yandouziyassine.github.io`. The Astro project replaces the static files at the root;
  the old site stays in git history.
- Layout: `src/` (pages, layouts, components, content, assets), `public/` (models, favicons), `infra/` (SAM),
  `lambdas/plate-reader/`, `lambdas/contact/`, `tests/`, `.github/workflows/`.
- When the AWS site is live on the domain, GitHub Pages serves a one-page redirect to the domain.

## Failure handling

- Webcam refused or absent → the demo switches to photo upload with a short explanation.
- No WebGPU → WASM backend automatically; slower devices see a progress message.
- Plate reader: cold start shows "warming up…"; HTTP 429 shows "busy, try again in a minute"; network errors are
  shown, never silent.
- Contact form: client and server validation, hidden honeypot field, rate limiting; success/failure message.
- No analytics scripts and no tracking cookies.

## Testing

- CI on every push: Astro build; broken-link check over the built site; unit tests (Vitest) for the painter's
  gesture state machine and the hard-hat post-processing (box decoding, NMS); existing Python tests for plate-format
  correction; Lambda handler tests run locally (SAM / pytest) before deploy; Playwright smoke test (every page loads,
  no console errors, painter starts with a fake camera); Lighthouse CI budget (performance and accessibility ≥ 90).

## Phases (each one goes live on its own)

1. **Site:** Astro site, all pages and content, `/resume` + PDF without contact details, S3 + CloudFront + domain,
   deploy pipeline.
2. **Browser demos:** painter, hard hats, PatchCore embed.
3. **AWS backend:** plate reader Lambda, contact form + SES, budget alarms.
4. **Polish:** Open Graph preview images, accessibility pass, Lighthouse ≥ 90.

Each phase gets its own implementation plan.

## Out of scope (v2)

- The city traffic-pulse project (live counts from Ottawa / Ontario 511 / Québec 511 camera snapshots): its own spec
  after phase 4, same AWS account. Findings so far: feeds are still images (≥ 60 s per camera, Ottawa requires a
  registered key and serving images from our own server).
- A blog, comments, user accounts, analytics.
- Re-training models: demos use existing trained models (07's full-data model, 06's plate model).

## Risks

- Model files for the demos were on the lost USB key: 07's model is re-downloadable from Kaggle
  (`cvlib-07-ppe-full`); 06's plate detector must be retrained (CPU ~1 h, or Kaggle GPU) before phase 3.
- MediaPipe and ONNX Runtime Web versions must be pinned; WebGPU support varies by browser.
- SES starts in sandbox mode (can only send to verified addresses): fine, since the only recipient is the owner.
