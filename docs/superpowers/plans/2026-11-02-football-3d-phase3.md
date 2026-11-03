# Football AI Coach, Phase 3 (3D View on the Site Replay): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "3D view" toggle on `/demos/football/` that shows the replay's current moment in 3D at any time. The visitor can pick a stadium camera, a tactical top view, or a chosen player's eyes. Low-poly figures carry team colours and shirt numbers, and the ball sits at its tracked height. Pause, advice arrows, follow and refuse keep working. The 2D page's weight and Lighthouse scores stay the same, because three.js loads only when 3D is asked for.

**Architecture:** The 2D component `FootballReplay.astro` keeps the single replay clock and state (`half`, `t`, `playing`, `advice`, `chosen`). Its `draw()` now goes to one of two targets: the 2D canvas, or the 3D view when it is open. Both get the same frame and the same arrow list (`arrowsNow()`). The 3D code is in `src/lib/football3d/`:
- pure modules, unit-tested in Node: `camera.ts` (poses, smoothing, flights), `shapes.ts` (pitch markings, ground ribbons, arrow triangles, number-atlas cells), `frame.ts` (what to draw at a moment, the ball height, the "Whose eyes" list), `webgl.ts` (WebGL 2 check)
- `scene.ts`: three.js objects only, with no renderer and no DOM. It has 13 draw calls in total because each body part is one instanced mesh. Node tests count its draw calls, update it and pick players.
- `view3d.ts`: the renderer, cameras, render-on-demand loop, arrow-label overlay and dispose.

The component loads `view3d.ts` with `import()` on the first toggle, so Vite puts three.js in a separate chunk. The library exports the ball height as separate `z0.bin` / `z1.bin` files. The 3D view loads them; the 2D page never does. The `h*.bin` layout and the parity fixtures do not change.

**Tech Stack:** Python 3 + numpy (library `20-football-analytics/coach/export.py`); Astro 7 + TypeScript, three.js **0.186.1** (exact, npm), Vitest 5, Playwright 1.64 (SwiftShader WebGL), Lighthouse CI, in `yandouziyassine.github.io` on branch `v2`.

**Spec:** `C:\Users\yando\Code\COMPUTER-VISION-PROJECT-LIBRARY\docs\superpowers\specs\2026-11-01-football-ai-coach-design.md`, section "Replay experience":
- 3D toggle at any moment, on the same timestamp
- stadium camera, tactical top view, or a player's eyes (click a player; the camera sits at head height and looks where he moves)
- simple low-poly figures with team colours and numbers
- works on a phone in 2D; 3D needs WebGL and loads only when asked for

It builds on `docs/superpowers/plans/2026-11-02-football-replay-phase2.md`.

---

## Decisions (made while planning, 2026-11-02)

1. **Ball height.** The library's `Half.ball` holds `[x, y, z]` in metres, taken from the DFL tracking `Z`. For J03WOH, z is never missing; its median is 0.08 m, the 99th percentile 9.7 m and the maximum 18.6 m. `export.py` currently writes only x and y. This phase adds one file per half, **`z<i>.bin`**: one little-endian int16 per site frame, in cm, with -32768 for unknown.
   - Sizes: `z0.bin` 34,712 × 2 = **69,424 B**; `z1.bin` 33,895 × 2 = **67,790 B**.
   - `h<i>.bin` and `coach-parity.json` stay byte-identical, so the parity tests stay green.
   - The site copies the z files when they exist (`scripts/football.mjs`) and fetches them only when 3D opens.
   - When a z file is missing, the 3D ball rests on the grass.
2. **three.js version.** Use `three@0.186.1`, published 2026-09-24, plus `@types/three@0.186.0` as a devDependency for the editor only. Both are exact versions with `--save-exact`. `0.187.0` came out on 2026-10-30, less than two weeks ago, so it is not used. three.js needs **WebGL 2** (WebGL 1 support was removed in r163), so `hasWebGL()` checks for `webgl2`.
3. **Draw-call budget: 13.** The scene has the surround, the grass, a single line-marking mesh, the goals (one instanced cylinder), and instanced shadows, bodies, heads and shirt numbers. Numbers are billboards in a single shader that samples a 10 × 10 number atlas drawn on a canvas at run time, with no textures from the web. On top of that come the carrier ring, the ball, the ball shadow, the arrows (one dynamic mesh) and the trail (one line).
   - A Node test asserts the count is ≤ 40.
   - The Playwright spec reads `renderer.info.render.calls` from `data-draw-calls`.
4. **Arrow labels** are DOM spans in an `aria-hidden` overlay, projected from the 3D arrow tips. Text stays sharp, they add no draw calls, and the option list stays in the DOM panel as in 2D.
5. **No orbit controls.** (Superseded by the addendum at the end: the visitor can now steer each camera, with our own small functions and no OrbitControls.) The cameras are the three in the spec. A click or tap picks a player: first by a ray against the bodies, then by the nearest player within 2.5 m of where the ray meets the grass, which is easier on phones. Keyboard users get the "Whose eyes" select.
6. **Tactical view.** The view is an `OrthographicCamera` at rest. Flights into or out of it use a perspective top pose whose ground extent matches the orthographic one, so the switch at the end of a flight cannot be seen. In the tactical view, figures are drawn 2.5× larger so they stay readable from 140 m up.
7. **A fresh canvas for every open.** `view3d.ts` creates its own canvas, and `dispose()` calls `forceContextLoss()` and removes it. A lost WebGL context cannot be reused, so reopening needs a new canvas.
8. **Rendering on demand.** The view renders only when:
   - the clock moves (`show()` is called from `draw()`),
   - the camera mode or the followed player changes, or
   - a camera is still easing (a flight, the stadium camera catching up with the ball, or the eyes camera turning).

   The pixel ratio is capped at 1.5.
