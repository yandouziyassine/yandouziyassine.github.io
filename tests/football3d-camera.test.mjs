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
