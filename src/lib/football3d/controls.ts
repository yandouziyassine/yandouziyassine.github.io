// Visitor controls for the football replay's 3D view. Pure, so they are unit-tested in Node:
// - player's eyes: free look (yaw unlimited, pitch -60°..+45°) and a field-of-view zoom (30°..90°), on top of the
//   automatic look direction
// - stadium camera: orbit around the aim point (elevation 8°..85°, distance 0.35..1.8 times)
// - tactical view: pan and zoom (1×..4×) with the pitch always filling the view
// - drag against click, pinch, keys, and the short inertia after a drag (never with reduced motion: view3d.ts)
// Directions follow "grab the scene": dragging right turns the eyes to the left and moves the stadium camera to the left.
import { EYES_FOV, tacticalExtent, type Pose, type V3 } from "./camera";

export { EYES_FOV };
const DEG = Math.PI / 180;
export const PITCH_MIN = -60 * DEG;
export const PITCH_MAX = 45 * DEG;
export const FOV_MIN = 30;
export const FOV_MAX = 90;
export const ELEV_MIN = 8 * DEG;      // the stadium camera stays above the grass
export const ELEV_MAX = 85 * DEG;     // ... and never reaches the vertical, where azimuth is undefined
export const ORBIT_ZOOM_MIN = 0.35;   // times the usual distance
export const ORBIT_ZOOM_MAX = 1.8;
export const TAC_ZOOM_MIN = 1;
export const TAC_ZOOM_MAX = 4;
export const DRAG_PX = 6;             // less than this between press and release is a click, not a drag
export const DOUBLE_TAP_MS = 300;     // two clicks or taps this close, and this near, re-centre the view
export const DOUBLE_TAP_PX = 30;
export const KEY_STEP = 5 * DEG;      // one Q / E / R / F press
export const KEY_PAN_M = 5;           // one Q / E / R / F press in the tactical view
export const ZOOM_KEY = 150;          // one + / - press, in wheel units
export const WHEEL_K = 0.001;         // wheel units to ln(factor): 100 units (one notch) = 10 %
export const INERTIA_TAU = 0.3;       // s, how long a flick keeps turning
export const INERTIA_MIN = 20;        // px/s: slower than this the flick has stopped

export interface LookOffset { yaw: number; pitch: number }
export interface Orbit { azimuth: number; elevation: number; zoom: number }
export interface TacticalView { x: number; y: number; zoom: number }
export type ControlKind = "eyes" | "orbit" | "tactical";
export interface ViewState { look: LookOffset; fov: number; orbit: Orbit; tac: TacticalView }
export interface KeyContext { aspect: number; baseElev: number }
export type KeyAction = { type: "reset" } | { type: "nudge"; h: -1 | 0 | 1; v: -1 | 0 | 1 } | { type: "zoom"; dir: 1 | -1 };

