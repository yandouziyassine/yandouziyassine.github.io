// The hard-hat model (project 07) for the browser demo: public/models/ppe_yolo11n_fp16.onnx (committed, owner decision
// 2026-10-25). This refreshes it from PPE_MODEL or ../cv-data/ppe/web after a re-export; without the file the demo
// builds as "coming soon". (The ONNX Runtime WASM binary needs no copy: Vite emits it from node_modules.)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MODEL = "ppe_yolo11n_fp16.onnx";
const MODEL_SRC = process.env.PPE_MODEL || path.join(ROOT, "..", "cv-data", "ppe", "web", MODEL);
const MODEL_OUT = path.join(ROOT, "public", "models", MODEL);

function copy(src, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out) && fs.statSync(out).size === fs.statSync(src).size) return false;
  fs.copyFileSync(src, out);
  return true;
}

if (fs.existsSync(MODEL_SRC)) {
  if (copy(MODEL_SRC, MODEL_OUT)) console.log(`demo-assets: refreshed ${MODEL}`);
} else if (!fs.existsSync(MODEL_OUT)) {
  console.log(`demo-assets: no ${MODEL}, the hard-hat demo builds as "coming soon"`);
}
