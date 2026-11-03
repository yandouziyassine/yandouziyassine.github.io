import { describe, expect, it } from "vitest";
import {
  DRAG_PX, EYES_FOV, FOV_MAX, FOV_MIN, KEY_STEP, LOOK_HOME, ORBIT_HOME, ORBIT_ZOOM_MAX, ORBIT_ZOOM_MIN, PITCH_MAX, PITCH_MIN,
  TAC_HOME, TAC_ZOOM_MAX, applyKey, blendVelocity, clampOrbit, clampTactical, decayVelocity, dragLook, dragOrbit, elevationOf,
  inertiaAlive, isDrag, keyAction, orbitPose, panTactical, pinchDelta, wrapAngle, zoomFov, zoomOrbit, zoomTactical,
} from "../src/lib/football3d/controls.ts";
import { broadcastPose, eyesPose, tacticalExtent, tacticalPose } from "../src/lib/football3d/camera.ts";

const deg = (r) => (r * 180) / Math.PI;
const near = (got, want, d = 6) => want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, d));
const CTX = { aspect: 1.5, baseElev: 0.3 };
const HOME = { look: LOOK_HOME, fov: EYES_FOV, orbit: ORBIT_HOME, tac: TAC_HOME };

describe("click or drag", () => {
  it("a movement under 6 px is still a click, from 6 px on it is a drag", () => {
    expect(DRAG_PX).toBe(6);
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(3, 4)).toBe(false); // 5 px
    expect(isDrag(-4, 4.5)).toBe(true); // 6.02 px
    expect(isDrag(0, -6)).toBe(true);
  });
});

describe("player's-eyes free look", () => {
  it("turns by the field of view per screen height: grab the scene, drag right to look left", () => {
    const o = dragLook(LOOK_HOME, 100, 0, 70, 700); // 70° over 700 px = 0.1° per px
    expect(deg(o.yaw)).toBeCloseTo(10, 6);
    expect(o.pitch).toBe(0);
    expect(deg(dragLook(LOOK_HOME, 0, 100, 70, 700).pitch)).toBeCloseTo(10, 6); // drag down: look up
  });
  it("yaw is unlimited (it wraps to ±180°), pitch stops at −60° and +45°", () => {
    let o = LOOK_HOME;
    for (let i = 0; i < 40; i++) o = dragLook(o, 100, 0, 70, 700);
    expect(Math.abs(deg(o.yaw))).toBeLessThanOrEqual(180);
    expect(deg(o.yaw)).toBeCloseTo(40, 6); // 400° once wrapped
    expect(dragLook(LOOK_HOME, 0, 1e6, 70, 700).pitch).toBe(PITCH_MAX);
    expect(dragLook(LOOK_HOME, 0, -1e6, 70, 700).pitch).toBe(PITCH_MIN);
    expect(deg(PITCH_MIN)).toBeCloseTo(-60, 9);
    expect(deg(PITCH_MAX)).toBeCloseTo(45, 9);
  });
  it("wraps angles into [−π, π)", () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI, 9);
    expect(wrapAngle(-2.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 9);
  });
  it("the pose with no offset is the original eyes pose; an offset turns the aim, never the head", () => {
    const base = eyesPose([10, 5], [0, 1]), same = eyesPose([10, 5], [0, 1], LOOK_HOME, EYES_FOV);
    near(same.target, base.target);
    near(same.position, base.position);
    const left = eyesPose([10, 5], [0, 1], { yaw: Math.PI / 2, pitch: 0 }); // looking +y, a left turn faces −x
    near(left.position, base.position);
    expect(left.target[0]).toBeLessThan(10 - 19);
    expect(left.target[2]).toBeCloseTo(-5, 6);
    const up = eyesPose([10, 5], [0, 1], { yaw: 0, pitch: PITCH_MAX });
    expect(up.target[1]).toBeGreaterThan(up.position[1]);
    expect(eyesPose([10, 5], [0, 1], LOOK_HOME, 50).fov).toBe(50);
  });
  it("the wheel zooms the field of view between 30° and 90°; wheel down widens it", () => {
    expect(zoomFov(70, 100)).toBeGreaterThan(70);
    expect(zoomFov(70, -100)).toBeLessThan(70);
    expect(zoomFov(35, -1e5)).toBe(FOV_MIN);
    expect(zoomFov(85, 1e5)).toBe(FOV_MAX);
    expect([FOV_MIN, FOV_MAX]).toEqual([30, 90]);
  });
  it("pinching apart zooms in, together zooms out, by the same law as the wheel", () => {
    expect(zoomFov(70, pinchDelta(100, 200))).toBeCloseTo(35, 6);
    expect(zoomFov(70, pinchDelta(200, 100))).toBe(FOV_MAX);
    expect(pinchDelta(100, 100)).toBeCloseTo(0, 9);
  });
});

