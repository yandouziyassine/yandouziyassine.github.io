// Ship switches, evaluated at build time.
import fs from "node:fs";

// The painter is "coming soon" on the built site until it has been tested with a real webcam; the dev server
// (npm run dev) shows it so it can be tested locally.
export const PAINTER_LIVE = import.meta.env.DEV;

// The hard-hat demo is live when its model was copied into public/models by scripts/demo-assets.mjs.
export const HARDHAT_LIVE = fs.existsSync("public/models/ppe_yolo11n_fp16.onnx");
