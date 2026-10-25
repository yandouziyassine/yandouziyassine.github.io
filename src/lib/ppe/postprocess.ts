// Pre/post-processing for the project 07 hard-hat model (YOLO11n, 2 classes, static 640x640 ONNX, no NMS).
// Port of ppe_onnx_reference.py: letterbox like Ultralytics LetterBox(auto=False), decode the channel-major
// [1, 6, 8400] output, class-aware greedy NMS, then map boxes back to the original image.

export const INPUT_SIZE = 640;
export const ANCHORS = 8400;
export const LABELS = ["hardhat", "no-hardhat"] as const;
export const CONF = 0.25; // site-alert operating point
export const IOU = 0.45;
export const MAX_DET = 300;

export interface Letterbox { origW: number; origH: number; ratio: number; newW: number; newH: number; left: number; top: number; }
export interface Detection { classId: number; label: (typeof LABELS)[number]; score: number; box: [number, number, number, number]; }

export function letterbox(origW: number, origH: number, size = INPUT_SIZE): Letterbox {
  const ratio = Math.min(size / origH, size / origW);
  const newW = Math.round(origW * ratio);
  const newH = Math.round(origH * ratio);
  // The -0.1 keeps .5 cases off the rounding edge, so Math.round matches Python's round here.
  const left = Math.max(0, Math.round((size - newW) / 2 - 0.1)); // max(0, .) turns -0 into 0
  const top = Math.max(0, Math.round((size - newH) / 2 - 0.1));
  return { origW, origH, ratio, newW, newH, left, top };
}

/** RGBA pixels of the 640x640 letterboxed canvas -> float32 NCHW RGB tensor in [0, 1]. */
export function toTensor(rgba: Uint8ClampedArray, size = INPUT_SIZE): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = rgba[i * 4] / 255;
    out[plane + i] = rgba[i * 4 + 1] / 255;
    out[2 * plane + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

type Box = [number, number, number, number];

function iou(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return inter / (union + 1e-9);
}

/** Greedy NMS over candidates already sorted by descending score; returns kept indices. */
export function nms(boxes: Box[], iouThr = IOU): number[] {
  const keep: number[] = [];
  const dropped = new Uint8Array(boxes.length);
  for (let i = 0; i < boxes.length; i++) {
    if (dropped[i]) continue;
    keep.push(i);
    for (let j = i + 1; j < boxes.length; j++) if (!dropped[j] && iou(boxes[i], boxes[j]) > iouThr) dropped[j] = 1;
  }
  return keep;
}

/** Raw output0 (flat, channel-major) -> detections in original-image pixels, best score first. */
export function decode(data: Float32Array, lb: Letterbox, conf = CONF, iouThr = IOU, maxDet = MAX_DET): Detection[] {
  const N = ANCHORS;
  const byClass: { box: Box; score: number }[][] = LABELS.map(() => []);
  for (let i = 0; i < N; i++) {
    const s0 = data[4 * N + i], s1 = data[5 * N + i];
    const cls = s1 > s0 ? 1 : 0; // argmax picks the first class on ties
    const score = cls ? s1 : s0;
    if (!(score > conf)) continue;
    const cx = data[i], cy = data[N + i], w = data[2 * N + i], h = data[3 * N + i];
    byClass[cls].push({ box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], score });
  }
  const kept: { cls: number; box: Box; score: number }[] = [];
  byClass.forEach((cands, cls) => {
    cands.sort((a, b) => b.score - a.score);
    for (const k of nms(cands.map((c) => c.box), iouThr)) kept.push({ cls, ...cands[k] });
  });
  kept.sort((a, b) => b.score - a.score);

  const clip = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);
  return kept.slice(0, maxDet).map(({ cls, box, score }) => ({
    classId: cls,
    label: LABELS[cls],
    score,
    box: [
      clip((box[0] - lb.left) / lb.ratio, lb.origW),
      clip((box[1] - lb.top) / lb.ratio, lb.origH),
      clip((box[2] - lb.left) / lb.ratio, lb.origW),
      clip((box[3] - lb.top) / lb.ratio, lb.origH),
    ],
  }));
}

/** Site alert: at least one no-hardhat detection at the operating threshold. */
export function siteAlert(dets: Detection[], conf = CONF): boolean {
  return dets.some((d) => d.classId === 1 && d.score >= conf);
}