9. **Reduced motion.** `prefers-reduced-motion` turns camera flights into cuts (`flightSeconds(true) = 0`), and the 3D ball trail is hidden, as in 2D.
10. **Playwright and WebGL.** Locally, headless Chromium from Playwright 1.64 already has WebGL 2 through SwiftShader (checked 2026-11-02: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`). The config adds `--enable-unsafe-swiftshader`, because Linux CI Chromium refuses software WebGL without it. The 3D spec skips itself when `data-webgl` is not `"true"`.
11. **Bundle check.** `npm run test:bundle` (`scripts/bundle-3d.mjs`, also run in CI) fails if any script the football page loads up front contains three.js (`isWebGLRenderer`) or the 3D scene (`aCell`). It also prints the gzip size of the lazy 3D chunk and fails above **200 kB**. Expect roughly 130–170 kB; the real number goes in the final report.
12. **Deploy.** Work on branch `v2` with CI green. The owner merges to `main` and deploys; that is not a task in this plan.

## Conventions used below

- Library commands (Git Bash): `cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY/20-football-analytics`, Python is `PY=C:/Users/yando/Code/.venv-tools/Scripts/python.exe` (set it in every new shell). Library commits go to `main` after `ruff format`, `ruff check` and pytest are green, and are pushed.
- Site commands: `cd /c/Users/yando/Code/yandouziyassine.github.io` on branch `v2` (`git switch v2`). Commits go to `v2`.
- Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Units: metres, centre spot = origin, pitch x along the length, y across (+y is the top of the 2D canvas). three.js world = `(x, height, -y)`: +x to the right, the stadium camera on the near (-y) touchline, as on the 2D pitch.
- This plan was written against `v2` at `a405bde`, which includes `88c104c`, "pause snaps to the nearest ball carrier". Every "replace X with Y" block quotes the code as it is at that commit. If a quoted block does not match, re-read the file and apply the same change by hand.
- Vitest runs `tests/**/*.test.mjs`, which import `.ts` files directly. Playwright runs `tests/*.spec.mjs` against the **built** site on port 4322, so run `npm run build` before Playwright.

## File structure

**Library (`COMPUTER-VISION-PROJECT-LIBRARY`, branch `main`)**

| File | Change | Responsibility |
|---|---|---|
| `20-football-analytics/coach/export.py` | Modify `pack_match` + docstring | Also write `z<i>.bin` (ball height, int16 cm per site frame) |
| `tests/test_20_coach.py` | Add 1 test | Ball height files; position files unchanged |
| `20-football-analytics/README.md`, `PROGRESS.md` | Modify | Export line, test count 35, phase 3 line |

**Site (`yandouziyassine.github.io`, branch `v2`)**

| File | Change | Responsibility |
|---|---|---|
| `scripts/football.mjs` | Modify | Copy optional `z<i>.bin` after checking its size |
| `public/football/z0.bin`, `z1.bin` | Create (data, committed) | Ball height per half (CC BY 4.0, same credit) |
| `package.json`, `package-lock.json` | Modify | `three@0.186.1`, `@types/three@0.186.0` (dev), `test:bundle` script |
| `playwright.config.mjs` | Modify | `--enable-unsafe-swiftshader` |
| `src/lib/coach/replay.ts` | Add `scoreAt` | Goals up to a frame |
| `src/lib/coach/format.ts` | Add `frameLabel` | Canvas aria-label: view, time, score, carrier |
| `src/lib/football3d/camera.ts` | Create | Poses (stadium, tactical, eyes), smoothing, look direction, flights |
| `src/lib/football3d/shapes.ts` | Create | Pitch markings, ribbons, arrow triangles, atlas cells |
| `src/lib/football3d/webgl.ts` | Create | `hasWebGL()` (WebGL 2) |
| `src/lib/football3d/frame.ts` | Create | `Frame3D`, `buildFrame`, `decodeBallZ`, `ballHeight`, `eyesChoices` |
| `src/lib/football3d/scene.ts` | Create | three.js scene, `update`, `pick`, `dispose` (no renderer) |
| `src/lib/football3d/view3d.ts` | Create | Renderer, cameras, render-on-demand loop, labels, resize, dispose |
| `src/components/FootballReplay.astro` | Modify | Toggle, camera radios, "Whose eyes", 3D stage, shared draw, keys V / C |
| `src/pages/demos/football.astro` | Modify | Lede, "How to read it" and "Honest limits" for 3D |
| `scripts/bundle-3d.mjs` | Create | Up-front vs lazy 3D code check, gzip report |
| `.github/workflows/ci.yml` | Modify | `npm run test:bundle` |
| `tests/football-sync.test.mjs` | Modify | z-file cases |
| `tests/coach-replay.test.mjs`, `tests/coach-format.test.mjs` | Modify | `scoreAt`, `frameLabel` |
| `tests/football3d-camera.test.mjs`, `tests/football3d-shapes.test.mjs`, `tests/football3d-frame.test.mjs`, `tests/football3d-scene.test.mjs`, `tests/bundle-3d.test.mjs` | Create | Vitest |
| `tests/football3d.spec.mjs` | Create | Playwright |
| `README.md` | Modify | Demos + Test sections |

---

## Part A: Library and data

### Task 1: Export the ball height per half

**Files:**
- Modify: `20-football-analytics/coach/export.py` (docstring lines 6–7, `pack_match` loop)
- Test: `tests/test_20_coach.py` (new test right after `test_pack_match_writes_one_file_per_half_with_its_own_players`)

- [ ] **Step 1: Write the failing test.** In `tests/test_20_coach.py`, insert directly after the end of `test_pack_match_writes_one_file_per_half_with_its_own_players`:

```python
def test_pack_match_writes_the_ball_height_per_half(tmp_path):
    m = tiny_match(frames=100)
    m.halves[0].ball[:, 2] = np.linspace(0, 3, 100)  # a lofted ball, metres
    m.halves[0].ball[4, 2] = np.nan  # height unknown at source frame 4 = site frame 2
    X.pack_match(m, tmp_path, fps=10)
    z0 = np.fromfile(tmp_path / "z0.bin", dtype="<i2")
    z1 = np.fromfile(tmp_path / "z1.bin", dtype="<i2")
    assert z0.size == 50 and z1.size == 50  # one int16 per site frame (12.5 fps)
    assert z0[2] == -32768
    assert np.allclose(z0[[0, 1, 49]] / 100.0, m.halves[0].ball[[0, 2, 98], 2], atol=0.005)  # whole cm
    assert (z1 == 0).all()
    raw0 = np.fromfile(tmp_path / "h0.bin", dtype="<i2")
    assert raw0.size == 50 * (4 + 1) * 2  # the position files keep their layout (the parity fixtures read them)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$PY -m pytest ../tests/test_20_coach.py -q -k ball_height`
Expected: FAIL with `FileNotFoundError` for `z0.bin`.

- [ ] **Step 3: Write the implementation.** In `20-football-analytics/coach/export.py`:

(a) Replace these two docstring lines:

```text
h<i>.bin (little-endian int16): for each frame of half i, the players who appear in that half (match.json
halves[i].slots, ascending player index), then the ball, each (x, y) in cm; NaN -> -32768. The browser loads the first
```

with:

```text
h<i>.bin (little-endian int16): for each frame of half i, the players who appear in that half (match.json
halves[i].slots, ascending player index), then the ball, each (x, y) in cm; NaN -> -32768. z<i>.bin (little-endian
int16): the ball's height in cm for each frame of half i (NaN -> -32768), used only by the site's 3D view; h<i>.bin
keeps its layout so the parity fixtures are unchanged. The browser loads the first
```

(b) In `pack_match`, directly after the line `np.where(np.isnan(pos), NAN, np.round(pos)).astype("<i2").tofile(out / f"h{i}.bin")`, add:

```python
        z = h.ball[idx, 2] * 100  # ball height (DFL tracking Z, metres) -> cm
        np.where(np.isnan(z), NAN, np.round(z)).astype("<i2").tofile(out / f"z{i}.bin")
```

- [ ] **Step 4: Run the tests, format, lint**

```bash
$PY -m pytest ../tests/test_20_coach.py -q
$PY -m ruff format coach ../tests/test_20_coach.py
$PY -m ruff check coach ../tests/test_20_coach.py
```
Expected: `35 passed`; ruff check prints `All checks passed!`. If `ruff format` changed anything, run pytest again.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY
git add 20-football-analytics/coach/export.py tests/test_20_coach.py
git commit -m "20 coach: export the ball height per half (z0/z1.bin, int16 cm) for the site's 3D view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Site sync copies the ball height files

**Files:**
- Modify: `scripts/football.mjs`
- Test: `tests/football-sync.test.mjs`

- [ ] **Step 1: Write the failing tests.** In `tests/football-sync.test.mjs`:

(a) Replace the `fakeExport` function with:

```js
function fakeExport(dir, { size = 2 * 3 * 4, credit = "Data: someone, CC BY 4.0", trainedWithout = "T", z = null } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const halves = [{ frames: 2, slots: [0, 1], attack: [1, -1] }];
  fs.writeFileSync(path.join(dir, "match.json"), JSON.stringify({ match_id: "T", fps: 12.5, halves, players: [], credit }));
  fs.writeFileSync(path.join(dir, "models.json"), JSON.stringify({ trained_without: trainedWithout }));
  fs.writeFileSync(path.join(dir, "h0.bin"), Buffer.alloc(size));
  if (z !== null) fs.writeFileSync(path.join(dir, "z0.bin"), Buffer.alloc(z)); // ball height: 2 bytes per frame
}
```

(b) Add these two tests inside the `describe` block, after "refuses a half file of the wrong size":

```js
  it("copies the ball height file of each half when the export has it", () => {
    const src = path.join(tmp, "z"), out = path.join(tmp, "out-z");
    fakeExport(src, { z: 2 * 2 });
    const r = run(src, out);
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual(["h0.bin", "match.json", "models.json", "z0.bin"]);
  });
  it("refuses a ball height file of the wrong size", () => {
    const src = path.join(tmp, "zsize");
    fakeExport(src, { z: 3 });
    const r = run(src, path.join(tmp, "out-zsize"));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/z0\.bin is 3 bytes, expected 4/);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/football-sync.test.mjs`
Expected: 2 failures. The first lists no `z0.bin`; the second exits 0 instead of refusing.

- [ ] **Step 3: Write the implementation.** In `scripts/football.mjs`:

(a) Replace the header line `//   npm run sync:football        FOOTBALL_EXPORT overrides ../cv-data/football-coach/site-export (FOOTBALL_OUT: tests)` with:

```js
//   npm run sync:football        FOOTBALL_EXPORT overrides ../cv-data/football-coach/site-export (FOOTBALL_OUT: tests)
// z<i>.bin (the ball's height per frame, int16 cm, for the 3D view) is copied when the export has it.
```

(b) Replace the line `const files = ["match.json", "models.json", ...meta.halves.map((_, i) => \`h${i}.bin\`)];` with:

```js
const zFiles = meta.halves.flatMap((h, i) => {
  const f = `z${i}.bin`, p = path.join(SRC, f);
  if (!fs.existsSync(p)) return [];
  const size = fs.statSync(p).size;
  if (size !== h.frames * 2) throw new Error(`football: ${f} is ${size} bytes, expected ${h.frames * 2}`);
  return [f];
});
const files = ["match.json", "models.json", ...meta.halves.map((_, i) => `h${i}.bin`), ...zFiles];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/football-sync.test.mjs`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/football.mjs tests/football-sync.test.mjs
git commit -m "Football sync: copy the ball height files (z0/z1.bin) when the export has them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Regenerate the export, ship the z files, document

**Files:**
- Output (not in a repo): `C:/Users/yando/Code/cv-data/football-coach/site-export/{z0.bin,z1.bin}` (the other files are rewritten byte-identical)
- Create (site, committed): `public/football/z0.bin`, `public/football/z1.bin`
- Modify (library): `20-football-analytics/README.md` (lines 289 and 293), `PROGRESS.md`

- [ ] **Step 1: Re-pack the match only, without refitting the models**

```bash
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY/20-football-analytics
$PY -c "from pathlib import Path; from coach.export import pack_match; from coach.match import load; from coach.prepare import OUT; pack_match(load(OUT / 'J03WOH'), Path('C:/Users/yando/Code/cv-data/football-coach/site-export'))"
ls -l C:/Users/yando/Code/cv-data/football-coach/site-export
```
Expected: `z0.bin` 69424 bytes and `z1.bin` 67790 bytes, next to unchanged `h0.bin` 3193504, `h1.bin` 4474140, `match.json` and `models.json`.

- [ ] **Step 2: Sync into the site and check that only the z files are new**

```bash
cd /c/Users/yando/Code/yandouziyassine.github.io
npm run sync:football
git status --short public/football
```
Expected: the sync prints `football: DFL-MAT-J03WOH, 34712 + 33895 frames, 6 files, 8.1 MB`, and `git status` shows exactly `?? public/football/z0.bin` and `?? public/football/z1.bin`. If `h0.bin`, `h1.bin` or `match.json` show as modified, stop. The position export changed, and the parity fixture would need regenerating (`$PY -m coach.parity_fixtures`, then `npx vitest run tests/coach-parity.test.mjs`) before continuing.

- [ ] **Step 3: Parity is still green**

Run: `npx vitest run tests/coach-parity.test.mjs tests/coach-replay.test.mjs`
Expected: all pass.

- [ ] **Step 4: Commit the data (site)**

```bash
git add public/football/z0.bin public/football/z1.bin
git commit -m "Football data: ball height per half (z0/z1.bin, 137 kB, loaded only by the 3D view)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Library README + PROGRESS.**
  1. In `20-football-analytics/README.md`, replace line 289 with:

```text
python -m coach.export --match J03WOH --site <folder>        # one match (h0/h1.bin int16 cm 12.5 fps, z0/z1.bin ball height) + weights
```

  2. On line 293, change `(34)` to `(35)`.
  3. In `PROGRESS.md`, under the project 20 entries, add: `2026-11-02: coach phase 3 groundwork: ball height exported per half (z0/z1.bin, int16 cm, 137 kB) for the site's 3D view; position files and parity fixtures unchanged.`

- [ ] **Step 6: Lint, test, commit, push (library)**

```bash
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY
$PY -m ruff format --check .
$PY -m ruff check .
$PY -m pytest tests -q
git add 20-football-analytics/README.md PROGRESS.md
git commit -m "20 coach: README export line and PROGRESS for the ball height files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
Expected: ruff is clean, pytest is green (tests with missing optional dependencies skip), and the push is accepted.

---

## Part B: Site (branch `v2`)

### Task 4: Baseline, three.js dependency, WebGL in Playwright

**Files:**
- Modify: `package.json`, `package-lock.json`, `playwright.config.mjs`

- [ ] **Step 1: Record the baseline before any 3D code.** Write the numbers down for the final report; do not commit them.

```bash
cd /c/Users/yando/Code/yandouziyassine.github.io
npm run build
node scripts/lighthouse-all.mjs .lighthouseci demos/football
node -e "const z=require('zlib'),fs=require('fs');for(const f of fs.readdirSync('dist/_astro').filter((f)=>f.startsWith('FootballReplay')))console.log(f,(z.gzipSync(fs.readFileSync('dist/_astro/'+f),{level:9}).length/1024).toFixed(1),'kB gzip')"
```
Expected: one line like `/demos/football/ perf 0.9x a11y 1 LCP …` with nothing after LCP, and the gzip size of the 2D replay script.

- [ ] **Step 2: Install three.js at an exact version**

```bash
npm install --save-exact three@0.186.1
npm install --save-exact --save-dev @types/three@0.186.0
```
Expected: `package.json` has `"three": "0.186.1"` under `dependencies` and `"@types/three": "0.186.0"` under `devDependencies`, with no `^`.

- [ ] **Step 3: Ask headless Chromium for software WebGL.** In `playwright.config.mjs`, replace the `use` block with:

```js
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Chromium's fake camera (a moving test pattern) for the painter test; harmless for the other pages.
    // SwiftShader WebGL for the football 3D view: Linux CI Chromium refuses software WebGL without this flag.
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--enable-unsafe-swiftshader"] },
  },
```

- [ ] **Step 4: Nothing else changed**

Run: `npm test`
Expected: all green, the same count as before.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.mjs
git commit -m "Football 3D: three.js 0.186.1 (exact), SwiftShader WebGL for Playwright

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Score and frame summary (canvas labels)

**Files:**
- Modify: `src/lib/coach/replay.ts` (append), `src/lib/coach/format.ts` (append + one import)
- Test: `tests/coach-replay.test.mjs`, `tests/coach-format.test.mjs`

- [ ] **Step 1: Write the failing tests.**

(a) In `tests/coach-replay.test.mjs`, replace the import line with:

```js
import { ABSENT, ballAt, carrierAt, clock, decodeHalf, eventFrame, frameDots, markers, nearestCarrierFrame, ownerAt, playerAt, scoreAt, stateAt, trail, velocityAt } from "../src/lib/coach/replay.ts";
```

and append at the end of the file:

```js
describe("score", () => {
  it("counts goals up to the frame, by the scoring team, with nominal frames when not synced", () => {
    const events = [
      { type: "shot", half: 0, frame: 8, team: 0, player: 0, goal: true },
      { type: "shot", half: 1, frame: null, nominal: 3, team: 1, player: 2, goal: true },
      { type: "shot", half: 0, frame: 5, team: 1, player: 2, goal: false },
      { type: "shot", half: null, frame: null, team: 0, player: 0, goal: true },
    ];
    const m = { ...meta, events };
    expect(scoreAt(m, 0, 7)).toEqual([0, 0]);
    expect(scoreAt(m, 0, 8)).toEqual([1, 0]);
    expect(scoreAt(m, 1, 2)).toEqual([1, 0]);
    expect(scoreAt(m, 1, 3)).toEqual([1, 1]);
  });
});
```

(b) In `tests/coach-format.test.mjs`, replace the import line with:

```js
import { arrowLabel, direction, frameLabel, optionLabel, outcomeLabel, pct, proLabel, signedXg, textOn } from "../src/lib/coach/format.ts";
```

and append at the end of the file:

```js
describe("canvas summary", () => {
  const m = { players, meta: { home: "Home", guest: "Away" } };
  it("says which view, when, the score and who has the ball", () => {
    expect(frameLabel(m, "Pitch", "12:34, first half", [1, 0], { player: 0, team: 0 }))
      .toBe("Pitch, 12:34, first half, Home 1–0 Away: #10 D. Ginczek (Home) has the ball.");
    expect(frameLabel(m, "3D view (tactical view)", "45:00, second half", [2, 3], null))
      .toBe("3D view (tactical view), 45:00, second half, Home 2–3 Away: no player has the ball.");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/coach-replay.test.mjs tests/coach-format.test.mjs`
Expected: FAIL with `scoreAt is not a function` and `frameLabel is not a function`.

- [ ] **Step 3: Write the implementation.**

(a) Append to `src/lib/coach/replay.ts`:

```ts
/** Goals scored up to (half, frame), as [home, guest]: shot events with goal = true, credited to the shooting team. */
export function scoreAt(m: MatchMeta, half: number, frame: number): [number, number] {
  const s: [number, number] = [0, 0];
  for (const e of m.events) {
    const f = eventFrame(e);
    if (e.type !== "shot" || !e.goal || e.half === null || f === null || (e.team !== 0 && e.team !== 1)) continue;
    if (e.half < half || (e.half === half && f <= frame)) s[e.team]++;
  }
  return s;
}
```

(b) In `src/lib/coach/format.ts`, replace `import type { PlayerInfo } from "./replay";` with `import type { Carrier, MatchMeta, PlayerInfo } from "./replay";` and append:

```ts
/** The canvases' aria-label: "<view>, <when>, Home 1–0 Away: #10 Name (Home) has the ball." */
export function frameLabel(m: Pick<MatchMeta, "players" | "meta">, view: string, when: string, score: [number, number], carrier: Carrier | null): string {
  const p = carrier ? m.players[carrier.player] : undefined;
  const who = p ? `#${p.shirt} ${p.name} (${carrier!.team ? m.meta.guest : m.meta.home}) has the ball` : "no player has the ball";
  return `${view}, ${when}, ${m.meta.home} ${score[0]}–${score[1]} ${m.meta.guest}: ${who}.`;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/coach-replay.test.mjs tests/coach-format.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/replay.ts src/lib/coach/format.ts tests/coach-replay.test.mjs tests/coach-format.test.mjs
git commit -m "Coach replay: score at a frame, canvas summary label (view, time, score, carrier)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Camera maths

**Files:**
- Create: `src/lib/football3d/camera.ts`
- Test: `tests/football3d-camera.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/football3d-camera.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import {
  BROADCAST, EYE_HEIGHT, FLY_S, SNAP_M, broadcastPose, damp, ease, eyesPose, flightSeconds, followBall, lerpPose,
  lookDirection, nextCamera, settled, smoothDirection, tacticalExtent, tacticalPose, toWorld,
} from "../src/lib/football3d/camera.ts";
import { HALF_WIDTH } from "../src/lib/coach/geometry.ts";

const near = (got, want, d = 9) => want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, d));

describe("smoothing", () => {
  it("closes 63 % of the gap in one time constant, whatever the frame rate", () => {
    expect(damp(0, 10, 0.6, 0.6)).toBeCloseTo(10 * (1 - Math.exp(-1)), 9);
    expect(damp(damp(0, 10, 0.3, 0.6), 10, 0.3, 0.6)).toBeCloseTo(damp(0, 10, 0.6, 0.6), 9);
    expect(damp(3, 10, 0, 0.6)).toBe(3);
    expect(damp(3, 10, 0.1, 0)).toBe(10);
  });
  it("the stadium camera pans after the ball but cuts after a jump in the replay", () => {
    expect(followBall([0, 0], [10, 0], 0.6)[0]).toBeCloseTo(10 * (1 - Math.exp(-1)), 9);
    expect(followBall([0, 0], [SNAP_M + 1, 0], 0.016)).toEqual([SNAP_M + 1, 0]);
    expect(settled([0, 0], [0.01, 0])).toBe(true);
    expect(settled([0, 0], [1, 0])).toBe(false);
  });
});

describe("player's eyes", () => {
  it("looks where the player runs", () => near(lookDirection([3, 4], [0, 0], [10, 10], [1, 0]), [0.6, 0.8]));
  it("looks at the ball when he stands still", () => near(lookDirection([0.1, 0], [0, 0], [0, -5], [1, 0]), [0, -1]));
  it("keeps his last direction when still with the ball at his feet or unknown", () => {
    near(lookDirection([0, 0], [0, 0], [0.1, 0], [0, 2]), [0, 1]);
    near(lookDirection([0, 0], [0, 0], null, [0, 0]), [1, 0]);
  });
  it("turns smoothly and stays a unit vector", () => {
    const d = smoothDirection([1, 0], [0, 1], 0.1, 0.25);
    expect(Math.hypot(d[0], d[1])).toBeCloseTo(1, 9);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[1]).toBeGreaterThan(0);
    near(smoothDirection([1, 0], [-1, 0], 0.25 * Math.log(2), 0.25), [-1, 0]); // half-way is no direction: take the target
  });
  it("sits at head height (1.7 m) and looks along his direction, slightly down", () => {
    const p = eyesPose([10, 5], [0, 1]);
    near(p.position, [10, EYE_HEIGHT, -5]);
    near(p.target, [10, 0.8, -25]);
    expect(p.up).toEqual([0, 1, 0]);
  });
});

describe("stadium and tactical cameras", () => {
  it("films from behind the near touchline, 20 m up, panning with the ball", () => {
    const p = broadcastPose([40, 10]);
    near(p.position, [32, BROADCAST.height, HALF_WIDTH + BROADCAST.back]);
    near(p.target, [40, 0, -5]);
    near(broadcastPose([90, 0]).target, [52.5, 0, 0]); // clamped to the pitch
  });
  it("tactical: fits the pitch plus 4 m in any viewport, seen from straight above", () => {
    expect(tacticalExtent(2)).toEqual({ halfW: 76, halfH: 38 });
    expect(tacticalExtent(1)).toEqual({ halfW: 56.5, halfH: 56.5 });
    const p = tacticalPose(2);
    expect(p.position[1] * Math.tan((p.fov * Math.PI) / 360)).toBeCloseTo(38, 9); // same ground extent as the orthographic view
    expect(p.up).toEqual([0, 0, -1]); // +y of the pitch points up the screen, as in 2D
  });
  it("cycles stadium → tactical → eyes", () => {
    expect(nextCamera("broadcast")).toBe("tactical");
    expect(nextCamera("tactical")).toBe("eyes");
    expect(nextCamera("eyes")).toBe("broadcast");
  });
  it("maps pitch metres to three.js world units", () => expect(toWorld([3, 4], 2)).toEqual([3, 2, -4]));
});

describe("flights", () => {
  it("eases between two poses with a unit up vector", () => {
    const a = broadcastPose([0, 0]), b = tacticalPose(1.5);
    near(lerpPose(a, b, 0).position, a.position);
    near(lerpPose(a, b, 1).target, b.target);
    near(lerpPose(a, b, 1).up, b.up);
    expect(Math.hypot(...lerpPose(a, b, 0.5).up)).toBeCloseTo(1, 9);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(2)).toBe(1);
  });
  it("cuts instead of flying when the visitor prefers reduced motion", () => {
    expect(flightSeconds(true)).toBe(0);
    expect(flightSeconds(false)).toBe(FLY_S);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/football3d-camera.test.mjs`
Expected: FAIL with `Failed to load url ../src/lib/football3d/camera.ts` (the module does not exist).

- [ ] **Step 3: Write the implementation.** Create `src/lib/football3d/camera.ts`:

```ts
// Camera maths for the football replay's 3D view (phase 3). Pure, so it is unit-tested in Node:
// - where each camera sits and looks
// - frame-rate independent smoothing that keeps the cameras calm
// - the eased flight between two cameras (a cut when the visitor prefers reduced motion)
// World coordinates are three.js's: pitch (x, y) at height h is [x, h, -y].
import { HALF_LENGTH, HALF_WIDTH, type Vec } from "../coach/geometry";

export type V3 = [number, number, number];
export type CameraMode = "broadcast" | "tactical" | "eyes";
export const CAMERA_MODES: readonly CameraMode[] = ["broadcast", "tactical", "eyes"];
export interface Pose { position: V3; target: V3; up: V3; fov: number }

export const EYE_HEIGHT = 1.7;   // m, the player's-eyes camera
export const MOVING_MS = 0.5;    // m/s: slower than this a player is standing, and looks at the ball
export const FOLLOW_TAU = 0.6;   // s, how far the stadium camera lags behind the ball
export const LOOK_TAU = 0.25;    // s, how far the player's-eyes camera lags behind his direction
export const SNAP_M = 25;        // a jump in the replay that moves the ball this far cuts instead of panning
export const FLY_S = 0.9;        // s, flight between two cameras
export const BROADCAST = { back: 30, height: 20, fov: 38, follow: 0.8 }; // 30 m behind the near touchline, 20 m up
export const TACTICAL_MARGIN = 4; // m of grass shown around the pitch
const TACTICAL_FOV = 30;

export const toWorld = (p: Vec, h = 0): V3 => [p[0], h, -p[1]];
export const nextCamera = (m: CameraMode): CameraMode => CAMERA_MODES[(CAMERA_MODES.indexOf(m) + 1) % CAMERA_MODES.length];
export const flightSeconds = (reduced: boolean) => (reduced ? 0 : FLY_S);

/** Exponential smoothing that does not depend on the frame rate: after `tau` seconds, 63 % of the gap is closed. */
export function damp(cur: number, target: number, dt: number, tau: number): number {
  if (dt <= 0) return cur;
  if (tau <= 0) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
}
export const dampVec = (cur: Vec, target: Vec, dt: number, tau: number): Vec =>
  [damp(cur[0], target[0], dt, tau), damp(cur[1], target[1], dt, tau)];
export const settled = (a: Vec, b: Vec, eps = 0.05) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;

function unit(v: Vec): Vec | null {
  const n = Math.hypot(v[0], v[1]);
  return n < 1e-9 ? null : [v[0] / n, v[1] / n];
}

/** The stadium camera's aim point: lags behind the ball, but cuts when the replay jumps. */
export function followBall(cur: Vec, ball: Vec, dt: number): Vec {
  return Math.hypot(ball[0] - cur[0], ball[1] - cur[1]) > SNAP_M ? [ball[0], ball[1]] : dampVec(cur, ball, dt, FOLLOW_TAU);
}

/** Where a player looks: along his velocity when he moves, else towards the ball, else where he looked before. */
export function lookDirection(vel: Vec, pos: Vec, ball: Vec | null, prev: Vec): Vec {
  if (Math.hypot(vel[0], vel[1]) >= MOVING_MS) return unit(vel)!;
  if (ball && Math.hypot(ball[0] - pos[0], ball[1] - pos[1]) > 0.3) return unit([ball[0] - pos[0], ball[1] - pos[1]])!;
  return unit(prev) ?? [1, 0];
}

/** Turn a unit direction towards another, smoothly; exactly opposite directions jump to the target. */
export function smoothDirection(cur: Vec, target: Vec, dt: number, tau: number): Vec {
  return unit(dampVec(cur, target, dt, tau)) ?? [target[0], target[1]];
}

/** TV-style camera on the near touchline, panning along with the ball (`focus` = the smoothed ball position). */
export function broadcastPose(focus: Vec): Pose {
  const x = Math.max(-HALF_LENGTH, Math.min(HALF_LENGTH, focus[0]));
  return {
    position: [x * BROADCAST.follow, BROADCAST.height, HALF_WIDTH + BROADCAST.back],
    target: toWorld([x, focus[1] * 0.5]),
    up: [0, 1, 0],
    fov: BROADCAST.fov,
  };
}

/** Half extents (m) of the top-down view that fits the pitch and its margin in a viewport of this width / height. */
export function tacticalExtent(aspect: number): { halfW: number; halfH: number } {
  const w = HALF_LENGTH + TACTICAL_MARGIN, h = HALF_WIDTH + TACTICAL_MARGIN, a = Math.max(0.1, aspect);
  return a >= w / h ? { halfW: h * a, halfH: h } : { halfW: w, halfH: w / a };
}

/** Perspective twin of the orthographic tactical view, used during flights: same ground extent, straight above. */
export function tacticalPose(aspect: number): Pose {
  const { halfH } = tacticalExtent(aspect);
  return { position: [0, halfH / Math.tan((TACTICAL_FOV * Math.PI) / 360), 0], target: [0, 0, 0], up: [0, 0, -1], fov: TACTICAL_FOV };
}

/** Head height, looking 20 m ahead along `dir` (a unit vector), slightly down so the grass is in view. */
export function eyesPose(pos: Vec, dir: Vec): Pose {
  return {
    position: toWorld(pos, EYE_HEIGHT),
    target: toWorld([pos[0] + 20 * dir[0], pos[1] + 20 * dir[1]], 0.8),
    up: [0, 1, 0],
    fov: 70,
  };
}

export const ease = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};

export function lerpPose(a: Pose, b: Pose, u: number): Pose {
  const mix = (p: V3, q: V3): V3 => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
  const up = mix(a.up, b.up), n = Math.hypot(up[0], up[1], up[2]) || 1;
  return { position: mix(a.position, b.position), target: mix(a.target, b.target), up: [up[0] / n, up[1] / n, up[2] / n], fov: a.fov + (b.fov - a.fov) * u };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/football3d-camera.test.mjs`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/football3d/camera.ts tests/football3d-camera.test.mjs
git commit -m "Football 3D: camera maths (stadium, tactical, player's eyes, smoothing, flights)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Ground shapes, number atlas cells, WebGL check

**Files:**
- Create: `src/lib/football3d/shapes.ts`, `src/lib/football3d/webgl.ts`
- Test: `tests/football3d-shapes.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/football3d-shapes.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { LINE_W, arrowTriangles, atlasCell, pitchMarkings, ribbon } from "../src/lib/football3d/shapes.ts";
import { hasWebGL } from "../src/lib/football3d/webgl.ts";

describe("pitch markings", () => {
  const lines = pitchMarkings(), pts = lines.flat();
  it("has the 18 markings of a 105 x 68 m pitch, all on the pitch", () => {
    expect(lines).toHaveLength(18);
    for (const [x, y] of pts) {
      expect(Math.abs(x)).toBeLessThanOrEqual(52.5 + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(34 + 1e-9);
    }
  });
  it("is symmetric about the halfway line", () => {
    for (const [x, y] of pts) expect(pts.some(([u, v]) => Math.abs(u + x) < 1e-6 && Math.abs(v - y) < 1e-6)).toBe(true);
  });
  it("puts the penalty arcs outside the areas, 9.15 m from the spots", () => {
    const arcs = lines.filter((l) => l.length === 25);
    expect(arcs).toHaveLength(2);
    for (const a of arcs) for (const [x, y] of a) {
      expect(Math.hypot(Math.abs(x) - 41.5, y)).toBeCloseTo(9.15, 9);
      expect(Math.abs(x)).toBeLessThanOrEqual(36 + 1e-9);
    }
  });
});

describe("ground shapes", () => {
  it("turns a segment into two triangles of the line's width", () => {
    expect([...ribbon([[[0, 0], [10, 0]]], 0.2)].map((v) => +v.toFixed(6))).toEqual([0, 0.1, 0, -0.1, 10, 0.1, 10, 0.1, 0, -0.1, 10, -0.1]);
    expect(ribbon(pitchMarkings()).length % 12).toBe(0);
    expect(LINE_W).toBe(0.12);
  });
  it("draws an arrow whose head ends exactly at the target", () => {
    const a = [...arrowTriangles([0, 0], [10, 0], 0.35, 1.6)].map((v) => +v.toFixed(5));
    expect(a).toHaveLength(18);
    expect(a.slice(0, 2)).toEqual([0, 0.175]);
    expect(a.slice(12, 18)).toEqual([10, 0, 8.4, 0.7, 8.4, -0.7]);
  });
  it("keeps the head of a short arrow at most half its length", () => {
    expect(arrowTriangles([0, 0], [2, 0], 0.35, 1.6)[14]).toBeCloseTo(1, 5);
  });
});

describe("shirt-number atlas", () => {
  it("finds a number's cell, counting rows from the bottom as texture coordinates do", () => {
    expect(atlasCell(0)).toEqual([0, 9]);
    expect(atlasCell(7)).toEqual([7, 9]);
    expect(atlasCell(10)).toEqual([0, 8]);
    expect(atlasCell(99)).toEqual([9, 0]);
    expect(atlasCell(123)).toEqual([9, 0]);
  });
});

describe("WebGL check", () => {
  const canvas = (ctx) => () => ({ getContext: (id) => ctx[id] ?? null });
  it("needs WebGL 2 (three.js dropped WebGL 1) and releases the test context", () => {
    let lost = 0;
    expect(hasWebGL(canvas({ webgl2: { getExtension: () => ({ loseContext: () => lost++ }) } }))).toBe(true);
    expect(lost).toBe(1);
    expect(hasWebGL(canvas({ webgl: {} }))).toBe(false);
    expect(hasWebGL(() => { throw new Error("no canvas"); })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/football3d-shapes.test.mjs`
Expected: FAIL, because `shapes.ts` and `webgl.ts` cannot be loaded.

- [ ] **Step 3: Write the implementation.** Create `src/lib/football3d/shapes.ts`:

```ts
// Flat shapes for the 3D pitch, in pitch metres (x along the length, y across, centre spot = origin):
// - the line markings, as polylines
// - polylines turned into ground ribbons (triangles)
// - the coach's arrows, as triangles
// - the cell of a shirt number in the 10 x 10 number atlas
// No three.js here, so it is unit-tested in Node; scene.ts lifts the [x, y] pairs to the world as (x, height, -y).
import { HALF_LENGTH, HALF_WIDTH, type Vec } from "../coach/geometry";

const L = HALF_LENGTH, W = HALF_WIDTH;
export const LINE_W = 0.12; // markings are 12 cm wide

function arc(c: Vec, r: number, a0: number, a1: number, n: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

/** Every line marking of a 105 x 68 m pitch as polylines (closed shapes repeat their first point). */
export function pitchMarkings(): Vec[][] {
  const out: Vec[][] = [
    [[-L, -W], [L, -W], [L, W], [-L, W], [-L, -W]], // touchlines and goal lines
    [[0, -W], [0, W]],                              // halfway line
    arc([0, 0], 9.15, 0, 2 * Math.PI, 64),          // centre circle
    arc([0, 0], 0.2, 0, 2 * Math.PI, 12),           // centre spot
  ];
  const a = Math.acos(5.5 / 9.15); // the penalty area's line is 16.5 - 11 = 5.5 m in front of the spot
  for (const s of [-1, 1]) {
    const g = s * L;
    out.push([[g, -20.16], [s * (L - 16.5), -20.16], [s * (L - 16.5), 20.16], [g, 20.16]]); // penalty area
    out.push([[g, -9.16], [s * (L - 5.5), -9.16], [s * (L - 5.5), 9.16], [g, 9.16]]);       // goal area
    out.push(arc([s * (L - 11), 0], 0.2, 0, 2 * Math.PI, 12));                              // penalty spot
    out.push(s > 0 ? arc([L - 11, 0], 9.15, Math.PI - a, Math.PI + a, 24) : arc([-L + 11, 0], 9.15, -a, a, 24)); // penalty arc
    for (const t of [-1, 1]) {
      const a0 = s > 0 ? Math.PI : 0; // corner arcs: the 1 m quarter circle inside the pitch
      out.push(arc([g, t * W], 1, a0, a0 + (s * t > 0 ? Math.PI / 2 : -Math.PI / 2), 8));
    }
  }
  return out;
}

/** Polylines as flat ribbons `width` wide: two triangles per segment, [x, y] per vertex (12 numbers per segment). */
export function ribbon(lines: Vec[][], width = LINE_W): Float32Array {
  const segs = lines.reduce((n, l) => n + Math.max(0, l.length - 1), 0), out = new Float32Array(segs * 12);
  let k = 0;
  for (const l of lines) for (let i = 0; i + 1 < l.length; i++) {
    const [ax, ay] = l[i], [bx, by] = l[i + 1], len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * (width / 2), ny = ((bx - ax) / len) * (width / 2);
    out.set([ax + nx, ay + ny, ax - nx, ay - ny, bx + nx, by + ny, bx + nx, by + ny, ax - nx, ay - ny, bx - nx, by - ny], k);
    k += 12;
  }
  return out;
}

/** A flat arrow from `from` to `to`: a shaft `width` wide and a head (at most half the arrow) 4 × width wide.
 *  3 triangles, [x, y] per vertex (18 numbers); vertex 6 is the tip. */
export function arrowTriangles(from: Vec, to: Vec, width = 0.35, head = 1.6): Float32Array {
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, w = width / 2, hw = width * 2;
  const h = Math.min(head, len / 2), bx = to[0] - ux * h, by = to[1] - uy * h;
  return new Float32Array([
    from[0] + nx * w, from[1] + ny * w, from[0] - nx * w, from[1] - ny * w, bx + nx * w, by + ny * w,
    bx + nx * w, by + ny * w, from[0] - nx * w, from[1] - ny * w, bx - nx * w, by - ny * w,
    to[0], to[1], bx + nx * hw, by + ny * hw, bx - nx * hw, by - ny * hw,
  ]);
}

/** Cell [column, row counted from the bottom] of shirt number n (0–99) in the 10 x 10 atlas drawn row by row from the
 *  top-left (texture v grows upwards). Numbers above 99 share the last cell. */
export function atlasCell(n: number): Vec {
  const k = Math.max(0, Math.min(99, Math.round(n)));
  return [k % 10, 9 - Math.floor(k / 10)];
}
```

Then create `src/lib/football3d/webgl.ts`:

```ts
// Can this browser draw the football replay's 3D view? three.js (r163+) needs WebGL 2. Asked once the replay data is
// ready, not on page load; the test context is released at once.
type CanvasLike = { getContext(id: string): unknown };
type GL = { getExtension?(name: string): { loseContext?(): void } | null };

export function hasWebGL(make: () => CanvasLike = () => document.createElement("canvas")): boolean {
  try {
    const gl = make().getContext("webgl2") as GL | null;
    if (!gl) return false;
    gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/football3d-shapes.test.mjs`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/football3d/shapes.ts src/lib/football3d/webgl.ts tests/football3d-shapes.test.mjs
git commit -m "Football 3D: pitch markings, ground ribbons, arrows, number atlas cells, WebGL 2 check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: What the 3D view draws at a moment

**Files:**
- Create: `src/lib/football3d/frame.ts`
- Test: `tests/football3d-frame.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/football3d-frame.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { ABSENT, decodeHalf } from "../src/lib/coach/replay.ts";
import { BALL_R, ballHeight, buildFrame, decodeBallZ, eyesChoices } from "../src/lib/football3d/frame.ts";

const players = [
  { team: 0, shirt: 10, name: "A" }, { team: 0, shirt: 8, name: "B" }, { team: 1, shirt: 4, name: "C" },
  { team: -1, shirt: 0, name: "?" }, { team: 1, shirt: 9, name: "Sub" },
];
/** A half file from at(frame) -> [[x, y] | null for each slot..., ball [x, y] | null], metres (as in coach-replay.test). */
function halfFile(frames, slots, at) {
  const stride = (slots.length + 1) * 2, data = new Int16Array(frames * stride);
  for (let f = 0; f < frames; f++) at(f).forEach((p, c) => {
    data[f * stride + 2 * c] = p ? Math.round(p[0] * 100) : ABSENT;
    data[f * stride + 2 * c + 1] = p ? Math.round(p[1] * 100) : ABSENT;
  });
  return data.buffer;
}
const FR = 20;
// A runs along +x at 2.5 m/s with the ball; B and "?" stand; C arrives at frame 3; player 4 is not in this half.
const info = { frames: FR, slots: [0, 1, 2, 3], attack: [1, -1] };
const h = decodeHalf(halfFile(FR, info.slots, (f) => [[-10 + 0.2 * f, 0], [5, 5], f < 3 ? null : [10, 0], [0, 30], [-10 + 0.2 * f, 0.5]]), info, players.length);
const meta = {
  match_id: "T", fps: 12.5, halves: [info], players, meta: { home: "Home", guest: "Away", colors: ["#9F1922", "#FFFFFF"] },
  owner: ["1".repeat(FR)], alive: ["1".repeat(FR)], events: [], credit: "",
};
const near = (got, want) => want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 9));
const input = (over) => ({ t: 5.5, z: null, carrier: null, arrows: [], focus: null, trail: false, ...over });

describe("ball height", () => {
  const z = new Int16Array([0, 100, ABSENT, 300]);
  it("decodes one int16 (cm) per frame and rejects a file of the wrong size", () => {
    expect(decodeBallZ(z.buffer, 4)).toEqual(z);
    expect(() => decodeBallZ(new ArrayBuffer(6), 4)).toThrow(/expected 8/);
  });
  it("interpolates in metres, bridges unknown values and never goes below the resting height", () => {
    expect(ballHeight(z, 0.5)).toBeCloseTo(0.5, 9);
    expect(ballHeight(z, 1.5)).toBeCloseTo(1, 9);
    expect(ballHeight(z, 2.5)).toBeCloseTo(3, 9);
    expect(ballHeight(z, 0)).toBe(BALL_R);
    expect(ballHeight(null, 3)).toBe(BALL_R);
  });
});

describe("frame for the 3D view", () => {
  it("gives every figure its team colour (grey without a team) and shirt number", () => {
    const f = buildFrame(meta, h, input({ carrier: 0 }));
    expect(f.figures.map((x) => [x.player, x.shirt, x.colour])).toEqual([[0, 10, "#9F1922"], [1, 8, "#9F1922"], [2, 4, "#FFFFFF"], [3, 0, "#777777"]]);
    near(f.figures[0].at, [-8.9, 0]);
    near(f.ball, [-8.9, 0.5]);
    expect(f.ballH).toBe(BALL_R);
    expect(f.carrier).toBe(0);
    expect(f.trail).toEqual([]);
    expect(f.focus).toBeNull();
  });
  it("adds the followed player's speed (for his eyes) and the last second of ball trail", () => {
    const f = buildFrame(meta, h, input({ focus: 0, trail: true }));
    expect(f.focus.player).toBe(0);
    near(f.focus.vel, [2.5, 0]);
    near(f.focus.at, [-8.9, 0]);
    expect(f.trail).toHaveLength(6);
    expect(buildFrame(meta, h, input({ t: 1, focus: 2 })).focus).toBeNull(); // C is not on the pitch yet
  });
  it("lists both teams' players for the 'Whose eyes' menu, home first, by shirt number", () => {
    expect(eyesChoices(meta, h)).toEqual([
      { player: 1, label: "#8 B (Home)" }, { player: 0, label: "#10 A (Home)" }, { player: 2, label: "#4 C (Away)" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/football3d-frame.test.mjs`
Expected: FAIL, because `frame.ts` cannot be loaded.

- [ ] **Step 3: Write the implementation.** Create `src/lib/football3d/frame.ts`:

```ts
// What the football replay's 3D view draws at one moment (phase 3), from the same clock and data as the 2D pitch:
// - the figures, with team colour and shirt number
// - the ball and its height
// - the ball carrier
// - the coach's arrows
// - the ball trail
// - for the player's-eyes camera, the followed player's position and speed
// Pure (no three.js), so it is unit-tested in Node. z<i>.bin (library coach/export.py) is the ball's height per frame,
// int16 cm, -32768 = unknown.
import type { Vec } from "../coach/geometry";
import { ABSENT, frameDots, trail, velocityAt, type HalfData, type MatchMeta } from "../coach/replay";

export const BALL_R = 0.11; // m: the ball's radius, so the height of its centre when it rests on the grass
const NO_TEAM = "#777777";  // players who are not on the match sheet (grey, as in 2D)

export type Tone = "best" | "pick" | "other";
export interface ArrowSpec { from: Vec; to: Vec; label: string; tone: Tone }
export interface Figure { player: number; at: Vec; team: number; shirt: number; colour: string }
export interface Frame3D {
  figures: Figure[]; ball: Vec | null; ballH: number; carrier: number | null; arrows: ArrowSpec[]; trail: Vec[];
  focus: { player: number; at: Vec; vel: Vec } | null;
}
export interface FrameInput { t: number; z: Int16Array | null; carrier: number | null; arrows: ArrowSpec[]; focus: number | null; trail: boolean }
export interface EyesChoice { player: number; label: string }

export function decodeBallZ(buf: ArrayBuffer, frames: number): Int16Array {
  if (buf.byteLength !== frames * 2) throw new Error(`ball height file has ${buf.byteLength} bytes, expected ${frames * 2}`);
  return new Int16Array(buf);
}

/** The ball centre's height (m) at a fractional frame; the resting height without a file or below it. */
export function ballHeight(z: Int16Array | null, t: number): number {
  if (!z || !z.length) return BALL_R;
  const last = z.length - 1, f0 = Math.max(0, Math.min(last, Math.floor(t))), f1 = Math.min(last, f0 + 1);
  const a = Math.max(0, Math.min(1, t - f0)), v0 = z[f0], v1 = z[f1];
  const cm = v0 === ABSENT ? (v1 === ABSENT ? 0 : v1) : v1 === ABSENT ? v0 : v0 + (v1 - v0) * a;
  return Math.max(BALL_R, cm / 100);
}

export function buildFrame(m: MatchMeta, h: HalfData, inp: FrameInput): Frame3D {
  const { players, ball } = frameDots(h, inp.t);
  const figures = players.map(({ player, at }): Figure => {
    const p = m.players[player];
    return { player, at, team: p.team, shirt: p.shirt, colour: p.team === 0 || p.team === 1 ? m.meta.colors[p.team] : NO_TEAM };
  });
  const f = inp.focus === null ? undefined : figures.find((x) => x.player === inp.focus);
  return {
    figures, ball, ballH: ballHeight(inp.z, inp.t), carrier: inp.carrier, arrows: inp.arrows,
    trail: inp.trail ? trail(h, inp.t, m.fps) : [],
    focus: f ? { player: f.player, at: f.at, vel: velocityAt(h, Math.floor(inp.t), f.player, m.fps) } : null,
  };
}

/** Players of either team who appear in this half, home first, by shirt number: the "Whose eyes" menu. */
export function eyesChoices(m: MatchMeta, h: HalfData): EyesChoice[] {
  return h.info.slots
    .filter((p) => m.players[p].team === 0 || m.players[p].team === 1)
    .sort((a, b) => m.players[a].team - m.players[b].team || m.players[a].shirt - m.players[b].shirt || a - b)
    .map((p) => {
      const i = m.players[p];
      return { player: p, label: `#${i.shirt} ${i.name} (${i.team ? m.meta.guest : m.meta.home})` };
    });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/football3d-frame.test.mjs`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/football3d/frame.ts tests/football3d-frame.test.mjs
git commit -m "Football 3D: frame model (figures, ball height, arrows, eyes target, Whose eyes list)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: The three.js scene (13 draw calls, picking)

**Files:**
- Create: `src/lib/football3d/scene.ts`
- Test: `tests/football3d-scene.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/football3d-scene.test.mjs`:

```js
// The 3D scene runs in Node: three.js objects need no WebGL until something renders them.
import { describe, expect, it } from "vitest";
import { Color, Matrix4, OrthographicCamera, PerspectiveCamera } from "three";
import { BALL_VIS_R, createScene } from "../src/lib/football3d/scene.ts";

