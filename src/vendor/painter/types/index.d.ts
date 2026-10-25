import { Mode, type Handedness } from "./gestures";
import { type Swatch } from "./painter";
export * from "./gestures";
export * from "./painter";
/** Exact version of @mediapipe/tasks-vision this module is built against (wasm must match). */
export declare const TASKS_VISION_VERSION = "1.1.0";
export declare const DEFAULT_WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
export declare const DEFAULT_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
export interface PainterOptions {
    /** Folder holding the tasks-vision wasm files. Default: jsDelivr, pinned to TASKS_VISION_VERSION. */
    wasmBase?: string;
    /** URL of hand_landmarker.task. Default: official storage.googleapis.com model. */
    modelAssetPath?: string;
    /** Inference delegate. Default "GPU" (falls back to CPU automatically if GPU init fails). */
    delegate?: "GPU" | "CPU";
    /** Start the camera immediately instead of showing a "Start camera" button. Default false. */
    autoStart?: boolean;
    /** Requested camera resolution (the actual one is used for the canvas). Default 1280x720. */
    width?: number;
    height?: number;
    /** Colour swatches shown in the toolbar. Default: the Python palette. */
    palette?: Swatch[];
    /** Hand used for the thumb test (Python default "Right"). */
    handedness?: Handedness;
    strokeThickness?: number;
    eraserRadius?: number;
    btnEraserRadius?: number;
    /** Theme overrides. */
    accent?: string;
    background?: string;
    fontFamily?: string;
    monoFontFamily?: string;
    /** Show the fps counter in the HUD. Default true. */
    showFps?: boolean;
    onModeChange?: (mode: Mode) => void;
    onError?: (error: Error) => void;
}
export interface PainterHandle {
    start(): Promise<void>;
    stop(): void;
    clear(): void;
    readonly mode: Mode;
    readonly running: boolean;
    /** PNG data URL of the drawing layer (no camera pixels). */
    snapshot(): string;
    destroy(): void;
}
export declare function mountPainter(element: HTMLElement, options?: PainterOptions): PainterHandle;
