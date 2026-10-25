# Portfolio v2, phase 2: browser demos (as built)

Spec: `docs/superpowers/specs/2026-10-24-portfolio-website-design.md` (phase 2, after the scope change: painter and
hard hats only, both in the browser, no PatchCore embed, no AWS).

## Virtual painter (project 01)

- `src/vendor/painter/`: build output of painter-web 0.1.0 (`mountPainter(element, options)`), see its README.
- `public/mediapipe/`: MediaPipe tasks-vision 1.1.0 wasm + `hand_landmarker.task`, self-hosted, Apache-2.0 notice.
- `src/components/Painter.astro`: mounts it; the camera starts only on click; destroyed on `pagehide`.
- Ship switch `PAINTER_LIVE` in `src/data/flags.ts`: `import.meta.env.DEV` until the owner tests it with a real
  webcam, so `npm run dev` shows it and the built site says "coming soon". To ship: set it to `true`, add
  `demo: /demos/` back to `src/content/projects/virtual-painter.md` (and the legacy entry).
- Test: `tests/smoke.spec.mjs` starts it with Chromium's fake camera (skipped while the flag is off in the build).

## Hard-hat safety check (project 07)

- Model: `ppe_yolo11n_fp16.onnx` (5.4 MB, FP16 weights, float32 I/O) from `cv-data/ppe/web` (exported from the
  Kaggle kernel `cvlib-07-ppe-full`). **Not committed** (no weights in git): `scripts/demo-assets.mjs` copies it to
  `public/models/` (gitignored) from `PPE_MODEL` or `../cv-data/ppe/web`. `HARDHAT_LIVE` is true when it is there,
  so CI and the deploy build the demo as "coming soon" until the model has a hosting decision.
- `src/lib/ppe/postprocess.ts`: letterbox (Ultralytics `LetterBox(auto=False)`), tensor packing, decode of the
  channel-major `[1, 6, 8400]` output, class-aware NMS (IoU 0.45, conf 0.25, max 300), site alert. Port of
  `ppe_onnx_reference.py`.
- `src/lib/ppe/detector.ts`: ONNX Runtime Web 1.30.0 (`onnxruntime-web/wasm`, single thread since GitHub Pages
  cannot send COOP/COEP), loaded on first use; Vite emits the 14 MB WASM as a hashed asset.
- `src/components/HardHat.astro`: file picker / drop zone, prefetch on focus or hover, boxes drawn on a canvas,
  status line with the alert and the on-device time. The photo never leaves the browser.
- Tests: `tests/ppe.test.mjs` (Vitest, synthetic tensors + the golden raw column of sample 1);
  `tests/hardhat.spec.mjs` (Playwright, the real page on the 5 golden samples vs `expected_detections.json`;
  runs only where the samples and the model exist, i.e. locally). Measured locally: all 5 match within
  1.5 px / 0.02 score (3 px / 0.05 for the resized 960x540 sample), ~0.4 s per photo on a laptop CPU.

## Open decision (owner)

Where the hard-hat model is served from in production: committed to this repo under `public/models/`
(simplest; 5.4 MB of our own weights in a public repo) or downloaded at build time from a public Hugging Face
model repo (keeps weights out of git; needs the owner to publish it).