const fig = (player, x, y, team = 0) => ({ player, at: [x, y], team, shirt: player + 1, colour: team ? "#FFFFFF" : "#9F1922" });
const frame = (over = {}) => ({ figures: [fig(0, 10, 5), fig(1, -20, 0, 1)], ball: [10, 5.5], ballH: 0.11, carrier: 0, arrows: [], trail: [], focus: null, ...over });
const drawables = (scene) => { let n = 0; scene.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) n++; }); return n; };
const scaleOf = (mesh, i) => { const m = new Matrix4(); mesh.getMatrixAt(i, m); return m.elements[0]; };
function above(x, y) { // a perspective camera 30 m straight above pitch point (x, y)
  const cam = new PerspectiveCamera(50, 1.5, 0.3, 600);
  cam.position.set(x, 30, -y); cam.up.set(0, 0, -1); cam.lookAt(x, 0, -y); cam.updateMatrixWorld();
  return cam;
}

describe("3D scene", () => {
  it("draws everything in at most 40 calls, however many players there are", () => {
    const s = createScene(null);
    expect(drawables(s.scene)).toBeLessThanOrEqual(40);
    s.update(frame({ figures: Array.from({ length: 22 }, (_, i) => fig(i, i * 4 - 44, 0, i % 2)) }), null);
    expect(s.parts.bodies.count).toBe(22);
    expect(drawables(s.scene)).toBe(13);
  });
  it("colours each body with its team and hides the player whose eyes we look through", () => {
    const s = createScene(null);
    s.update(frame(), 0);
    expect(scaleOf(s.parts.bodies, 0)).toBe(0);
    expect(scaleOf(s.parts.bodies, 1)).toBe(1);
    const c = new Color();
    s.parts.bodies.getColorAt(1, c);
    expect(c.getHex()).toBe(new Color("#FFFFFF").getHex());
    expect(s.parts.ring.visible).toBe(false); // the carrier ring goes with the hidden carrier
  });
  it("puts the ball at its tracked height, never below its drawn radius", () => {
    const s = createScene(null);
    s.update(frame({ ballH: 3 }), null);
    expect(s.parts.ball.position.y).toBe(3);
    s.update(frame({ ballH: 0.05 }), null);
    expect(s.parts.ball.position.y).toBe(BALL_VIS_R);
    s.update(frame({ ball: null }), null);
    expect(s.parts.ball.visible).toBe(false);
  });
  it("builds one flat arrow (9 vertices) per option and the ball trail", () => {
    const s = createScene(null);
    const arrows = [{ from: [10, 5], to: [30, 0], label: "#9 74 %", tone: "best" }, { from: [10, 5], to: [0, 20], label: "62 %", tone: "other" }];
    s.update(frame({ arrows, trail: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] }), null);
    expect(s.parts.arrows.geometry.drawRange.count).toBe(18);
    expect(s.parts.trail.geometry.drawRange.count).toBe(5);
  });
  it("scales the figures up for the tactical view", () => {
    const s = createScene(null);
    s.update(frame(), null, 2.5);
    expect(scaleOf(s.parts.bodies, 0)).toBeCloseTo(2.5, 9);
  });
  it("picks the player under the pointer, or the nearest within 2.5 m of where the ray meets the grass", () => {
    const s = createScene(null);
    s.update(frame(), null);
    const cam = above(10, 5);
    expect(s.pick([0, 0], cam)).toBe(0);     // straight down onto his body
    expect(s.pick([0.05, 0], cam)).toBe(0);  // about 1 m to his side on the grass
    expect(s.pick([0.5, 0], cam)).toBeNull(); // 10 m away: nobody
    const top = new OrthographicCamera(-60, 60, 40, -40, 1, 400);
    top.position.set(0, 200, 0); top.up.set(0, 0, -1); top.lookAt(0, 0, 0); top.updateMatrixWorld();
    expect(s.pick([-20 / 60, 0], top)).toBe(1);
    s.update(frame(), 0);
    expect(s.pick([0, 0], cam)).toBeNull();  // the hidden player cannot be picked
  });
  it("frees every geometry on dispose", () => {
    const s = createScene(null);
    let freed = 0;
    s.scene.traverse((o) => o.geometry?.addEventListener("dispose", () => freed++));
    s.dispose();
    expect(freed).toBe(13);
  });
});

