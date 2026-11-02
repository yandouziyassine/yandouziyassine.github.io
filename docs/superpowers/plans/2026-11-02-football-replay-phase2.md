# Football AI Coach, Phase 2 (2D Replay on the Site): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page at `/demos/football/` that replays the full IDSSE match J03WOH on a 2D canvas pitch. When the visitor pauses and a player has the ball, the coach (a TypeScript port of the library's engine, parity-tested against Python) ranks his options. The visitor follows or refuses the coach, then the page shows what the professional did and how the move ended, with a running tally of viewer, coach and pros.

**Architecture:** First, the library's `coach/export.py` writes one int16 file per half (`h0.bin`, `h1.bin`), each holding only that half's players, at 12.5 fps. A new `coach/parity_fixtures.py` writes about 30 real frames, with their expected states, features, probabilities and option order, to the site's `tests/fixtures/coach-parity.json`. On the site, `npm run sync:football` copies the export into `public/football/`. That folder is committed, and `FOOTBALL_LIVE` is true when it is there. The pure TypeScript engine lives in `src/lib/coach/` (`geometry`, `pitchControl`, `features`, `models`, `advice`, `replay`, `decision`, `format`). The UI is a single Astro component, `FootballReplay.astro`, with a canvas, controls, the coach panel and the tally. The page loads `match.json` and `models.json` after the page `load` event, then the first half; it loads the second half only when it is needed.

**Tech Stack:** Python 3 (numpy, scikit-learn) in `COMPUTER-VISION-PROJECT-LIBRARY/20-football-analytics`; Astro 7 + TypeScript, Vitest 5, Playwright 1.64 and Lighthouse CI in `yandouziyassine.github.io` (branch `v2`).

**Spec:** `C:\Users\yando\Code\COMPUTER-VISION-PROJECT-LIBRARY\docs\superpowers\specs\2026-11-01-football-ai-coach-design.md` (sections "Replay experience", "Units", "Evaluation": Python ↔ TS parity). The library README section "v3 · AI coach" supplies the numbers and limits shown on the page.

---

## Decisions (owner, 2026-11-02)

1. **Data size.** One 9 MB file is too large for a single load. `export.py` writes per-half files (`h0.bin` / `h1.bin`) that hold only the players who appear in that half. `match.json` carries the slot list for each half. The format stays int16 cm at 12.5 fps. The browser loads half 1 first and half 2 when needed. Expected sizes for J03WOH: `h0.bin` 34,712 frames × (22 + 1) × 4 B = **3,193,504 B**; `h1.bin` 33,895 × (32 + 1) × 4 B = **4,474,140 B**. The data files are committed to the site under `public/football/`. They are CC BY 4.0, and the page shows the credit line. `npm run sync:football` refreshes them from `C:\Users\yando\Code\cv-data\football-coach\site-export`; the env var `FOOTBALL_EXPORT` overrides that path. `FOOTBALL_LIVE` is true when `public/football/models.json` exists. Without the data, the site still builds and the page says "coming soon".
2. **TS port in `src/lib/coach/`.** It covers geometry, pitch control, features, logistic/linear prediction from `models.json`, advice options, replay decoding, interpolation, ball-carrier detection and causal velocity. Velocity matches training: a backward difference over 0.16 s, which is 4 frames at 25 fps in training and **2 frames at 12.5 fps** on the site. For parity, `coach/parity_fixtures.py` rebuilds the browser's inputs from the shipped files and writes the expected outputs. Vitest asserts `|diff| < 1e-6` and an identical option order.
3. **UI.** `FootballReplay.astro` sits on `src/pages/demos/football.astro`:
   - **Pitch:** a 105 × 68 canvas with team colours from `match.json`, shirt numbers, the ball and a 1 s ball trail.
   - **Playback:** play/pause (Space), speed 1×/2×/4×, a scrubber with goal/shot markers, a half switch and a "Jump to" select.
   - **Coach panel:** when paused with a ball carrier, arrows show the top 3 options and a list shows every option (kind, target shirt, p %, value in xG). The visitor can Follow (choose the top option) or Refuse (pick another by click or keys 1–9).
   - **Reveal:** at the pro's next pass or shot, or 10 s after the pause, the page shows what the pro did and the outcome within 15 s (kept / lost / shot / goal).
   - **Tally:** viewer vs coach vs pros, summing the coach's expected value of each chosen option. It lives in memory only.
   - **Notes:** honest notes on the page.
   - **Mobile:** the canvas scales and buttons are at least 44 px.
   - **3D:** there is **no** disabled "3D view" button, because a disabled control adds nothing for keyboard users. A sentence in the notes says 3D is the next phase.
4. **Integration:**
   - a demo card on `/demos/` with the link "▶ Watch and coach" (not "▶ Play", which the depth-game test already clicks)
   - the project 20 "Live demo" link going to `/demos/football/`
   - an OG card entry
   - the Lighthouse CI URL
   - a Playwright spec that skips when the data is absent
5. **Deploy flow.** Work on branch `v2`; CI (`.github/workflows/ci.yml`) must pass on the push. Merging to `main` deploys through `pages.yml`, which publishes the site, so merge only after the owner says go.

## Conventions used below

- Library commands (Git Bash): `cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY/20-football-analytics`, then run Python as `C:/Users/yando/Code/.venv-tools/Scripts/python.exe` (written `$PY` below; run `PY=C:/Users/yando/Code/.venv-tools/Scripts/python.exe` in every new shell).
- Site commands: `cd /c/Users/yando/Code/yandouziyassine.github.io` on branch `v2` (`git switch v2`).
- Library commits go to `main` and are pushed. The library rule is ruff format, ruff check and pytest green first. Site commits go to `v2`.
- Every commit message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Units: metres, centre spot = origin. "Normalised" means the team in question attacks +x (the Python convention).

## File structure

**Library (`COMPUTER-VISION-PROJECT-LIBRARY`)**

| File | Change | Responsibility |
|---|---|---|
| `20-football-analytics/coach/export.py` | Modify (full rewrite of `pack_match`) | Per-half `h<i>.bin` with that half's player slots; `match.json` `halves[i] = {frames, slots, attack}`; event `frame`/`nominal` at the site rate; sync diagnostics dropped; stale `match.bin` removed |
| `20-football-analytics/coach/features.py` | Modify `state()` | Optional `fps`, `back_frames`, `direction` (defaults unchanged) so the site's 12.5 fps state can be rebuilt exactly |
| `20-football-analytics/coach/models.py` | Add `linear_predictor()` | Predict from exported JSON weights alone (what the browser computes) |
| `20-football-analytics/coach/parity_fixtures.py` | Create | Writes `coach-parity.json` from the shipped files |
| `tests/test_20_coach.py` | Modify | Export test rewritten; 3 new tests (state at the site rate, linear predictor, parity fixtures) |
| `20-football-analytics/README.md`, `PROGRESS.md` | Modify | Export layout line, parity command, test count, phase 2 link |

**Site (`yandouziyassine.github.io`, branch `v2`)**

| File | Change | Responsibility |
|---|---|---|
| `scripts/football.mjs` | Create | `npm run sync:football`: validate + copy the export into `public/football/` |
| `package.json` | Modify | `sync:football` script |
| `src/data/flags.ts` | Modify | `FOOTBALL_LIVE` |
| `public/football/{match.json,models.json,h0.bin,h1.bin}` | Create (data, committed) | Replay data, CC BY 4.0 |
| `src/lib/coach/geometry.ts` | Create | `Vec`, pitch constants, `normalise`, `goalGeometry` |
| `src/lib/coach/pitchControl.ts` | Create | `timeToReach`, `control` |
| `src/lib/coach/features.ts` | Create | `State`, feature names, `passFeatures`, `valueFeatures`, `shotFeatures`, `laneLossPoint`, `vector` |
| `src/lib/coach/advice.ts` | Create | `Coach`, `CoachOption`, `options()` ranking |
| `src/lib/coach/models.ts` | Create | `LinearModel`, `ModelsJson`, `predictLinear`, `coachFromModels` |
| `src/lib/coach/replay.ts` | Create | `MatchMeta`, `decodeHalf`, `playerAt`, `ballAt`, `velocityAt`, `stateAt`, `carrierAt`, `frameDots`, `trail`, `clock`, `eventFrame`, `markers` |
| `src/lib/coach/decision.ts` | Create | `proChoice`, `outcome`, `Tally`, `decide`, `reveal` |
| `src/lib/coach/format.ts` | Create | Labels: `optionLabel`, `arrowLabel`, `proLabel`, `outcomeLabel`, `signedXg`, `pct`, `direction`, `textOn` |
| `src/components/FootballReplay.astro` | Create | Canvas, controls, coach panel, reveal, tally, keyboard |
| `src/pages/demos/football.astro` | Create | Page, notes, credit, "coming soon" fallback |
| `src/pages/demos.astro` | Modify | Demo card |
| `src/content/projects/football-analytics.md`, `legacy/data/projects.js` | Modify | "Live demo" link |
| `src/lib/og.ts` | Modify | OG card `demos/football` |
| `src/pages/credits.astro` | Modify | Data credit entry |
| `lighthouserc.json`, `tests/smoke.spec.mjs` | Modify | Page URL |
| `tests/fixtures/coach-parity.json` | Create (generated by the library) | Parity frames |
| `tests/coach-geometry.test.mjs`, `tests/coach-features.test.mjs`, `tests/coach-advice.test.mjs`, `tests/coach-parity.test.mjs`, `tests/coach-replay.test.mjs`, `tests/coach-decision.test.mjs`, `tests/coach-format.test.mjs`, `tests/football-sync.test.mjs` | Create | Vitest |
| `tests/football.spec.mjs` | Create | Playwright |
| `README.md` | Modify | Pages / demos / tests |

---

## Part A: Library

### Task 1: Per-half export files

**Files:**
- Modify: `20-football-analytics/coach/export.py` (whole file below)
- Test: `tests/test_20_coach.py` (replace `test_pack_match_roundtrip_in_centimetres`, currently lines 507–527)

- [ ] **Step 1: Write the failing test.** In `tests/test_20_coach.py`, replace the whole function `test_pack_match_roundtrip_in_centimetres` with:

```python
def test_pack_match_writes_one_file_per_half_with_its_own_players(tmp_path):
    import json

    m = tiny_match(frames=100)
    m.names[0] = "Müller-Ösil"  # non-ASCII must survive (UTF-8 on disk, whatever the platform default encoding)
    m.halves[0].xy[:7, 1] = np.nan  # player b is not on the pitch for the first frames of half 0
    m.halves[1].xy[:, 3] = np.nan  # player d never plays in half 1: not in that half's file
    m.events[0]["frame"] = 40
    m.events[0]["nominal"] = 41
    m.events[0]["t_sync"] = 1000.0  # sync diagnostics are not shipped
    m.events.append({"type": "shot", "half": 0, "frame": None, "nominal": 61, "team": 0, "drop": "far", "x": 1.0, "y": 2.0})
    (tmp_path / "match.bin").write_bytes(b"old single-file layout")
    X.pack_match(m, tmp_path, fps=10)
    meta = json.loads((tmp_path / "match.json").read_text(encoding="utf-8"))
    assert meta["fps"] == 12.5 and not (tmp_path / "match.bin").exists()
    h0, h1 = meta["halves"]
    assert h0 == {"frames": 50, "slots": [0, 1, 2, 3], "attack": [1, -1]}
    assert h1 == {"frames": 50, "slots": [0, 1, 2], "attack": [-1, 1]}
    raw0 = np.fromfile(tmp_path / "h0.bin", dtype="<i2")
    raw1 = np.fromfile(tmp_path / "h1.bin", dtype="<i2")
    assert raw0.size == 50 * (4 + 1) * 2 and raw1.size == 50 * (3 + 1) * 2
    first = raw0[:10].reshape(-1, 2)
    assert np.allclose(first[0] / 100.0, m.halves[0].xy[0, 0]) and np.allclose(first[-1] / 100.0, m.halves[0].ball[0, :2])
    assert (first[1] == -32768).all()  # absent player -> NaN code
    last1 = raw1[-8:].reshape(-1, 2) / 100.0  # half 1, last site frame (source frame 98): players a, b, c, then the ball
    assert np.allclose(last1[2], m.halves[1].xy[98, 2]) and np.allclose(last1[3], m.halves[1].ball[98, :2])
    text = (tmp_path / "match.json").read_text(encoding="utf-8")
    assert meta["players"][0]["name"] == "Müller-Ösil" and "ö" in text.lower()
    assert meta["events"][0]["frame"] == 20 and meta["events"][0]["nominal"] == 20 and "t_sync" not in meta["events"][0]
    assert meta["events"][-1]["frame"] is None and meta["events"][-1]["nominal"] == 30
    assert len(meta["owner"][1]) == 50 and set(meta["owner"][0]) == {"1"} and set(meta["alive"][0]) == {"1"}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$PY -m pytest ../tests/test_20_coach.py -q -k per_half`
Expected: FAIL with `KeyError: 'halves'`. If the old code got as far as the first assert, it fails on `match.bin` existing instead.

- [ ] **Step 3: Write the implementation.** Replace `20-football-analytics/coach/export.py` with:

```python
"""Export for the website (phase 2): model weights as JSON and one match as int16 centimetres, one file per half.

    python -m coach.export --match J03WOH --site ../../cv-data/football-coach/site-export

Frame rate: the 25 fps source is subsampled by a whole step (fps=10 -> step 2 -> 12.5 fps, written in match.json).
h<i>.bin (little-endian int16): for each frame of half i, the players who appear in that half (match.json
halves[i].slots, ascending player index), then the ball, each (x, y) in cm; NaN -> -32768. The browser loads the first
half first and the second when needed. match.json (UTF-8) holds players (team, shirt, name; the list index is the
player index used by slots and events), team names/colours, per half the frame count, the slots and the attack
directions (+1/-1 for home, guest), fps, owner/alive per frame (strings of digits), passes and shots with frame and
nominal indices at the site's rate (frame None when sync could not place the event, `drop` says why), and the data
credit. models.json holds the weights of the pass (logistic), value (ridge, with its basis definition) and shot
(logistic) models, trained WITHOUT the exported match.
"""

import argparse
import json
from pathlib import Path

import numpy as np

from . import advice as A
from . import datasets as D
from . import geometry as G
from . import models as ML
from . import pitch_control as PC
from .match import load
from .prepare import MATCHES, OUT

NAN = -32768
CREDIT = "Bundesliga tracking and event data: Bassek et al. (2025), DFL / Sportec Solutions, CC BY 4.0"
SYNC_ONLY = ("t", "t_sync", "calc_frame", "dist", "sync_shift_s")  # sync diagnostics, not needed by the site


def _site_event(e: dict, step: int) -> dict:
    """An event with frame indices at the site's rate (frame stays None when sync could not place it)."""
    out = {k: v for k, v in e.items() if k not in SYNC_ONLY}
    out["frame"] = int(e["frame"]) // step if e.get("frame") is not None else None
    if e.get("nominal") is not None:
        out["nominal"] = int(e["nominal"]) // step
    return out


def pack_match(m, out: Path, fps: int = 10):
    out.mkdir(parents=True, exist_ok=True)
    (out / "match.bin").unlink(missing_ok=True)  # the single-file layout used before the per-half split
    step = max(1, int(round(25 / fps)))  # 25 fps source: fps=10 -> every 2nd frame = 12.5 fps (stored as such)
    halves, owner, alive = [], [], []
    for i, h in enumerate(m.halves):
        idx = np.arange(0, len(h.t), step)
        slots = np.flatnonzero(~np.isnan(h.xy[idx, :, 0]).all(axis=0))  # players seen at least once in this half
        pos = np.concatenate([h.xy[idx][:, slots], h.ball[idx, None, :2]], axis=1) * 100
        np.where(np.isnan(pos), NAN, np.round(pos)).astype("<i2").tofile(out / f"h{i}.bin")
        halves.append(
            {"frames": len(idx), "slots": slots.tolist(), "attack": [int(d) for d in G.attack_dirs(h, m.team)]}
        )
        owner.append("".join(str(int(o) + 1) for o in h.owner[idx]))
        alive.append("".join("1" if a else "0" for a in h.alive[idx]))
    meta = {
        "match_id": m.match_id,
        "fps": 25 / step,
        "halves": halves,
        "players": [{"team": int(t), "shirt": int(s), "name": n} for t, s, n in zip(m.team, m.shirt, m.names)],
        "meta": m.meta,
        "owner": owner,
        "alive": alive,
        "events": [_site_event(e, step) for e in m.events],
        "credit": CREDIT,
    }
    (out / "match.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


def export_models(out: Path, matches, exclude=None):
    """Fit on every match but `exclude` (the replay match must stay unseen) and write models.json."""
    train = [m for m in matches if m.match_id != exclude]
    tables = {
        "pass": D.stack([D.pass_table(m) for m in train]),
        "value": D.stack([D.value_table(m) for m in train]),
        "shot": D.drop_penalties(D.stack([D.shot_table(m) for m in train])),
    }
    p, v, s = tables["pass"], tables["value"], tables["shot"]
    weights = {
        "trained_without": exclude,
        "trained_on": [m.match_id for m in train],
        "pass": ML.export_logistic(ML.fit_logistic(p["X"], p["y"], p["weight"]), D.F.PASS_FEATURES),
        "value": {
            **ML.export_ridge(ML.fit_ridge(v["X"], v["y"]), D.F.VALUE_FEATURES),
            "horizon_s": D.HORIZON,
            "target": "net expected goals (provider xG for minus against) within horizon_s, team in possession",
            "basis": D.F.VALUE_BASIS,
        },
        "shot": ML.export_logistic(ML.fit_logistic(s["X"], s["y"]), D.F.SHOT_FEATURES),
        "pitch_control": {"reaction": PC.REACTION, "vmax": PC.VMAX, "sigma": PC.SIGMA},
        "advice": {
            "carry_dist": A.CARRY_DIST,
            "carry_angles_deg": list(A.CARRY_ANGLES),
            "shot_range": A.SHOT_RANGE,
            "score": "p * V(target) + (1 - p) * (-V_opp(loss point)) - V(now); shot: xG - V(now)",
        },
    }
    (out / "models.json").write_text(json.dumps(weights, indent=2), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--match", default="J03WOH")
    ap.add_argument("--site", type=Path, required=True)
    args = ap.parse_args()
    pack_match(load(OUT / args.match), args.site)
    export_models(args.site, [load(OUT / mid) for mid in MATCHES], exclude=args.match)
    print("wrote", sorted(p.name for p in args.site.iterdir()))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$PY -m pytest ../tests/test_20_coach.py -q`
