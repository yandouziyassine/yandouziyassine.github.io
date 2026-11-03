// Camera maths for the football replay's 3D view (phase 3). Pure, so it is unit-tested in Node:
// - where each camera sits and looks
// - frame-rate independent smoothing that keeps the cameras calm
// - the eased flight between two cameras (a cut when the visitor prefers reduced motion)
// World coordinates are three.js's: pitch (x, y) at height h is [x, h, -y].
import { HALF_LENGTH, HALF_WIDTH, type Vec } from "../coach/geometry";

export type V3 = [number, number, number];
export type CameraMode = "broadcast" | "tactical" | "eyes";
export const CAMERA_MODES: readonly CameraMode[] = ["broadcast", "tactical", "eyes"];
export interface Pose { position: V3; target: V3; up: V3; fov: number }

export const EYE_HEIGHT = 1.7;   // m, the player's-eyes camera
export const MOVING_MS = 0.5;    // m/s: slower than this a player is standing, and looks at the ball
export const FOLLOW_TAU = 0.6;   // s, how far the stadium camera lags behind the ball
export const LOOK_TAU = 0.25;    // s, how far the player's-eyes camera lags behind his direction
export const SNAP_M = 25;        // a jump in the replay that moves the ball this far cuts instead of panning
export const FLY_S = 0.9;        // s, flight between two cameras
export const BROADCAST = { back: 30, height: 20, fov: 38, follow: 0.8 }; // 30 m behind the near touchline, 20 m up
export const TACTICAL_MARGIN = 4; // m of grass shown around the pitch
export const EYES_FOV = 70;       // degrees, the player's-eyes camera before the visitor zooms
const TACTICAL_FOV = 30;

export const toWorld = (p: Vec, h = 0): V3 => [p[0], h, -p[1]];
export const nextCamera = (m: CameraMode): CameraMode => CAMERA_MODES[(CAMERA_MODES.indexOf(m) + 1) % CAMERA_MODES.length];
export const flightSeconds = (reduced: boolean) => (reduced ? 0 : FLY_S);

/** Exponential smoothing that does not depend on the frame rate: after `tau` seconds, 63 % of the gap is closed. */
export function damp(cur: number, target: number, dt: number, tau: number): number {
  if (dt <= 0) return cur;
  if (tau <= 0) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
}
export const dampVec = (cur: Vec, target: Vec, dt: number, tau: number): Vec =>
  [damp(cur[0], target[0], dt, tau), damp(cur[1], target[1], dt, tau)];
export const settled = (a: Vec, b: Vec, eps = 0.05) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;

function unit(v: Vec): Vec | null {
  const n = Math.hypot(v[0], v[1]);
  return n < 1e-9 ? null : [v[0] / n, v[1] / n];
}

/** The stadium camera's aim point: lags behind the ball, but cuts when the replay jumps. */
export function followBall(cur: Vec, ball: Vec, dt: number): Vec {
  return Math.hypot(ball[0] - cur[0], ball[1] - cur[1]) > SNAP_M ? [ball[0], ball[1]] : dampVec(cur, ball, dt, FOLLOW_TAU);
}

/** Where a player looks: along his velocity when he moves, else towards the ball, else where he looked before. */
export function lookDirection(vel: Vec, pos: Vec, ball: Vec | null, prev: Vec): Vec {
  if (Math.hypot(vel[0], vel[1]) >= MOVING_MS) return unit(vel)!;
  if (ball && Math.hypot(ball[0] - pos[0], ball[1] - pos[1]) > 0.3) return unit([ball[0] - pos[0], ball[1] - pos[1]])!;
  return unit(prev) ?? [1, 0];
}

/** Turn a unit direction towards another, smoothly; exactly opposite directions jump to the target. */
export function smoothDirection(cur: Vec, target: Vec, dt: number, tau: number): Vec {
  return unit(dampVec(cur, target, dt, tau)) ?? [target[0], target[1]];
}

/** TV-style camera on the near touchline, panning along with the ball (`focus` = the smoothed ball position). */
export function broadcastPose(focus: Vec): Pose {
  const x = Math.max(-HALF_LENGTH, Math.min(HALF_LENGTH, focus[0]));
  return {
    position: [x * BROADCAST.follow, BROADCAST.height, HALF_WIDTH + BROADCAST.back],
    target: toWorld([x, focus[1] * 0.5]),
    up: [0, 1, 0],
    fov: BROADCAST.fov,
  };
}

/** Half extents (m) of the top-down view that fits the pitch and its margin in a viewport of this width / height. */
export function tacticalExtent(aspect: number): { halfW: number; halfH: number } {
  const w = HALF_LENGTH + TACTICAL_MARGIN, h = HALF_WIDTH + TACTICAL_MARGIN, a = Math.max(0.1, aspect);
  return a >= w / h ? { halfW: h * a, halfH: h } : { halfW: w, halfH: w / a };
}

/** Perspective twin of the orthographic tactical view, used during flights: same ground extent, straight above.
 *  `view` is the visitor's pan (pitch metres of the view centre) and zoom (1 = the whole pitch). */
export function tacticalPose(aspect: number, view: { x: number; y: number; zoom: number } = { x: 0, y: 0, zoom: 1 }): Pose {
  const halfH = tacticalExtent(aspect).halfH / view.zoom;
  return {
    position: [view.x, halfH / Math.tan((TACTICAL_FOV * Math.PI) / 360), -view.y],
    target: [view.x, 0, -view.y],
    up: [0, 0, -1],
    fov: TACTICAL_FOV,
  };
}

/** Head height, looking 20 m ahead along `dir` (a unit vector), slightly down so the grass is in view.
 *  `look` is the visitor's free look on top of that: yaw to the left and pitch up, in radians (0 = straight ahead).
 *  The camera stays at his head; only the aim turns. */
export function eyesPose(pos: Vec, dir: Vec, look: { yaw: number; pitch: number } = { yaw: 0, pitch: 0 }, fov = EYES_FOV): Pose {
  const c = Math.cos(look.yaw), s = Math.sin(look.yaw);
  const d: Vec = [dir[0] * c - dir[1] * s, dir[0] * s + dir[1] * c];
  const down = Math.atan2(EYE_HEIGHT - 0.8, 20); // the resting pitch: 20 m ahead, 0.8 m up
  const rise = look.pitch === 0 ? -(EYE_HEIGHT - 0.8) : 20 * Math.tan(look.pitch - down);
  return {
    position: toWorld(pos, EYE_HEIGHT),
    target: toWorld([pos[0] + 20 * d[0], pos[1] + 20 * d[1]], EYE_HEIGHT + rise),
    up: [0, 1, 0],
    fov,
  };
}

export const ease = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};

export function lerpPose(a: Pose, b: Pose, u: number): Pose {
  const mix = (p: V3, q: V3): V3 => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
  const up = mix(a.up, b.up), n = Math.hypot(up[0], up[1], up[2]) || 1;
  return { position: mix(a.position, b.position), target: mix(a.target, b.target), up: [up[0] / n, up[1] / n, up[2] / n], fov: a.fov + (b.fov - a.fov) * u };
}
