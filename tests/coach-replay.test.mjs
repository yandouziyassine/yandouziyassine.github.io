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
