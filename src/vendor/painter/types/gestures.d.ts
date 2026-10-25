export type Point = {
    x: number;
    y: number;
};
/** Same values as config.py */
export declare const SMOOTHING_WINDOW = 5;
export declare const DEBOUNCE_FRAMES = 3;
/** MediaPipe landmark indices (hand_tracker.py) */
export declare const TIP_IDS: readonly [4, 8, 12, 16, 20];
export declare const PIP_IDS: readonly [3, 6, 10, 14, 18];
export declare enum Mode {
    IDLE = "IDLE",// fist or no hand
    DRAW = "DRAW",// 1 finger
    ERASE = "ERASE"
}
export type Handedness = "Right" | "Left";
/** A normalised MediaPipe landmark (x, y in [0, 1]). */
export type NormalizedLandmark = {
    x: number;
    y: number;
    z?: number;
};
/**
 * Normalised landmarks -> pixel coords. `mirror` flips x so that the result
 * matches the Python code, which ran on a cv2.flip(frame, 1) image.
 * Uses truncation like Python's int().
 */
export declare function toPixels(lms: readonly NormalizedLandmark[], width: number, height: number, mirror?: boolean): Point[];
/** Rolling average per landmark (HandTracker._buffers). */
export declare class LandmarkSmoother {
    readonly window: number;
    private buffers;
    constructor(window?: number);
    /** Push one frame of landmarks; returns smoothed landmarks, or null (and flushes) when no hand. */
    push(landmarks: readonly Point[] | null): Point[] | null;
    reset(): void;
}
/** [thumb, index, middle, ring, pinky] extended? (HandTracker.count_fingers) */
export declare function fingersUp(lm: readonly Point[] | null, handedness?: Handedness): boolean[];
export declare function countFingers(lm: readonly Point[] | null, handedness?: Handedness): number;
/** GestureDetector._fingers_to_mode: count-based, exactly like the Python. */
export declare function fingersToMode(count: number): Mode;
export interface GestureState {
    mode: Mode;
    /** primary action point: index tip (DRAW / IDLE) or index-middle midpoint (ERASE) */
    position: Point | null;
    indexTip: Point | null;
    midpoint: Point | null;
    fingers: boolean[];
}
/** Debounced mode state machine (gesture_detector.py). */
export declare class GestureDetector {
    readonly debounceFrames: number;
    private current;
    private pending;
    private pendingCount;
    constructor(debounceFrames?: number);
    get mode(): Mode;
    update(landmarks: readonly Point[] | null, handedness?: Handedness): GestureState;
    reset(): void;
}
