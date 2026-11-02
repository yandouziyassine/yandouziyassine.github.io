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
