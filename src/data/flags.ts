// Ship switches, evaluated at build time.
import fs from "node:fs";

// The painter shipped after the owner tested it with a real webcam (2026-10-25).
export const PAINTER_LIVE = true;

// The hard-hat demo is live when its model was copied into public/models by scripts/demo-assets.mjs.
export const HARDHAT_LIVE = fs.existsSync("public/models/ppe_yolo11n_fp16.onnx");