describe("keys", () => {
  it("0 re-centres, Q/E turn, R/F look up and down; other keys are not ours", () => {
    expect(keyAction("0")).toEqual({ type: "reset" });
    expect(keyAction("q")).toEqual({ type: "nudge", h: -1, v: 0 });
    expect(keyAction("E")).toEqual({ type: "nudge", h: 1, v: 0 });
    expect(keyAction("r")).toEqual({ type: "nudge", h: 0, v: 1 });
    expect(keyAction("f")).toEqual({ type: "nudge", h: 0, v: -1 });
    expect(keyAction("+")).toEqual({ type: "zoom", dir: 1 });
    expect(keyAction("-")).toEqual({ type: "zoom", dir: -1 });
    expect(keyAction("v")).toBeNull();
    expect(keyAction("ArrowLeft")).toBeNull();
  });
  it("on the player's eyes: E turns right, R looks up (clamped), 0 re-centres", () => {
    expect(applyKey("eyes", HOME, keyAction("e"), CTX).look.yaw).toBeCloseTo(-KEY_STEP, 9);
    let s = HOME;
    for (let i = 0; i < 50; i++) s = applyKey("eyes", s, keyAction("r"), CTX);
    expect(s.look.pitch).toBe(PITCH_MAX);
    s = applyKey("eyes", { ...s, fov: 50 }, keyAction("0"), CTX);
    expect(s.look).toEqual(LOOK_HOME);
    expect(s.fov).toBe(EYES_FOV);
  });
  it("0 only resets the camera in use", () => {
    const dirty = { look: { yaw: 1, pitch: 0.2 }, fov: 50, orbit: { azimuth: 1, elevation: 0.1, zoom: 0.5 }, tac: { x: 3, y: 2, zoom: 2 } };
    const r = applyKey("orbit", dirty, keyAction("0"), CTX);
    expect(r.orbit).toEqual(ORBIT_HOME);
    expect(r.look).toEqual(dirty.look);
    expect(r.tac).toEqual(dirty.tac);
    expect(applyKey("tactical", dirty, keyAction("0"), CTX).tac).toEqual(TAC_HOME);
  });
  it("+ and − zoom the camera in use", () => {
    expect(applyKey("eyes", HOME, keyAction("+"), CTX).fov).toBeLessThan(EYES_FOV);
    expect(applyKey("orbit", HOME, keyAction("+"), CTX).orbit.zoom).toBeLessThan(1);
    expect(applyKey("orbit", HOME, keyAction("e"), CTX).orbit.azimuth).toBeGreaterThan(0);
    expect(applyKey("tactical", HOME, keyAction("+"), CTX).tac.zoom).toBeGreaterThan(1);
  });
});