Expected: `31 passed`. The export test is replaced, not added.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY
git add 20-football-analytics/coach/export.py tests/test_20_coach.py
git commit -m "20 coach: per-half site export (h0.bin / h1.bin with each half's players), events at the site rate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: State at the site's rate + predictor from exported weights

**Files:**
- Modify: `20-football-analytics/coach/features.py:51-71` (function `state`)
- Modify: `20-football-analytics/coach/models.py` (add `linear_predictor` after `export_ridge`)
- Test: `tests/test_20_coach.py` (add 2 tests)

- [ ] **Step 1: Write the failing tests.** Insert this right after `test_state_velocity_is_causal_backward_difference`:

```python
def test_state_velocity_at_the_site_frame_rate_and_given_direction():
    m = tiny_match(frames=50)
    m.halves[0].xy[:, 0, 0] = -10 + 0.2 * np.arange(50)  # 0.2 m per (12.5 fps) frame = 2.5 m/s
    s = F.state(m, 0, 10, team=0, fps=12.5, back_frames=2)
    assert np.allclose(s["att_v"][0], [2.5, 0.0])  # (x[10] - x[8]) * 12.5 / 2
    flipped = F.state(m, 0, 10, team=0, fps=12.5, back_frames=2, direction=-1)
    assert flipped["direction"] == -1 and np.allclose(flipped["att"][0], -s["att"][0])
    assert np.allclose(flipped["att_v"][0], [-2.5, 0.0])
```

Then insert this right after `test_ridge_export_and_regression_lomo`:

```python
def test_linear_predictor_reproduces_the_fitted_pipelines():
    t = synthetic_table()
    clf = ML.fit_logistic(t["X"], t["y"])
    p = ML.linear_predictor(ML.export_logistic(clf, ["a", "b", "c"]))(t["X"])
    assert np.allclose(p, clf.predict_proba(t["X"])[:, 1], atol=1e-9)
    reg = ML.fit_ridge(t["X"], 0.3 * t["X"][:, 0])
    v = ML.linear_predictor(ML.export_ridge(reg, ["a", "b", "c"]))(t["X"])
    assert np.allclose(v, reg.predict(t["X"]), atol=1e-9)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$PY -m pytest ../tests/test_20_coach.py -q -k "site_frame_rate or linear_predictor"`
Expected: 2 FAIL. The state test fails with `TypeError: state() got an unexpected keyword argument 'fps'`; the predictor test fails with `AttributeError: module 'coach.models' has no attribute 'linear_predictor'`.

- [ ] **Step 3: Implement.** In `coach/features.py`, replace the function `state` with:

```python
def state(m, half: int, frame: int, team: int, fps: float = FPS, back_frames: int = BACK, direction=None) -> dict:
    """Causal state: velocities are backward differences over `back_frames` frames (same in training and at
    inference). The website rebuilds it at 12.5 fps with back_frames=2 (0.16 s, as in training) and the attack
    direction stored in its match.json (coach/parity_fixtures.py)."""
    h = m.halves[half]
    if direction is None:
        direction = G.attack_dirs(h, m.team)[team]
    back = max(0, frame - back_frames)
    pos = h.xy[frame]
    vel = np.nan_to_num((pos - h.xy[back]) * (fps / (frame - back))) if frame > back else np.zeros_like(pos)
    present = ~np.isnan(pos[:, 0])
    att = present & (m.team == team)
    dfn = present & (m.team == 1 - team)  # players with team -1 (not on the match sheet) are neither
    norm = lambda a: G.normalise(a, direction)
    return {
        "att": norm(pos[att]),
        "att_v": norm(vel[att]),
        "def": norm(pos[dfn]),
        "def_v": norm(vel[dfn]),
        "att_idx": np.flatnonzero(att),
        "def_idx": np.flatnonzero(dfn),
        "ball": norm(h.ball[frame, :2]),
        "direction": direction,
    }
```

In `coach/models.py`, add this after `export_ridge`:

```python
def linear_predictor(w: dict):
    """Inverse of export_linear: X[n, k] -> P(y = 1) (link "logit") or the prediction (link "identity"), computed from
    the exported JSON weights alone, exactly what the website computes."""
    mean, scale, coef = (np.asarray(w[k], float) for k in ("mean", "scale", "coef"))

    def predict(X):
        z = ((np.atleast_2d(np.asarray(X, float)) - mean) / scale) @ coef + w["intercept"]
        return 1.0 / (1.0 + np.exp(-z)) if w["link"] == "logit" else z

    return predict
```

- [ ] **Step 4: Run all coach tests**

Run: `$PY -m pytest ../tests/test_20_coach.py -q`
Expected: `33 passed`

- [ ] **Step 5: Commit**

```bash
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY
git add 20-football-analytics/coach/features.py 20-football-analytics/coach/models.py tests/test_20_coach.py
git commit -m "20 coach: state() at any frame rate / given direction, predictor from exported weights

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Parity fixtures script

**Files:**
- Create: `20-football-analytics/coach/parity_fixtures.py`
- Test: `tests/test_20_coach.py` (append at the end)

- [ ] **Step 1: Write the failing test.** Append to `tests/test_20_coach.py`:

```python
from coach import parity_fixtures as PF  # noqa: E402


def _flat_model(names, link, c):
    k = len(names)
    return {"features": list(names), "link": link, "mean": [0.0] * k, "scale": [1.0] * k, "coef": [c] * k, "intercept": 0.0}


def test_parity_fixtures_rebuild_the_site_state_and_rank_options(tmp_path):
    import json

    m = tiny_match(frames=100)
    m.halves[0].ball[30:50, :2] = [-10.0, 0.5]  # the ball at player a's feet around the pass (source frame 40)
    m.events[0]["frame"] = 40
    X.pack_match(m, tmp_path, fps=10)
    models = {
        "trained_without": "TEST",
        "pass": _flat_model(F.PASS_FEATURES, "logit", 0.05),
        "value": _flat_model(F.VALUE_FEATURES, "identity", 0.001),
        "shot": _flat_model(F.SHOT_FEATURES, "logit", -0.1),
    }
    (tmp_path / "models.json").write_text(json.dumps(models), encoding="utf-8")
    meta = json.loads((tmp_path / "match.json").read_text(encoding="utf-8"))
    team_of = np.array([p["team"] for p in meta["players"]])
    h = PF.load_half(tmp_path, meta, 0)
    assert PF.carrier_at(meta, 0, h, team_of, 20) == (0, 0)
    assert PF.carrier_at(meta, 0, h, team_of, 49) is None  # ball ~7 m from the nearest home player
    fx = PF.build(tmp_path, per_half=3)
    assert fx["back_frames"] == 2 and fx["fps"] == 12.5 and fx["models"]["trained_without"] == "TEST"
    assert len(fx["frames"]) == 1  # the tiny match has one pass with a frame
    rec = fx["frames"][0]
    assert (rec["half"], rec["frame"], rec["carrier"], rec["team"], rec["carrier_row"]) == (0, 20, 0, 0, 0)
    st = rec["state"]
    assert st["att_idx"] == [0, 1] and st["def_idx"] == [2, 3] and st["direction"] == 1
    assert np.allclose(st["att"][0], [-10.0, 0.0]) and np.allclose(st["att_v"], 0.0)
    scores = [o["score"] for o in rec["options"]]
    assert scores == sorted(scores, reverse=True) and {"pass", "carry"} <= {o["kind"] for o in rec["options"]}
    assert [p["target"] for p in rec["pass_features"]] == [1] and set(rec["value_features"]) == set(F.VALUE_FEATURES)
    json.dumps(fx, allow_nan=False)  # valid JSON for the browser: no NaN anywhere
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$PY -m pytest ../tests/test_20_coach.py -q -k parity`
Expected: FAIL with `ImportError: cannot import name 'parity_fixtures'`, reported as a collection error for the whole file.

- [ ] **Step 3: Implement.** Create `20-football-analytics/coach/parity_fixtures.py`:

```python
"""Python <-> TypeScript parity fixtures for the website's coach (phase 2).

    python -m coach.parity_fixtures                               # from 20-football-analytics/
    python -m coach.parity_fixtures --export <dir> --out <file>   # defaults: cv-data site-export -> site tests

Reads exactly what the site ships (coach.export: match.json, h0.bin, h1.bin, models.json) and rebuilds each frame
state the way the browser does: int16 cm -> float64 metres, 12.5 fps, velocity = backward difference over 2 frames
(0.16 s, training's 4 frames at 25 fps), attack direction from match.json. It finds the ball carrier with the site's
rule and ranks the options with the library's own features.py / advice.py on the exported weights. It writes the
state, features and ranked options of up to `per_half` frames per half to the site's tests/fixtures/coach-parity.json;
the site's vitest asserts |diff| < 1e-6 and the same option order.
"""

import argparse
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np

from . import advice as A
from . import features as F
from .models import linear_predictor
from .prepare import CV_DATA, HERE

NAN = -32768
BACK_SITE = 2  # frames at 12.5 fps = 0.16 s, the training lag (features.BACK = 4 frames at 25 fps)
CARRIER_M = 2.0  # the nearest player of the team in possession has the ball when within this distance (m)
TIE = 1e-9  # options closer than this could swap order between languages: such frames are skipped
EXPORT = CV_DATA / "football-coach" / "site-export"
SITE_FIXTURE = HERE.parents[1] / "yandouziyassine.github.io" / "tests" / "fixtures" / "coach-parity.json"


def load_half(export: Path, meta: dict, half: int) -> SimpleNamespace:
    """xy [F, P, 2] and ball [F, 2] in float64 metres (NaN = absent), P = every player of the match."""
    info = meta["halves"][half]
    n = len(info["slots"])
    raw = np.fromfile(export / f"h{half}.bin", dtype="<i2").reshape(info["frames"], n + 1, 2)
    val = np.where(raw == NAN, np.nan, raw / 100.0)
    xy = np.full((info["frames"], len(meta["players"]), 2), np.nan)
    xy[:, info["slots"]] = val[:, :n]
    return SimpleNamespace(xy=xy, ball=val[:, n])


def carrier_at(meta: dict, half: int, h, team_of, frame: int):
    """(player, team) of the ball carrier, or None: ball in play, team in possession known, and that team's nearest
    player within CARRIER_M of the ball (same rule as the site's carrierAt)."""
    owner = int(meta["owner"][half][frame]) - 1
    if meta["alive"][half][frame] != "1" or owner < 0 or np.isnan(h.ball[frame, 0]):
        return None
    cand = np.flatnonzero((team_of == owner) & ~np.isnan(h.xy[frame, :, 0]))
    if not len(cand):
        return None
    d = np.hypot(h.xy[frame, cand, 0] - h.ball[frame, 0], h.xy[frame, cand, 1] - h.ball[frame, 1])
    k = int(np.argmin(d))
    return (int(cand[k]), owner) if d[k] <= CARRIER_M else None


def predictors(models: dict) -> dict:
    return {k: linear_predictor(models[k]) for k in ("pass", "value", "shot")}


def frame_record(meta: dict, half: int, h, team_of, frame: int, models: dict):
    found = carrier_at(meta, half, h, team_of, frame)
    if found is None:
        return None
    player, team = found
    m = SimpleNamespace(halves={half: h}, team=team_of)
    direction = meta["halves"][half]["attack"][team]
    s = F.state(m, half, frame, team, fps=meta["fps"], back_frames=BACK_SITE, direction=direction)
    row = int(np.flatnonzero(s["att_idx"] == player)[0])
    opts = A.options(s, row, predictors(models))
    scores = [o["score"] for o in opts]
    if any(abs(a - b) < TIE for a, b in zip(scores, scores[1:])):
        return None
    here = s["att"][row]
    return {
        "half": half,
        "frame": frame,
        "carrier": player,
        "team": team,
        "carrier_row": row,
        "state": {
            "att": s["att"].tolist(),
            "att_v": s["att_v"].tolist(),
            "def": s["def"].tolist(),
            "def_v": s["def_v"].tolist(),
            "att_idx": s["att_idx"].tolist(),
            "def_idx": s["def_idx"].tolist(),
            "ball": s["ball"].tolist(),
            "direction": int(direction),
        },
        "pass_features": [
            {"target": int(s["att_idx"][j]), **F.pass_features(s, row, j)} for j in range(len(s["att"])) if j != row
        ],
        "value_features": F.value_features(here),
        "shot_features": F.shot_features(here, s["def"]),
        "options": opts,
    }


