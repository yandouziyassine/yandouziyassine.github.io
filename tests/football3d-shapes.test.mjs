import { describe, expect, it } from "vitest";
import { LINE_W, arrowTriangles, atlasCell, pitchMarkings, ribbon } from "../src/lib/football3d/shapes.ts";
import { hasWebGL } from "../src/lib/football3d/webgl.ts";

describe("pitch markings", () => {
  const lines = pitchMarkings(), pts = lines.flat();
  it("has the 16 markings of a 105 x 68 m pitch, all on the pitch", () => {
    expect(lines).toHaveLength(16); // outline, halfway line, centre circle + spot, 2 x (penalty area, goal area, spot, arc, 2 corners)
    for (const [x, y] of pts) {
      expect(Math.abs(x)).toBeLessThanOrEqual(52.5 + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(34 + 1e-9);
    }
  });
  it("is symmetric about the halfway line", () => {
    for (const [x, y] of pts) expect(pts.some(([u, v]) => Math.abs(u + x) < 1e-6 && Math.abs(v - y) < 1e-6)).toBe(true);
  });
  it("puts the penalty arcs outside the areas, 9.15 m from the spots", () => {
    const arcs = lines.filter((l) => l.length === 25);
    expect(arcs).toHaveLength(2);
    for (const a of arcs) for (const [x, y] of a) {
      expect(Math.hypot(Math.abs(x) - 41.5, y)).toBeCloseTo(9.15, 9);
      expect(Math.abs(x)).toBeLessThanOrEqual(36 + 1e-9);
    }
  });
});

describe("ground shapes", () => {
  it("turns a segment into two triangles of the line's width", () => {
    expect([...ribbon([[[0, 0], [10, 0]]], 0.2)].map((v) => +v.toFixed(6))).toEqual([0, 0.1, 0, -0.1, 10, 0.1, 10, 0.1, 0, -0.1, 10, -0.1]);
    expect(ribbon(pitchMarkings()).length % 12).toBe(0);
    expect(LINE_W).toBe(0.12);
  });
  it("draws an arrow whose head ends exactly at the target", () => {
    const a = [...arrowTriangles([0, 0], [10, 0], 0.35, 1.6)].map((v) => +v.toFixed(5));
    expect(a).toHaveLength(18);
    expect(a.slice(0, 2)).toEqual([0, 0.175]);
    expect(a.slice(12, 18)).toEqual([10, 0, 8.4, 0.7, 8.4, -0.7]);
  });
  it("keeps the head of a short arrow at most half its length", () => {
    expect(arrowTriangles([0, 0], [2, 0], 0.35, 1.6)[14]).toBeCloseTo(1, 5);
  });
});

describe("shirt-number atlas", () => {
  it("finds a number's cell, counting rows from the bottom as texture coordinates do", () => {
    expect(atlasCell(0)).toEqual([0, 9]);
    expect(atlasCell(7)).toEqual([7, 9]);
    expect(atlasCell(10)).toEqual([0, 8]);
    expect(atlasCell(99)).toEqual([9, 0]);
    expect(atlasCell(123)).toEqual([9, 0]);
  });
});

describe("WebGL check", () => {
  const canvas = (ctx) => () => ({ getContext: (id) => ctx[id] ?? null });
  it("needs WebGL 2 (three.js dropped WebGL 1) and releases the test context", () => {
    let lost = 0;
    expect(hasWebGL(canvas({ webgl2: { getExtension: () => ({ loseContext: () => lost++ }) } }))).toBe(true);
    expect(lost).toBe(1);
    expect(hasWebGL(canvas({ webgl: {} }))).toBe(false);
    expect(hasWebGL(() => { throw new Error("no canvas"); })).toBe(false);
  });
});
