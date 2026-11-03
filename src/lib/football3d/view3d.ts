// The football replay's 3D view (phase 3). FootballReplay.astro loads it with import() the first time the visitor asks
// for 3D, so three.js never weighs on the 2D page.
// It renders only when:
// - the replay clock moves (show)
// - the camera mode or the followed player changes
// - a camera is still easing (a flight, the stadium camera catching the ball, the eyes camera turning)
// The visitor steers with a pointer (drag, wheel, pinch, double tap), with keys when the stage has focus (key()), or
// with reset(); controls.ts holds the maths. Eyes: free look on top of the player's own direction, the camera stays at
// his head. Stadium: orbit round the aim point. Tactical: pan and zoom. A drag shorter than DRAG_PX is a tap (onTap).
// Each steering input requests one render; a flick keeps turning for a moment unless the visitor prefers reduced motion.
// The pixel ratio is capped at MAX_DPR. Each open gets its own canvas: dispose() frees the GPU memory, drops the WebGL
// context and removes the canvas, because a lost context cannot be reused.
import { CanvasTexture, OrthographicCamera, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import type { Vec } from "../coach/geometry";
import {
  LOOK_TAU, broadcastPose, ease, eyesPose, flightSeconds, followBall, lerpPose, lookDirection, settled, smoothDirection,
  tacticalExtent, tacticalPose, type CameraMode, type Pose,
} from "./camera";
import {
  DOUBLE_TAP_MS, DOUBLE_TAP_PX, EYES_FOV, LOOK_HOME, ORBIT_HOME, TAC_HOME, applyKey, blendVelocity, clampTactical,
  decayVelocity, dragLook, dragOrbit, elevationOf, inertiaAlive, isDrag, keyAction, orbitPose, panTactical, pinchDelta,
  wrapAngle, zoomFov, zoomOrbit, zoomTactical, type ControlKind, type LookOffset, type Orbit, type TacticalView, type ViewState,
} from "./controls";
import type { Frame3D } from "./frame";
import { createScene } from "./scene";

export const MAX_DPR = 1.5;
const TACTICAL_SCALE = 2.5; // figures drawn larger in the tactical view, so they read from 140 m up

export interface ViewOptions {
  host: HTMLElement;   // the canvas is created inside it, before the labels overlay
  labels: HTMLElement; // overlay for the arrow labels (aria-hidden: the options are listed in the DOM panel)
  reduced: boolean;    // prefers-reduced-motion: camera changes cut instead of fly
  onRender?: (drawCalls: number) => void;
  onLost?: () => void; // the browser dropped the WebGL context
  onTap?: (clientX: number, clientY: number) => void; // a click or tap that was not a drag (and not the first of a double tap)
  onCamera?: (readout: Record<string, number>) => void; // the visitor's camera offsets, rounded, whenever they change (data-camera-*)
}
export interface View3D {
  readonly canvas: HTMLCanvasElement;
  show(frame: Frame3D): void;
  setMode(mode: CameraMode): void;
  pickAt(clientX: number, clientY: number): number | null;
  /** A key pressed while the stage has focus; true when it steered the camera (the caller then stops it there). */
  key(key: string): boolean;
  /** Back to the usual view of the camera in use. */
  reset(): void;
  dispose(): void;
}

/** White shirt numbers 0–99 with a dark outline, 10 x 10 cells, drawn here (no image from the web). */
function numberAtlas(): CanvasTexture {
  const c = document.createElement("canvas"), cell = 64;
  c.width = c.height = cell * 10;
  const g = c.getContext("2d")!;
  g.font = `700 ${Math.round(cell * 0.62)}px system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = cell * 0.14; g.strokeStyle = "#0d0e10"; g.fillStyle = "#ffffff";
  for (let n = 0; n < 100; n++) {
    const x = ((n % 10) + 0.5) * cell, y = (Math.floor(n / 10) + 0.5) * cell;
    g.strokeText(String(n), x, y);
    g.fillText(String(n), x, y);
  }
  return new CanvasTexture(c);
}

export function createView3D(o: ViewOptions): View3D {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "3D view of the pitch");
  o.host.prepend(canvas);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  } catch (e) {
    canvas.remove();
    throw e;
  }
  renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
  const atlas = numberAtlas(), world = createScene(atlas);
  const persp = new PerspectiveCamera(38, 1.5, 0.3, 600);
  const ortho = new OrthographicCamera(-1, 1, 1, -1, 1, 400);
  ortho.position.set(0, 200, 0); ortho.up.set(0, 0, -1); ortho.lookAt(0, 0, 0);
  let active: PerspectiveCamera | OrthographicCamera = persp;
  let mode: CameraMode = "broadcast", frame: Frame3D | null = null, focus: Vec | null = null, look: Vec = [1, 0];
  let current: Pose | null = null, scale = 1, raf = 0, last = 0, disposed = false;
  let fly: { from: Pose; start: number; seconds: number; scale: number } | null = null;
  const tip = new Vector3();
  let look0: LookOffset = LOOK_HOME, fov0 = EYES_FOV, orbit0: Orbit = ORBIT_HOME, tac0: TacticalView = TAC_HOME;
  let inertia: [number, number] = [0, 0], lastReadout = "";
  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);

  function livePose(dt: number): { pose: Pose; moving: boolean } {
    if (mode === "tactical") return { pose: tacticalPose(aspect(), tac0), moving: false };
    if (mode === "eyes" && frame?.focus) {
      const f = frame.focus, want = lookDirection(f.vel, f.at, frame.ball, look);
      look = smoothDirection(look, want, dt, LOOK_TAU);
      return { pose: eyesPose(f.at, look, look0, fov0), moving: !settled(look, want, 0.01) };
    }
    const ball: Vec = frame?.ball ?? focus ?? [0, 0]; // eyes without a player on the pitch: the stadium camera
    focus = focus ? followBall(focus, ball, dt) : ball;
    return { pose: orbitPose(broadcastPose(focus), orbit0), moving: !settled(focus, ball) };
  }

  // ---- steering ----
  /** Which camera the visitor's input drives now (eyes without a player on the pitch is the stadium camera). */
  const kind = (): ControlKind => (mode === "tactical" ? "tactical" : mode === "eyes" && frame?.focus ? "eyes" : "orbit");
  const baseElev = () => elevationOf(broadcastPose(focus ?? frame?.ball ?? [0, 0]));
  const state = (): ViewState => ({ look: look0, fov: fov0, orbit: orbit0, tac: tac0 });
  function setState(s: ViewState) { look0 = s.look; fov0 = s.fov; orbit0 = s.orbit; tac0 = s.tac; request(); }
  function drag(dx: number, dy: number) {
    const h = canvas.clientHeight, k = kind();
    if (k === "eyes") look0 = dragLook(look0, dx, dy, fov0, h);
    else if (k === "orbit") orbit0 = dragOrbit(orbit0, dx, dy, h, baseElev());
    else tac0 = panTactical(tac0, dx, dy, aspect(), h);
  }
  function zoom(wheel: number) {
    const k = kind();
    if (k === "eyes") fov0 = zoomFov(fov0, wheel);
    else if (k === "orbit") orbit0 = zoomOrbit(orbit0, wheel);
    else tac0 = zoomTactical(tac0, wheel, aspect());
    request();
  }
  function reset() {
    inertia = [0, 0];
    setState(applyKey(kind(), state(), keyAction("0"), { aspect: aspect(), baseElev: baseElev() }));
  }

  /** The offsets as rounded numbers for the data-camera-* attributes: degrees, or a factor for the zooms. */
  function readout() {
    const deg = (r: number) => Math.round((wrapAngle(r) * 180) / Math.PI) + 0, r2 = (n: number) => Math.round(n * 100) / 100;
    const r = {
      yaw: deg(look0.yaw), pitch: deg(look0.pitch), fov: Math.round(fov0),
      azimuth: deg(orbit0.azimuth), elevation: deg(orbit0.elevation), zoom: r2(orbit0.zoom),
      tzoom: r2(tac0.zoom), panx: Math.round(tac0.x) + 0, pany: Math.round(tac0.y) + 0,
    };
    const key = JSON.stringify(r);
    if (key !== lastReadout) { lastReadout = key; o.onCamera?.(r); }
  }

  function place(pose: Pose) {
    persp.position.set(...pose.position);
    persp.up.set(...pose.up);
    persp.lookAt(...pose.target);
    if (persp.fov !== pose.fov) { persp.fov = pose.fov; persp.updateProjectionMatrix(); }
  }

  /** Move the camera one animation frame; true while it is still easing (keep rendering). */
  function step(dt: number, now: number): boolean {
    let flick = false;
    if (inertia[0] || inertia[1]) { // the last flick keeps turning, slower and slower
      drag(inertia[0] * dt, inertia[1] * dt);
      inertia = decayVelocity(inertia, dt);
      if (inertiaAlive(inertia)) flick = true; else inertia = [0, 0];
    }
    tac0 = clampTactical(tac0, aspect());
    const { pose: live, moving } = livePose(dt);
    const goal = mode === "tactical" ? TACTICAL_SCALE : 1;
    let pose = live, flying = false;
    if (fly) {
      const u = (now - fly.start) / (fly.seconds * 1000);
      if (u >= 1) fly = null;
      else { const e = ease(u); pose = lerpPose(fly.from, live, e); scale = fly.scale + (goal - fly.scale) * e; flying = true; }
    }
    if (!flying) scale = goal;
    current = pose;
    if (frame) world.update(frame, mode === "eyes" ? frame.focus?.player ?? null : null, scale, mode === "eyes" && !!frame.focus);
    if (mode === "tactical" && !flying) {
      const e = tacticalExtent(aspect()), halfW = e.halfW / tac0.zoom, halfH = e.halfH / tac0.zoom;
      // the camera looks straight down with +y of the pitch up the screen: the view centre (x, y) is the middle of the frustum
      ortho.left = tac0.x - halfW; ortho.right = tac0.x + halfW; ortho.top = tac0.y + halfH; ortho.bottom = tac0.y - halfH;
      ortho.updateProjectionMatrix();
      active = ortho;
    } else {
      place(pose);
      active = persp;
    }
    return flying || moving || flick;
  }

  function startFly() {
    const seconds = flightSeconds(o.reduced);
    fly = seconds > 0 && current ? { from: current, start: performance.now(), seconds, scale } : null;
  }

  /** Arrow labels: DOM spans at the projected arrow tips; hidden when a tip is off screen or behind the camera. */
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight, arrows = frame?.arrows ?? [];
    while (o.labels.children.length < arrows.length) o.labels.append(document.createElement("span"));
    Array.from(o.labels.children).forEach((el, i) => {
      const span = el as HTMLElement, a = arrows[i];
      if (!a) { span.hidden = true; return; }
      tip.set(a.to[0], 0, -a.to[1]).project(active);
      span.hidden = tip.z < -1 || tip.z > 1 || Math.abs(tip.x) > 1 || Math.abs(tip.y) > 1;
      if (span.hidden) return;
      span.textContent = a.label;
      span.className = a.tone;
      span.style.transform = `translate(${Math.round(((tip.x + 1) / 2) * w + 8)}px, ${Math.round(((1 - tip.y) / 2) * h - 24)}px)`;
    });
  }

  function loop(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const moving = step(dt, now);
    renderer.render(world.scene, active);
    readout();
    placeLabels();
    o.onRender?.(renderer.info.render.calls);
    if (moving) request();
  }
  const request = () => { if (!raf && !disposed) raf = requestAnimationFrame(loop); };

  // ---- pointer: drag steers, a short press is a tap, two fingers pinch, the wheel zooms ----
  canvas.style.touchAction = "none"; // the page does not scroll or zoom under a drag on the 3D view
  const pts = new Map<number, { x: number; y: number }>();
  let press: { id: number; sx: number; sy: number; lx: number; ly: number; lt: number; moved: boolean; vel: [number, number] } | null = null;
  let multi = false, pinchD = 0, tap: { x: number; y: number; t: number } | null = null, tapTimer = 0;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  function tapped(x: number, y: number) {
    const now = performance.now();
    if (tap && now - tap.t < DOUBLE_TAP_MS && Math.hypot(x - tap.x, y - tap.y) < DOUBLE_TAP_PX) { // double click / double tap
      clearTimeout(tapTimer);
      tap = null;
      reset();
      return;
    }
    tap = { x, y, t: now };
    clearTimeout(tapTimer);
    // In the player's eyes a tap picks another player at once; elsewhere it waits a moment, in case it is half of a double tap
    if (kind() === "eyes") o.onTap?.(x, y);
    else tapTimer = window.setTimeout(() => o.onTap?.(x, y), DOUBLE_TAP_MS);
  }
  function down(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    inertia = [0, 0];
    if (pts.size === 1) press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, moved: false, vel: [0, 0] };
    else { multi = true; press = null; pinchD = spread(); }
  }
  function move(e: PointerEvent) {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2) { const d = spread(); zoom(pinchDelta(pinchD, d)); pinchD = d; return; }
    if (!press || press.id !== e.pointerId) return;
    if (!press.moved) {
      if (!isDrag(e.clientX - press.sx, e.clientY - press.sy)) return; // still a click
      press.moved = true;
      canvas.style.cursor = "grabbing";
    }
    const dx = e.clientX - press.lx, dy = e.clientY - press.ly, dt = (e.timeStamp - press.lt) / 1000;
    press.vel = blendVelocity(press.vel, dx, dy, dt);
    press.lx = e.clientX; press.ly = e.clientY; press.lt = e.timeStamp;
    drag(dx, dy);
    request();
  }
  function up(e: PointerEvent) {
    if (!pts.delete(e.pointerId)) return;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    canvas.style.cursor = "";
    const pr = press;
    if (pr && pr.id === e.pointerId) {
      press = null;
      if (!pr.moved) { if (e.type === "pointerup" && !multi) tapped(e.clientX, e.clientY); }
      else if (!o.reduced && e.type === "pointerup" && e.timeStamp - pr.lt < 80 && inertiaAlive(pr.vel)) { inertia = pr.vel; request(); }
    }
    if (pts.size === 0) multi = false;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault(); // the wheel zooms the 3D view instead of scrolling the page while the pointer is over it
    zoom(Math.max(-300, Math.min(300, e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1))));
  }
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });

  const ro = new ResizeObserver(() => {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    request();
  });
  ro.observe(canvas);
  const lost = (e: Event) => { e.preventDefault(); o.onLost?.(); };
  canvas.addEventListener("webglcontextlost", lost);

  return {
    canvas,
    show(f) {
      const before = frame?.focus?.player ?? null, now = f.focus?.player ?? null;
      frame = f;
      if (mode === "eyes" && now !== null && now !== before) {
        look0 = LOOK_HOME; // another player: his own direction first
        look = lookDirection(f.focus!.vel, f.focus!.at, f.ball, look); // face his way at once
        if (before !== null) startFly(); // another player: fly over (setMode already started the flight into eyes)
      }
      request();
    },
    setMode(next) {
      if (next === mode) return;
      startFly();
      if (next === "eyes") look0 = LOOK_HOME;
      mode = next;
      request();
    },
    pickAt(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return world.pick([((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1)], active);
    },
    key(k) {
      const a = keyAction(k);
      if (!a) return false;
      inertia = [0, 0]; // a key stops a flick that is still turning
      setState(applyKey(kind(), state(), a, { aspect: aspect(), baseElev: baseElev() }));
      return true;
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(tapTimer);
      for (const [t, h] of [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]] as const) canvas.removeEventListener(t, h as EventListener);
      canvas.removeEventListener("wheel", wheel);
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      world.dispose();
      atlas.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      o.labels.replaceChildren();
    },
  };
}
