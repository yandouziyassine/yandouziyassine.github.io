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
