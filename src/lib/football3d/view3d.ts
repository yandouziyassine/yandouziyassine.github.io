// The football replay's 3D view (phase 3). FootballReplay.astro loads it with import() the first time the visitor asks
// for 3D, so three.js never weighs on the 2D page.
// It renders only when:
// - the replay clock moves (show)
// - the camera mode or the followed player changes
// - a camera is still easing (a flight, the stadium camera catching the ball, the eyes camera turning)
// The pixel ratio is capped at MAX_DPR. Each open gets its own canvas: dispose() frees the GPU memory, drops the WebGL
// context and removes the canvas, because a lost context cannot be reused.
import { CanvasTexture, OrthographicCamera, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import type { Vec } from "../coach/geometry";
import {
  LOOK_TAU, broadcastPose, ease, eyesPose, flightSeconds, followBall, lerpPose, lookDirection, settled, smoothDirection,
  tacticalExtent, tacticalPose, type CameraMode, type Pose,
} from "./camera";
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
}
export interface View3D {
  readonly canvas: HTMLCanvasElement;
  show(frame: Frame3D): void;
  setMode(mode: CameraMode): void;
  pickAt(clientX: number, clientY: number): number | null;
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
  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);

  function livePose(dt: number): { pose: Pose; moving: boolean } {
    if (mode === "tactical") return { pose: tacticalPose(aspect()), moving: false };
    if (mode === "eyes" && frame?.focus) {
      const f = frame.focus, want = lookDirection(f.vel, f.at, frame.ball, look);
      look = smoothDirection(look, want, dt, LOOK_TAU);
      return { pose: eyesPose(f.at, look), moving: !settled(look, want, 0.01) };
    }
    const ball: Vec = frame?.ball ?? focus ?? [0, 0]; // eyes without a player on the pitch: the stadium camera
    focus = focus ? followBall(focus, ball, dt) : ball;
    return { pose: broadcastPose(focus), moving: !settled(focus, ball) };
  }

  function place(pose: Pose) {
    persp.position.set(...pose.position);
    persp.up.set(...pose.up);
    persp.lookAt(...pose.target);
    if (persp.fov !== pose.fov) { persp.fov = pose.fov; persp.updateProjectionMatrix(); }
  }

  /** Move the camera one animation frame; true while it is still easing (keep rendering). */
  function step(dt: number, now: number): boolean {
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
    if (frame) world.update(frame, mode === "eyes" ? frame.focus?.player ?? null : null, scale);
    if (mode === "tactical" && !flying) {
      const { halfW, halfH } = tacticalExtent(aspect());
      ortho.left = -halfW; ortho.right = halfW; ortho.top = halfH; ortho.bottom = -halfH;
      ortho.updateProjectionMatrix();
      active = ortho;
    } else {
      place(pose);
      active = persp;
    }
    return flying || moving;
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
    placeLabels();
    o.onRender?.(renderer.info.render.calls);
    if (moving) request();
  }
  const request = () => { if (!raf && !disposed) raf = requestAnimationFrame(loop); };

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
        look = lookDirection(f.focus!.vel, f.focus!.at, f.ball, look); // face his way at once
        if (before !== null) startFly(); // another player: fly over (setMode already started the flight into eyes)
      }
      request();
    },
    setMode(next) {
      if (next === mode) return;
      startFly();
      mode = next;
      request();
    },
    pickAt(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return world.pick([((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1)], active);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
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
