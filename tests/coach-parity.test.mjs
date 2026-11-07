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

import { PHRASES, explainOptions } from "../src/lib/coach/explain.ts";
import { FAN_DEG, HORIZON_S, MAX_GHOSTS, MIN_SPEED, REACH, DEF_MIN_GAIN, RUN_MIN_GAIN, SPEED, ghostDefence, ghostRuns } from "../src/lib/coach/ghosts.ts";
import { valueAt } from "../src/lib/coach/advice.ts";

describe.skipIf(!fx?.explain)("explanations: same contributions and phrases as Python", () => {
  const coach = fx ? coachFromModels(fx.models) : null;
  it("the phrase table and ghost constants are the library's", () => {
    expect(PHRASES).toEqual(fx.explain.phrases);
    const p = fx.ghost_params;
    expect([SPEED, HORIZON_S, REACH, MIN_SPEED, RUN_MIN_GAIN, DEF_MIN_GAIN, MAX_GHOSTS]).toEqual([p.speed, p.horizon_s, p.reach_m, p.min_speed, p.run_min_gain, p.def_min_gain, p.max_ghosts]);
    expect(FAN_DEG).toEqual(p.fan_deg);
  });
  let compared = 0;
  for (const r of fx?.frames ?? []) {
    it(`half ${r.half}, frame ${r.frame}: contributions to 1e-9, phrases identical unless fragile`, () => {
      const s = stateOf(r);
      const opts = options(s, r.carrier_row, coach);
      const vNow = valueAt(coach, s.att[r.carrier_row]);
      expect(Math.abs(vNow - r.v_now)).toBeLessThan(TOL);
      const got = explainOptions(s, r.carrier_row, opts, fx.models, vNow, coach.pc);
      expect(got.length).toBe(r.explanations.length);
      got.forEach((g, i) => {
        const w = r.explanations[i];
        expect(g.kind).toBe(w.kind);
        expect(g.contributions.map((c) => c.feature)).toEqual(w.contributions.map((c) => c.feature));
        g.contributions.forEach((c, k) => expect(Math.abs(c.contribution - w.contributions[k].contribution), `${w.kind} ${c.feature}`).toBeLessThan(1e-9));
        for (const k of Object.keys(w.value_terms)) expect(Math.abs(g.valueTerms[k] - w.value_terms[k]), `${w.kind} ${k}`).toBeLessThan(1e-9);
        expect(g.phrases.length).toBe(w.phrases.length);
        if (!w.fragile) { expect(g.phrases).toEqual(w.phrases); expect(g.signs).toEqual(w.signs); compared++; }
      });
    });
  }
  it("most options were compared by text", () => {
    const total = fx.frames.reduce((n, r) => n + r.explanations.length, 0);
    expect(compared).toBeGreaterThan(total * 0.9);
  });
});

describe.skipIf(!fx?.ghost_params)("ghosts: same positions, gains and choices as Python", () => {
  const coach = fx ? coachFromModels(fx.models) : null;
  const same = (got, want, what) => {
    expect(got.length, `${what} count`).toBe(want.length);
    got.forEach((g, i) => {
      const w = want[i];
      if (w.fragile) return;
      expect([g.row, g.player, g.fanIndex], `${what} ${i} choice`).toEqual([w.row, w.player, w.fan_index]);
      expect(Math.abs(g.gain - w.gain), `${what} ${i} gain`).toBeLessThan(TOL);
      for (const [a, b] of [[g.from, w.from], [g.to, w.to]]) expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])), `${what} ${i} position`).toBeLessThan(TOL);
    });
  };
  for (const r of fx?.frames ?? []) {
    it(`half ${r.half}, frame ${r.frame}: ghost runs and ghost defence`, () => {
      const s = stateOf(r);
      const runs = ghostRuns(s, r.carrier_row, coach), def = ghostDefence(s, r.carrier_row, coach);
      const fragile = (l) => l.some((g) => g.fragile);
      if (fragile(r.ghosts.runs) || fragile(r.ghosts.defence)) {
        // a near tie could flip a choice: compare what is stable (the best gain of each list, numerically)
        for (const [got, want] of [[runs, r.ghosts.runs], [def, r.ghosts.defence]]) if (got.length && want.length) expect(Math.abs(got[0].gain - want[0].gain)).toBeLessThan(TOL);
        return;
      }
      same(runs, r.ghosts.runs, "run");
      same(def, r.ghosts.defence, "defender");
    });
  }
  it("each frame's ghosts stay within the 50 ms budget in node", () => {
    const ms = [];
    for (const r of fx.frames) {
      const s = stateOf(r), t0 = performance.now();
      ghostRuns(s, r.carrier_row, coach); ghostDefence(s, r.carrier_row, coach);
      ms.push(performance.now() - t0);
    }
    const max = Math.max(...ms);
    console.info(`ghosts per frame: mean ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1)} ms, max ${max.toFixed(1)} ms over ${ms.length} frames`);
    expect(max).toBeLessThan(50);
  });
});
