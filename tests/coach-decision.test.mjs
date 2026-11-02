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