def candidate_frames(meta: dict, half: int, per_half: int) -> list:
    """Open-play pass frames of the half (the passer has the ball there), evenly thinned to about 3 x per_half."""
    frames = sorted(
        {
            e["frame"]
            for e in meta["events"]
            if e["type"] == "pass" and e.get("half") == half and e.get("frame") is not None and not e.get("set_piece")
        }
    )
    return frames[:: max(1, len(frames) // (3 * per_half))]


def build(export: Path, per_half: int = 15) -> dict:
    meta = json.loads((export / "match.json").read_text(encoding="utf-8"))
    models = json.loads((export / "models.json").read_text(encoding="utf-8"))
    team_of = np.array([p["team"] for p in meta["players"]])
    frames = []
    for half in range(len(meta["halves"])):
        h = load_half(export, meta, half)
        got = 0
        for f in candidate_frames(meta, half, per_half):
            rec = frame_record(meta, half, h, team_of, f, models)
            if rec is not None:
                frames.append(rec)
                got += 1
            if got == per_half:
                break
    return {
        "generated_by": "COMPUTER-VISION-PROJECT-LIBRARY/20-football-analytics/coach/parity_fixtures.py",
        "match_id": meta["match_id"],
        "fps": meta["fps"],
        "back_frames": BACK_SITE,
        "carrier_m": CARRIER_M,
        "tolerance": 1e-6,
        "models": models,
        "frames": frames,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", type=Path, default=EXPORT)
    ap.add_argument("--out", type=Path, default=SITE_FIXTURE)
    ap.add_argument("--per-half", type=int, default=15)
    args = ap.parse_args()
    fx = build(args.export, args.per_half)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(fx, allow_nan=False) + "\n", encoding="utf-8")
    print(f"wrote {len(fx['frames'])} frames to {args.out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run all coach tests + lint**

```bash
$PY -m pytest ../tests/test_20_coach.py -q
$PY -m ruff format coach ../tests/test_20_coach.py
$PY -m ruff check coach ../tests/test_20_coach.py
```
Expected: `34 passed`; ruff check prints `All checks passed!`. If `ruff format` reformats anything, run the tests again.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY
git add 20-football-analytics/coach/parity_fixtures.py tests/test_20_coach.py
git commit -m "20 coach: Python <-> TypeScript parity fixtures from the shipped site files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Regenerate the export + fixture, document, push

**Files:**
- Output (not in any repo): `C:/Users/yando/Code/cv-data/football-coach/site-export/{match.json,models.json,h0.bin,h1.bin}`
- Output (site working tree, committed in Task 9): `C:/Users/yando/Code/yandouziyassine.github.io/tests/fixtures/coach-parity.json`
- Modify: `20-football-analytics/README.md` (section "Run the coach"), `PROGRESS.md`

- [ ] **Step 1: Re-run the export (it refits the 3 models on the 6 other matches; a few minutes on CPU)**

```bash
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY/20-football-analytics
$PY -m coach.export --match J03WOH --site C:/Users/yando/Code/cv-data/football-coach/site-export
```
Expected last line: `wrote ['h0.bin', 'h1.bin', 'match.json', 'models.json']`. There must be no `match.bin`.

- [ ] **Step 2: Check the sizes**

```bash
ls -l C:/Users/yando/Code/cv-data/football-coach/site-export
```
Expected: `h0.bin` 3193504 bytes, `h1.bin` 4474140 bytes, and `match.json` a little under 350 KB.

- [ ] **Step 3: Write the parity fixture into the site repo**

```bash
$PY -m coach.parity_fixtures
```
Expected: `wrote 30 frames to C:\Users\yando\Code\yandouziyassine.github.io\tests\fixtures\coach-parity.json`. That is 15 per half; anything at or above 20 is fine. Fewer than 20 means too many frames had no carrier: re-run with `--per-half 20`.

- [ ] **Step 4: Update the README.** In `20-football-analytics/README.md`, section "Run the coach", replace the code block and the line after it with:

````markdown
```bash
cd 20-football-analytics
python -m coach.prepare --raw D:/football-coach/idsse-raw    # 7 matches, ~15 min, restartable
python -m coach.evaluate                                     # all numbers + charts (~10 min on CPU)
python -m coach.export --match J03WOH --site <folder>        # one match (h0.bin / h1.bin, int16 cm, 12.5 fps) + weights
python -m coach.parity_fixtures                              # Python <-> TypeScript parity frames for the website
```

All numbers: [`docs/coach_results.json`](docs/coach_results.json). Tests: `tests/test_20_coach.py` (34).
````

- [ ] **Step 5: Add a line to `PROGRESS.md`** under the current project 20 entry: `2026-11-02: coach phase 2 groundwork: per-half site export (h0 3.2 MB, h1 4.5 MB), state() at 12.5 fps, exported-weights predictor, parity fixtures (30 J03WOH frames) for the site's TypeScript port.`

- [ ] **Step 6: Lint, test, commit, push**

```bash
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY
$PY -m ruff format --check .
$PY -m ruff check .
$PY -m pytest tests -q
git add 20-football-analytics/README.md PROGRESS.md
git commit -m "20 coach: README run lines for the per-half export and parity fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
Expected: ruff clean, pytest all green (tests whose dependencies are missing are skipped), push accepted.

---

## Part B: Site (branch `v2`)

### Task 5: Sync script, flag, data

**Files:**
- Create: `scripts/football.mjs`
- Modify: `package.json` (scripts), `src/data/flags.ts`
- Create: `public/football/*` (by running the script)
- Test: `tests/football-sync.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/football-sync.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fakeExport(dir, { size = 2 * 3 * 4, credit = "Data: someone, CC BY 4.0", trainedWithout = "T" } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const halves = [{ frames: 2, slots: [0, 1], attack: [1, -1] }];
  fs.writeFileSync(path.join(dir, "match.json"), JSON.stringify({ match_id: "T", fps: 12.5, halves, players: [], credit }));
  fs.writeFileSync(path.join(dir, "models.json"), JSON.stringify({ trained_without: trainedWithout }));
  fs.writeFileSync(path.join(dir, "h0.bin"), Buffer.alloc(size));
}
const run = (src, out) => spawnSync(process.execPath, ["scripts/football.mjs"],
  { env: { ...process.env, FOOTBALL_EXPORT: src, FOOTBALL_OUT: out }, encoding: "utf8" });

describe("npm run sync:football", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "football-"));

  it("copies match.json, models.json and one file per half", () => {
    const src = path.join(tmp, "ok"), out = path.join(tmp, "out-ok");
    fakeExport(src);
    const r = run(src, out);
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual(["h0.bin", "match.json", "models.json"]);
  });
  it("refuses a half file of the wrong size", () => {
    const src = path.join(tmp, "size");
    fakeExport(src, { size: 10 });
    const r = run(src, path.join(tmp, "out-size"));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/h0\.bin is 10 bytes, expected 24/);
  });
  it("refuses models that saw the replay match, and data without the CC BY credit", () => {
    const a = path.join(tmp, "seen"), b = path.join(tmp, "credit");
    fakeExport(a, { trainedWithout: "OTHER" });
    fakeExport(b, { credit: "no licence" });
    expect(run(a, path.join(tmp, "out-a")).stderr).toMatch(/not trained without T/);
    expect(run(b, path.join(tmp, "out-b")).stderr).toMatch(/CC BY 4\.0/);
  });
  it("does nothing when there is no export", () => {
    const out = path.join(tmp, "out-none");
    const r = run(path.join(tmp, "missing"), out);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/nothing copied/);
    expect(fs.existsSync(out)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/football-sync.test.mjs`
Expected: 4 FAIL. Node cannot find `scripts/football.mjs`, so the status is 1 and stderr says `Cannot find module`.

- [ ] **Step 3: Implement.** Create `scripts/football.mjs`:

```js
// Copies the project 20 replay export (one match + model weights, from the library's coach/export.py) into
// public/football/. Run by hand after a re-export; the output is committed (CC BY 4.0 data, credited on the page;
// CI has no cv-data checkout):
//   npm run sync:football        FOOTBALL_EXPORT overrides ../cv-data/football-coach/site-export (FOOTBALL_OUT: tests)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(process.env.FOOTBALL_EXPORT || path.join(ROOT, "..", "cv-data", "football-coach", "site-export"));
const OUT = path.resolve(process.env.FOOTBALL_OUT || path.join(ROOT, "public", "football"));

if (!fs.existsSync(path.join(SRC, "match.json"))) {
  console.log(`football: no export in ${SRC}, nothing copied`);
  process.exit(0);
}
const meta = JSON.parse(fs.readFileSync(path.join(SRC, "match.json"), "utf8"));
const models = JSON.parse(fs.readFileSync(path.join(SRC, "models.json"), "utf8"));
if (!Array.isArray(meta.halves)) throw new Error("football: old single-file export (match.bin); re-run coach.export in the library");
if (!/CC BY 4\.0/.test(meta.credit || "")) throw new Error("football: match.json has no CC BY 4.0 credit line");
if (models.trained_without !== meta.match_id) throw new Error(`football: models were not trained without ${meta.match_id}`);
meta.halves.forEach((h, i) => {
  const size = fs.statSync(path.join(SRC, `h${i}.bin`)).size, want = h.frames * (h.slots.length + 1) * 4;
  if (size !== want) throw new Error(`football: h${i}.bin is ${size} bytes, expected ${want}`);
});
const files = ["match.json", "models.json", ...meta.halves.map((_, i) => `h${i}.bin`)];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of files) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
const mb = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1e6;
console.log(`football: ${meta.match_id}, ${meta.halves.map((h) => h.frames).join(" + ")} frames, ${files.length} files, ${mb.toFixed(1)} MB`);
```

In `package.json` `"scripts"`, add after `"sync:depth-game"`:

```json
    "sync:depth-game": "node scripts/depth-game.mjs",
    "sync:football": "node scripts/football.mjs"
```

Append to `src/data/flags.ts`:

```ts

// The football replay is live once scripts/football.mjs has copied the project 20 export into public/football/.
export const FOOTBALL_LIVE = fs.existsSync("public/football/models.json");
```

- [ ] **Step 4: Run the test, then copy the real data**

```bash
npx vitest run tests/football-sync.test.mjs
npm run sync:football
```
Expected: `4 passed`, then `football: J03WOH, 34712 + 33895 frames, 4 files, 8.0 MB`. The exact MB may differ by 0.1.

- [ ] **Step 5: Commit**

```bash
git add scripts/football.mjs package.json src/data/flags.ts tests/football-sync.test.mjs public/football
git commit -m "Football replay data: sync script, FOOTBALL_LIVE flag, J03WOH per-half files (CC BY 4.0)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Geometry + pitch control

**Files:**
- Create: `src/lib/coach/geometry.ts`, `src/lib/coach/pitchControl.ts`
- Test: `tests/coach-geometry.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/coach-geometry.test.mjs` (ports of the Python tests with the same numbers):

```js
import { describe, expect, it } from "vitest";
import { goalGeometry, normalise } from "../src/lib/coach/geometry.ts";
import { DEFAULT_PC, control, timeToReach } from "../src/lib/coach/pitchControl.ts";

describe("geometry", () => {
  it("rotates by 180° when the team attacks towards -x", () => {
    expect(normalise([10, 5], -1)).toEqual([-10, -5]);
    expect(normalise([10, 5], 1)).toEqual([10, 5]);
  });
  it("measures the goal distance and the opening angle between the posts", () => {
    const g = goalGeometry([52.5 - 11, 0]);
    expect(g.dist).toBeCloseTo(11, 12);
    expect(g.angle).toBeCloseTo(2 * Math.atan(3.66 / 11), 12);
    expect(goalGeometry([52.5, 10]).angle).toBe(0);        // on the goal line outside the posts
    expect(goalGeometry([52.5, 1]).angle).toBe(Math.PI);   // on the goal line between the posts
  });
});

describe("pitch control", () => {
  it("adds the reaction time, moving with the current velocity meanwhile", () => {
    // after 0.7 s the player is at x = 3.5, then 6.5 m at 5 m/s
    expect(timeToReach([0, 0], [5, 0], [10, 0], DEFAULT_PC)).toBeCloseTo(0.7 + 6.5 / 5, 12);
  });
  it("treats a missing player as never arriving", () => {
    expect(timeToReach([NaN, 0], [0, 0], [1, 0], DEFAULT_PC)).toBe(Infinity);
  });
  it("is one half when both arrive together, high near the attacker, low near the defender", () => {
    const z = [[0, 0]];
    expect(control([10, 0], [[0, 0]], z, [[20, 0]], z)).toBeCloseTo(0.5, 9);
    expect(control([1, 0], [[0, 0]], z, [[20, 0]], z)).toBeGreaterThan(0.95);
    expect(control([19, 0], [[0, 0]], z, [[20, 0]], z)).toBeLessThan(0.05);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/coach-geometry.test.mjs`
Expected: FAIL with `Failed to resolve import "../src/lib/coach/geometry.ts"` (or `Cannot find module`).

- [ ] **Step 3: Implement.** Create `src/lib/coach/geometry.ts`:

```ts
// Pitch geometry: port of coach/geometry.py (COMPUTER-VISION-PROJECT-LIBRARY, project 20). Metres, centre spot =
// origin. "Normalised" frame: the team in question attacks towards +x (goal centre at (52.5, 0)).

export type Vec = [number, number];
export const HALF_LENGTH = 52.5, HALF_WIDTH = 34.0, GOAL_HALF_WIDTH = 3.66;

/** Rotate by 180° when the team attacks towards -x (keeps left/right consistent). Its own inverse. */
export function normalise(p: Vec, direction: number): Vec {
  return direction === 1 ? [p[0], p[1]] : [-p[0], -p[1]];
}

/** Distance to the goal centre and opening angle between the posts (radians) of a normalised point. */
export function goalGeometry(p: Vec): { dist: number; angle: number } {
  const dx = HALF_LENGTH - p[0];
  const dist = Math.hypot(dx, p[1]);
  if (dx <= 1e-9) return { dist, angle: Math.abs(p[1]) <= GOAL_HALF_WIDTH ? Math.PI : 0 };
  const a1 = Math.atan2(GOAL_HALF_WIDTH - p[1], dx), a2 = Math.atan2(-GOAL_HALF_WIDTH - p[1], dx);
  let angle = Math.abs(a1 - a2);
  if (angle > Math.PI) angle = 2 * Math.PI - angle;
  return { dist, angle };
}
```

Create `src/lib/coach/pitchControl.ts`:

```ts
// Closed-form pitch control: port of coach/pitch_control.py. Each player reacts for `reaction` s (moving with his
// current velocity), then runs straight at `vmax`; a team's control of a point is a logistic function of the gap
// between the fastest defender's and the fastest attacker's arrival times (sigma = arrival-time uncertainty).
import type { Vec } from "./geometry";

export interface PitchControlParams { reaction: number; vmax: number; sigma: number }
export const DEFAULT_PC: PitchControlParams = { reaction: 0.7, vmax: 5.0, sigma: 0.45 };

/** Arrival time of one player at a point; Infinity for a missing (NaN) player. */
export function timeToReach(pos: Vec, vel: Vec, point: Vec, pc: PitchControlParams): number {
  const sx = pos[0] + vel[0] * pc.reaction, sy = pos[1] + vel[1] * pc.reaction;
  const dx = point[0] - sx, dy = point[1] - sy;
  const t = pc.reaction + Math.sqrt(dx * dx + dy * dy) / pc.vmax; // np.linalg.norm in the Python
  return Number.isNaN(t) ? Infinity : t;
}

/** Probability that the attacking team controls the point. */
export function control(point: Vec, att: Vec[], attV: Vec[], def: Vec[], defV: Vec[], pc: PitchControlParams = DEFAULT_PC): number {
  let ta = Infinity, td = Infinity;
  for (let i = 0; i < att.length; i++) ta = Math.min(ta, timeToReach(att[i], attV[i], point, pc));
  for (let i = 0; i < def.length; i++) td = Math.min(td, timeToReach(def[i], defV[i], point, pc));
  const scale = Math.PI / Math.sqrt(3) / pc.sigma;
  return 1 / (1 + Math.exp(-scale * Math.max(-50, Math.min(50, td - ta))));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/coach-geometry.test.mjs`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/geometry.ts src/lib/coach/pitchControl.ts tests/coach-geometry.test.mjs
git commit -m "Coach port: pitch geometry and closed-form pitch control

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Features

**Files:**
- Create: `src/lib/coach/features.ts`
- Test: `tests/coach-features.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/coach-features.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { PASS_FEATURES, SHOT_FEATURES, VALUE_FEATURES, laneLossPoint, passFeatures, shotFeatures, valueFeatures, vector } from "../src/lib/coach/features.ts";

const s = {
  att: [[0, 0], [20, 0]], attV: [[0, 0], [0, 0]],
  def: [[10, 1], [40, 30]], defV: [[0, 0], [0, 0]],
  attIdx: [5, 6], defIdx: [7, 8], ball: [0, 0], direction: 1,
};

describe("pass features", () => {
  it("measures the lane, the receiver's space and the pressure, in the model's order", () => {
    const f = passFeatures(s, 0, 1);
    expect(f.distance).toBeCloseTo(20, 12);
    expect(f.forward).toBeCloseTo(20, 12);
    expect(f.abs_angle).toBe(0);
    expect(f.lane_defenders).toBe(1);
    expect(f.receiver_space).toBeCloseTo(Math.hypot(10, 1), 12);
    expect(f.passer_pressure).toBeCloseTo(Math.hypot(10, 1), 12);
    expect(f.target_control).toBeGreaterThan(0);
    expect(f.target_control).toBeLessThan(1);
    expect(Object.keys(f)).toEqual([...PASS_FEATURES]);
    expect(vector(f, PASS_FEATURES)).toHaveLength(9);
  });
});

describe("value and shot features", () => {
  it("builds the value basis", () => {
    const v = valueFeatures([41.5, 0]);
    expect(v.goal_dist).toBeCloseTo(11, 12);
    expect(v.in_box).toBe(1);
    expect(v.near_goal).toBeCloseTo(Math.exp(-11 / 8), 12);
    expect(v.x_sq).toBeCloseTo((41.5 / 52.5) ** 2, 12);
    expect(Object.keys(v)).toEqual([...VALUE_FEATURES]);
    expect(valueFeatures([30, 0]).in_box).toBe(0);
  });
  it("counts defenders inside the ball-post-post triangle", () => {
    const f = shotFeatures([41.5, 0], [[45, 0], [0, 0]]);
    expect(f.cone_defenders).toBe(1);
    expect(Object.keys(f)).toEqual([...SHOT_FEATURES]);
  });
});

describe("lane loss point", () => {
  it("is the nearest defender's projection on the lane, clipped to its interior", () => {
    expect(laneLossPoint(s, [0, 0], [20, 0])).toEqual([10, 0]);
    expect(laneLossPoint({ ...s, def: [[-3, 1]] }, [0, 0], [20, 0])).toEqual([2, 0]); // t clipped to 0.1
  });
  it("is the lane midpoint when no defender is within 10 m", () => {
    expect(laneLossPoint({ ...s, def: [[40, 30]] }, [0, 0], [20, 0])).toEqual([10, 0]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/coach-features.test.mjs`
Expected: FAIL with `Failed to resolve import "../src/lib/coach/features.ts"`

- [ ] **Step 3: Implement.** Create `src/lib/coach/features.ts`:

```ts
// Features for the coach's three models from one normalised frame state (the team in question attacks +x): port of
// coach/features.py. Names and order match models.json; norms are sqrt(dx² + dy²) like np.linalg.norm.
import { GOAL_HALF_WIDTH, HALF_LENGTH, goalGeometry, type Vec } from "./geometry";
import { DEFAULT_PC, control, type PitchControlParams } from "./pitchControl";

export const PASS_FEATURES = ["distance", "forward", "abs_angle", "lane_defenders", "receiver_space", "passer_pressure",
  "target_control", "target_x", "target_goal_dist"] as const;
export const VALUE_FEATURES = ["x", "abs_y", "goal_dist", "goal_angle", "in_box", "near_goal", "mid_goal", "far_goal",
  "x_sq", "angle_near"] as const;
export const SHOT_FEATURES = ["goal_dist", "goal_angle", "cone_defenders"] as const;
export const LANE_WIDTH = 2.0;

/** One frame from the point of view of the attacking team (rows of att / def follow ascending player index). */
export interface State {
  att: Vec[]; attV: Vec[]; def: Vec[]; defV: Vec[];
  attIdx: number[]; defIdx: number[]; ball: Vec; direction: number;
}
export type Features = Record<string, number>;

/** Feature dict -> vector in a model's order. */
export const vector = (f: Features, names: readonly string[]): number[] => names.map((k) => f[k]);
const norm = (x: number, y: number) => Math.sqrt(x * x + y * y);

/** Distance from p to the segment a-b and the projection parameter t in [0, 1]. */
export function segmentDist(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const raw = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / Math.max(abx * abx + aby * aby, 1e-9);
  const t = Math.min(1, Math.max(0, raw));
  return { d: norm(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby)), t };
}

export function passFeatures(s: State, passer: number, target: number, pc: PitchControlParams = DEFAULT_PC): Features {
  const a = s.att[passer], b = s.att[target];
  let lane = 0, space = Infinity, pressure = Infinity;
  for (const p of s.def) {
    const { d, t } = segmentDist(p, a, b);
    if (d < LANE_WIDTH && t > 0.05 && t < 0.95) lane++;
    space = Math.min(space, norm(p[0] - b[0], p[1] - b[1]));
    pressure = Math.min(pressure, norm(p[0] - a[0], p[1] - a[1]));
  }
  return {
    distance: norm(b[0] - a[0], b[1] - a[1]),
    forward: b[0] - a[0],
    abs_angle: Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0])),
    lane_defenders: lane,
    receiver_space: space,
    passer_pressure: pressure,
    target_control: control(b, s.att, s.attV, s.def, s.defV, pc),
    target_x: b[0],
    target_goal_dist: goalGeometry(b).dist,
  };
}

export function valueFeatures(ball: Vec): Features {
  const { dist: gd, angle: ga } = goalGeometry(ball);
  const near = Math.exp(-gd / 8.0);
  return {
    x: ball[0],
    abs_y: Math.abs(ball[1]),
    goal_dist: gd,
    goal_angle: ga,
    in_box: Math.abs(ball[1]) < 20.16 && ball[0] > HALF_LENGTH - 16.5 ? 1 : 0,
    near_goal: near,
    mid_goal: Math.exp(-gd / 20.0),
    far_goal: Math.exp(-gd / 50.0),
    x_sq: (ball[0] / HALF_LENGTH) ** 2,
    angle_near: ga * near,
  };
}

/** Where a pass from a to b is most likely lost: the nearest defender's projection on the lane (t clipped to
 *  [0.1, 0.95]), or the lane midpoint when no defender is within `reach` metres of it. */
export function laneLossPoint(s: State, a: Vec, b: Vec, reach = 10.0): Vec {
  let best = Infinity, tk = 0;
  for (const p of s.def) {
    const { d, t } = segmentDist(p, a, b);
    if (d < best) { best = d; tk = t; }
  }
  if (best > reach) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const t = Math.min(0.95, Math.max(0.1, tk));
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Defenders inside the triangle ball-post-post count as blocking the shot. */
export function shotFeatures(ball: Vec, defenders: Vec[]): Features {
  const { dist, angle } = goalGeometry(ball);
  const tri: Vec[] = [ball, [HALF_LENGTH, GOAL_HALF_WIDTH], [HALF_LENGTH, -GOAL_HALF_WIDTH]];
  const inside = (p: Vec) => {
    const s = [0, 1, 2].map((i) => {
      const a = tri[i], b = tri[(i + 1) % 3];
      return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    });
    return s.every((v) => v >= 0) || s.every((v) => v <= 0);
  };
  return { goal_dist: dist, goal_angle: angle, cone_defenders: defenders.filter(inside).length };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/coach-features.test.mjs`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/features.ts tests/coach-features.test.mjs
git commit -m "Coach port: pass, value and shot features, lane loss point

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Models + advice ranking

**Files:**
- Create: `src/lib/coach/advice.ts`, `src/lib/coach/models.ts`
- Test: `tests/coach-advice.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/coach-advice.test.mjs` (the two Python advice tests with the same numbers, plus models):

```js
import { describe, expect, it } from "vitest";
import { options } from "../src/lib/coach/advice.ts";
import { coachFromModels, predictLinear } from "../src/lib/coach/models.ts";
import { PASS_FEATURES, SHOT_FEATURES, VALUE_FEATURES } from "../src/lib/coach/features.ts";
import { DEFAULT_PC } from "../src/lib/coach/pitchControl.ts";

const ADVICE = { carry_dist: 6, carry_angles_deg: [-60, -30, 0, 30, 60], shot_range: 35 };
const dot = (w) => (x) => x.reduce((s, v, i) => s + v * w[i], 0);
const sig = (f) => (x) => 1 / (1 + Math.exp(-f(x)));
const coach = (predict) => ({ predict, pc: DEFAULT_PC, advice: ADVICE });
const z2 = (n) => Array.from({ length: n }, () => [0, 0]);

describe("predictLinear", () => {
  const lin = { features: ["a", "b"], link: "logit", mean: [1, 2], scale: [2, 4], coef: [0.5, -1], intercept: 0.25 };
  it("standardises, takes the dot product and applies the link", () => {
    // z = 0.25 + (3 - 1) / 2 * 0.5 + (6 - 2) / 4 * -1 = -0.25
    expect(predictLinear(lin, [3, 6])).toBeCloseTo(1 / (1 + Math.exp(0.25)), 15);
    expect(predictLinear({ ...lin, link: "identity" }, [3, 6])).toBeCloseTo(-0.25, 15);
  });
  it("refuses weights whose feature order differs from the port's", () => {
    const flat = (names, link) => ({ features: [...names], link, mean: names.map(() => 0), scale: names.map(() => 1), coef: names.map(() => 0), intercept: 0 });
    const ok = { trained_without: "X", trained_on: [], pass: flat(PASS_FEATURES, "logit"), value: flat(VALUE_FEATURES, "identity"),
      shot: flat(SHOT_FEATURES, "logit"), pitch_control: DEFAULT_PC, advice: ADVICE };
    expect(coachFromModels(ok).predict.pass(PASS_FEATURES.map(() => 1))).toBeCloseTo(0.5, 15);
    expect(() => coachFromModels({ ...ok, pass: flat([...PASS_FEATURES].reverse(), "logit") })).toThrow(/pass features/);
  });
});

describe("options", () => {
  it("prefers the open forward teammate and scores the shot as xG minus the value of keeping the ball", () => {
    const s = { att: [[20, 0], [45, 0], [5, 0]], attV: z2(3), def: [[20, 25], [0, -25]], defV: z2(2),
      attIdx: [0, 1, 2], defIdx: [3, 4], ball: [20, 0], direction: 1 }; // carrier 32.5 m from goal: a shot option
    const opts = options(s, 0, coach({
      pass: sig(dot([-0.05, 0, 0, -1.0, 0.05, 0, 2.0, 0, 0])),
      value: (x) => (0.1 * x[0]) / 52.5,
      shot: sig(dot([-0.2, 0, 0])),
    }));
    const passes = opts.filter((o) => o.kind === "pass");
    expect(passes[0].target).toBe(1);
    expect(new Set(opts.map((o) => o.kind))).toEqual(new Set(["pass", "carry", "shot"]));
    expect(opts.every((o) => o.p >= 0 && o.p <= 1)).toBe(true);
    expect(opts.map((o) => o.score)).toEqual([...opts.map((o) => o.score)].sort((a, b) => b - a));
    const shot = opts.find((o) => o.kind === "shot");
    expect(shot.score).toBeCloseTo(shot.p - (0.1 * 20) / 52.5, 12);
  });
  it("lets the turnover cost overturn the order of probability alone", () => {
    const s = { att: [[-30, 0], [-35, 0], [10, 0]], attV: z2(3), def: [[-32, 3], [5, 2]], defV: z2(2),
      attIdx: [0, 1, 2], defIdx: [3, 4], ball: [-30, 0], direction: 1 };
    const passes = options(s, 0, coach({
      pass: (x) => 1 / (1 + Math.exp(-(2.0 - 0.1 * x[0]))),
      value: (x) => (0.1 * x[0]) / 52.5,
      shot: () => 0,
    })).filter((o) => o.kind === "pass");
    const byP = [...passes].sort((a, b) => b.p - a.p);
    expect(byP[0].target).toBe(1);
    expect(passes[0].target).toBe(2);
    expect(passes[0].score).toBeGreaterThan(0);
    expect(byP[0].score).toBeLessThan(0);
    expect(passes[0].vLost).toBeCloseTo((0.1 * -5.0) / 52.5, 12); // loss point (5, 0), mirrored for the opponent
  });
  it("clips carries to the pitch", () => {
    const s = { att: [[50, 32], [0, 0]], attV: z2(2), def: [[-40, 0]], defV: z2(1), attIdx: [0, 1], defIdx: [2], ball: [50, 32], direction: 1 };
    const carries = options(s, 0, coach({ pass: () => 0.5, value: () => 0, shot: () => 0.1 })).filter((o) => o.kind === "carry");
    expect(carries.every((o) => o.to[0] <= 52.5 && o.to[1] <= 34)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/coach-advice.test.mjs`
Expected: FAIL with `Failed to resolve import "../src/lib/coach/advice.ts"`

- [ ] **Step 3: Implement.** Create `src/lib/coach/advice.ts`:

```ts
// Rank the ball carrier's options in expected-goal units: port of coach/advice.py. For each pass and carry,
// score = p * V(target) - (1 - p) * V_opp(loss point) - V(now), where V_opp is the value for the opponent (point
// mirrored) and the loss point is where a failed pass is lost (laneLossPoint) or the carry point itself. A shot within
// shot_range scores xG - V(now). Sorted best first; ties keep insertion order (Python's sorted is stable too).
import { PASS_FEATURES, SHOT_FEATURES, VALUE_FEATURES, laneLossPoint, passFeatures, shotFeatures, valueFeatures, vector, type State } from "./features";
import { HALF_LENGTH, HALF_WIDTH, type Vec } from "./geometry";
import { control, type PitchControlParams } from "./pitchControl";

export type Predict = (x: number[]) => number;
export interface AdviceParams { carry_dist: number; carry_angles_deg: number[]; shot_range: number }
export interface Coach { predict: { pass: Predict; value: Predict; shot: Predict }; pc: PitchControlParams; advice: AdviceParams }
export interface CoachOption {
  kind: "pass" | "carry" | "shot";
  target?: number;   // pass: player index (match.json players)
  angle?: number;    // carry: degrees in the normalised frame, > 0 = to the carrier's left
  to: Vec;           // normalised end point
  p: number;         // pass arrives / team keeps the ball at the carry point / shot is a goal
  value: number;     // V(to); 1 for a shot
  vLost?: number;    // V_opp(loss point)
  score: number;     // expected change in net xG
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const valueAt = (coach: Coach, p: Vec) => coach.predict.value(vector(valueFeatures(p), VALUE_FEATURES));

export function options(s: State, carrier: number, coach: Coach): CoachOption[] {
  const out: CoachOption[] = [], loss: Vec[] = [];
  const here = s.att[carrier];
  for (let j = 0; j < s.att.length; j++) {
    if (j === carrier) continue;
    const p = coach.predict.pass(vector(passFeatures(s, carrier, j, coach.pc), PASS_FEATURES));
    out.push({ kind: "pass", target: s.attIdx[j], to: [s.att[j][0], s.att[j][1]], p, value: 0, score: 0 });
    loss.push(laneLossPoint(s, here, s.att[j]));
  }
  for (const a of coach.advice.carry_angles_deg) {
    const r = a * (Math.PI / 180); // np.radians
    const to: Vec = [
      clamp(here[0] + coach.advice.carry_dist * Math.cos(r), -HALF_LENGTH, HALF_LENGTH),
      clamp(here[1] + coach.advice.carry_dist * Math.sin(r), -HALF_WIDTH, HALF_WIDTH),
    ];
    out.push({ kind: "carry", angle: a, to, p: control(to, s.att, s.attV, s.def, s.defV, coach.pc), value: 0, score: 0 });
    loss.push(to);
  }
  const vNow = valueAt(coach, here);
  out.forEach((o, i) => {
    o.value = valueAt(coach, o.to);
    o.vLost = valueAt(coach, [-loss[i][0], -loss[i][1]]); // the opponent attacks the other way
    o.score = o.p * o.value - (1 - o.p) * o.vLost - vNow;
  });
  const sf = shotFeatures(here, s.def);
  if (sf.goal_dist <= coach.advice.shot_range) {
    const p = coach.predict.shot(vector(sf, SHOT_FEATURES));
    out.push({ kind: "shot", to: [HALF_LENGTH, 0], p, value: 1, score: p - vNow });
  }
  return out.map((o, i) => ({ o, i })).sort((x, y) => y.o.score - x.o.score || x.i - y.i).map(({ o }) => o);
}
```

Create `src/lib/coach/models.ts`:

```ts
// The exported model weights (public/football/models.json, written by the library's coach/export.py): StandardScaler
// + logistic regression (pass, shot) or ridge (value). score = ((x - mean) / scale) . coef + intercept; probability =
// sigmoid(score) for link "logit", the score itself for "identity".
import type { AdviceParams, Coach } from "./advice";
import { PASS_FEATURES, SHOT_FEATURES, VALUE_FEATURES } from "./features";
import type { PitchControlParams } from "./pitchControl";

export interface LinearModel { features: string[]; link: "logit" | "identity"; mean: number[]; scale: number[]; coef: number[]; intercept: number }
export interface ModelsJson {
  trained_without: string; trained_on: string[];
  pass: LinearModel; value: LinearModel & { horizon_s?: number }; shot: LinearModel;
  pitch_control: PitchControlParams; advice: AdviceParams;
}

export function predictLinear(m: LinearModel, x: readonly number[]): number {
  let z = m.intercept;
  for (let i = 0; i < x.length; i++) z += ((x[i] - m.mean[i]) / m.scale[i]) * m.coef[i];
  return m.link === "logit" ? 1 / (1 + Math.exp(-z)) : z;
}

function check(m: LinearModel, names: readonly string[], what: string) {
  if (m.features.join() !== names.join()) throw new Error(`${what} features [${m.features}] differ from the port's [${names}]`);
}

export function coachFromModels(w: ModelsJson): Coach {
  check(w.pass, PASS_FEATURES, "pass");
  check(w.value, VALUE_FEATURES, "value");
  check(w.shot, SHOT_FEATURES, "shot");
  return {
    predict: { pass: (x) => predictLinear(w.pass, x), value: (x) => predictLinear(w.value, x), shot: (x) => predictLinear(w.shot, x) },
    pc: w.pitch_control,
    advice: w.advice,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/coach-advice.test.mjs`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/advice.ts src/lib/coach/models.ts tests/coach-advice.test.mjs
git commit -m "Coach port: option ranking in expected goals, predictors from models.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Python ↔ TypeScript engine parity

**Files:**
- Add: `tests/fixtures/coach-parity.json` (written in Task 4, Step 3)
- Test: `tests/coach-parity.test.mjs`

- [ ] **Step 1: Write the test.** Create `tests/coach-parity.test.mjs`:

```js
// Python <-> TypeScript parity (spec, "Evaluation"): the frames in tests/fixtures/coach-parity.json were computed by
// the library's coach/parity_fixtures.py on the shipped J03WOH files. Same features and probabilities within 1e-6,
// same option order.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { options } from "../src/lib/coach/advice.ts";
import { passFeatures, shotFeatures, valueFeatures } from "../src/lib/coach/features.ts";
import { coachFromModels } from "../src/lib/coach/models.ts";

const FX = "tests/fixtures/coach-parity.json";
const fx = fs.existsSync(FX) ? JSON.parse(fs.readFileSync(FX, "utf8")) : null;
const TOL = 1e-6;
const stateOf = (r) => ({ att: r.state.att, attV: r.state.att_v, def: r.state.def, defV: r.state.def_v,
  attIdx: r.state.att_idx, defIdx: r.state.def_idx, ball: r.state.ball, direction: r.state.direction });
const key = (o) => (o.kind === "pass" ? `pass:${o.target}` : o.kind === "carry" ? `carry:${o.angle}` : "shot");
const close = (got, want, what) => {
  for (const k of Object.keys(want)) expect(Math.abs(got[k] - want[k]), `${what}: ${k}`).toBeLessThan(TOL);
};

describe.skipIf(!fx)("coach parity with Python on real frames", () => {
  const coach = fx ? coachFromModels(fx.models) : null;
  it("covers at least 20 frames from both halves", () => {
    expect(fx.frames.length).toBeGreaterThanOrEqual(20);
    expect(new Set(fx.frames.map((r) => r.half))).toEqual(new Set([0, 1]));
  });
  for (const r of fx?.frames ?? []) {
    it(`half ${r.half}, frame ${r.frame}: features, probabilities, values and ranking`, () => {
      const s = stateOf(r);
      for (const { target, ...want } of r.pass_features) close(passFeatures(s, r.carrier_row, s.attIdx.indexOf(target), coach.pc), want, `pass to ${target}`);
      close(valueFeatures(s.att[r.carrier_row]), r.value_features, "value");
      close(shotFeatures(s.att[r.carrier_row], s.def), r.shot_features, "shot");
      const got = options(s, r.carrier_row, coach);
      expect(got.map(key)).toEqual(r.options.map(key));
      got.forEach((o, i) => {
        const w = r.options[i];
        for (const k of ["p", "value", "score"]) expect(Math.abs(o[k] - w[k]), `${key(o)} ${k}`).toBeLessThan(TOL);
        if (w.v_lost !== undefined) expect(Math.abs(o.vLost - w.v_lost), `${key(o)} v_lost`).toBeLessThan(TOL);
        expect(Math.max(Math.abs(o.to[0] - w.to[0]), Math.abs(o.to[1] - w.to[1])), `${key(o)} to`).toBeLessThan(TOL);
      });
    });
  }
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/coach-parity.test.mjs`
Expected: all pass (`31 passed` with 30 frames). Fix any failure with superpowers:systematic-debugging and **never raise the tolerance**. The usual causes are a different operation order (compare with the Python line by line), a feature missing from `PASS_FEATURES`, or a fixture written by an older export (re-run Task 4, Steps 1–3).

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/coach-parity.json tests/coach-parity.test.mjs
git commit -m "Coach port: Python <-> TypeScript parity on 30 J03WOH frames (1e-6, same ranking)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Replay decoding, state, carrier, interpolation

**Files:**
- Create: `src/lib/coach/replay.ts`
- Test: `tests/coach-replay.test.mjs`; `tests/coach-parity.test.mjs` (append the shipped-data block)

- [ ] **Step 1: Write the failing tests.** Create `tests/coach-replay.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { ABSENT, ballAt, carrierAt, clock, decodeHalf, eventFrame, frameDots, markers, ownerAt, playerAt, stateAt, trail, velocityAt } from "../src/lib/coach/replay.ts";

const players = [
  { team: 0, shirt: 10, name: "A" }, { team: 0, shirt: 8, name: "B" }, { team: 1, shirt: 4, name: "C" },
  { team: -1, shirt: 0, name: "?" }, { team: 1, shirt: 9, name: "Sub" },
];
/** A half file from at(frame) -> [[x, y] | null for each slot..., ball [x, y] | null], metres. */
function halfFile(frames, slots, at) {
  const stride = (slots.length + 1) * 2, data = new Int16Array(frames * stride);
  for (let f = 0; f < frames; f++) at(f).forEach((p, c) => {
    data[f * stride + 2 * c] = p ? Math.round(p[0] * 100) : ABSENT;
    data[f * stride + 2 * c + 1] = p ? Math.round(p[1] * 100) : ABSENT;
  });
  return data.buffer;
}
const FR = 20;
// A runs along +x at 2.5 m/s (0.2 m per 12.5 fps frame) with the ball at his feet; B and "?" stand; C arrives at
// frame 3; player 4 (a substitute) is not in this half's slots.
const info = { frames: FR, slots: [0, 1, 2, 3], attack: [1, -1] };
const h = decodeHalf(halfFile(FR, info.slots, (f) => [[-10 + 0.2 * f, 0], [5, 5], f < 3 ? null : [10, 0], [0, 30], [-10 + 0.2 * f, 0.5]]), info, players.length);
const meta = {
  match_id: "T", fps: 12.5, halves: [info], players, meta: { home: "Home", guest: "Away", colors: ["#9F1922", "#FFFFFF"] },
  owner: ["1".repeat(10) + "0" + "2".repeat(9)], alive: ["1".repeat(FR - 1) + "0"], events: [], credit: "",
};
const near = (got, want) => want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 9));

describe("decoding", () => {
  it("rejects a file of the wrong size", () => {
    expect(() => decodeHalf(new ArrayBuffer(10), info, players.length)).toThrow(/expected/);
  });
  it("reads centimetres as metres and the absent code as null", () => {
    near(playerAt(h, 5, 0), [-9, 0]);
    near(ballAt(h, 5), [-9, 0.5]);
    expect(playerAt(h, 0, 2)).toBeNull();
    expect(playerAt(h, 5, 4)).toBeNull(); // not in this half
  });
});

describe("state", () => {
  it("velocity: backward difference over 2 frames, zero without history or when the player was absent", () => {
    near(velocityAt(h, 10, 0, 12.5), [2.5, 0]);
    near(velocityAt(h, 1, 0, 12.5), [2.5, 0]); // one frame of history: (x1 - x0) * 12.5
    expect(velocityAt(h, 0, 0, 12.5)).toEqual([0, 0]);
    expect(velocityAt(h, 4, 2, 12.5)).toEqual([0, 0]); // C absent at frame 2
  });
  it("normalises for the attacking team, orders by player index and leaves out players without a team", () => {
    const s = stateAt(meta, 0, h, 10, 1); // guests attack -x in this half: everything rotates by 180°
    expect(s.direction).toBe(-1);
    expect(s.attIdx).toEqual([2]);
    expect(s.defIdx).toEqual([0, 1]);
    near(s.att[0], [-10, 0]);
    near(s.def[0], [8, 0]);
    near(s.defV[0], [-2.5, 0]);
    near(s.ball, [8, -0.5]);
  });
});

describe("ball carrier", () => {
  it("is the nearest player of the team in possession within 2 m of the ball", () => {
    expect(carrierAt(meta, 0, h, 5)).toEqual({ player: 0, team: 0 });
  });
  it("is nobody when possession is unknown, the ball is dead, or the team's nearest player is too far", () => {
    expect(ownerAt(meta, 0, 10)).toBe(-1);
    expect(carrierAt(meta, 0, h, 10)).toBeNull();
    expect(ownerAt(meta, 0, 12)).toBe(1);
    expect(carrierAt(meta, 0, h, 12)).toBeNull(); // C is 17 m from the ball
    expect(carrierAt(meta, 0, h, 19)).toBeNull(); // ball out of play
  });
});

describe("drawing helpers", () => {
  it("interpolates positions between frames and hides a player absent at the nearer frame", () => {
    const at = (t, p) => frameDots(h, t).players.find((d) => d.player === p)?.at ?? null;
    near(at(5.5, 0), [-8.9, 0]);
    expect(at(2.4, 2)).toBeNull();
    near(at(2.6, 2), [10, 0]);
    near(frameDots(h, 5.5).ball, [-8.9, 0.5]);
  });
  it("keeps the last second of ball positions", () => {
    expect(trail(h, 15, 12.5)).toHaveLength(14); // frames 2..15
  });
  it("prints the match clock, the second half starting at 45:00", () => {
    expect(clock(0, 750, 12.5)).toBe("01:00");
    expect(clock(1, 0, 12.5)).toBe("45:00");
    expect(clock(1, 125, 12.5)).toBe("45:10");
  });
  it("places events by their synced frame, else their nominal frame", () => {
    expect(eventFrame({ frame: 3, nominal: 7 })).toBe(3);
    expect(eventFrame({ frame: null, nominal: 7 })).toBe(7);
    expect(eventFrame({ frame: null })).toBeNull();
  });
  it("lists goals and shots for the timeline, in time order", () => {
    const events = [
      { type: "shot", half: 0, frame: null, nominal: 12, team: 1, player: 2, goal: false },
      { type: "shot", half: 0, frame: 8, team: 0, player: 0, goal: true },
      { type: "shot", half: null, frame: null, team: 0, player: 0, goal: false },
      { type: "pass", half: 0, frame: 9, team: 0, player: 0, recipient: 1, success: true },
    ];
    expect(markers({ ...meta, events })).toEqual([
      { half: 0, frame: 8, kind: "goal", team: 0, label: "Goal 00:00 · Home · #10 A" },
      { half: 0, frame: 12, kind: "shot", team: 1, label: "Shot 00:00 · Away · #4 C" },
    ]);
  });
});
```

Then append to `tests/coach-parity.test.mjs`:

```js
import { carrierAt, decodeHalf, stateAt } from "../src/lib/coach/replay.ts";

const DATA = "public/football";
const shipped = !!fx && fs.existsSync(`${DATA}/h0.bin`) && fs.existsSync(`${DATA}/h1.bin`);
const meta = shipped ? JSON.parse(fs.readFileSync(`${DATA}/match.json`, "utf8")) : null;
const halves = shipped ? meta.halves.map((info, i) => {
  const b = fs.readFileSync(`${DATA}/h${i}.bin`);
  return decodeHalf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), info, meta.players.length);
}) : [];

describe.skipIf(!shipped)("the shipped replay files rebuild the same frames", () => {
  it("the fixture was made from the shipped match and models", () => {
    expect(fx.match_id).toBe(meta.match_id);
    expect(fx.models).toEqual(JSON.parse(fs.readFileSync(`${DATA}/models.json`, "utf8")));
  });
  for (const r of fx?.frames ?? []) {
    it(`half ${r.half}, frame ${r.frame}: carrier and state`, () => {
      const h = halves[r.half];
      expect(carrierAt(meta, r.half, h, r.frame)).toEqual({ player: r.carrier, team: r.team });
      const s = stateAt(meta, r.half, h, r.frame, r.team);
      expect(s.attIdx).toEqual(r.state.att_idx);
      expect(s.defIdx).toEqual(r.state.def_idx);
      expect(s.direction).toBe(r.state.direction);
      for (const [k, py] of [["att", "att"], ["attV", "att_v"], ["def", "def"], ["defV", "def_v"]])
        s[k].forEach((v, i) => expect(Math.max(Math.abs(v[0] - r.state[py][i][0]), Math.abs(v[1] - r.state[py][i][1])), `${k}[${i}]`).toBeLessThan(1e-9));
    });
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/coach-replay.test.mjs tests/coach-parity.test.mjs`
Expected: FAIL with `Failed to resolve import "../src/lib/coach/replay.ts"`

- [ ] **Step 3: Implement.** Create `src/lib/coach/replay.ts`:

```ts
// Replay data for the football demo (project 20): decode the per-half files written by the library's
// coach/export.py, rebuild the coach's frame state exactly like coach/features.py state() at the site's rate, find the
// ball carrier, and interpolate positions for drawing. h<i>.bin: little-endian int16 centimetres; for each frame the
// half's player slots (match.json halves[i].slots, ascending player index), then the ball, each (x, y);
// -32768 = absent. Int16Array reads the platform's byte order: little-endian on every browser that runs this site.
import type { State } from "./features";
import { normalise, type Vec } from "./geometry";

export const ABSENT = -32768;
/** Velocity lag: training used 4 frames at 25 fps (0.16 s), which is 2 frames at 12.5 fps. */
export const BACK_FRAMES = 2;
/** The nearest player of the team in possession has the ball when within this distance of it (m). */
export const CARRIER_M = 2.0;

export interface PlayerInfo { team: number; shirt: number; name: string }
export interface HalfInfo { frames: number; slots: number[]; attack: [number, number] }
export interface MatchEvent {
  type: "pass" | "shot"; half: number | null; frame: number | null; nominal?: number | null; team: number;
  player: number | null; recipient?: number | null; success?: boolean; goal?: boolean; xg?: number | null;
  set_piece?: string | null; cross?: boolean; drop?: string | null;
}
export interface MatchMeta {
  match_id: string; fps: number; halves: HalfInfo[]; players: PlayerInfo[];
  meta: { home: string; guest: string; colors: [string, string] };
  owner: string[]; alive: string[]; events: MatchEvent[]; credit: string;
}
export interface HalfData { info: HalfInfo; data: Int16Array; column: Int16Array; stride: number }
export interface Carrier { player: number; team: number }

export function decodeHalf(buf: ArrayBuffer, info: HalfInfo, players: number): HalfData {
  const stride = (info.slots.length + 1) * 2;
  if (buf.byteLength !== info.frames * stride * 2)
    throw new Error(`half file has ${buf.byteLength} bytes, expected ${info.frames * stride * 2}`);
  const column = new Int16Array(players).fill(-1);
  info.slots.forEach((p, c) => (column[p] = c));
  return { info, data: new Int16Array(buf), column, stride };
}

function read(h: HalfData, frame: number, col: number): Vec | null {
  const i = frame * h.stride + col * 2, x = h.data[i];
  return x === ABSENT ? null : [x / 100, h.data[i + 1] / 100];
}
export const playerAt = (h: HalfData, frame: number, player: number): Vec | null =>
  h.column[player] < 0 ? null : read(h, frame, h.column[player]);
export const ballAt = (h: HalfData, frame: number): Vec | null => read(h, frame, h.info.slots.length);

/** Backward difference over `back` frames (fewer at the start of the half); zero when the player was absent. */
export function velocityAt(h: HalfData, frame: number, player: number, fps: number, back = BACK_FRAMES): Vec {
  const b = Math.max(0, frame - back);
  if (frame <= b) return [0, 0];
  const p = playerAt(h, frame, player), q = playerAt(h, b, player);
  if (!p || !q) return [0, 0];
  const k = fps / (frame - b);
  return [(p[0] - q[0]) * k, (p[1] - q[1]) * k];
}

/** The coach's state for `team` at a frame (coach/features.py state() with fps = 12.5, back_frames = 2). */
export function stateAt(m: MatchMeta, half: number, h: HalfData, frame: number, team: number): State {
  const direction = m.halves[half].attack[team];
  const s: State = { att: [], attV: [], def: [], defV: [], attIdx: [], defIdx: [], ball: [NaN, NaN], direction };
  for (const p of h.info.slots) {
    const pos = playerAt(h, frame, p), t = m.players[p].team;
    if (!pos || (t !== team && t !== 1 - team)) continue; // team -1: not on the match sheet
    const v = velocityAt(h, frame, p, m.fps);
    if (t === team) { s.att.push(normalise(pos, direction)); s.attV.push(normalise(v, direction)); s.attIdx.push(p); }
    else { s.def.push(normalise(pos, direction)); s.defV.push(normalise(v, direction)); s.defIdx.push(p); }
  }
  const ball = ballAt(h, frame);
  if (ball) s.ball = normalise(ball, direction);
  return s;
}

/** Team in possession at a frame: 0 home, 1 guest, -1 unknown. */
export const ownerAt = (m: MatchMeta, half: number, frame: number) => Number(m.owner[half][frame]) - 1;

export function carrierAt(m: MatchMeta, half: number, h: HalfData, frame: number): Carrier | null {
  const team = ownerAt(m, half, frame), ball = ballAt(h, frame);
  if (m.alive[half][frame] !== "1" || team < 0 || !ball) return null;
  let best = -1, bestD = Infinity;
  for (const p of h.info.slots) {
    if (m.players[p].team !== team) continue;
    const pos = playerAt(h, frame, p);
    if (!pos) continue;
    const d = Math.hypot(pos[0] - ball[0], pos[1] - ball[1]);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best >= 0 && bestD <= CARRIER_M ? { player: best, team } : null;
}

/** Positions at a fractional frame t (linear between frames; a player missing at either end shows at the nearer). */
export function frameDots(h: HalfData, t: number): { players: { player: number; at: Vec }[]; ball: Vec | null } {
  const last = h.info.frames - 1;
  const f0 = Math.max(0, Math.min(last, Math.floor(t))), f1 = Math.min(last, f0 + 1), a = Math.max(0, Math.min(1, t - f0));
  const mix = (p: Vec | null, q: Vec | null): Vec | null => (p && q ? [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a] : a < 0.5 ? p : q);
  const players: { player: number; at: Vec }[] = [];
  for (const p of h.info.slots) {
    const at = mix(playerAt(h, f0, p), playerAt(h, f1, p));
    if (at) players.push({ player: p, at });
  }
  return { players, ball: mix(ballAt(h, f0), ballAt(h, f1)) };
}

/** Ball positions over the last `seconds` up to frame t. */
export function trail(h: HalfData, t: number, fps: number, seconds = 1): Vec[] {
  const f = Math.max(0, Math.min(h.info.frames - 1, Math.floor(t))), out: Vec[] = [];
  for (let i = Math.max(0, f - Math.round(seconds * fps)); i <= f; i++) {
    const b = ballAt(h, i);
    if (b) out.push(b);
  }
  return out;
}

export function clock(half: number, frame: number, fps: number): string {
  const s = Math.floor(frame / fps) + half * 45 * 60;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Frame of an event: the synced frame, else the nominal one (event clock shifted by the half's offset), else null. */
export const eventFrame = (e: Pick<MatchEvent, "frame" | "nominal">): number | null => e.frame ?? e.nominal ?? null;

export interface Marker { half: number; frame: number; kind: "goal" | "shot"; team: number; label: string }

export function markers(m: MatchMeta): Marker[] {
  const out: Marker[] = [];
  for (const e of m.events) {
    const f = eventFrame(e);
    if (e.type !== "shot" || e.half === null || f === null || (e.team !== 0 && e.team !== 1)) continue;
    const p = e.player != null ? m.players[e.player] : undefined;
    const kind = e.goal ? "goal" : "shot";
    const who = p ? ` · #${p.shirt} ${p.name}` : "";
    out.push({ half: e.half, frame: f, kind, team: e.team,
      label: `${kind === "goal" ? "Goal" : "Shot"} ${clock(e.half, f, m.fps)} · ${e.team ? m.meta.guest : m.meta.home}${who}` });
  }
  return out.sort((a, b) => a.half - b.half || a.frame - b.frame);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/coach-replay.test.mjs tests/coach-parity.test.mjs`
Expected: replay `11 passed`. Parity is 31 + 1 + 30 = `62 passed` when the data is in `public/football/` (Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/replay.ts tests/coach-replay.test.mjs tests/coach-parity.test.mjs
git commit -m "Coach port: replay decoding, causal state at 12.5 fps, ball carrier, interpolation, timeline markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: What the pro did, outcome, tally

**Files:**
- Create: `src/lib/coach/decision.ts`
- Test: `tests/coach-decision.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/coach-decision.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { decide, emptyTally, outcome, proChoice, reveal } from "../src/lib/coach/decision.ts";
import { ABSENT, decodeHalf } from "../src/lib/coach/replay.ts";

const players = [{ team: 0, shirt: 10, name: "A" }, { team: 0, shirt: 8, name: "B" }, { team: 1, shirt: 4, name: "C" }];
const FR = 300; // 24 s at 12.5 fps
function world(at, { owner = "1".repeat(FR), events = [] } = {}) {
  const slots = [0, 1, 2], stride = 8, data = new Int16Array(FR * stride);
  for (let f = 0; f < FR; f++) at(f).forEach((p, c) => {
    data[f * stride + 2 * c] = p ? Math.round(p[0] * 100) : ABSENT;
    data[f * stride + 2 * c + 1] = p ? Math.round(p[1] * 100) : ABSENT;
  });
  const info = { frames: FR, slots, attack: [1, -1] };
  const meta = { match_id: "T", fps: 12.5, halves: [info], players, meta: { home: "H", guest: "G", colors: ["#9F1922", "#FFFFFF"] },
    owner: [owner], alive: ["1".repeat(FR)], events, credit: "" };
  return { meta, h: decodeHalf(data.buffer, info, players.length) };
}
const still = () => [[-10, 0], [5, 5], [20, 0], [-10, 0.5]];
const runner = (f) => [[-10 + 0.2 * Math.min(f, 30), 0], [5, 5], [20, 0], [-10, 0.5]]; // A carries along +x for 2.4 s
const opts = [
  { kind: "carry", angle: 0, to: [-4, 0], p: 0.9, value: 0.01, vLost: 0, score: 0.03 },
  { kind: "pass", target: 1, to: [5, 5], p: 0.8, value: 0.02, vLost: 0, score: 0.02 },
  { kind: "carry", angle: 60, to: [-7, 5.2], p: 0.9, value: 0, vLost: 0, score: 0.01 },
  { kind: "shot", to: [52.5, 0], p: 0.05, value: 1, score: -0.01 },
];
const A = { player: 0, team: 0 };
const pass = (frame, extra = {}) => ({ type: "pass", half: 0, frame, team: 0, player: 0, recipient: 1, success: true, ...extra });

describe("what the pro did", () => {
  it("reads a completed pass from the events and finds the coach's option for it", () => {
    const { meta, h } = world(still, { events: [pass(20)] });
    const pro = proChoice(meta, 0, h, 0, A, opts);
    expect(pro).toMatchObject({ kind: "pass", revealFrame: 20, recipient: 1, success: true, source: "event", approx: false });
    expect(pro.option).toBe(opts[1]);
  });
  it("uses the nominal frame when the event was not synced, and says so", () => {
    const { meta, h } = world(still, { events: [pass(null, { nominal: 30 })] });
    expect(proChoice(meta, 0, h, 0, A, opts)).toMatchObject({ kind: "pass", revealFrame: 30, approx: true });
  });
  it("for a failed pass, takes the teammate nearest to the ball one second later", () => {
    const at = (f) => [[-10, 0], [5, 5], [20, 0], f >= 30 ? [5, 4] : [-10, 0.5]];
    const { meta, h } = world(at, { events: [pass(20, { recipient: 2, success: false })] });
    const pro = proChoice(meta, 0, h, 0, A, opts);
    expect(pro).toMatchObject({ kind: "pass", success: false, recipient: 2 });
    expect(pro.option).toBe(opts[1]);
  });
  it("reads a shot from the events", () => {
    const { meta, h } = world(still, { events: [{ type: "shot", half: 0, frame: 40, team: 0, player: 0, goal: false }] });
    const pro = proChoice(meta, 0, h, 0, A, opts);
    expect(pro).toMatchObject({ kind: "shot", revealFrame: 40, success: false });
    expect(pro.option).toBe(opts[3]);
  });
  it("without a pass or shot by him within 10 s, reads the carry from the tracking", () => {
    const { meta, h } = world(runner, { events: [pass(200)] }); // 16 s later: outside the window
    const pro = proChoice(meta, 0, h, 0, A, opts);
    expect(pro).toMatchObject({ kind: "carry", revealFrame: 125, source: "tracking" });
    expect(pro.option).toBe(opts[0]);
  });
  it("says he held the ball when he moved less than a metre; another player's event ends the window", () => {
    const { meta, h } = world(still, { events: [pass(50, { player: 1, recipient: 0 })] });
    expect(proChoice(meta, 0, h, 0, A, opts)).toMatchObject({ kind: "hold", revealFrame: 50, option: null });
  });
});

describe("outcome within 15 s", () => {
  const shot = (frame, goal, team = 0) => ({ type: "shot", half: 0, frame, team, player: 0, goal });
  it("goal beats shot beats lost beats kept", () => {
    expect(outcome(world(still, { events: [shot(100, false), shot(150, true)] }).meta, 0, 0, 0)).toBe("goal");
    expect(outcome(world(still, { events: [shot(100, false)] }).meta, 0, 0, 0)).toBe("shot");
    expect(outcome(world(still, { events: [shot(250, true)] }).meta, 0, 0, 0)).toBe("kept"); // after 15 s
    expect(outcome(world(still, { events: [shot(100, true, 1)] }).meta, 0, 0, 0)).toBe("kept"); // the other team's
  });
  it("is lost when the opponent holds the ball for a second", () => {
    expect(outcome(world(still, { owner: "1".repeat(50) + "2".repeat(13) + "1".repeat(FR - 63) }).meta, 0, 0, 0)).toBe("lost");
    expect(outcome(world(still, { owner: "1".repeat(50) + "2".repeat(12) + "1".repeat(FR - 62) }).meta, 0, 0, 0)).toBe("kept");
  });
});

describe("tally", () => {
  it("adds the coach's value of the viewer's and the coach's choices, then the pro's at the reveal", () => {
    let t = decide(emptyTally(), opts, opts[0]);
    t = decide(t, opts, opts[2]);
    expect(t).toMatchObject({ decisions: 2, followed: 1, proCounted: 0 });
    expect(t.viewer).toBeCloseTo(0.04, 12);
    expect(t.coach).toBeCloseTo(0.06, 12);
    t = reveal(t, { kind: "pass", option: opts[1] });
    t = reveal(t, { kind: "hold", option: null });
    expect(t.proCounted).toBe(1);
    expect(t.pro).toBeCloseTo(0.02, 12);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/coach-decision.test.mjs`
Expected: FAIL with `Failed to resolve import "../src/lib/coach/decision.ts"`

- [ ] **Step 3: Implement.** Create `src/lib/coach/decision.ts`:

```ts
// After a pause: what the professional did, how the move ended, and the running tally (viewer vs coach vs pros, each
// the sum of the coach's own score of the chosen option). Pure functions of the match data; the tally lives only in
// the page's memory.
import type { CoachOption } from "./advice";
import { normalise } from "./geometry";
import { ballAt, eventFrame, playerAt, type Carrier, type HalfData, type MatchEvent, type MatchMeta } from "./replay";

export const REVEAL_S = 10;    // the pro's choice: his next pass or shot, at most this long after the pause
export const OUTCOME_S = 15;   // the outcome window (the value model's horizon)
export const LOST_S = 1;       // the opponent must hold the ball this long to count as "lost"
export const BALL_AFTER_S = 1; // failed pass: the intended teammate is the one nearest the ball this long after release
export const CARRY_LOOK_S = 2; // a carry's direction: the carrier's movement over this time
export const MIN_CARRY_M = 1;  // moving less than this is "held the ball"

export type ProKind = "pass" | "shot" | "carry" | "hold";
export interface ProChoice {
  kind: ProKind; revealFrame: number; option: CoachOption | null; recipient: number | null;
  success: boolean | null; source: "event" | "tracking"; approx: boolean;
}
export type Outcome = "goal" | "shot" | "lost" | "kept";

function nearest(opts: CoachOption[], kind: CoachOption["kind"], dist: (o: CoachOption) => number): CoachOption | null {
  let best: CoachOption | null = null;
  for (const o of opts) if (o.kind === kind && (best === null || dist(o) < dist(best))) best = o;
  return best;
}

export function proChoice(m: MatchMeta, half: number, h: HalfData, frame: number, carrier: Carrier, opts: CoachOption[]): ProChoice {
  const fps = m.fps, last = m.halves[half].frames - 1, dir = m.halves[half].attack[carrier.team];
  const horizon = Math.min(last, frame + Math.round(REVEAL_S * fps));
  let next: { e: MatchEvent; f: number } | null = null;
  for (const e of m.events) {
    const f = eventFrame(e);
    if (e.half !== half || f === null || f < frame || f > horizon) continue;
    if (!next || f < next.f) next = { e, f };
  }
  if (next && next.e.player === carrier.player) {
    const { e, f } = next, approx = e.frame === null, base = { revealFrame: f, source: "event" as const, approx };
    if (e.type === "shot")
      return { ...base, kind: "shot", option: opts.find((o) => o.kind === "shot") ?? null, recipient: null, success: e.goal ?? null };
    if (e.success && e.recipient != null && m.players[e.recipient]?.team === carrier.team)
      return { ...base, kind: "pass", option: opts.find((o) => o.kind === "pass" && o.target === e.recipient) ?? null, recipient: e.recipient, success: true };
    // a failed pass: the recorded recipient is the opponent who won the ball, so the intended teammate is inferred
    const ball = ballAt(h, Math.min(last, f + Math.round(BALL_AFTER_S * fps)));
    const end = ball ? normalise(ball, dir) : null;
    const option = end ? nearest(opts, "pass", (o) => Math.hypot(o.to[0] - end[0], o.to[1] - end[1])) : null;
    return { ...base, kind: "pass", option, recipient: e.recipient ?? null, success: false };
  }
  // no pass or shot by the carrier within the window (or another player's came first): read the tracking
  const revealFrame = next ? next.f : horizon;
  const hold: ProChoice = { kind: "hold", revealFrame, option: null, recipient: null, success: null, source: "tracking", approx: false };
  const a = playerAt(h, frame, carrier.player);
  const b = playerAt(h, Math.min(revealFrame, frame + Math.round(CARRY_LOOK_S * fps)), carrier.player);
  if (!a || !b) return hold;
  const d = normalise([b[0] - a[0], b[1] - a[1]], dir);
  if (Math.hypot(d[0], d[1]) < MIN_CARRY_M) return hold;
  const angle = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  return { ...hold, kind: "carry", option: nearest(opts, "carry", (o) => Math.abs((o.angle ?? 0) - angle)) };
}

export function outcome(m: MatchMeta, half: number, frame: number, team: number): Outcome {
  const end = Math.min(m.halves[half].frames - 1, frame + Math.round(OUTCOME_S * m.fps));
  const shots = m.events.filter((e) => {
    const f = eventFrame(e);
    return e.type === "shot" && e.half === half && e.team === team && f !== null && f >= frame && f <= end;
  });
  if (shots.some((e) => e.goal)) return "goal";
  if (shots.length) return "shot";
  const opp = String(2 - team), need = Math.round(LOST_S * m.fps), owner = m.owner[half];
  for (let f = frame + 1, run = 0; f <= end; f++) {
    run = owner[f] === opp ? run + 1 : 0;
    if (run >= need) return "lost";
  }
  return "kept";
}

export interface Tally { decisions: number; followed: number; viewer: number; coach: number; pro: number; proCounted: number }
export const emptyTally = (): Tally => ({ decisions: 0, followed: 0, viewer: 0, coach: 0, pro: 0, proCounted: 0 });

export function decide(t: Tally, opts: CoachOption[], chosen: CoachOption): Tally {
  return { ...t, decisions: t.decisions + 1, followed: t.followed + (chosen === opts[0] ? 1 : 0),
    viewer: t.viewer + chosen.score, coach: t.coach + opts[0].score };
}

export function reveal(t: Tally, pro: Pick<ProChoice, "option">): Tally {
  return pro.option ? { ...t, pro: t.pro + pro.option.score, proCounted: t.proCounted + 1 } : t;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/coach-decision.test.mjs`
Expected: `9 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/decision.ts tests/coach-decision.test.mjs
git commit -m "Coach replay: the pro's choice (events, else tracking), 15 s outcome, viewer/coach/pros tally

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Labels

**Files:**
- Create: `src/lib/coach/format.ts`
- Test: `tests/coach-format.test.mjs`

- [ ] **Step 1: Write the failing test.** Create `tests/coach-format.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { arrowLabel, direction, optionLabel, outcomeLabel, pct, proLabel, signedXg, textOn } from "../src/lib/coach/format.ts";

const players = [{ team: 0, shirt: 10, name: "D. Ginczek" }, { team: 0, shirt: 8, name: "B" }];
const pass = { kind: "pass", target: 1, to: [0, 0], p: 0.736, value: 0, score: 0.0312 };

describe("labels", () => {
  it("formats numbers", () => {
    expect(pct(0.736)).toBe("74 %");
    expect(signedXg(0.0312)).toBe("+0.031 xG");
    expect(signedXg(-0.0126)).toBe("-0.013 xG");
    expect(signedXg(-0.0004)).toBe("+0.000 xG");
    expect(direction(0)).toBe("straight ahead");
    expect(direction(60)).toBe("60° left");
    expect(direction(-30)).toBe("30° right");
  });
  it("describes each option with its kind, target, chance and value", () => {
    expect(optionLabel(pass, players)).toBe("Pass to #8 B · 74 % arrives · +0.031 xG");
    expect(optionLabel({ kind: "carry", angle: -30, to: [0, 0], p: 0.9, value: 0, score: -0.0004 }, players))
      .toBe("Carry 30° right · 90 % keeps it · +0.000 xG");
    expect(optionLabel({ kind: "shot", to: [52.5, 0], p: 0.094, value: 1, score: 0.05 }, players))
      .toBe("Shoot · 9 % goal chance · +0.050 xG");
    expect(arrowLabel(pass, players)).toBe("#8 74 %");
  });
  it("describes the pro's choice and the outcome", () => {
    expect(proLabel({ kind: "pass", success: true, recipient: 1, option: pass, approx: false }, players))
      .toBe("The pro passed to #8 B (coach value +0.031 xG).");
    expect(proLabel({ kind: "pass", success: false, recipient: 5, option: pass, approx: true }, players))
      .toBe("The pro's pass towards #8 B did not arrive (coach value +0.031 xG), time from the event log (approximate).");
    expect(proLabel({ kind: "hold", option: null, approx: false }, players)).toBe("The pro held the ball.");
    expect(proLabel({ kind: "shot", option: null, approx: false }, players)).toBe("The pro shot (not one of the coach's options).");
    expect(outcomeLabel("lost")).toBe("ball lost");
  });
  it("picks readable shirt-number ink for a team colour", () => {
    expect(textOn("#9F1922")).toBe("#ffffff");
    expect(textOn("#FFFFFF")).toBe("#0d0e10");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/coach-format.test.mjs`
Expected: FAIL with `Failed to resolve import "../src/lib/coach/format.ts"`

- [ ] **Step 3: Implement.** Create `src/lib/coach/format.ts`:

```ts
// Text for the football replay. "Value" is the coach's score: the expected change in net expected goals (xG) from
// choosing that option.
import type { CoachOption } from "./advice";
import type { Outcome, ProChoice } from "./decision";
import type { PlayerInfo } from "./replay";

export const pct = (p: number) => `${Math.round(p * 100)} %`;

export function signedXg(x: number): string {
  const r = Math.round(x * 1000) / 1000;
  return `${r < 0 ? "-" : "+"}${Math.abs(r).toFixed(3)} xG`;
}

/** Carry angle in the normalised frame: > 0 is to the carrier's left (he faces +x). */
export function direction(angle: number): string {
  const a = Math.round(angle);
  return a === 0 ? "straight ahead" : a > 0 ? `${a}° left` : `${-a}° right`;
}

const who = (players: PlayerInfo[], i: number | null | undefined) =>
  i == null || !players[i] ? "a teammate" : `#${players[i].shirt} ${players[i].name}`;

export function optionLabel(o: CoachOption, players: PlayerInfo[]): string {
  const gain = signedXg(o.score);
  if (o.kind === "pass") return `Pass to ${who(players, o.target)} · ${pct(o.p)} arrives · ${gain}`;
  if (o.kind === "carry") return `Carry ${direction(o.angle ?? 0)} · ${pct(o.p)} keeps it · ${gain}`;
  return `Shoot · ${pct(o.p)} goal chance · ${gain}`;
}

/** Short label drawn next to an arrow on the pitch. */
export function arrowLabel(o: CoachOption, players: PlayerInfo[]): string {
  if (o.kind === "pass") return `#${o.target != null && players[o.target] ? players[o.target].shirt : "?"} ${pct(o.p)}`;
  return o.kind === "shot" ? `shot ${pct(o.p)}` : pct(o.p);
}

export function proLabel(pro: Pick<ProChoice, "kind" | "option" | "approx"> & Partial<ProChoice>, players: PlayerInfo[]): string {
  const what =
    pro.kind === "shot" ? "The pro shot"
    : pro.kind === "carry" ? `The pro carried the ball ${direction(pro.option?.angle ?? 0)}`
    : pro.kind === "hold" ? "The pro held the ball"
    : pro.success ? `The pro passed to ${who(players, pro.recipient)}`
    : `The pro's pass ${pro.option ? `towards ${who(players, pro.option.target)} ` : ""}did not arrive`;
  const value = pro.option ? ` (coach value ${signedXg(pro.option.score)})` : pro.kind === "hold" ? "" : " (not one of the coach's options)";
  return `${what}${value}${pro.approx ? ", time from the event log (approximate)" : ""}.`;
}

export const outcomeLabel = (o: Outcome): string => ({ goal: "goal", shot: "a shot", lost: "ball lost", kept: "ball kept" })[o];

/** Dark or light ink for text on a team colour (#rrggbb). */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 140 ? "#0d0e10" : "#ffffff";
}
```

- [ ] **Step 4: Run the test, then the whole Vitest suite (some content tests need a build)**

```bash
npx vitest run tests/coach-format.test.mjs
npm run build
npx vitest run
```
Expected: `4 passed`, then the build succeeds, then every test file passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/format.ts tests/coach-format.test.mjs
git commit -m "Coach replay: option, pro-choice and outcome labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Replay component + page

**Files:**
- Test: `tests/football.spec.mjs`
- Create: `src/components/FootballReplay.astro`, `src/pages/demos/football.astro`

- [ ] **Step 1: Write the failing Playwright spec.** Create `tests/football.spec.mjs`:

```js
// The football replay with the shipped match (public/football, committed): it loads, plays and pauses; on a frame
// where a player has the ball (the first parity frame) it shows the coach's options; "Follow" updates the tally; on
// resume the pro's choice is revealed.
import { test, expect } from "@playwright/test";
import fs from "node:fs";

const FX = "tests/fixtures/coach-parity.json";
const live = fs.existsSync("public/football/models.json") && fs.existsSync(FX);
const fx = live ? JSON.parse(fs.readFileSync(FX, "utf8")) : null;

test.describe("football replay", () => {
  test.skip(!live, "football data or parity fixture not here");
  test.setTimeout(60_000);

  test("loads, plays and pauses", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    const clock = root.locator("[data-clock]");
    await expect(clock).toHaveText("00:00");
    await root.getByRole("button", { name: "4×" }).click();
    await root.getByRole("button", { name: "Play" }).click();
    await expect(clock).not.toHaveText("00:00", { timeout: 5_000 });
    await page.keyboard.press("Space"); // focus is on the Play/Pause button: Space presses it
    await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("pausing on a ball carrier shows the options; Follow updates the tally; resuming reveals the pro", async ({ page }) => {
    const r = fx.frames.find((f) => f.half === 0);
    await page.goto("/demos/football/");
    const root = page.locator("[data-football]");
    await expect(root).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
    await root.locator("[data-time]").fill(String(r.frame));
    await expect(root).toHaveAttribute("data-options", String(r.options.length));
    await expect(root.locator("[data-options] button").first())
      .toContainText({ pass: "Pass to", carry: "Carry", shot: "Shoot" }[r.options[0].kind]);
    await root.getByRole("button", { name: "Follow the coach" }).click();
    await expect(root.locator("[data-tally-decisions]")).toHaveText("1");
    await expect(root.locator("[data-tally-coach]")).toHaveText(await root.locator("[data-tally-viewer]").innerText());
    await root.getByRole("button", { name: "4×" }).click();
    await root.getByRole("button", { name: "Play" }).click();
    await expect(root.locator("[data-reveal]")).toContainText("Outcome within 15 s", { timeout: 10_000 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run build
npx playwright test tests/football.spec.mjs
```
Expected: 2 FAIL. The page returns 404, so the `[data-football]` locator times out.

- [ ] **Step 3: Create the component.** Create `src/components/FootballReplay.astro`:

```astro
---
// Football replay (project 20, phase 2): one full Bundesliga match on a 2D pitch. Pause when a player has the ball and
// the coach (src/lib/coach, a parity-tested port of the library's coach engine) ranks his options; follow or refuse,
// then see what the pro did. Data in /football/ (scripts/football.mjs): match.json and models.json load after the
// page, each half's positions (3.2 / 4.5 MB) when first needed. Choices stay in memory; nothing is sent anywhere.
---
<div class="fr" data-football>
  <canvas class="pitch" data-canvas role="img" aria-label="Football pitch; the match is loading"></canvas>
  <div class="bar">
    <button type="button" class="btn primary ctl" data-play disabled>Play</button>
    <span class="clock mono" data-clock>00:00</span>
    <div class="group" role="group" aria-label="Playback speed">
      <button type="button" class="btn ctl" data-speed="1" aria-pressed="true">1×</button>
      <button type="button" class="btn ctl" data-speed="2" aria-pressed="false">2×</button>
      <button type="button" class="btn ctl" data-speed="4" aria-pressed="false">4×</button>
    </div>
    <div class="group" role="group" aria-label="Half">
      <button type="button" class="btn ctl" data-half="0" aria-pressed="true" disabled>1st half</button>
      <button type="button" class="btn ctl" data-half="1" aria-pressed="false" disabled>2nd half</button>
    </div>
  </div>
  <div class="timeline">
    <div class="marks" data-marks aria-hidden="true"></div>
    <label class="sr-only" for="fr-time">Match time</label>
    <input id="fr-time" type="range" min="0" max="0" step="1" value="0" data-time disabled />
  </div>
  <label class="jump mono">Jump to
    <select data-jump disabled><option value="">a goal or a shot…</option></select>
  </label>
  <p class="status mono" data-status role="status" aria-live="polite">Loading the match…</p>
  <section class="coach" data-coach hidden aria-labelledby="fr-coach">
    <h2 class="small" id="fr-coach">The coach's options <span data-coach-who></span></h2>
    <ol class="opts" data-options></ol>
    <div class="actions">
      <button type="button" class="btn primary ctl" data-follow>Follow the coach</button>
      <span class="hint mono">or pick another option (keys 1–9) to refuse</span>
    </div>
  </section>
  <p class="reveal" data-reveal role="status" aria-live="polite" hidden></p>
  <table class="tally">
    <caption class="sr-only">Running tally: the coach's expected value of the options chosen</caption>
    <thead><tr><th scope="col">Tally</th><th scope="col">Choices</th><th scope="col">Expected value</th></tr></thead>
    <tbody>
      <tr><th scope="row">You</th><td data-tally-decisions>0</td><td data-tally-viewer>+0.000 xG</td></tr>
      <tr><th scope="row">Coach</th><td data-tally-coach-n>0</td><td data-tally-coach>+0.000 xG</td></tr>
      <tr><th scope="row">Pros</th><td data-tally-pro-n>0</td><td data-tally-pro>+0.000 xG</td></tr>
    </tbody>
  </table>
  <p class="keys mono">You followed the coach <span data-tally-followed>0 of 0</span> times · Keys: Space play / pause · ← → 5 s · F follow · 1–9 pick</p>
</div>
<script>
  import { options as rankOptions, type Coach, type CoachOption } from "../lib/coach/advice";
  import { decide, emptyTally, outcome, proChoice, reveal, type Outcome, type ProChoice, type Tally } from "../lib/coach/decision";
  import { arrowLabel, optionLabel, outcomeLabel, proLabel, signedXg, textOn } from "../lib/coach/format";
  import { HALF_LENGTH, HALF_WIDTH, normalise, type Vec } from "../lib/coach/geometry";
  import { coachFromModels, type ModelsJson } from "../lib/coach/models";
  import { carrierAt, clock, decodeHalf, frameDots, markers, playerAt, stateAt, trail, type Carrier, type HalfData, type MatchMeta } from "../lib/coach/replay";

  const BASE = "/football/";
  const MARGIN = 3; // metres drawn around the pitch (the goals stick out 2 m)
  const same = (a: CoachOption, b: CoachOption) => a.kind === b.kind && a.target === b.target && a.angle === b.angle;

  function mount(root: HTMLElement) {
    const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
    const canvas = $<HTMLCanvasElement>("[data-canvas]"), ctx = canvas.getContext("2d")!;
    const playBtn = $<HTMLButtonElement>("[data-play]"), followBtn = $<HTMLButtonElement>("[data-follow]");
    const time = $<HTMLInputElement>("[data-time]"), jump = $<HTMLSelectElement>("[data-jump]");
    const status = $("[data-status]"), coachBox = $("[data-coach]"), list = $("[data-options]"), revealBox = $("[data-reveal]");
    const halfBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-half]")];
    const css = getComputedStyle(document.documentElement);
    const SIGNAL = css.getPropertyValue("--signal").trim() || "#ff5b1f";
    const OK = css.getPropertyValue("--ok").trim() || "#7fd18b";
    const MONO = css.getPropertyValue("--font-mono").trim() || "monospace";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let meta = null as unknown as MatchMeta;
    let coach = null as unknown as Coach;
    let ready = false, half = 0, t = 0, playing = false, speed = 1, last = 0, dpr = 1;
    const halves: (HalfData | undefined)[] = [];
    const loads: (Promise<HalfData> | undefined)[] = [];
    let advice: { half: number; frame: number; carrier: Carrier; opts: CoachOption[] } | null = null;
    let chosen: { half: number; frame: number; option: CoachOption } | null = null;
    let pending: { half: number; pro: ProChoice; result: Outcome } | null = null;
    let tally: Tally = emptyTally();

    const say = (text: string) => { status.textContent = text; };
    const failed = (err: unknown) => { say("Could not load the match data. Please reload the page."); console.warn(err); };
    const frameNow = () => Math.floor(t);

    function getHalf(i: number): Promise<HalfData> {
      if (halves[i]) return Promise.resolve(halves[i]!);
      return (loads[i] ??= fetch(`${BASE}h${i}.bin`)
        .then((r) => { if (!r.ok) throw new Error(`h${i}.bin: HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((buf) => (halves[i] = decodeHalf(buf, meta.halves[i], meta.players.length)))
        .catch((e) => { loads[i] = undefined; throw e; }));
    }

    // ---------- drawing ----------
    const scale = () => canvas.width / (2 * HALF_LENGTH + 2 * MARGIN);
    const px = (p: Vec): Vec => { const k = scale(); return [(p[0] + HALF_LENGTH + MARGIN) * k, (HALF_WIDTH + MARGIN - p[1]) * k]; };
    const circle = (p: Vec, r: number) => { const [x, y] = px(p); ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); };
    function box(a: Vec, b: Vec) {
      const [x0, y0] = px(a), [x1, y1] = px(b);
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, canvas.clientWidth);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round((w * dpr * (2 * HALF_WIDTH + 2 * MARGIN)) / (2 * HALF_LENGTH + 2 * MARGIN));
      draw();
    }

    function drawPitch(k: number) {
      const line = "rgba(236, 235, 230, 0.55)";
      ctx.fillStyle = "#183224"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = line; ctx.lineWidth = Math.max(dpr, 0.12 * k);
      box([-HALF_LENGTH, -HALF_WIDTH], [HALF_LENGTH, HALF_WIDTH]);
      const [mx, top] = px([0, HALF_WIDTH]), [, bottom] = px([0, -HALF_WIDTH]);
      ctx.beginPath(); ctx.moveTo(mx, top); ctx.lineTo(mx, bottom); ctx.stroke();
      circle([0, 0], 9.15 * k); ctx.stroke();
      for (const s of [-1, 1]) {
        box([s * HALF_LENGTH, -20.16], [s * (HALF_LENGTH - 16.5), 20.16]);
        box([s * HALF_LENGTH, -9.16], [s * (HALF_LENGTH - 5.5), 9.16]);
        box([s * HALF_LENGTH, -3.66], [s * (HALF_LENGTH + 2), 3.66]);
        circle([s * (HALF_LENGTH - 11), 0], Math.max(1.5 * dpr, 0.2 * k)); ctx.fillStyle = line; ctx.fill();
      }
    }

    function arrow(from: Vec, to: Vec, colour: string, label: string, k: number) {
      const [x0, y0] = px(from), [x1, y1] = px(to);
      const a = Math.atan2(y1 - y0, x1 - x0), head = Math.max(9 * dpr, 1.3 * k);
      ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = Math.max(2 * dpr, 0.3 * k);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - 0.7 * head * Math.cos(a), y1 - 0.7 * head * Math.sin(a)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45));
      ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45));
      ctx.closePath(); ctx.fill();
      const size = Math.round(Math.max(11 * dpr, 1.25 * k));
      ctx.font = `500 ${size}px ${MONO}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const w = ctx.measureText(label).width + 10, hgt = size + 8;
      const lx = Math.min(canvas.width - w - 2, Math.max(2, x1 + 8)), ly = Math.min(canvas.height - hgt - 2, Math.max(2, y1 - hgt - 6));
      ctx.fillStyle = "rgba(13, 14, 16, 0.85)"; ctx.fillRect(lx, ly, w, hgt);
      ctx.fillStyle = colour; ctx.fillText(label, lx + 5, ly + hgt / 2);
    }

    function draw() {
      const k = scale();
      drawPitch(k);
      const h = halves[half];
      if (!ready || !h) return;
      if (!reduced) {
        const tr = trail(h, t, meta.fps);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"; ctx.lineWidth = Math.max(dpr, 0.2 * k);
        ctx.beginPath();
        tr.forEach((p, i) => { const [x, y] = px(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      }
      const shown = !playing && advice && advice.half === half && advice.frame === frameNow() ? advice : null;
      if (shown) {
        const from = playerAt(h, shown.frame, shown.carrier.player), dir = meta.halves[half].attack[shown.carrier.team];
        const pick = chosen && chosen.half === half && chosen.frame === shown.frame ? shown.opts.find((o) => same(o, chosen!.option)) ?? null : null;
        const drawn = shown.opts.slice(0, 3);
        if (pick && !drawn.includes(pick)) drawn.push(pick);
        if (from) for (const o of [...drawn].reverse())
          arrow(from, normalise(o.to, dir), o === pick ? OK : o === shown.opts[0] ? SIGNAL : "rgba(236, 235, 230, 0.85)", arrowLabel(o, meta.players), k);
      }
      const { players, ball } = frameDots(h, t);
      const r = Math.max(7 * dpr, 1.1 * k);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `600 ${Math.round(r * 1.05)}px ${MONO}`;
      for (const d of players) {
        const info = meta.players[d.player];
        const fill = info.team === 0 || info.team === 1 ? meta.meta.colors[info.team] : "#777777", ink = textOn(fill);
        circle(d.at, r); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = ink; ctx.stroke();
        if (shown && d.player === shown.carrier.player) { circle(d.at, r + 4 * dpr); ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = SIGNAL; ctx.stroke(); }
        const [x, y] = px(d.at); ctx.fillStyle = ink; ctx.fillText(String(info.shirt), x, y + 0.5);
      }
      if (ball) { circle(ball, Math.max(4 * dpr, 0.55 * k)); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = "#0d0e10"; ctx.stroke(); }
    }

    // ---------- coach ----------
    function showClock() {
      const c = clock(half, frameNow(), meta.fps);
      $("[data-clock]").textContent = c;
      time.setAttribute("aria-valuetext", `${c}, ${half ? "second" : "first"} half`);
    }

    function describe(c: Carrier | null) {
      const when = `${clock(half, frameNow(), meta.fps)}, ${half ? "second" : "first"} half`, p = c && meta.players[c.player];
      canvas.setAttribute("aria-label", p
        ? `Pitch at ${when}: #${p.shirt} ${p.name} (${c!.team ? meta.meta.guest : meta.meta.home}) has the ball.`
        : `Pitch at ${when}: no player has the ball.`);
    }

    function updateCoach() {
      const h = halves[half]!, f = frameNow();
      list.replaceChildren();
      advice = null;
      const c = carrierAt(meta, half, h, f);
      describe(c);
      if (!c) {
        coachBox.hidden = true; root.dataset.options = "0";
        say("Paused. Nobody has the ball at this moment: step on a little (→) and the coach will look again.");
        draw(); return;
      }
      const s = stateAt(meta, half, h, f, c.team);
      const opts = rankOptions(s, s.attIdx.indexOf(c.player), coach);
      advice = { half, frame: f, carrier: c, opts };
      const done = !!chosen && chosen.half === half && chosen.frame === f;
      opts.forEach((o, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "opt"; b.textContent = optionLabel(o, meta.players); b.disabled = done;
        b.classList.toggle("best", i === 0);
        b.classList.toggle("chosen", done && same(o, chosen!.option));
        b.addEventListener("click", () => choose(i));
        const li = document.createElement("li"); li.append(b); list.append(li);
      });
      const p = meta.players[c.player];
      $("[data-coach-who]").textContent = `for #${p.shirt} ${p.name}`;
      followBtn.disabled = done; coachBox.hidden = false; root.dataset.options = String(opts.length);
      say(done ? "You already chose here. Press Play to see what the pro did."
        : `Paused. #${p.shirt} ${p.name} has the ball: ${opts.length} options, best first. Follow the coach or pick another (1–9).`);
      draw();
    }

    function renderTally() {
      const set = (key: string, v: string) => { $(`[data-tally-${key}]`).textContent = v; };
      set("decisions", String(tally.decisions)); set("viewer", signedXg(tally.viewer));
      set("coach-n", String(tally.decisions)); set("coach", signedXg(tally.coach));
      set("pro-n", String(tally.proCounted)); set("pro", signedXg(tally.pro));
      set("followed", `${tally.followed} of ${tally.decisions}`);
    }

    function doReveal() {
      if (!pending) return;
      const p = pending;
      pending = null;
      tally = reveal(tally, p.pro);
      revealBox.textContent = `${proLabel(p.pro, meta.players)} Outcome within 15 s: ${outcomeLabel(p.result)}.`;
      revealBox.hidden = false;
      renderTally();
    }

    function choose(i: number) {
      if (playing || !advice) return;
      const { opts, carrier, frame } = advice, option = opts[i];
      if (!option || (chosen && chosen.half === half && chosen.frame === frame)) return;
      doReveal(); // an earlier choice that was never revealed
      tally = decide(tally, opts, option);
      chosen = { half, frame, option };
      pending = { half, pro: proChoice(meta, half, halves[half]!, frame, carrier, opts), result: outcome(meta, half, frame, carrier.team) };
      revealBox.hidden = true;
      renderTally(); updateCoach();
      say(`${i === 0 ? "You followed the coach" : "You refused the coach"}: ${optionLabel(option, meta.players)}. Press Play to see what the pro did.`);
    }

    // ---------- playback ----------
    function seek(frame: number) {
      doReveal(); // moving away from a choice reveals it at once
      t = Math.max(0, Math.min(meta.halves[half].frames - 1, Math.round(frame)));
      time.value = String(t); showClock();
      if (!playing) updateCoach(); else draw();
    }

    function tick(now: number) {
      if (!playing) return;
      const end = meta.halves[half].frames - 1;
      t += (Math.min(100, now - last) / 1000) * meta.fps * speed;
      last = now;
      if (half === 0 && t > end - 60 * meta.fps) getHalf(1).catch(() => {}); // prefetch the second half
      if (pending && pending.half === half && t >= pending.pro.revealFrame) doReveal();
      if (t >= end) {
        t = end; pause();
        if (half === 1) say("Full time.");
        else { say("Half time."); if (!reduced) setHalf(1, 0).then(play).catch(failed); }
        return;
      }
      time.value = String(frameNow()); showClock(); draw();
      requestAnimationFrame(tick);
    }

    function play() {
      if (playing || !ready || frameNow() >= meta.halves[half].frames - 1) return;
      playing = true; playBtn.textContent = "Pause"; coachBox.hidden = true; advice = null; root.dataset.options = "0"; say("");
      last = performance.now(); requestAnimationFrame(tick);
    }

    function pause() {
      if (!playing) return;
      playing = false; playBtn.textContent = "Play";
      t = frameNow(); time.value = String(t); showClock(); updateCoach();
    }

    const toggle = () => (playing ? pause() : play());

    async function setHalf(i: number, frame: number) {
      pause();
      if (!halves[i]) { say(`Loading the ${i ? "second" : "first"} half…`); playBtn.disabled = true; }
      await getHalf(i);
      playBtn.disabled = false;
      half = i; time.max = String(meta.halves[i].frames - 1);
      halfBtns.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.half) === i)));
      const marks = $("[data-marks]"), n = meta.halves[i].frames - 1;
      marks.replaceChildren(...markers(meta).filter((m) => m.half === i).map((m) => {
        const s = document.createElement("span");
        s.className = `mark ${m.kind}`; s.style.left = `${(100 * m.frame) / n}%`;
        return s;
      }));
      seek(frame);
    }

    async function init() {
      const get = (f: string) => fetch(BASE + f).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
      const [m, w] = await Promise.all([get("match.json"), get("models.json")]);
      meta = m as MatchMeta; coach = coachFromModels(w as ModelsJson);
      say("Loading the first half…");
      await getHalf(0);
      ready = true;
      for (const mk of markers(meta)) jump.add(new Option(mk.label, `${mk.half}:${mk.frame}`));
      playBtn.disabled = false; time.disabled = false; jump.disabled = false;
      halfBtns.forEach((b) => (b.disabled = false));
      await setHalf(0, 0);
      root.dataset.ready = "true";
      say(`Ready: ${meta.meta.home} vs ${meta.meta.guest}. Press Play (or Space) and pause whenever a player has the ball.`);
    }

    // ---------- wiring ----------
    playBtn.addEventListener("click", toggle);
    followBtn.addEventListener("click", () => choose(0));
    time.addEventListener("input", () => seek(Number(time.value)));
    jump.addEventListener("change", () => {
      if (!jump.value) return;
      const [hh, f] = jump.value.split(":").map(Number);
      jump.value = "";
      setHalf(hh, Math.max(0, f - Math.round(5 * meta.fps))).catch(failed); // 5 s before the shot
    });
    root.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((b) => b.addEventListener("click", () => {
      speed = Number(b.dataset.speed);
      root.querySelectorAll("[data-speed]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
    halfBtns.forEach((b) => b.addEventListener("click", () => { if (ready) setHalf(Number(b.dataset.half), 0).catch(failed); }));
    window.addEventListener("keydown", (e) => {
      if (!ready || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return; // the control handles its own keys
      if (e.key === " " && tag !== "BUTTON") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); seek(frameNow() + (e.key === "ArrowLeft" ? -1 : 1) * Math.round(5 * meta.fps)); }
      else if (e.key === "f" || e.key === "F") choose(0);
      else if (/^[1-9]$/.test(e.key)) choose(Number(e.key) - 1);
    });
    new ResizeObserver(resize).observe(canvas);
    const start = () => init().catch(failed);
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
  }

  const el = document.querySelector<HTMLElement>("[data-football]");
  if (el) mount(el);
</script>
<style>
  .fr { display: grid; gap: 14px; }
  .pitch { display: block; width: 100%; height: auto; aspect-ratio: 111 / 74; background: #183224; border: 1px solid var(--line); border-radius: var(--radius); }
  .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .group { display: inline-flex; gap: 6px; }
  .ctl { min-height: 44px; min-width: 44px; justify-content: center; }
  .ctl[aria-pressed="true"] { background: var(--signal); color: #0d0e10; }
  .ctl:disabled { opacity: 0.5; cursor: not-allowed; }
  .clock { font-size: 18px; min-width: 64px; }
  .timeline { position: relative; padding-top: 12px; }
  .timeline input { width: 100%; min-height: 44px; margin: 0; accent-color: var(--signal); }
  .marks { position: absolute; left: 0; right: 0; top: 0; height: 12px; pointer-events: none; }
  .marks :global(.mark) { position: absolute; top: 2px; width: 3px; height: 10px; margin-left: -1px; background: var(--ink-3); }
  .marks :global(.mark.goal) { top: 0; width: 5px; height: 12px; margin-left: -2px; background: var(--signal); }
  .jump { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; color: var(--ink-2); }
  .jump select { min-height: 44px; max-width: 100%; padding: 0 10px; font: inherit; color: var(--ink); background: var(--bg-2); border: 1px solid var(--line-2); border-radius: var(--radius); }
  .status, .keys { margin: 0; font-size: 13px; color: var(--ink-2); }
  .small { font: 500 15px var(--sans); margin: 0 0 8px; }
  .opts { margin: 0; padding-left: 26px; display: grid; gap: 6px; color: var(--ink-3); }
  .opts :global(.opt) { width: 100%; min-height: 44px; padding: 8px 12px; text-align: left; font: 14px var(--sans); color: var(--ink);
    background: var(--bg-2); border: 1px solid var(--line-2); border-radius: var(--radius); cursor: pointer; }
  .opts :global(.opt.best) { border-color: var(--signal); }
  .opts :global(.opt.chosen) { border-color: var(--ok); }
  .opts :global(.opt:hover:not(:disabled)) { border-color: var(--signal); }
  .opts :global(.opt:disabled) { cursor: default; color: var(--ink-2); }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 10px; }
  .hint { font-size: 12px; color: var(--ink-3); }
  .reveal { margin: 0; padding: 12px 14px; color: var(--ink-2); border: 1px solid var(--line); border-radius: var(--radius); }
  .tally { width: 100%; max-width: 480px; border-collapse: collapse; font-size: 14px; }
  .tally th, .tally td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--line); }
</style>
```

- [ ] **Step 4: Create the page.** Create `src/pages/demos/football.astro`:

```astro
---
import fs from "node:fs";
import Base from "../../layouts/Base.astro";
import FootballReplay from "../../components/FootballReplay.astro";
import { FOOTBALL_LIVE } from "../../data/flags";
import { CARRIER_M, type MatchMeta } from "../../lib/coach/replay";
import type { ModelsJson } from "../../lib/coach/models";

const match = FOOTBALL_LIVE ? (JSON.parse(fs.readFileSync("public/football/match.json", "utf8")) as MatchMeta) : null;
const models = FOOTBALL_LIVE ? (JSON.parse(fs.readFileSync("public/football/models.json", "utf8")) as ModelsJson) : null;
const ext = { target: "_blank", rel: "noopener" };
---
<Base title="Football AI coach" description="Replay a full Bundesliga match on a 2D pitch, pause at any moment and see what an AI coach would do with the ball, then what the pro did.">
  <div class="wrap section">
    <a class="back mono" href="/demos/">← All demos</a>
    <div class="section-head"><span class="eyebrow">Live demo · project 20</span><h1 class="display">Pause the match. Ask the coach.</h1>
      <p class="lede">{match ? `${match.meta.home} vs ${match.meta.guest}, 2. Bundesliga 2022/23` : "A full Bundesliga match"},
        replayed from optical tracking of every player and the ball. Pause when a player has the ball: the coach ranks his
        passes, carries and shot in expected goals. Follow it or refuse it, then watch what the professional did.</p></div>
    {match && models ? (
      <>
        <div class="panel box"><FootballReplay /></div>
        <h2 class="small">How to read it</h2>
        <ul class="notes">
          <li><b>Arrows</b>: the coach's top three options, the best in orange. The % is the chance that the pass arrives
            (pass model), that the team still has the ball after a 6 m carry (pitch control), or that a shot scores.</li>
          <li><b>Value</b>: the expected change in net expected goals (xG) over the next {models.value.horizon_s ?? 15} s if the
            option is chosen, counting the cost of losing the ball where it would be lost.</li>
          <li><b>Tally</b>: the sum of the coach's value for the options you, the coach and the pros chose. It is the coach's
            opinion of every choice, not a result.</li>
        </ul>
        <h2 class="small">Honest limits</h2>
        <ul class="notes">
          <li>The models were trained on the {models.trained_on.length} other matches of the dataset; this match
            ({models.trained_without}) was never seen in training.</li>
          <li>The pass model is solid (held-out AUC 0.77–0.84). The value model is weak: it explains about 2 % of what happens
            in the next 15 s, barely more than "closer to goal is better", so differences of a few thousandths of a goal mean little.</li>
          <li>The coach plays bolder than the pros: passes it ranks first were completed 69 % of the time, against 85 % for
            its 7th choice and below, and it has the pro's receiver in its top 3 about as often as chance (37 % vs 30 %). It
            gives a value opinion, not a prediction of what a player will do.</li>
          <li>The shot option uses our own small shot model (160 shots, AUC 0.63; the data provider's xG reaches 0.82).</li>
          <li>The ball carrier is the nearest player of the team in possession within {CARRIER_M} m of the ball (ball height
            is not used); speeds come from positions 0.16 s apart, as in training. "What the pro did" comes from the official
            events when they could be synchronised with the tracking (about two thirds of the passes), otherwise from the tracking.</li>
          <li>Everything runs in your browser; your choices stay in memory and are gone when you leave. A 3D view (stadium,
            a player's eyes) is the next phase.</li>
        </ul>
        <p><a class="case" href="/projects/football-analytics/">How the coach was built and evaluated →</a></p>
        <h2 class="small">Data credit</h2>
        <p class="credit">{match.credit}. Bassek et al. (2025), <i>Scientific Data</i>:
          <a href="https://doi.org/10.1038/s41597-025-04505-y" {...ext}>paper</a>,
          <a href="https://doi.org/10.6084/m9.figshare.28196177" {...ext}>data</a>;
          licence <a href="https://creativecommons.org/licenses/by/4.0/" {...ext}>CC BY 4.0</a>. Changes: positions
          subsampled from 25 to 12.5 frames per second and rounded to the centimetre; events synchronised to the tracking.</p>
      </>
    ) : (
      <p class="panel box soon">Coming soon: the replay match and the coach's model weights are being exported from the project 20 study.</p>
    )}
  </div>
</Base>
<style>
  .back { font-size: 13px; color: var(--ink-3); text-decoration: none; } .back:hover { color: var(--signal); }
  .box { padding: clamp(12px, 3vw, 22px); margin-top: 24px; }
  .soon { color: var(--ink-2); }
  .small { font: 500 15px var(--sans); margin: 28px 0 8px; }
  .notes { max-width: 760px; padding-left: 18px; font-size: 15px; color: var(--ink-2); }
  .notes li { margin-bottom: 6px; }
  .credit { max-width: 760px; font-size: 13px; color: var(--ink-3); }
  .credit a, .case { color: var(--ink); text-decoration-color: var(--signal); }
</style>
```

- [ ] **Step 5: Build and run the spec**

```bash
npm run build
npx playwright test tests/football.spec.mjs
```
Expected: `2 passed`. Then check by eye with `npm run preview` and open http://localhost:4321/demos/football/:
- the pitch draws, Play animates, and pausing shows arrows and the list;
- keys 1–9 and F work;
- Space toggles playback from the page body;
- the half switch loads the second half;
- in a 375 px wide window, nothing overflows horizontally and every button is at least 44 px tall.

- [ ] **Step 6: Commit**

```bash
git add src/components/FootballReplay.astro src/pages/demos/football.astro tests/football.spec.mjs
git commit -m "Football replay page: 2D pitch, playback, coach options, follow / refuse, reveal, tally

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Demo card, project link, OG card, credits, Lighthouse URL

**Files:**
- Modify: `src/pages/demos.astro`, `src/content/projects/football-analytics.md`, `legacy/data/projects.js:229-232`, `src/lib/og.ts`, `src/pages/credits.astro`, `lighthouserc.json`, `tests/smoke.spec.mjs`, `tests/football.spec.mjs`

- [ ] **Step 1: Add the failing test for the card link.** In `tests/football.spec.mjs`, inside `test.describe("football replay", ...)` after `test.setTimeout(60_000);`, add:

```js
  test("the demos page links to the replay", async ({ page }) => {
    await page.goto("/demos/");
    await page.getByRole("link", { name: "▶ Watch and coach" }).click();
    await expect(page).toHaveURL(/\/demos\/football\/$/);
    await expect(page.locator("h1")).toHaveText("Pause the match. Ask the coach.");
  });
```

In `tests/smoke.spec.mjs`, add `"/demos/football/"` to `pages` after `"/demos/"`.

- [ ] **Step 2: Run them to verify the card test fails**

Run: `npm run build; npx playwright test tests/football.spec.mjs tests/smoke.spec.mjs`
Expected: `the demos page links to the replay` FAILS because the link is not found. The new smoke page passes, since the page exists.

- [ ] **Step 3: Implement the card.** In `src/pages/demos.astro`:
  1. Change the flags import to `import { DEPTH_GAME_LIVE, FOOTBALL_LIVE, HARDHAT_LIVE, PAINTER_LIVE } from "../data/flags";`.
  2. Append this entry to the `demos` array, after the depth-game entry:

```js
  { title: "Football AI coach", where: FOOTBALL_LIVE ? "Runs in your browser" : "Will run in your browser", status: FOOTBALL_LIVE ? "live" : "soon", football: true,
    text: "Replay a full Bundesliga match on a 2D pitch and pause at any moment: an AI coach ranks the ball carrier's passes, carries and shot in expected goals. Follow it or refuse it, then see what the pro did.", project: "/projects/football-analytics/" },
```

  3. Replace the `links` paragraph with:

```astro
            <p class="links">{d.game && DEPTH_GAME_LIVE && <a class="play-link" href="/demos/depth-challenge/">▶ Play</a>}{d.football && FOOTBALL_LIVE && <a class="play-link" href="/demos/football/">▶ Watch and coach</a>}<a href={d.project}>Case study →</a></p>
```

- [ ] **Step 4: Project link, OG card, credits, Lighthouse URL**

In `src/content/projects/football-analytics.md` frontmatter, replace the `links:` block with:

```yaml
links:
  code: https://github.com/yandouziyassine/COMPUTER-VISION-PROJECT-LIBRARY/tree/main/20-football-analytics
  demo: /demos/football/
```

In `legacy/data/projects.js`, change project 20's `links` line to:

```js
    links: [{ label: "Code", href: cv("20-football-analytics") }, { label: "Live demo", href: "/demos/football/" }] },
```

In `src/lib/og.ts`, replace the `demos` card and add a `demos/football` card right after it:

```ts
    { slug: "demos", eyebrow: "Live demos", title: "Computer vision running in your browser",
      sub: "Virtual painter · Hard-hat safety check · Can you beat the AI? · Football AI coach", image: "/images/cv-01.svg" },
    { slug: "demos/football", eyebrow: "Live demo · project 20", title: "Pause a Bundesliga match. Ask the AI coach.",
      sub: "Pass success and value in expected goals · follow or refuse · then see what the pro did" },
```

In `src/pages/credits.astro`, add this item to the list under "Data used in charts", before "Other charts show…":

```astro
      <li>Football replay (project 20): Bundesliga tracking and event data, Bassek et al. (2025), DFL / Sportec Solutions, <a href="https://doi.org/10.6084/m9.figshare.28196177" target="_blank" rel="noopener">IDSSE dataset</a>, CC BY 4.0 (subsampled to 12.5 fps, rounded to the centimetre, events synchronised to the tracking).</li>
```

In `lighthouserc.json`, add `"http://localhost/demos/football/",` after `"http://localhost/demos/depth-challenge/",`.

- [ ] **Step 5: Build and run everything that touches these files**

```bash
npm run build
npx vitest run
npx playwright test tests/football.spec.mjs tests/smoke.spec.mjs tests/depth-game.spec.mjs
npm run test:links
```
Expected:
- the build passes and `OG cards: N written` includes `demos/football`;
- all Vitest files pass, including the content test "every built page has an Open Graph card" and the privacy test over `dist/football/*.json`;
- all Playwright tests pass; the depth game's "▶ Play" link is still unique;
- linkinator reports no broken links.

- [ ] **Step 6: Commit**

```bash
git add src/pages/demos.astro src/content/projects/football-analytics.md legacy/data/projects.js src/lib/og.ts src/pages/credits.astro lighthouserc.json tests/smoke.spec.mjs tests/football.spec.mjs
git commit -m "Football replay: demo card, project 20 live-demo link, OG card, credit, Lighthouse and smoke URLs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Accessibility + performance check, docs

**Files:**
- Modify: `README.md` (site); vault notes (no git)

- [ ] **Step 1: Lighthouse on the new page (accessibility must be 1.0, as on every page today)**

```bash
npm run build
node scripts/lighthouse-all.mjs .lighthouseci demos/football
```
Expected: `/demos/football/ perf ≥0.9 a11y 1 LCP …`, with nothing listed after LCP (the list shows failing a11y audits). Fixes for the likely findings:
- `heading-order`: the component heading must stay `h2`.
- `color-contrast`: use `--ink-2`/`--ink-3` on `--panel` only.
- `target-size`: every control keeps `.ctl` or `.opt`.

If performance falls below 0.9, the cause is the post-load data fetch. Start `init()` on the first `pointerenter`/`focusin` of `[data-football]` instead of on `load`:
1. Replace the last two lines of `mount` with `root.addEventListener("pointerenter", start, { once: true }); root.addEventListener("focusin", start, { once: true });`, and make `start` idempotent: `let started = false; const start = () => { if (!started) { started = true; init().catch(failed); } };`.
2. In both Playwright tests, add `await root.hover();` before waiting for `data-ready`.
3. Rebuild and re-run.

- [ ] **Step 2: Lighthouse CI as in CI**

Run: `npm run test:lhci`
Expected: every URL is at or above 0.9 for performance and accessibility (the assertions pass).

- [ ] **Step 3: Update the site README.**
  1. In "Pages", add the row `| /demos/football/ | src/pages/demos/football.astro + src/components/FootballReplay.astro: the project 20 replay and coach (data in public/football/, npm run sync:football) |`.
  2. In "Demos", add the bullet `- **Football AI coach** (src/components/FootballReplay.astro, src/lib/coach/): one IDSSE Bundesliga match (CC BY 4.0, committed in public/football/, refreshed with npm run sync:football from ../cv-data/football-coach/site-export or FOOTBALL_EXPORT); the coach engine is a TypeScript port of the library's coach/ (pitch control, features, logistic / ridge from models.json, advice), checked against Python on 30 real frames (tests/coach-parity.test.mjs, fixture from coach/parity_fixtures.py).`
  3. In "Test", change the Vitest comment to `# Vitest: content, privacy, hard-hat decode, coach port + Python parity` and the smoke comment to mention `football replay`.

- [ ] **Step 4: Library PROGRESS + Obsidian vault.** Add one line to the library's `PROGRESS.md`: `2026-11-02: coach phase 2 on the site (branch v2): /demos/football/ replay with the TypeScript coach (parity 1e-6 on 30 frames), follow / refuse, tally.` In `C:\Users\yando\Documents\SuperVault\Projets\CV-Project-Library\`, following the vault's `AGENTS.md` (notes in French), add a dated entry to `cvlib-02-journal-de-construction.md` (what was built, the parity check, the data-size decision) and update the project 20 status in `cvlib-01-feuille-de-route.md`. No git in the vault.

- [ ] **Step 5: Full local suite, then commit**

```bash
npm run build
npm test
npm run test:links
npm run test:smoke
git add README.md
git commit -m "README: football replay page, data sync, coach port tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
cd /c/Users/yando/Code/COMPUTER-VISION-PROJECT-LIBRARY
git add PROGRESS.md
git commit -m "PROGRESS: coach phase 2 replay on the site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```
Expected: everything green. The hard-hat parity spec skips unless its samples exist locally.

### Task 16: Push `v2`, CI, deploy (owner's go)

- [ ] **Step 1: Push the branch**

```bash
cd /c/Users/yando/Code/yandouziyassine.github.io
git push origin v2
```

- [ ] **Step 2: Watch CI**

Run: `gh run list --branch v2 --limit 1`, then `gh run watch <id> --exit-status`.
Expected: the `ci` workflow passes every step: build, vitest, links, Playwright (including `tests/football.spec.mjs`, which runs in CI because the data and the fixture are committed) and Lighthouse CI. If it fails, use superpowers:systematic-debugging, fix it on `v2`, push again, and watch again.

- [ ] **Step 3: Deploy only after the owner says go.** Merging to `main` publishes the site through `pages.yml`:

```bash
git switch main
git pull --ff-only
git merge --ff-only v2
git push origin main
gh run list --branch main --limit 1
git switch v2
```
Expected: the `pages` run succeeds. Then https://yandouziyassine.github.io/demos/football/ loads, the project 20 card shows "Live demo", and the demos page shows the new card.

---

## Spec coverage (self-review)

| Requirement | Task |
|---|---|
| Per-half export, slot list per half, int16 cm 12.5 fps, half 2 loaded when needed | 1, 4, 13 (`getHalf`, prefetch 60 s before half time) |
| Data committed in `public/football/`, `npm run sync:football`, `FOOTBALL_EXPORT`, `FOOTBALL_LIVE`, "coming soon" when absent | 5, 13 (page fallback) |
| TS port: geometry, pitch control, features (incl. value basis), models (logit + identity), advice + constants from models.json | 6, 7, 8 |
| Replay decoding, interpolation, ball carrier, causal velocity (2 frames at 12.5 fps) | 10 |
| Parity: `coach/parity_fixtures.py`, ~30 real J03WOH frames, `< 1e-6`, identical option order | 3, 4, 9, 10 (shipped files rebuild the same states) |
| Canvas pitch 105×68, team colours, shirt numbers, ball, 1 s trail | 13 |
| Play/pause (Space), speed 1×/2×/4×, scrubber with goal/shot markers, half switch | 13 |
| Pause with carrier: top-3 arrows, list of all options (kind, target shirt, p %, value in xG) | 12, 13 |
| Follow / Refuse (click or keys) | 13 |
| Reveal after the next pass event or 10 s: pro's choice (events or tracking), outcome kept/lost/shot/goal in 15 s | 11, 13 |
| Tally viewer vs coach vs pros, in memory | 11, 13 |
| Honest notes (6 other matches, weak value model, coach bolder than pros) + credit line | 13 |
| Mobile (canvas scales, ≥ 44 px), keyboard, labels, reduced motion, Lighthouse a11y 1.0 | 13, 15 |
| 3D: no disabled button; mentioned as next phase | 13 (notes) |
| Demo card, project 20 "Live demo" link, OG card, lighthouserc URL, Playwright spec skipping without data | 13, 14 |
| Deploy flow: branch v2, CI green, merge to main deploys | 16 |
