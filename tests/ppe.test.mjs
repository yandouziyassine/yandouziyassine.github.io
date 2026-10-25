import { describe, expect, it } from "vitest";
import { ANCHORS, decode, letterbox, nms, siteAlert, toTensor } from "../src/lib/ppe/postprocess.ts";

// Synthetic output0: every anchor scores 0 unless set.
function output(anchors) {
  const d = new Float32Array(6 * ANCHORS);
  anchors.forEach(([i, cx, cy, w, h, s0, s1]) => [cx, cy, w, h, s0, s1].forEach((v, c) => (d[c * ANCHORS + i] = v)));
  return d;
}

describe("letterbox", () => {
  it("leaves a 640x640 image untouched", () => {
    expect(letterbox(640, 640)).toEqual({ origW: 640, origH: 640, ratio: 1, newW: 640, newH: 640, left: 0, top: 0 });
  });
  it("pads a wide image top and bottom (960x540 sample: 640x360, top 140)", () => {
    const lb = letterbox(960, 540);
    expect([lb.newW, lb.newH, lb.left, lb.top]).toEqual([640, 360, 0, 140]);
  });
  it("rounds an odd 1 px pad to the bottom/right like Ultralytics (round(0.5 - 0.1) = 0)", () => {
    expect(letterbox(639, 640)).toMatchObject({ newW: 639, left: 0, top: 0 });
    expect(letterbox(640, 639)).toMatchObject({ newH: 639, left: 0, top: 0 });
  });
});

describe("toTensor", () => {
  it("writes RGB planes divided by 255 and ignores alpha", () => {
    const px = new Uint8ClampedArray([255, 0, 51, 7, 0, 255, 0, 9, 0, 0, 0, 0, 102, 0, 0, 0]); // 2x2 pixels
    const t = toTensor(px, 2);
    expect(Array.from(t).map((v) => +v.toFixed(3))).toEqual([1, 0, 0, 0.4, 0, 1, 0, 0, 0.2, 0, 0, 0]);
  });
});

describe("nms", () => {
  it("drops overlaps above the threshold and keeps the rest", () => {
    const keep = nms([[0, 0, 10, 10], [1, 1, 11, 11], [20, 20, 30, 30]], 0.45);
    expect(keep).toEqual([0, 2]);
  });
});

describe("decode", () => {
  const lb = letterbox(640, 640);
  it("matches the golden raw column of sample_1 (anchor 7229 -> hardhat 0.7068)", () => {
    const d = decode(output([[7229, 477.8151, 314.9489, 62.1568, 84.1694, 0.7068, 0.0004]]), lb);
    expect(d).toHaveLength(1);
    expect(d[0].label).toBe("hardhat");
    expect(d[0].box.map((v) => +v.toFixed(2))).toEqual([446.74, 272.86, 508.89, 357.03]);
  });
  it("is class-aware: overlapping boxes of different classes both survive", () => {
    const d = decode(output([[0, 100, 100, 50, 50, 0.9, 0], [1, 102, 102, 50, 50, 0, 0.8], [2, 101, 101, 50, 50, 0.6, 0]]), lb);
    expect(d.map((x) => [x.label, +x.score.toFixed(1)])).toEqual([["hardhat", 0.9], ["no-hardhat", 0.8]]);
  });
  it("keeps only scores strictly above conf", () => {
    expect(decode(output([[0, 100, 100, 10, 10, 0.25, 0]]), lb)).toEqual([]);
  });
  it("maps back through the letterbox and clips to the image", () => {
    const wide = letterbox(960, 540); // ratio 2/3, top 140
    const [det] = decode(output([[5, 20, 150, 60, 40, 0.5, 0]]), wide);
    expect(det.box.map((v) => +v.toFixed(2))).toEqual([0, 0, 75, 45]);
  });
  it("flags the site only for no-hardhat", () => {
    expect(siteAlert(decode(output([[0, 50, 50, 10, 10, 0.9, 0]]), lb))).toBe(false);
    expect(siteAlert(decode(output([[0, 50, 50, 10, 10, 0, 0.3]]), lb))).toBe(true);
  });
});
