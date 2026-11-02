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