describe("3D view module", () => {
  it("loads without a browser (it touches the DOM only when created)", async () => {
    const v = await import("../src/lib/football3d/view3d.ts");
    expect(typeof v.createView3D).toBe("function");
    expect(v.MAX_DPR).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/football3d-scene.test.mjs`
Expected: FAIL, because `scene.ts` and `view3d.ts` cannot be loaded. The "3D view module" test keeps failing until Task 10.

- [ ] **Step 3: Write the implementation.** Create `src/lib/football3d/scene.ts`:

```ts
// The football replay's 3D scene (phase 3). It contains the pitch, the goals, low-poly players with team colours and
// shirt numbers, the ball at its tracked height, the coach's arrows and the ball trail.
// It is built from three.js objects only (no renderer, no DOM), so Node tests can count its draw calls, update it and
// pick players. Pitch metres map to three.js world units as (x, y, height) -> (x, height, -y): +x to the right and +y
// away from the stadium camera, as on the 2D pitch.
// 13 draw calls whatever the number of players: each body part is one instanced mesh, and the shirt numbers are
// billboards sampling a 10 x 10 number atlas.
import {
  BufferAttribute, BufferGeometry, CapsuleGeometry, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  DynamicDrawUsage, HemisphereLight, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Line, LineBasicMaterial,
  Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Plane, PlaneGeometry, Quaternion, Raycaster, RingGeometry, Scene,
  ShaderMaterial, SphereGeometry, Vector2, Vector3, type Camera, type Material, type Texture,
} from "three";
import { GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, type Vec } from "../coach/geometry";
import type { Frame3D, Tone } from "./frame";
import { arrowTriangles, atlasCell, pitchMarkings, ribbon } from "./shapes";

export const MAX_FIGURES = 40;  // instances per body part (22 on the pitch; spare room for data with more slots)
export const BODY_Y = 0.78;     // capsule centre: a 1.0 m cylinder + two 0.28 m caps = 1.56 m tall
export const HEAD_Y = 1.7;
export const NUMBER_Y = 2.3;
export const BALL_VIS_R = 0.22; // drawn at twice its real radius so it can be seen from the stand
export const PICK_M = 2.5;      // a tap on the grass this close to a player picks him
const GOAL_H = 2.44, MAX_TRAIL = 32, MAX_ARROWS = 4;
const TONES: Record<Tone, string> = { best: "#ff5b1f", pick: "#7fd18b", other: "#ecebe6" }; // --signal, --ok, --ink

const NUMBER_VS = /* glsl */ `
attribute vec2 aCell;
uniform float uSize;
varying vec2 vUv;
void main() {
  float k = length(instanceMatrix[0].xyz); // the instance's scale: 0 hides it
  vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  centre.xy += position.xy * uSize * k;    // billboard: always faces the camera
  gl_Position = projectionMatrix * centre;
  vUv = (aCell + uv) / 10.0;
}`;
const NUMBER_FS = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a < 0.35) discard;
  gl_FragColor = c;
}`;

export interface Scene3D {
  scene: Scene;
  parts: { bodies: InstancedMesh; heads: InstancedMesh; numbers: InstancedMesh; shadows: InstancedMesh; ring: Mesh; ball: Mesh; arrows: Mesh; trail: Line };
  /** Place everything for this frame; `hide` = the player whose eyes we look through; `scale` enlarges the figures. */
  update(frame: Frame3D, hide: number | null, scale?: number): void;
  /** The player under a point in normalised device coordinates ([-1, 1], y up), or null. */
  pick(ndc: Vec, camera: Camera): number | null;
  dispose(): void;
}

const flat = <T extends BufferGeometry>(g: T): T => { g.rotateX(-Math.PI / 2); return g; };

export function createScene(atlas: Texture | null): Scene3D {
  const scene = new Scene();
  scene.background = new Color("#0d0e10");
  const sun = new DirectionalLight(0xffffff, 1.5);
  sun.position.set(-30, 60, 40);
  scene.add(new HemisphereLight(0xffffff, 0x1d2b1f, 1.8), sun);

  const ground = (w: number, d: number, colour: string, y: number) => {
    const mesh = new Mesh(flat(new PlaneGeometry(w, d)), new MeshLambertMaterial({ color: colour }));
    mesh.position.y = y;
    return mesh;
  };
  const surround = ground(2 * HALF_LENGTH + 24, 2 * HALF_WIDTH + 24, "#12261b", -0.02);
  const grass = ground(2 * HALF_LENGTH + 6, 2 * HALF_WIDTH + 6, "#183224", -0.01);

  const flatLines = ribbon(pitchMarkings()), linePos = new Float32Array((flatLines.length / 2) * 3);
  for (let i = 0, j = 0; i < flatLines.length; i += 2, j += 3) linePos.set([flatLines[i], 0.005, -flatLines[i + 1]], j);
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(linePos, 3));
  const lines = new Mesh(lineGeo, new MeshBasicMaterial({ color: "#d9d8d2", side: DoubleSide }));

  const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), colour = new Color();
  const goals = new InstancedMesh(new CylinderGeometry(0.06, 0.06, 1, 8), new MeshLambertMaterial({ color: "#ffffff" }), 6);
  const bar = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2); // cylinder axis y -> world z (pitch y)
  let gi = 0;
  for (const side of [-1, 1]) {
    const x = side * HALF_LENGTH;
    for (const y of [-GOAL_HALF_WIDTH, GOAL_HALF_WIDTH]) goals.setMatrixAt(gi++, m.compose(p.set(x, GOAL_H / 2, -y), q.identity(), s.set(1, GOAL_H, 1)));
    goals.setMatrixAt(gi++, m.compose(p.set(x, GOAL_H, 0), bar, s.set(1, 2 * GOAL_HALF_WIDTH, 1)));
  }

  const figureMesh = (geometry: BufferGeometry, material: Material) => {
    const mesh = new InstancedMesh(geometry, material, MAX_FIGURES);
    mesh.count = 0;
    mesh.frustumCulled = false; // the instances move every frame; not worth bounds for culling
    return mesh;
  };
  const shadowMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  const shadows = figureMesh(flat(new CircleGeometry(0.45, 12)), shadowMat);
  const bodies = figureMesh(new CapsuleGeometry(0.28, 1.0, 4, 8), new MeshLambertMaterial({ color: 0xffffff }));
  for (let i = 0; i < MAX_FIGURES; i++) bodies.setColorAt(i, colour.set(0xffffff)); // instance colours exist before the first render
  const heads = figureMesh(new SphereGeometry(0.14, 10, 8), new MeshLambertMaterial({ color: "#d8d6cf" }));
  const cells = new InstancedBufferAttribute(new Float32Array(MAX_FIGURES * 2), 2);
  const numberGeo = new PlaneGeometry(1, 1);
  numberGeo.setAttribute("aCell", cells);
  const numbers = figureMesh(numberGeo, new ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uSize: { value: 0.75 } }, vertexShader: NUMBER_VS, fragmentShader: NUMBER_FS,
  }));

  const ring = new Mesh(flat(new RingGeometry(0.55, 0.75, 24)), new MeshBasicMaterial({ color: TONES.best }));
  ring.visible = false;
  const ball = new Mesh(new IcosahedronGeometry(BALL_VIS_R, 1), new MeshLambertMaterial({ color: "#ffffff" }));
  ball.visible = false;
  const ballShadow = new Mesh(flat(new CircleGeometry(0.3, 16)), shadowMat);
  ballShadow.visible = false;

  const arrowPos = new BufferAttribute(new Float32Array(MAX_ARROWS * 9 * 3), 3).setUsage(DynamicDrawUsage);
  const arrowCol = new BufferAttribute(new Float32Array(MAX_ARROWS * 9 * 3), 3).setUsage(DynamicDrawUsage);
  const arrowGeo = new BufferGeometry();
  arrowGeo.setAttribute("position", arrowPos);
  arrowGeo.setAttribute("color", arrowCol);
  arrowGeo.setDrawRange(0, 0);
  const arrows = new Mesh(arrowGeo, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
  arrows.frustumCulled = false;

  const trailPos = new BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3).setUsage(DynamicDrawUsage);
  const trailGeo = new BufferGeometry();
  trailGeo.setAttribute("position", trailPos);
  trailGeo.setDrawRange(0, 0);
  const trail = new Line(trailGeo, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  trail.frustumCulled = false;

  scene.add(surround, grass, lines, goals, shadows, bodies, heads, numbers, ring, ball, ballShadow, arrows, trail);

  let slots: number[] = [], spots: Vec[] = [], hidden: number | null = null;

  function update(f: Frame3D, hide: number | null, scale = 1) {
    const n = Math.min(MAX_FIGURES, f.figures.length);
    slots = []; spots = []; hidden = hide;
    q.identity();
    for (let i = 0; i < n; i++) {
      const fig = f.figures[i], x = fig.at[0], z = -fig.at[1], k = fig.player === hide ? 0 : scale;
      s.set(k, k, k);
      bodies.setMatrixAt(i, m.compose(p.set(x, BODY_Y * scale, z), q, s));
      bodies.setColorAt(i, colour.set(fig.colour));
      heads.setMatrixAt(i, m.compose(p.set(x, HEAD_Y * scale, z), q, s));
      numbers.setMatrixAt(i, m.compose(p.set(x, NUMBER_Y * scale, z), q, s));
      const [cx, cy] = atlasCell(fig.shirt);
      cells.setXY(i, cx, cy);
      shadows.setMatrixAt(i, m.compose(p.set(x, 0.01, z), q, s));
      slots.push(fig.player);
      spots.push(fig.at);
    }
    for (const mesh of [bodies, heads, numbers, shadows]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
    bodies.instanceColor!.needsUpdate = true;
    cells.needsUpdate = true;
    bodies.computeBoundingSphere(); // for picking

    const c = f.carrier === null ? undefined : f.figures.find((x) => x.player === f.carrier);
    ring.visible = !!c && f.carrier !== hide;
    if (c) { ring.position.set(c.at[0], 0.02, -c.at[1]); ring.scale.setScalar(scale); }

    ball.visible = ballShadow.visible = !!f.ball;
    if (f.ball) {
      ball.scale.setScalar(scale);
      ball.position.set(f.ball[0], Math.max(BALL_VIS_R * scale, f.ballH), -f.ball[1]);
      ballShadow.position.set(f.ball[0], 0.015, -f.ball[1]);
    }

    let v = 0;
    for (const a of f.arrows.slice(0, MAX_ARROWS)) {
      const tri = arrowTriangles(a.from, a.to);
      colour.set(TONES[a.tone]);
      for (let i = 0; i < tri.length; i += 2, v++) {
        arrowPos.setXYZ(v, tri[i], 0.03, -tri[i + 1]);
        arrowCol.setXYZ(v, colour.r, colour.g, colour.b);
      }
    }
    arrowGeo.setDrawRange(0, v);
    arrowPos.needsUpdate = arrowCol.needsUpdate = true;

    const tr = f.trail.slice(-MAX_TRAIL);
    tr.forEach((b, i) => trailPos.setXYZ(i, b[0], 0.05, -b[1]));
    trailGeo.setDrawRange(0, tr.length);
    trailPos.needsUpdate = true;
  }

  const ray = new Raycaster(), grassPlane = new Plane(new Vector3(0, 1, 0), 0), onGrass = new Vector3();
  function pick(ndc: Vec, camera: Camera): number | null {
    ray.setFromCamera(new Vector2(ndc[0], ndc[1]), camera);
    const hit = ray.intersectObject(bodies, false) // a hidden (scale 0) instance must never count as a hit
      .find((h) => h.instanceId !== undefined && h.instanceId < slots.length && slots[h.instanceId] !== hidden);
    if (hit) return slots[hit.instanceId!];
    if (!ray.ray.intersectPlane(grassPlane, onGrass)) return null;
    let best: number | null = null, bestD = PICK_M;
    spots.forEach((at, i) => {
      const d = Math.hypot(at[0] - onGrass.x, at[1] + onGrass.z); // world z = -pitch y
      if (slots[i] !== hidden && d <= bestD) { best = slots[i]; bestD = d; }
    });
    return best;
  }

  function dispose() {
    const mats = new Set<Material>();
    scene.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((x) => mats.add(x));
      if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose();
    });
    mats.forEach((x) => x.dispose());
  }

  return { scene, parts: { bodies, heads, numbers, shadows, ring, ball, arrows, trail }, update, pick, dispose };
}
```

- [ ] **Step 4: Run the scene tests**

Run: `npx vitest run tests/football3d-scene.test.mjs -t "3D scene"`
Expected: 7 passed. (The "3D view module" test is filtered out until Task 10.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/football3d/scene.ts tests/football3d-scene.test.mjs
git commit -m "Football 3D: three.js scene, 13 draw calls (instanced figures, billboard numbers), picking

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: The 3D view (renderer, cameras, render on demand)

**Files:**
- Create: `src/lib/football3d/view3d.ts`
- Test: `tests/football3d-scene.test.mjs` ("3D view module", written in Task 9); the browser behaviour is covered by `tests/football3d.spec.mjs` in Task 11

- [ ] **Step 1: Confirm the module test fails**

Run: `npx vitest run tests/football3d-scene.test.mjs -t "3D view module"`
Expected: FAIL, because `view3d.ts` cannot be loaded.

- [ ] **Step 2: Write the implementation.** Create `src/lib/football3d/view3d.ts`:

```ts
// The football replay's 3D view (phase 3). FootballReplay.astro loads it with import() the first time the visitor asks
// for 3D, so three.js never weighs on the 2D page.
// It renders only when:
// - the replay clock moves (show)
// - the camera mode or the followed player changes
// - a camera is still easing (a flight, the stadium camera catching the ball, the eyes camera turning)
// The pixel ratio is capped at MAX_DPR. Each open gets its own canvas: dispose() frees the GPU memory, drops the WebGL
// context and removes the canvas, because a lost context cannot be reused.
import { CanvasTexture, OrthographicCamera, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import type { Vec } from "../coach/geometry";
import {
  LOOK_TAU, broadcastPose, ease, eyesPose, flightSeconds, followBall, lerpPose, lookDirection, settled, smoothDirection,
  tacticalExtent, tacticalPose, type CameraMode, type Pose,
} from "./camera";
import type { Frame3D } from "./frame";
import { createScene } from "./scene";

export const MAX_DPR = 1.5;
const TACTICAL_SCALE = 2.5; // figures drawn larger in the tactical view, so they read from 140 m up

export interface ViewOptions {
  host: HTMLElement;   // the canvas is created inside it, before the labels overlay
  labels: HTMLElement; // overlay for the arrow labels (aria-hidden: the options are listed in the DOM panel)
  reduced: boolean;    // prefers-reduced-motion: camera changes cut instead of fly
  onRender?: (drawCalls: number) => void;
  onLost?: () => void; // the browser dropped the WebGL context
}
export interface View3D {
  readonly canvas: HTMLCanvasElement;
  show(frame: Frame3D): void;
  setMode(mode: CameraMode): void;
  pickAt(clientX: number, clientY: number): number | null;
  dispose(): void;
}

/** White shirt numbers 0–99 with a dark outline, 10 x 10 cells, drawn here (no image from the web). */
function numberAtlas(): CanvasTexture {
  const c = document.createElement("canvas"), cell = 64;
  c.width = c.height = cell * 10;
  const g = c.getContext("2d")!;
  g.font = `700 ${Math.round(cell * 0.62)}px system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = cell * 0.14; g.strokeStyle = "#0d0e10"; g.fillStyle = "#ffffff";
  for (let n = 0; n < 100; n++) {
    const x = ((n % 10) + 0.5) * cell, y = (Math.floor(n / 10) + 0.5) * cell;
    g.strokeText(String(n), x, y);
    g.fillText(String(n), x, y);
  }
  return new CanvasTexture(c);
}

export function createView3D(o: ViewOptions): View3D {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "3D view of the pitch");
  o.host.prepend(canvas);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  } catch (e) {
    canvas.remove();
    throw e;
  }
  renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
  const atlas = numberAtlas(), world = createScene(atlas);
  const persp = new PerspectiveCamera(38, 1.5, 0.3, 600);
  const ortho = new OrthographicCamera(-1, 1, 1, -1, 1, 400);
  ortho.position.set(0, 200, 0); ortho.up.set(0, 0, -1); ortho.lookAt(0, 0, 0);
  let active: PerspectiveCamera | OrthographicCamera = persp;
  let mode: CameraMode = "broadcast", frame: Frame3D | null = null, focus: Vec | null = null, look: Vec = [1, 0];
  let current: Pose | null = null, scale = 1, raf = 0, last = 0, disposed = false;
  let fly: { from: Pose; start: number; seconds: number; scale: number } | null = null;
  const tip = new Vector3();
  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);

  function livePose(dt: number): { pose: Pose; moving: boolean } {
    if (mode === "tactical") return { pose: tacticalPose(aspect()), moving: false };
    if (mode === "eyes" && frame?.focus) {
      const f = frame.focus, want = lookDirection(f.vel, f.at, frame.ball, look);
      look = smoothDirection(look, want, dt, LOOK_TAU);
      return { pose: eyesPose(f.at, look), moving: !settled(look, want, 0.01) };
    }
    const ball: Vec = frame?.ball ?? focus ?? [0, 0]; // eyes without a player on the pitch: the stadium camera
    focus = focus ? followBall(focus, ball, dt) : ball;
    return { pose: broadcastPose(focus), moving: !settled(focus, ball) };
  }

  function place(pose: Pose) {
    persp.position.set(...pose.position);
    persp.up.set(...pose.up);
    persp.lookAt(...pose.target);
    if (persp.fov !== pose.fov) { persp.fov = pose.fov; persp.updateProjectionMatrix(); }
  }

  /** Move the camera one animation frame; true while it is still easing (keep rendering). */
  function step(dt: number, now: number): boolean {
    const { pose: live, moving } = livePose(dt);
    const goal = mode === "tactical" ? TACTICAL_SCALE : 1;
    let pose = live, flying = false;
    if (fly) {
      const u = (now - fly.start) / (fly.seconds * 1000);
      if (u >= 1) fly = null;
      else { const e = ease(u); pose = lerpPose(fly.from, live, e); scale = fly.scale + (goal - fly.scale) * e; flying = true; }
    }
    if (!flying) scale = goal;
    current = pose;
    if (frame) world.update(frame, mode === "eyes" ? frame.focus?.player ?? null : null, scale);
    if (mode === "tactical" && !flying) {
      const { halfW, halfH } = tacticalExtent(aspect());
      ortho.left = -halfW; ortho.right = halfW; ortho.top = halfH; ortho.bottom = -halfH;
      ortho.updateProjectionMatrix();
      active = ortho;
    } else {
      place(pose);
      active = persp;
    }
    return flying || moving;
  }

  function startFly() {
    const seconds = flightSeconds(o.reduced);
    fly = seconds > 0 && current ? { from: current, start: performance.now(), seconds, scale } : null;
  }

  /** Arrow labels: DOM spans at the projected arrow tips; hidden when a tip is off screen or behind the camera. */
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight, arrows = frame?.arrows ?? [];
    while (o.labels.children.length < arrows.length) o.labels.append(document.createElement("span"));
    Array.from(o.labels.children).forEach((el, i) => {
      const span = el as HTMLElement, a = arrows[i];
      if (!a) { span.hidden = true; return; }
      tip.set(a.to[0], 0, -a.to[1]).project(active);
      span.hidden = tip.z < -1 || tip.z > 1 || Math.abs(tip.x) > 1 || Math.abs(tip.y) > 1;
      if (span.hidden) return;
      span.textContent = a.label;
      span.className = a.tone;
      span.style.transform = `translate(${Math.round(((tip.x + 1) / 2) * w + 8)}px, ${Math.round(((1 - tip.y) / 2) * h - 24)}px)`;
    });
  }

  function loop(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const moving = step(dt, now);
    renderer.render(world.scene, active);
    placeLabels();
    o.onRender?.(renderer.info.render.calls);
    if (moving) request();
  }
  const request = () => { if (!raf && !disposed) raf = requestAnimationFrame(loop); };

  const ro = new ResizeObserver(() => {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    request();
  });
  ro.observe(canvas);
  const lost = (e: Event) => { e.preventDefault(); o.onLost?.(); };
  canvas.addEventListener("webglcontextlost", lost);

  return {
    canvas,
    show(f) {
      const before = frame?.focus?.player ?? null, now = f.focus?.player ?? null;
      frame = f;
      if (mode === "eyes" && now !== null && now !== before) {
        look = lookDirection(f.focus!.vel, f.focus!.at, f.ball, look); // face his way at once
        if (before !== null) startFly(); // another player: fly over (setMode already started the flight into eyes)
      }
      request();
    },
    setMode(next) {
      if (next === mode) return;
      startFly();
      mode = next;
      request();
    },
    pickAt(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return world.pick([((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1)], active);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      world.dispose();
      atlas.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      o.labels.replaceChildren();
    },
  };
}
```

- [ ] **Step 3: Run the scene + module tests**

Run: `npx vitest run tests/football3d-scene.test.mjs`
Expected: 8 passed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/football3d/view3d.ts
git commit -m "Football 3D: view (renderer, stadium / tactical / eyes cameras, flights, render on demand, labels, dispose)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Wire the 3D view into the replay component

**Files:**
- Modify: `src/components/FootballReplay.astro`
- Test: `tests/football3d.spec.mjs` (create)

- [ ] **Step 1: Write the failing Playwright spec.** Create `tests/football3d.spec.mjs`:

```js
// The football replay's 3D view (phase 3) with the shipped match:
// - nothing 3D loads until asked
// - the toggle opens the 3D view on the same moment
// - cameras switch with the radio group, the C key and the "Whose eyes" menu
// - pausing on a ball carrier still lists the options in the DOM and labels the arrows in 3D
// - V goes back to 2D and removes the 3D canvas
// Skips when headless Chromium has no WebGL 2 (playwright.config.mjs asks for SwiftShader).
import { test, expect } from "@playwright/test";
import fs from "node:fs";

