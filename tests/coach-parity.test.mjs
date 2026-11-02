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