describe("stadium orbit", () => {
  const base = broadcastPose([20, 4]);
  it("no offset leaves the stadium camera where it was", () => {
    const p = orbitPose(base, ORBIT_HOME);
    near(p.position, base.position);
    near(p.target, base.target);
    expect(p.fov).toBe(base.fov);
  });
  it("orbits around the target at a constant distance; drag right moves the camera left", () => {
    expect(dragOrbit(ORBIT_HOME, 200, 0, 600, elevationOf(base)).azimuth).toBeLessThan(0);
    const p = orbitPose(base, { azimuth: 1.2, elevation: 0, zoom: 1 });
    const dist = (q) => Math.hypot(...q.position.map((v, i) => v - base.target[i]));
    expect(dist(p)).toBeCloseTo(dist(base), 6);
    expect(p.position[1]).toBeCloseTo(base.position[1], 6); // same height
    near(p.target, base.target);
  });
  it("the elevation is clamped between 8° and 85° whatever the drag", () => {
    const e0 = elevationOf(base);
    const low = orbitPose(base, clampOrbit({ azimuth: 0, elevation: -9, zoom: 1 }, e0));
    const high = orbitPose(base, clampOrbit({ azimuth: 0, elevation: 9, zoom: 1 }, e0));
    expect(deg(elevationOf(low))).toBeCloseTo(8, 4);
    expect(deg(elevationOf(high))).toBeCloseTo(85, 4);
    expect(deg(elevationOf(orbitPose(base, dragOrbit(ORBIT_HOME, 0, -1e6, 600, e0))))).toBeGreaterThanOrEqual(8 - 1e-6);
    expect(low.position[1]).toBeGreaterThan(0); // never below the grass
  });
  it("the wheel moves the camera in and out, between 0.35 and 1.8 times the distance", () => {
    expect(zoomOrbit(ORBIT_HOME, -100).zoom).toBeLessThan(1);
    expect(zoomOrbit(ORBIT_HOME, 100).zoom).toBeGreaterThan(1);
    expect(zoomOrbit(ORBIT_HOME, -1e5).zoom).toBe(ORBIT_ZOOM_MIN);
    expect(zoomOrbit(ORBIT_HOME, 1e5).zoom).toBe(ORBIT_ZOOM_MAX);
    const dist = (q) => Math.hypot(...q.position.map((v, i) => v - base.target[i]));
    expect(dist(orbitPose(base, { azimuth: 0, elevation: 0, zoom: 0.5 }))).toBeCloseTo(dist(base) / 2, 6);
  });
});

describe("tactical pan and zoom", () => {
  const aspect = 2, ext = tacticalExtent(aspect);
  it("at zoom 1 the whole pitch is in view, so there is nothing to pan to", () => {
    expect(panTactical(TAC_HOME, 300, 300, aspect, 400)).toEqual(TAC_HOME);
  });
  it("zoomed in, a drag moves the grass with the finger (the view centre goes the other way)", () => {
    const z = { x: 0, y: 0, zoom: 2 };
    const p = panTactical(z, 100, 0, aspect, 400); // 2 * 38 / 2 / 400 = 0.095 m per px
    expect(p.x).toBeCloseTo(-9.5, 6);
    expect(p.y).toBe(0);
    expect(panTactical(z, 0, 100, aspect, 400).y).toBeGreaterThan(0); // drag down: the view moves up the pitch
  });
  it("the centre never leaves the pitch view; the zoom is 1× to 4×", () => {
    const c = clampTactical({ x: 1e3, y: -1e3, zoom: 2 }, aspect);
    expect(c.x).toBeCloseTo(ext.halfW / 2, 6);
    expect(c.y).toBeCloseTo(-ext.halfH / 2, 6);
    expect(zoomTactical(TAC_HOME, -1e5, aspect).zoom).toBe(TAC_ZOOM_MAX);
    expect(zoomTactical(TAC_HOME, 1e5, aspect).zoom).toBe(1);
    expect(zoomTactical({ x: 40, y: 20, zoom: 4 }, 1e5, aspect)).toEqual(TAC_HOME); // zooming out pulls the centre back in
  });
  it("the pose looks straight down at the centre, with the same ground extent divided by the zoom", () => {
    const p = tacticalPose(aspect, { x: 10, y: 5, zoom: 2 });
    near(p.target, [10, 0, -5]);
    expect(p.position[0]).toBeCloseTo(10, 9);
    expect(p.position[1] * Math.tan((p.fov * Math.PI) / 360)).toBeCloseTo(19, 9);
    near(tacticalPose(aspect).target, [0, 0, 0]);
  });
});

describe("inertia", () => {
  it("fades out exponentially and dies below 20 px/s", () => {
    expect(decayVelocity([300, 0], 0.3)[0]).toBeCloseTo(300 * Math.exp(-1), 6);
    expect(inertiaAlive([300, 0])).toBe(true);
    expect(inertiaAlive([10, 10])).toBe(false);
  });
  it("estimates the release speed from the last moves", () => {
    const v = blendVelocity([0, 0], 10, 0, 0.01); // 1000 px/s
    expect(v[0]).toBeGreaterThan(0);
    expect(v[0]).toBeLessThanOrEqual(1000);
    expect(blendVelocity([500, 0], 0, 0, 0)).toEqual([500, 0]); // no time passed: no new information
  });
});