const FX = "tests/fixtures/coach-parity.json";
const live = fs.existsSync("public/football/models.json") && fs.existsSync(FX);
const fx = live ? JSON.parse(fs.readFileSync(FX, "utf8")) : null;

test.describe("football replay 3D", () => {
  test.skip(!live, "football data or parity fixture not here");
  test.setTimeout(90_000);

  test("3D on demand: toggle, cameras, options while paused, back to 2D", async ({ page }) => {
    const errors = [], urls = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => urls.push(r.url()));
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await root.hover(); // the data loads on first hover / focus
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    expect(urls.filter((u) => /view3d\.|\/z\d\.bin/.test(u))).toEqual([]); // no 3D code or ball height before the toggle
    const toggle = root.getByRole("button", { name: "3D view" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    test.skip((await root.getAttribute("data-webgl")) !== "true", "no WebGL 2 in this browser");
    await toggle.click();
    await expect(root).toHaveAttribute("data-view", "3d", { timeout: 20_000 });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const canvas3d = root.locator("[data-stage3d] canvas");
    await expect(canvas3d).toBeVisible();
    await expect(root.locator("[data-canvas]")).toBeHidden();
    expect(urls.some((u) => /view3d\./.test(u))).toBe(true);
    await expect.poll(async () => Number(await root.getAttribute("data-draw-calls"))).toBeGreaterThan(0);
    expect(Number(await root.getAttribute("data-draw-calls"))).toBeLessThanOrEqual(40);

    const r = fx.frames.find((f) => f.half === 0);
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-options", String(r.options.length));
    await expect(canvas3d).toHaveAttribute("aria-label", /^3D view \(stadium camera\), .* has the ball\.$/);

    await root.getByRole("radio", { name: "Tactical" }).check();
    await expect(root).toHaveAttribute("data-camera", "tactical");
    await expect(root.locator("[data-labels3d] span:not([hidden])").first()).toBeVisible();
    await page.keyboard.press("c"); // focus is on the radio group: C still cycles
    await expect(root).toHaveAttribute("data-camera", "eyes");
    const eyes = root.getByLabel("Whose eyes");
    await expect(eyes).toBeVisible();
    await expect(eyes).toHaveValue(String(r.carrier)); // paused on a carrier: his eyes first
    await eyes.selectOption({ index: 0 });
    await expect(canvas3d).toHaveAttribute("aria-label", /^3D view \(the eyes of #\d+ /);
    await root.getByRole("radio", { name: "Stadium" }).check();
    await expect(root).toHaveAttribute("data-camera", "broadcast");

    await root.getByRole("button", { name: "Follow the coach" }).click();
    await expect(root.locator("[data-tally-decisions]")).toHaveText("1");

    await page.keyboard.press("v");
    await expect(root).toHaveAttribute("data-view", "2d");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(canvas3d).toHaveCount(0);
    await expect(root.locator("[data-canvas]")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run build
npx playwright test tests/football3d.spec.mjs
```
Expected: FAIL on `getByRole("button", { name: "3D view" })` (`toHaveAttribute` times out), because the button does not exist yet. The WebGL skip comes after that check, so the test cannot skip at this point.

- [ ] **Step 3: Edit the markup.** In `src/components/FootballReplay.astro`:

(a) Replace

```text
// needed. Choices stay in memory; nothing is sent anywhere.
---
```

with

```text
// needed. Choices stay in memory; nothing is sent anywhere. Phase 3: a 3D view of the same moment (stadium camera,
// tactical view, a player's eyes) from src/lib/football3d/, loaded with import() on the first "3D view" press so
// three.js never weighs on the 2D page; the ball's height (z0/z1.bin, 68 kB per half) loads with it.
---
```

(b) Replace

```html
  <canvas class="pitch" data-canvas role="img" aria-label="Football pitch; the match is loading"></canvas>
```

with

```html
  <div class="stage">
    <canvas class="pitch" data-canvas role="img" aria-label="Football pitch; the match is loading"></canvas>
    <div class="stage3d" data-stage3d hidden>
      <div class="labels3d" data-labels3d aria-hidden="true"></div>
    </div>
  </div>
```

(c) Replace

```html
      <button type="button" class="btn ctl" data-half="1" aria-pressed="false" disabled>2nd half</button>
    </div>
  </div>
```

with

```html
      <button type="button" class="btn ctl" data-half="1" aria-pressed="false" disabled>2nd half</button>
    </div>
    <button type="button" class="btn ctl" data-view3d aria-pressed="false" aria-describedby="fr-3d-note" disabled>3D view</button>
  </div>
  <div class="view3d">
    <fieldset class="cams" data-cams hidden>
      <legend class="sr-only">Camera</legend>
      <label class="cam"><input type="radio" name="fr-cam" value="broadcast" checked /> Stadium</label>
      <label class="cam"><input type="radio" name="fr-cam" value="tactical" /> Tactical</label>
      <label class="cam"><input type="radio" name="fr-cam" value="eyes" /> Player's eyes</label>
    </fieldset>
    <label class="jump mono" data-eyes-row hidden>Whose eyes
      <select data-eyes></select>
    </label>
    <span class="note3d mono" id="fr-3d-note" data-note3d>3D view: stadium camera, tactical view or a player's eyes (tap a player). Loaded only when you ask for it.</span>
  </div>
```

(d) Replace `· F follow · 1–9 pick</p>` with `· F follow · 1–9 pick · V 3D view · C camera</p>`.

- [ ] **Step 4: Edit the script: imports, elements, state.**

(a) Replace

```ts
  import { arrowLabel, optionLabel, outcomeLabel, proLabel, signedXg, textOn } from "../lib/coach/format";
```

with

```ts
  import { arrowLabel, frameLabel, optionLabel, outcomeLabel, proLabel, signedXg, textOn } from "../lib/coach/format";
```

(b) Replace

```ts
  import { carrierAt, clock, decodeHalf, frameDots, markers, nearestCarrierFrame, playerAt, stateAt, trail, type Carrier, type HalfData, type MatchMeta } from "../lib/coach/replay";
```

with

```ts
  import { carrierAt, clock, decodeHalf, frameDots, markers, nearestCarrierFrame, playerAt, scoreAt, stateAt, trail, type Carrier, type HalfData, type MatchMeta } from "../lib/coach/replay";
  import { nextCamera, type CameraMode } from "../lib/football3d/camera";
  import { buildFrame, decodeBallZ, eyesChoices, type ArrowSpec, type Tone } from "../lib/football3d/frame";
  import { hasWebGL } from "../lib/football3d/webgl";
  import type { View3D } from "../lib/football3d/view3d"; // type only: three.js is loaded by import() in open3d()
```

(c) Replace

```ts
    const halfBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-half]")];
```

with

```ts
    const halfBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-half]")];
    const stage3d = $("[data-stage3d]"), labels3d = $("[data-labels3d]"), view3dBtn = $<HTMLButtonElement>("[data-view3d]");
    const cams = $<HTMLFieldSetElement>("[data-cams]"), eyesRow = $("[data-eyes-row]"), eyesSel = $<HTMLSelectElement>("[data-eyes]");
    const note3d = $("[data-note3d]");
```

(d) Replace

```ts
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
```

with

```ts
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const TONE: Record<Tone, string> = { best: SIGNAL, pick: OK, other: "rgba(236, 235, 230, 0.85)" };
    const CAMERA_NAMES: Record<CameraMode, string> = { broadcast: "stadium camera", tactical: "tactical view", eyes: "player's eyes" };
```

(e) Replace

```ts
    let tally: Tally = emptyTally();
```

with

```ts
    let tally: Tally = emptyTally();
    let view3d: View3D | null = null, opening3d = false, webgl = false, camMode: CameraMode = "broadcast", eyesOf: number | null = null;
    const zHalves: (Int16Array | null | undefined)[] = []; // ball height per half: undefined = not asked yet, null = none
```

(f) Replace

```ts
        .catch((e) => { loads[i] = undefined; throw e; }));
    }
```

with

```ts
        .catch((e) => { loads[i] = undefined; throw e; }));
    }

    // The ball's height (z<i>.bin, 68 kB per half) is only drawn in 3D: fetched the first time 3D shows that half.
    // Missing file or failed fetch: the 3D ball rests on the grass.
    async function getBallZ(i: number): Promise<Int16Array | null> {
      if (zHalves[i] !== undefined) return zHalves[i]!;
      try {
        const r = await fetch(`${BASE}z${i}.bin`);
        zHalves[i] = r.ok ? decodeBallZ(await r.arrayBuffer(), meta.halves[i].frames) : null;
      } catch (e) {
        console.warn(e);
        zHalves[i] = null;
      }
      return zHalves[i]!;
    }
```

- [ ] **Step 5: Edit the script: one draw path for 2D and 3D.**

(a) Replace

```ts
    function draw() {
      const k = scale();
```

with

```ts
    const shownAdvice = () => (!playing && advice && advice.half === half && advice.frame === frameNow() ? advice : null);

    /** The coach's arrows at this moment (top 3 + the viewer's pick), for the 2D canvas and the 3D view alike. */
    function arrowsNow(h: HalfData): ArrowSpec[] {
      const shown = shownAdvice();
      if (!shown) return [];
      const from = playerAt(h, shown.frame, shown.carrier.player), dir = meta.halves[half].attack[shown.carrier.team];
      if (!from) return [];
      const pick = chosen && chosen.half === half && chosen.frame === shown.frame ? shown.opts.find((o) => same(o, chosen!.option)) ?? null : null;
      const drawn = shown.opts.slice(0, 3);
      if (pick && !drawn.includes(pick)) drawn.push(pick);
      return drawn.map((o): ArrowSpec => ({
        from, to: normalise(o.to, dir), label: arrowLabel(o, meta.players),
        tone: o === pick ? "pick" : o === shown.opts[0] ? "best" : "other",
      }));
    }

    function draw3d() {
      const h = halves[half];
      if (!ready || !h || !view3d) return;
      view3d.show(buildFrame(meta, h, {
        t, z: zHalves[half] ?? null, carrier: shownAdvice()?.carrier.player ?? null, arrows: arrowsNow(h),
        focus: camMode === "eyes" ? eyesOf : null, trail: !reduced,
      }));
    }

    function draw() {
      if (view3d) { draw3d(); return; } // same clock, same frame: only the target differs
      const k = scale();
```

(b) Inside `draw()`, replace

```ts
      const shown = !playing && advice && advice.half === half && advice.frame === frameNow() ? advice : null;
      if (shown) {
        const from = playerAt(h, shown.frame, shown.carrier.player), dir = meta.halves[half].attack[shown.carrier.team];
        const pick = chosen && chosen.half === half && chosen.frame === shown.frame ? shown.opts.find((o) => same(o, chosen!.option)) ?? null : null;
        const drawn = shown.opts.slice(0, 3);
        if (pick && !drawn.includes(pick)) drawn.push(pick);
        if (from) for (const o of [...drawn].reverse())
          arrow(from, normalise(o.to, dir), o === pick ? OK : o === shown.opts[0] ? SIGNAL : "rgba(236, 235, 230, 0.85)", arrowLabel(o, meta.players), k);
      }
```

with

```ts
      const shown = shownAdvice();
      for (const a of arrowsNow(h).reverse()) arrow(a.from, a.to, TONE[a.tone], a.label, k); // best drawn last, on top
```

(c) Replace the whole `describe` function

```ts
    function describe(c: Carrier | null) {
      const when = `${clock(half, frameNow(), meta.fps)}, ${half ? "second" : "first"} half`, p = c && meta.players[c.player];
      canvas.setAttribute("aria-label", p
        ? `Pitch at ${when}: #${p.shirt} ${p.name} (${c!.team ? meta.meta.guest : meta.meta.home}) has the ball.`
        : `Pitch at ${when}: no player has the ball.`);
    }
```

with

```ts
    function cameraName(): string {
      return camMode === "eyes" && eyesOf !== null ? `the eyes of #${meta.players[eyesOf].shirt} ${meta.players[eyesOf].name}` : CAMERA_NAMES[camMode];
    }

    function describe(c: Carrier | null) {
      const f = frameNow(), when = `${clock(half, f, meta.fps)}, ${half ? "second" : "first"} half`, score = scoreAt(meta, half, f);
      canvas.setAttribute("aria-label", frameLabel(meta, "Pitch", when, score, c));
      view3d?.canvas.setAttribute("aria-label", frameLabel(meta, `3D view (${cameraName()})`, when, score, c));
    }
```

- [ ] **Step 6: Edit the script: halves, init, 3D open / close, cameras.**

(a) In `setHalf`, replace

```ts
      await getHalf(i);
      playBtn.disabled = false;
```

with

```ts
      await getHalf(i);
      if (view3d) await getBallZ(i);
      playBtn.disabled = false;
```

and replace

```ts
      seek(frame);
    }

    async function init() {
```

with

```ts
      if (view3d) fillEyes();
      seek(frame);
    }

    async function init() {
```

(b) In `init`, replace

```ts
      halfBtns.forEach((b) => (b.disabled = false));
```

with

```ts
      halfBtns.forEach((b) => (b.disabled = false));
      webgl = hasWebGL();
      root.dataset.webgl = String(webgl);
      view3dBtn.disabled = !webgl;
      if (!webgl) note3d.textContent = "The 3D view needs WebGL 2, which this browser does not offer; the 2D pitch shows everything.";
```

(c) Replace

```ts
    // ---------- wiring ----------
```

with

```ts
    // ---------- 3D view ----------
    function fillEyes() {
      const list = eyesChoices(meta, halves[half]!);
      eyesSel.replaceChildren(...list.map((c) => new Option(c.label, String(c.player))));
      if (!list.some((c) => c.player === eyesOf)) eyesOf = null;
      if (eyesOf !== null) eyesSel.value = String(eyesOf);
    }

    function setCamera(mode: CameraMode) {
      camMode = mode;
      if (mode === "eyes" && eyesOf === null) eyesOf = shownAdvice()?.carrier.player ?? (eyesSel.value ? Number(eyesSel.value) : null);
      if (eyesOf !== null) eyesSel.value = String(eyesOf);
      cams.querySelectorAll<HTMLInputElement>("input").forEach((r) => (r.checked = r.value === mode));
      eyesRow.hidden = mode !== "eyes";
      root.dataset.camera = mode;
      view3d?.setMode(mode);
      describe(carrierAt(meta, half, halves[half]!, frameNow()));
      say(`3D view: ${cameraName()}. C changes the camera, V goes back to 2D.`);
      draw();
    }

    async function open3d() {
      if (view3d || opening3d || !ready || !webgl) return;
      opening3d = true;
      view3dBtn.disabled = true;
      say("Loading the 3D view…");
      try {
        const [{ createView3D }] = await Promise.all([import("../lib/football3d/view3d"), getBallZ(half)]);
        view3d = createView3D({
          host: stage3d, labels: labels3d, reduced,
          onRender: (calls) => { root.dataset.drawCalls = String(calls); },
          onLost: () => { close3d(); say("The 3D view stopped (the browser dropped its graphics context). Press 3D view to try again."); },
        });
      } catch (err) {
        console.warn(err);
        say("The 3D view could not start in this browser; the 2D pitch shows everything.");
        return;
      } finally {
        opening3d = false;
        view3dBtn.disabled = false;
      }
      stage3d.hidden = false; canvas.hidden = true; cams.hidden = false;
      view3dBtn.setAttribute("aria-pressed", "true");
      root.dataset.view = "3d";
      fillEyes();
      setCamera(camMode);
    }

    function close3d() {
      if (!view3d) return;
      view3d.dispose(); // frees the GPU memory and removes the 3D canvas
      view3d = null;
      stage3d.hidden = true; canvas.hidden = false; cams.hidden = true; eyesRow.hidden = true;
      view3dBtn.setAttribute("aria-pressed", "false");
      root.dataset.view = "2d";
      delete root.dataset.drawCalls;
      say("Back to the 2D pitch.");
      resize();
    }

    function flip3d() {
      if (view3d) close3d();
      else open3d().catch(failed);
    }

    // ---------- wiring ----------
```

- [ ] **Step 7: Edit the script: events and keys.**

(a) Replace

```ts
    halfBtns.forEach((b) => b.addEventListener("click", () => { if (ready) setHalf(Number(b.dataset.half), 0).catch(failed); }));
```

with

```ts
    halfBtns.forEach((b) => b.addEventListener("click", () => { if (ready) setHalf(Number(b.dataset.half), 0).catch(failed); }));
    view3dBtn.addEventListener("click", flip3d);
    cams.addEventListener("change", (e) => setCamera((e.target as HTMLInputElement).value as CameraMode));
    eyesSel.addEventListener("change", () => { eyesOf = Number(eyesSel.value); setCamera("eyes"); });
    stage3d.addEventListener("click", (e) => { // click / tap a player: see through his eyes
      const p = view3d?.pickAt(e.clientX, e.clientY);
      if (p == null) return;
      eyesOf = p;
      setCamera("eyes");
    });
```

(b) Replace

```ts
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return; // the control handles its own keys
```

with

```ts
      const el = e.target as HTMLElement | null, tag = el?.tagName ?? "";
      const radio = tag === "INPUT" && (el as HTMLInputElement).type === "radio"; // the camera radios do not use V or C
      if (/^[vVcC]$/.test(e.key) && (radio || (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA"))) {
        e.preventDefault();
        if (e.key === "v" || e.key === "V") { if (webgl) flip3d(); }
        else if (view3d) setCamera(nextCamera(camMode));
        return;
      }
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return; // the control handles its own keys
```

- [ ] **Step 8: Edit the styles.** At the end of the `<style>` block, before `</style>`, add:

```css
  .stage { position: relative; }
  .stage3d { position: relative; width: 100%; aspect-ratio: 111 / 74; overflow: hidden; background: #0d0e10;
    border: 1px solid var(--line); border-radius: var(--radius); cursor: pointer; }
  .stage3d :global(canvas) { display: block; width: 100%; height: 100%; }
  .labels3d { position: absolute; inset: 0; pointer-events: none; }
  .labels3d :global(span) { position: absolute; left: 0; top: 0; padding: 2px 6px; font: 500 12px var(--font-mono, monospace);
    color: var(--ink); background: rgba(13, 14, 16, 0.85); border-radius: 4px; white-space: nowrap; }
  .labels3d :global(span.best) { color: var(--signal); }
  .labels3d :global(span.pick) { color: var(--ok); }
  .view3d { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .cams { display: inline-flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; border: 0; }
  .cam { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; font-size: 14px;
    border: 1px solid var(--line-2); border-radius: var(--radius); cursor: pointer; }
  .cam:has(input:checked) { border-color: var(--signal); }
  .cam input { accent-color: var(--signal); }
  .note3d { font-size: 12px; color: var(--ink-3); }
```

(`[hidden]` already wins over these `display` rules: `src/styles/global.css` line 20 has `[hidden] { display: none !important; }`.)

- [ ] **Step 9: Build and run the 3D spec and the phase 2 spec**

```bash
npm run build
npx playwright test tests/football3d.spec.mjs tests/football.spec.mjs
```
Expected: 4 passed (3D + 3 phase 2 tests). If the 3D test is **skipped** with "no WebGL 2", run `node -e "import('@playwright/test').then(async({chromium})=>{const b=await chromium.launch({args:['--enable-unsafe-swiftshader']});const p=await b.newPage();console.log(await p.evaluate(()=>!!document.createElement('canvas').getContext('webgl2')));await b.close()})"`. It must print `true`; if it does not, fix the launch flags before going on.

- [ ] **Step 10: Look at it.** Run `npx astro preview --port 4321` and open http://localhost:4321/demos/football/ in the Browser pane. Hover the panel, press **3D view**, play at 4×, pause, and switch through Stadium, Tactical and Player's eyes. Tap a player. Then use the pane's viewport menu at 375 px wide and repeat. Check that:
- the players stand on the grass,
- the numbers can be read in Tactical,
- the arrows lie on the grass with their labels next to the tips,
- the eyes camera does not show the followed player's own body,
- with reduced motion emulated (DevTools, Rendering, `prefers-reduced-motion: reduce`), camera changes cut.

Stop the preview server afterwards.

- [ ] **Step 11: Commit**

```bash
git add src/components/FootballReplay.astro tests/football3d.spec.mjs
git commit -m "Football replay: 3D view toggle (V), cameras (C, radios, Whose eyes, tap a player), shared clock and arrows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Page text, bundle-size check in CI

**Files:**
- Modify: `src/pages/demos/football.astro`, `package.json`, `.github/workflows/ci.yml`
- Create: `scripts/bundle-3d.mjs`
- Test: `tests/bundle-3d.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/bundle-3d.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** A tiny dist/: the football page loads entry.js (which imports shared.js) and import()s view3d.js -> three.js. */
function fakeDist(dir, { leak = false, threeBytes = 100 } = {}) {
  const a = path.join(dir, "_astro"), page = path.join(dir, "demos", "football");
  fs.mkdirSync(a, { recursive: true });
  fs.mkdirSync(page, { recursive: true });
  fs.writeFileSync(path.join(page, "index.html"), `<html><script type="module" src="/_astro/entry.AAA.js"></script></html>`);
  fs.writeFileSync(path.join(a, "entry.AAA.js"), `import{a}from"./shared.BBB.js";${leak ? "x.isWebGLRenderer=!0;" : ""}const v=()=>import("./view3d.CCC.js");`);
  fs.writeFileSync(path.join(a, "shared.BBB.js"), `export const a=1;`);
  fs.writeFileSync(path.join(a, "view3d.CCC.js"), `import{a}from"./shared.BBB.js";import"./three.DDD.js";export const createView3D=1;`);
  fs.writeFileSync(path.join(a, "three.DDD.js"), `this.isWebGLRenderer=!0;"aCell";` + crypto.randomBytes(threeBytes).toString("base64"));
}
const run = (dist, env = {}) => spawnSync(process.execPath, ["scripts/bundle-3d.mjs"], { env: { ...process.env, BUNDLE_DIST: dist, ...env }, encoding: "utf8" });

describe("npm run test:bundle", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));

  it("reports the lazy 3D files and their gzip size", () => {
    const d = path.join(tmp, "ok");
    fakeDist(d);
    const r = run(d);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/the 3D view adds 2 file\(s\)/);
    expect(r.stdout).toMatch(/_astro\/view3d\.CCC\.js/);
    expect(r.stdout).toMatch(/_astro\/three\.DDD\.js/);
    expect(r.stdout).not.toMatch(/ {2}_astro\/shared/); // shared with the page: not counted as 3D
  });
  it("fails when 3D code is loaded up front", () => {
    const d = path.join(tmp, "leak");
    fakeDist(d, { leak: true });
    const r = run(d);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/3D code is loaded up front in _astro\/entry\.AAA\.js/);
  });
  it("fails over the gzip budget", () => {
    const d = path.join(tmp, "big");
    fakeDist(d, { threeBytes: 4096 });
    const r = run(d, { BUNDLE_BUDGET_KB: "1" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/over the 1 kB budget/);
  });
  it("does nothing when the football page is not built", () => {
    const r = run(path.join(tmp, "none"));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/nothing checked/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/bundle-3d.test.mjs`
Expected: 4 failures. Node cannot find `scripts/bundle-3d.mjs`, so the status is not 0 and stdout is empty.

- [ ] **Step 3: Write the script.** Create `scripts/bundle-3d.mjs`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/bundle-3d.test.mjs`
Expected: 4 passed.

- [ ] **Step 5: Script and CI step.**
  1. In `package.json` `scripts`, after `"test:lh-all": …,`, add `"test:bundle": "node scripts/bundle-3d.mjs",`.
  2. In `.github/workflows/ci.yml`, after `      - run: npm run build`, add the line `      - run: npm run test:bundle`.

- [ ] **Step 6: Page text.** In `src/pages/demos/football.astro`:

(a) Replace

```text
<Base title="Football AI coach" description="Replay a full Bundesliga match on a 2D pitch, pause at any moment and see what an AI coach would do with the ball, then what the pro did.">
```

with

```text
<Base title="Football AI coach" description="Replay a full Bundesliga match in 2D or 3D, pause at any moment and see what an AI coach would do with the ball, then what the pro did.">
```

(b) Replace `passes, carries and shot in expected goals. Follow it or refuse it, then watch what the professional did.</p></div>` with:

```text
passes, carries and shot in expected goals. Follow it or refuse it, then watch what the professional did. Switch to 3D
        at any moment: stadium camera, tactical view or a player's eyes.</p></div>
```

(c) After the `<li><b>Tally</b>: …</li>` item in "How to read it", add:

```html
          <li><b>3D view</b> (button or V): the same moment in 3D; C or the camera buttons switch between the stadium
            camera, a tactical view from above and a player's eyes. Tap a player, or pick him in "Whose eyes", to stand
            at his head height (1.7 m) looking where he is running, or at the ball when he stands still. The arrows lie
            on the grass; the full list of options stays below the pitch.</li>
```

(d) Replace

```html
          <li>Everything runs in your browser; your choices stay in memory and are gone when you leave. A 3D view (stadium,
            a player's eyes) is the next phase.</li>
```

with

```html
          <li>The 3D figures come from the tracking positions only: there is no body pose, so the player's-eyes camera
            follows his movement, not his head. The ball's height comes from the same optical tracking.</li>
          <li>Everything runs in your browser; your choices stay in memory and are gone when you leave.</li>
```

- [ ] **Step 7: Build, check the bundle, record the size**

```bash
npm run build
npm run test:bundle
```
Expected: `bundle: /demos/football/ loads N script(s) up front, X kB gzip; the 3D view adds M file(s), Y kB gzip, on first use`, then one line per lazy file, exit 0. **Record X (compare it with the Task 4 baseline: it should grow by at most about 3 kB, for camera.ts, frame.ts and webgl.ts) and Y (the gzip size of the lazy three.js chunk) for the final report.**

- [ ] **Step 8: Commit**

```bash
git add scripts/bundle-3d.mjs tests/bundle-3d.test.mjs package.json .github/workflows/ci.yml src/pages/demos/football.astro
git commit -m "Football 3D: page text, bundle check (no three.js up front, lazy chunk gzip size) in CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Lighthouse, full suite, docs

**Files:**
- Modify: `README.md` (site); vault notes (no git)

- [ ] **Step 1: Lighthouse on the football page, compared with the Task 4 baseline**

```bash
npm run build
node scripts/lighthouse-all.mjs .lighthouseci demos/football
```
Expected: `/demos/football/ perf ≥0.9 a11y 1 LCP …`, with nothing listed after LCP and performance within 0.02 of the baseline. Lighthouse runs on the 2D page. The 3D controls are hidden, apart from the disabled "3D view" button, whose `aria-describedby` points at the visible note. Likely findings and fixes:
- `target-size` on the new button: keep the `.ctl` class.
- `color-contrast` on the note: keep `--ink-3`.

- [ ] **Step 2: Lighthouse CI as in CI**

Run: `npm run test:lhci`
Expected: every URL is at or above 0.9 for performance and accessibility.

- [ ] **Step 3: Site README.**
  1. In "Demos", append to the **Football AI coach** bullet: ` Phase 3 adds a 3D view (\`src/lib/football3d/\`; three.js loaded with \`import()\` on the first "3D view" press, ball height from \`public/football/z0.bin\` / \`z1.bin\`): stadium, tactical and player's-eyes cameras, 13 draw calls, rendered only when something moves.`
  2. In "Test", after the `test:lh-all` line, add `npm run test:bundle  # the football page loads no three.js up front; prints the lazy 3D chunk's gzip size (fails above 200 kB)`.
  3. Change the smoke comment to `# Playwright: pages, filter, painter with a fake camera, football replay + 3D (skips without WebGL 2), hard-hat parity (local only)`.

- [ ] **Step 4: Library PROGRESS + Obsidian vault.**
  1. In the library's `PROGRESS.md`, add: `2026-11-02: coach phase 3 on the site (branch v2): 3D view of the replay (stadium / tactical / player's eyes), three.js lazy chunk <Y> kB gzip, 2D page unchanged (Lighthouse <perf> / 1.0).`, filling in the measured numbers. Commit and push it as in Task 3 Step 6, with the message `PROGRESS: coach phase 3 (3D view) on the site`.
  2. In `C:\Users\yando\Documents\SuperVault\Projets\CV-Project-Library\`, following the vault's `AGENTS.md` (notes in French), add a dated entry to `cvlib-02-journal-de-construction.md` covering:
     - the 3D view and its three cameras
     - the decision to export the ball height as separate files
     - the draw-call budget
     - the lazy chunk size

     Then update the project 20 status in `cvlib-01-feuille-de-route.md`. The vault is not in git.

- [ ] **Step 5: Full local suite, then commit**

```bash
npm run build
npm test
npm run test:links
npm run test:bundle
npm run test:smoke
git add README.md
git commit -m "README: football 3D view, bundle check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: everything is green. The football 3D spec runs and is not skipped, unless WebGL 2 is missing, which Task 11 Step 9 already checked. The hard-hat parity spec skips unless its samples exist locally.

### Task 14: Push `v2`, watch CI

- [ ] **Step 1: Push the branch**

```bash
cd /c/Users/yando/Code/yandouziyassine.github.io
GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -q origin v2
```

- [ ] **Step 2: Watch CI**

Run `gh run list --branch v2 --limit 1`, then `gh run watch <id> --exit-status`.
Expected: the `ci` workflow passes build, `test:bundle`, vitest, links, Playwright and Lighthouse CI. In the Playwright log, check whether `football replay 3D` **ran or was skipped**: Linux SwiftShader should run it with `--enable-unsafe-swiftshader`. Report which one happened. If CI fails, use superpowers:systematic-debugging, fix on `v2`, push again and watch again.

- [ ] **Step 3: Hand over.** Report to the owner:
- the commits on `v2`
- CI status, and whether the 3D spec ran in CI
- Lighthouse for `/demos/football/`, before and after
- the up-front gzip size, before and after
- the **gzip size of the lazy three.js chunk**

Merging to `main` and deploying are the owner's call and are not part of this plan.

---

## Spec coverage (self-review)

| Requirement | Task |
|---|---|
| 3D toggle at any moment, same timestamp; one shared clock and state (2D and 3D draw the same frame) | 11 (`draw()` → `draw3d()`, `arrowsNow()` shared) |
| Pause / advice / follow / refuse work in 3D; arrows on the grass with labels; option list stays in the DOM | 9 (arrow mesh), 10 (label overlay), 11 (spec: options, Follow, tally) |
| Stadium camera (side, follows the ball, smoothed) | 6 (`broadcastPose`, `followBall`, `damp`), 10 |
| Tactical top-down orthographic | 6 (`tacticalExtent`, `tacticalPose`), 10 (`OrthographicCamera`, 2.5× figures) |
| Player's eyes: tap / click a player or "Whose eyes" select; 1.7 m; smoothed velocity, else towards the ball | 6 (`eyesPose`, `lookDirection`, `smoothDirection`), 8 (`focus.vel`, `eyesChoices`), 9 (`pick`), 11 |
| Smooth transitions; reduced motion cuts | 6 (`lerpPose`, `ease`, `flightSeconds`), 10 (`startFly`) |
| Pitch with procedural markings, goals, no web textures | 7 (`pitchMarkings`, `ribbon`), 9 |
| Low-poly players (capsule + head), team colours from match.json, shirt numbers | 8 (`colour`), 9 (instanced capsule / sphere, billboard numbers), 10 (canvas atlas) |
| Ball with height: z exported (int16 cm), parity kept green | 1, 2, 3, 8 (`ballHeight`), 9 |
| Instanced meshes, ≤ 40 draw calls (13) | 9 (Node test), 11 (`data-draw-calls` in Playwright) |
| Render only when the clock moves or the camera changes; DPR cap; dispose on toggle back | 10 (`request`, `MAX_DPR`, `dispose`), 11 (`close3d`, spec: canvas removed) |
| WebGL unavailable → toggle disabled with a message | 7 (`hasWebGL`, WebGL 2), 11 (`init`, `note3d`) |
| Toggle is a real button with aria-pressed; camera radio group; canvas aria-label (score / time / carrier); keys V, C | 5 (`scoreAt`, `frameLabel`), 11 |
| three.js as an exact npm dependency, lazy `import()`, 2D page weight and Lighthouse unchanged | 4, 11, 12 (`test:bundle`), 13 |
| Vitest for camera maths; Playwright toggle / cameras / pause options / back to 2D, skipping without WebGL (SwiftShader flag) | 6, 11, 4 (flag) |
| Lighthouse on /demos/football/ unchanged | 4 (baseline), 13 |
| Bundle size: gzip of the lazy three chunk reported | 12, 14 |
| Final task: push v2 + CI; merge / deploy by the owner | 14 |

---

## Addendum (2026-11-02): the visitor steers the camera

Owner request: "when I click on a player I need to be able to move the camera around to see the view."

- `src/lib/football3d/controls.ts` (pure, unit-tested in `tests/football3d-controls.test.mjs`):
  - Player's eyes: free look. Drag turns the view (yaw unlimited, pitch clamped to -60°..+45°) on top of the automatic direction, so the camera stays at his head and keeps following him. Wheel and pinch change the field of view (30°..90°).
  - Stadium: orbit round the aim point (elevation 8°..85°, distance 0.35..1.8 times). Tactical: pan and zoom 1×..4×, always inside the pitch view.
  - A pointer that moves less than 6 px is a click (picks a player); a double click or double tap re-centres; `0` re-centres.
  - Keys only when the 3D stage has focus: Q/E turn or orbit, R/F up and down, + / - zoom, 0 re-centres. The stage handler stops the event, so F still means "follow the coach" everywhere else.
  - A short inertia after a flick; none with reduced motion. Render on demand is unchanged: each input requests one frame.
- No OrbitControls: the maths are about 150 lines and the lazy chunk is 137 kB gzip in total (budget 200).
- `view3d.ts` owns the pointer events (`setPointerCapture`, `touch-action: none` on the canvas, a non-passive wheel listener) and exposes `key()` and `reset()`. A tap in the stadium and tactical views waits 300 ms in case it is the first half of a double tap; in the player's eyes it picks at once.
- The stage carries read-only `data-camera-yaw|pitch|fov|azimuth|elevation|zoom|tzoom|panx|pany` (rounded) for the Playwright spec.
- The 3D canvas now captures touch drags and the wheel, so the page does not scroll while the pointer or finger is on it.

