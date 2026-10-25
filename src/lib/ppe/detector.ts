// Runs the hard-hat model in the browser with ONNX Runtime Web (WASM, single thread: GitHub Pages cannot send the
// COOP/COEP headers that threads need). The runtime and the model load on first use only. The WASM binary is
// emitted by Vite as a hashed asset next to the bundle (onnxruntime-web/wasm locates it with import.meta.url).
import type { InferenceSession } from "onnxruntime-web";
import { decode, INPUT_SIZE, letterbox, toTensor, type Detection, type Letterbox } from "./postprocess";

export interface Result { detections: Detection[]; letterbox: Letterbox; ms: number; }

export interface DetectorOptions { modelUrl: string; }

let session: Promise<{ ort: typeof import("onnxruntime-web"); sess: InferenceSession }> | undefined;

function load({ modelUrl }: DetectorOptions) {
  session ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1;
    const sess = await ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    return { ort, sess };
  })();
  session.catch(() => (session = undefined)); // allow a retry after a network error
  return session;
}

/** Downloads the runtime and the model ahead of the first photo. */
export function warmUp(opts: DetectorOptions) {
  return load(opts).then(() => undefined);
}

export async function detect(image: ImageBitmap | HTMLImageElement, opts: DetectorOptions): Promise<Result> {
  const { ort, sess } = await load(opts);
  const w = "naturalWidth" in image ? image.naturalWidth : image.width;
  const h = "naturalHeight" in image ? image.naturalHeight : image.height;
  const lb = letterbox(w, h);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(image, lb.left, lb.top, lb.newW, lb.newH);
  const pixels = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;

  const t0 = performance.now();
  const input = new ort.Tensor("float32", toTensor(pixels), [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const out = await sess.run({ [sess.inputNames[0]]: input });
  const data = out[sess.outputNames[0]].data as Float32Array;
  const detections = decode(data, lb);
  return { detections, letterbox: lb, ms: performance.now() - t0 };
}
