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