export const LOOK_HOME: LookOffset = { yaw: 0, pitch: 0 };
export const ORBIT_HOME: Orbit = { azimuth: 0, elevation: 0, zoom: 1 };
export const TAC_HOME: TacticalView = { x: 0, y: 0, zoom: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** An angle in [-π, π). */
export function wrapAngle(a: number): number {
  return Math.abs(a) < Math.PI ? a : a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}

/** True once a pointer has moved far enough since it went down: from then on it is a drag and cannot select a player. */
export const isDrag = (dx: number, dy: number) => Math.hypot(dx, dy) >= DRAG_PX;

// ---- the player's eyes ----

/** One drag step: a screen height covers one vertical field of view, so the scene follows the finger. */
export function dragLook(o: LookOffset, dx: number, dy: number, fov: number, heightPx: number): LookOffset {
  const k = (fov * DEG) / Math.max(1, heightPx);
  return { yaw: wrapAngle(o.yaw + dx * k), pitch: clamp(o.pitch + dy * k, PITCH_MIN, PITCH_MAX) };
}

/** Wheel (deltaY, positive = down) to a new field of view: down widens it, up narrows it. */
export const zoomFov = (fov: number, wheel: number) => clamp(fov * Math.exp(wheel * WHEEL_K), FOV_MIN, FOV_MAX);

/** Two fingers moving from distance d0 to d, as wheel units: apart zooms in, together zooms out. */
export const pinchDelta = (d0: number, d: number) => (d0 > 0 && d > 0 ? -Math.log(d / d0) / WHEEL_K : 0);

// ---- the stadium camera ----

/** Elevation above the ground plane (radians) of a pose, seen from its target. */
export function elevationOf(pose: Pose): number {
  const x = pose.position[0] - pose.target[0], y = pose.position[1] - pose.target[1], z = pose.position[2] - pose.target[2];
  return Math.atan2(y, Math.hypot(x, z));
}

/** Keep the orbit inside its limits; `baseElev` is the elevation of the camera it is an offset from. */
export function clampOrbit(o: Orbit, baseElev: number): Orbit {
  return {
    azimuth: wrapAngle(o.azimuth),
    elevation: clamp(o.elevation, ELEV_MIN - baseElev, ELEV_MAX - baseElev),
    zoom: clamp(o.zoom, ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX),
  };
}

/** One drag step: a screen height is half a turn. Right moves the camera left, down raises it. */
export function dragOrbit(o: Orbit, dx: number, dy: number, heightPx: number, baseElev: number): Orbit {
  const k = Math.PI / Math.max(1, heightPx);
  return clampOrbit({ ...o, azimuth: o.azimuth - dx * k, elevation: o.elevation + dy * k }, baseElev);
}

export const zoomOrbit = (o: Orbit, wheel: number): Orbit => ({ ...o, zoom: clamp(o.zoom * Math.exp(wheel * WHEEL_K), ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX) });

/** The camera `base` moved round its target by the orbit: same target, azimuth and elevation added, distance scaled. */
export function orbitPose(base: Pose, o: Orbit): Pose {
  const rel = base.position.map((v, i) => v - base.target[i]) as V3;
  const r = Math.hypot(...rel) * o.zoom;
  const az = Math.atan2(rel[0], rel[2]) + o.azimuth;
  const el = clamp(elevationOf(base) + o.elevation, ELEV_MIN, ELEV_MAX);
  return {
    ...base,
    position: [base.target[0] + r * Math.cos(el) * Math.sin(az), base.target[1] + r * Math.sin(el), base.target[2] + r * Math.cos(el) * Math.cos(az)],
  };
}

// ---- the tactical view ----

/** Zoom limits, and the centre kept so that the view never shows more than the full pitch view does. */
export function clampTactical(v: TacticalView, aspect: number): TacticalView {
  const zoom = clamp(v.zoom, TAC_ZOOM_MIN, TAC_ZOOM_MAX), e = tacticalExtent(aspect);
  const mx = e.halfW * (1 - 1 / zoom), my = e.halfH * (1 - 1 / zoom);
  return { x: clamp(v.x, -mx, mx) + 0, y: clamp(v.y, -my, my) + 0, zoom }; // + 0: no negative zero
}

/** One drag step: the grass follows the finger, so the view centre moves the other way. */
export function panTactical(v: TacticalView, dx: number, dy: number, aspect: number, heightPx: number): TacticalView {
  const mpp = (2 * tacticalExtent(aspect).halfH) / v.zoom / Math.max(1, heightPx);
  return clampTactical({ ...v, x: v.x - dx * mpp, y: v.y + dy * mpp }, aspect);
}

export const zoomTactical = (v: TacticalView, wheel: number, aspect: number): TacticalView => clampTactical({ ...v, zoom: v.zoom * Math.exp(-wheel * WHEEL_K) }, aspect);

// ---- keys ----

/** What a key does in the 3D view when the stage has focus: 0 re-centres, Q/E turn, R/F up and down, + / - zoom. */
export function keyAction(key: string): KeyAction | null {
  switch (key) {
    case "0": return { type: "reset" };
    case "q": case "Q": return { type: "nudge", h: -1, v: 0 };
    case "e": case "E": return { type: "nudge", h: 1, v: 0 };
    case "r": case "R": return { type: "nudge", h: 0, v: 1 };
    case "f": case "F": return { type: "nudge", h: 0, v: -1 };
    case "+": case "=": return { type: "zoom", dir: 1 };
    case "-": case "_": return { type: "zoom", dir: -1 };
    default: return null;
  }
}

/** The state after a key, for the camera in use (the others are left alone). h > 0 is right, v > 0 is up. */
export function applyKey(kind: ControlKind, s: ViewState, a: KeyAction | null, ctx: KeyContext): ViewState {
  if (!a) return s;
  if (a.type === "reset") {
    return kind === "eyes" ? { ...s, look: LOOK_HOME, fov: EYES_FOV } : kind === "orbit" ? { ...s, orbit: ORBIT_HOME } : { ...s, tac: TAC_HOME };
  }
  if (a.type === "zoom") {
    const wheel = -a.dir * ZOOM_KEY;
    return kind === "eyes" ? { ...s, fov: zoomFov(s.fov, wheel) } : kind === "orbit" ? { ...s, orbit: zoomOrbit(s.orbit, wheel) } : { ...s, tac: zoomTactical(s.tac, wheel, ctx.aspect) };
  }
  if (kind === "eyes") {
    return { ...s, look: { yaw: wrapAngle(s.look.yaw - a.h * KEY_STEP), pitch: clamp(s.look.pitch + a.v * KEY_STEP, PITCH_MIN, PITCH_MAX) } };
  }
  if (kind === "orbit") {
    return { ...s, orbit: clampOrbit({ ...s.orbit, azimuth: s.orbit.azimuth + a.h * KEY_STEP, elevation: s.orbit.elevation + a.v * KEY_STEP }, ctx.baseElev) };
  }
  return { ...s, tac: clampTactical({ ...s.tac, x: s.tac.x + (a.h * KEY_PAN_M) / s.tac.zoom, y: s.tac.y + (a.v * KEY_PAN_M) / s.tac.zoom }, ctx.aspect) };
}

// ---- inertia (px/s of pointer movement keeps driving the same drag function) ----

export const decayVelocity = (v: [number, number], dt: number): [number, number] => {
  const f = Math.exp(-Math.max(0, dt) / INERTIA_TAU);
  return [v[0] * f, v[1] * f];
};
export const inertiaAlive = (v: [number, number]) => Math.hypot(v[0], v[1]) >= INERTIA_MIN;

/** Release speed, smoothed over the last moves: `dt` seconds, `dx`/`dy` pixels since the previous pointer event. */
export function blendVelocity(prev: [number, number], dx: number, dy: number, dt: number): [number, number] {
  if (dt <= 0) return prev;
  const a = 0.5;
  return [prev[0] * (1 - a) + (dx / dt) * a, prev[1] * (1 - a) + (dy / dt) * a];
}
