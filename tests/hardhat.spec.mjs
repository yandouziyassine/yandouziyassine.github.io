// Browser parity test for the hard-hat demo: the real page (ONNX Runtime Web + the JS decode) against the golden
// detections from ppe_onnx_reference.py. The samples come from the Hard Hat Workers test split and are not
// committed, so this test runs only where they exist (PPE_WEB_DIR, default ../cv-data/ppe/web) and the demo is live.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.PPE_WEB_DIR || path.resolve("..", "cv-data", "ppe", "web");
const golden = fs.existsSync(path.join(DIR, "expected_detections.json"))
  ? JSON.parse(fs.readFileSync(path.join(DIR, "expected_detections.json"), "utf8"))
  : null;
const modelBuilt = fs.existsSync("dist/models/ppe_yolo11n_fp16.onnx");

const iou = (a, b) => {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return (w * h) / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - w * h);
};

test.describe("hard-hat demo matches the Python reference", () => {
  test.skip(!golden || !modelBuilt, "golden samples or model not available here");
  test.setTimeout(120_000); // the first test loads ~14 MB of WASM + the model; slow on a busy laptop

  for (const img of golden?.images ?? []) {
    // FP16 model + browser JPEG decode/resample vs FP32 + PIL/OpenCV: README tolerances, wider when resized.
    const resized = img.letterbox.ratio !== 1;
    const [boxTol, scoreTol] = resized ? [3, 0.05] : [1.5, 0.02];

    test(path.basename(img.file), async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/demos/");
      const root = page.locator("[data-hardhat]");
      await root.locator("[data-input]").setInputFiles(path.join(DIR, img.file));
      await expect(root).toHaveAttribute("data-detections", /.*/, { timeout: 60_000 });
      const got = JSON.parse(await root.getAttribute("data-detections"));

      // Detections right at the threshold may flip with FP16; every confident golden box must be found.
      const expected = img.detections.filter((d) => d.score > golden.conf + scoreTol);
      const used = new Set();
      for (const e of expected) {
        const cands = got.map((g, i) => ({ g, i })).filter(({ g, i }) => !used.has(i) && g.label === e.label);
        const best = cands.sort((a, b) => iou(b.g.box, e.box_xyxy) - iou(a.g.box, e.box_xyxy))[0];
        expect(best, `missing ${e.label} ${e.score}`).toBeTruthy();
        used.add(best.i);
        expect(Math.max(...best.g.box.map((v, k) => Math.abs(v - e.box_xyxy[k])))).toBeLessThanOrEqual(boxTol);
        expect(Math.abs(best.g.score - e.score)).toBeLessThanOrEqual(scoreTol);
      }
      expect(got.length).toBeLessThanOrEqual(img.detections.length + 1);
      const alert = img.detections.some((d) => d.label === "no-hardhat");
      await expect(root.locator("[data-status]")).toHaveAttribute("data-kind", alert ? "alert" : img.detections.length ? "ok" : "");
      expect(errors).toEqual([]);
    });
  }
});
