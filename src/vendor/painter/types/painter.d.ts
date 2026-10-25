import { type GestureState, type Point } from "./gestures";
/** Same values as config.py (pixels in canvas space) */
export declare const STROKE_THICKNESS = 6;
export declare const ERASER_RADIUS = 40;
export declare const BTN_ERASER_RADIUS = 50;
export declare const TOOLBAR_HEIGHT = 70;
export declare const SWATCH_SIZE = 44;
export declare const SWATCH_MARGIN = 10;
export declare const BTN_WIDTH = 110;
export declare const BTN_MARGIN = 12;
export type Swatch = {
    name: string;
    color: string;
};
/** config.PALETTE converted from BGR to CSS hex. */
export declare const PALETTE: Swatch[];
export type Rect = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};
export type HitResult = {
    kind: "color";
    color: string;
    name: string;
} | {
    kind: "clear";
} | {
    kind: "eraser";
};
export interface ToolbarLayout {
    width: number;
    height: number;
    swatches: (Swatch & {
        rect: Rect;
    })[];
    clear: Rect;
    eraser: Rect;
}
export declare function layoutToolbar(width: number, palette?: Swatch[]): ToolbarLayout;
/** Toolbar.hit_test (inclusive bounds, like the Python). */
export declare function hitTest(layout: ToolbarLayout, p: Point): HitResult | null;
export declare const pointInToolbar: (p: Point | null) => p is Point;
/** Minimal drawing target, so the controller is testable without a DOM. */
export interface DrawingSurface {
    stroke(p1: Point, p2: Point, color: string, thickness: number): void;
    erase(center: Point, radius: number): void;
    clear(): void;
}
/** Per-frame logic of main.py's loop. */
export declare class PainterController {
    private surface;
    layout: ToolbarLayout;
    readonly opts: {
        strokeThickness?: number;
        eraserRadius?: number;
        btnEraserRadius?: number;
    };
    activeColor: string;
    eraserMode: boolean;
    private prevPos;
    private prevMode;
    private prevHitKind;
    constructor(surface: DrawingSurface, layout: ToolbarLayout, opts?: {
        strokeThickness?: number;
        eraserRadius?: number;
        btnEraserRadius?: number;
    });
    get strokeThickness(): number;
    get eraserRadius(): number;
    /** Feed one GestureState (hasHand = landmarks were detected this frame). */
    step(state: GestureState, hasHand: boolean): HitResult | null;
    clear(): void;
}
/** Canvas2D implementation of the drawing layer (canvas.py). */
export declare class CanvasSurface implements DrawingSurface {
    private ctx;
    constructor(ctx: CanvasRenderingContext2D);
    stroke(p1: Point, p2: Point, color: string, thickness: number): void;
    erase(center: Point, radius: number): void;
    clear(): void;
}
export interface OverlayTheme {
    accent: string;
    font: string;
    mono: string;
}
/** Toolbar + cursor + HUD + idle skeleton (toolbar.render, draw_cursor, draw_hud). */
export declare function renderOverlay(ctx: CanvasRenderingContext2D, layout: ToolbarLayout, ctrl: PainterController, state: GestureState | null, landmarks: Point[] | null, theme: OverlayTheme, fps: number): void;
