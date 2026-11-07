// The football replay's 3D scene (phase 3). It contains the pitch, the goals, low-poly players with team colours and
// shirt numbers, the ball at its tracked height, the coach's arrows and the ball trail.
// It is built from three.js objects only (no renderer, no DOM), so Node tests can count its draw calls, update it and
// pick players. Pitch metres map to three.js world units as (x, y, height) -> (x, height, -y): +x to the right and +y
// away from the stadium camera, as on the 2D pitch.
// 16 draw calls whatever the number of players (3 of them are the ghosts, empty unless the visitor shows them): each body part is one instanced mesh, and the shirt numbers are
// billboards sampling a 10 x 10 number atlas.
import {
  BufferAttribute, BufferGeometry, CapsuleGeometry, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  DynamicDrawUsage, HemisphereLight, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Line, LineBasicMaterial, LineSegments,
  Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Plane, PlaneGeometry, Quaternion, Raycaster, RingGeometry, Scene,
  ShaderMaterial, SphereGeometry, Vector2, Vector3, type Camera, type Material, type Texture,
} from "three";
import { GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, type Vec } from "../coach/geometry";
import type { Frame3D, Tone } from "./frame";
import { arrowTriangles, atlasCell, eyesArrow, pitchMarkings, ribbon } from "./shapes";

export const MAX_FIGURES = 40;  // instances per body part (22 on the pitch; spare room for data with more slots)
export const BODY_Y = 0.78;     // capsule centre: a 1.0 m cylinder + two 0.28 m caps = 1.56 m tall
export const HEAD_Y = 1.7;
export const NUMBER_Y = 2.3;
export const BALL_VIS_R = 0.22; // drawn at twice its real radius so it can be seen from the stand
export const PICK_M = 2.5;      // a tap on the grass this close to a player picks him
const GOAL_H = 2.44, MAX_TRAIL = 32, MAX_ARROWS = 4, MAX_GHOST_FIGURES = 6, DASH = 0.6, GAP = 0.5, MAX_DASHES = 14;
export const GHOST_OPACITY = 0.35;
const TONES: Record<Tone, string> = { best: "#ff5b1f", pick: "#7fd18b", other: "#ecebe6" }; // --signal, --ok, --ink

const NUMBER_VS = /* glsl */ `
attribute vec2 aCell;
uniform float uSize;
varying vec2 vUv;
void main() {
  float k = length(instanceMatrix[0].xyz); // the instance's scale: 0 hides it
  vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  centre.xy += position.xy * uSize * k;    // billboard: always faces the camera
  gl_Position = projectionMatrix * centre;
  vUv = (aCell + uv) / 10.0;
}`;
const NUMBER_FS = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a < 0.35) discard;
  gl_FragColor = c;
}`;

export interface Scene3D {
  scene: Scene;
  parts: { bodies: InstancedMesh; heads: InstancedMesh; numbers: InstancedMesh; shadows: InstancedMesh; ring: Mesh; ball: Mesh; arrows: Mesh; trail: Line; ghostBodies: InstancedMesh; ghostHeads: InstancedMesh; ghostPaths: LineSegments };
  /** Place everything for this frame; `hide` = the player whose eyes we look through; `scale` enlarges the figures;
   *  `eyes` draws the arrows as thin ribbons that start 2.5 m ahead (the camera stands where they start). */
  update(frame: Frame3D, hide: number | null, scale?: number, eyes?: boolean): void;
  /** The player under a point in normalised device coordinates ([-1, 1], y up), or null. */
  pick(ndc: Vec, camera: Camera): number | null;
  dispose(): void;
}

const flat = <T extends BufferGeometry>(g: T): T => { g.rotateX(-Math.PI / 2); return g; };

export function createScene(atlas: Texture | null): Scene3D {
  const scene = new Scene();
  scene.background = new Color("#0d0e10");
  const sun = new DirectionalLight(0xffffff, 1.5);
  sun.position.set(-30, 60, 40);
  scene.add(new HemisphereLight(0xffffff, 0x1d2b1f, 1.8), sun);

  const ground = (w: number, d: number, colour: string, y: number) => {
    const mesh = new Mesh(flat(new PlaneGeometry(w, d)), new MeshLambertMaterial({ color: colour }));
    mesh.position.y = y;
    return mesh;
  };
  const surround = ground(2 * HALF_LENGTH + 24, 2 * HALF_WIDTH + 24, "#12261b", -0.02);
  const grass = ground(2 * HALF_LENGTH + 6, 2 * HALF_WIDTH + 6, "#183224", -0.01);

  const flatLines = ribbon(pitchMarkings()), linePos = new Float32Array((flatLines.length / 2) * 3);
  for (let i = 0, j = 0; i < flatLines.length; i += 2, j += 3) linePos.set([flatLines[i], 0.005, -flatLines[i + 1]], j);
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(linePos, 3));
  const lines = new Mesh(lineGeo, new MeshBasicMaterial({ color: "#d9d8d2", side: DoubleSide }));

  const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), colour = new Color();
  const goals = new InstancedMesh(new CylinderGeometry(0.06, 0.06, 1, 8), new MeshLambertMaterial({ color: "#ffffff" }), 6);
  const bar = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2); // cylinder axis y -> world z (pitch y)
  let gi = 0;
  for (const side of [-1, 1]) {
    const x = side * HALF_LENGTH;
    for (const y of [-GOAL_HALF_WIDTH, GOAL_HALF_WIDTH]) goals.setMatrixAt(gi++, m.compose(p.set(x, GOAL_H / 2, -y), q.identity(), s.set(1, GOAL_H, 1)));
    goals.setMatrixAt(gi++, m.compose(p.set(x, GOAL_H, 0), bar, s.set(1, 2 * GOAL_HALF_WIDTH, 1)));
  }

  const figureMesh = (geometry: BufferGeometry, material: Material) => {
    const mesh = new InstancedMesh(geometry, material, MAX_FIGURES);
    mesh.count = 0;
    mesh.frustumCulled = false; // the instances move every frame; not worth bounds for culling
    return mesh;
  };
  const shadowMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  const shadows = figureMesh(flat(new CircleGeometry(0.45, 12)), shadowMat);
  const bodies = figureMesh(new CapsuleGeometry(0.28, 1.0, 4, 8), new MeshLambertMaterial({ color: 0xffffff }));
  for (let i = 0; i < MAX_FIGURES; i++) bodies.setColorAt(i, colour.set(0xffffff)); // instance colours exist before the first render
  const heads = figureMesh(new SphereGeometry(0.14, 10, 8), new MeshLambertMaterial({ color: "#d8d6cf" }));
  const cells = new InstancedBufferAttribute(new Float32Array(MAX_FIGURES * 2), 2);
  const numberGeo = new PlaneGeometry(1, 1);
  numberGeo.setAttribute("aCell", cells);
  const numbers = figureMesh(numberGeo, new ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uSize: { value: 0.75 } }, vertexShader: NUMBER_VS, fragmentShader: NUMBER_FS,
  }));

  const ring = new Mesh(flat(new RingGeometry(0.55, 0.75, 24)), new MeshBasicMaterial({ color: TONES.best }));
  ring.visible = false;
  const ball = new Mesh(new IcosahedronGeometry(BALL_VIS_R, 1), new MeshLambertMaterial({ color: "#ffffff" }));
  ball.visible = false;
  const ballShadow = new Mesh(flat(new CircleGeometry(0.3, 16)), shadowMat);
  ballShadow.visible = false;

  const arrowPos = new BufferAttribute(new Float32Array(MAX_ARROWS * 9 * 3), 3).setUsage(DynamicDrawUsage);
  const arrowCol = new BufferAttribute(new Float32Array(MAX_ARROWS * 9 * 3), 3).setUsage(DynamicDrawUsage);
  const arrowGeo = new BufferGeometry();
  arrowGeo.setAttribute("position", arrowPos);
  arrowGeo.setAttribute("color", arrowCol);
  arrowGeo.setDrawRange(0, 0);
  const arrows = new Mesh(arrowGeo, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
  arrows.frustumCulled = false;

  const trailPos = new BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3).setUsage(DynamicDrawUsage);
  const trailGeo = new BufferGeometry();
  trailGeo.setAttribute("position", trailPos);
  trailGeo.setDrawRange(0, 0);
  const trail = new Line(trailGeo, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  trail.frustumCulled = false;

  // Ghosts: faint translucent figures where a teammate or a defender would stand, and dashed paths from where he is.
  const ghostMat = (color: number | string) => new MeshLambertMaterial({ color, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
  const ghostMesh = (geometry: BufferGeometry, material: Material) => {
    const mesh = new InstancedMesh(geometry, material, MAX_GHOST_FIGURES);
    mesh.count = 0;
    mesh.frustumCulled = false;
    return mesh;
  };
  const ghostBodies = ghostMesh(new CapsuleGeometry(0.28, 1.0, 4, 8), ghostMat(0xffffff));
  for (let i = 0; i < MAX_GHOST_FIGURES; i++) ghostBodies.setColorAt(i, colour.set(0xffffff));
  const ghostHeads = ghostMesh(new SphereGeometry(0.14, 10, 8), ghostMat("#d8d6cf"));
  const pathPos = new BufferAttribute(new Float32Array(MAX_GHOST_FIGURES * MAX_DASHES * 2 * 3), 3).setUsage(DynamicDrawUsage);
  const pathGeo = new BufferGeometry();
  pathGeo.setAttribute("position", pathPos);
  pathGeo.setDrawRange(0, 0);
  const ghostPaths = new LineSegments(pathGeo, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ghostPaths.frustumCulled = false;

  scene.add(surround, grass, lines, goals, shadows, bodies, heads, numbers, ring, ball, ballShadow, arrows, trail, ghostBodies, ghostHeads, ghostPaths);

  let slots: number[] = [], spots: Vec[] = [], hidden: number | null = null;

  function update(f: Frame3D, hide: number | null, scale = 1, eyes = false) {
    const n = Math.min(MAX_FIGURES, f.figures.length);
    slots = []; spots = []; hidden = hide;
    q.identity();
    for (let i = 0; i < n; i++) {
      const fig = f.figures[i], x = fig.at[0], z = -fig.at[1], k = fig.player === hide ? 0 : scale;
      s.set(k, k, k);
      bodies.setMatrixAt(i, m.compose(p.set(x, BODY_Y * scale, z), q, s));
      bodies.setColorAt(i, colour.set(fig.colour));
      heads.setMatrixAt(i, m.compose(p.set(x, HEAD_Y * scale, z), q, s));
      numbers.setMatrixAt(i, m.compose(p.set(x, NUMBER_Y * scale, z), q, s));
      const [cx, cy] = atlasCell(fig.shirt);
      cells.setXY(i, cx, cy);
      shadows.setMatrixAt(i, m.compose(p.set(x, 0.01, z), q, s));
      slots.push(fig.player);
      spots.push(fig.at);
    }
    for (const mesh of [bodies, heads, numbers, shadows]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
    bodies.instanceColor!.needsUpdate = true;
    cells.needsUpdate = true;
    bodies.computeBoundingSphere(); // for picking

    const c = f.carrier === null ? undefined : f.figures.find((x) => x.player === f.carrier);
    ring.visible = !!c && f.carrier !== hide;
    if (c) { ring.position.set(c.at[0], 0.02, -c.at[1]); ring.scale.setScalar(scale); }

    ball.visible = ballShadow.visible = !!f.ball;
    if (f.ball) {
      ball.scale.setScalar(scale);
      ball.position.set(f.ball[0], Math.max(BALL_VIS_R * scale, f.ballH), -f.ball[1]);
      ballShadow.position.set(f.ball[0], 0.015, -f.ball[1]);
    }

    let v = 0;
    for (const a of f.arrows.slice(0, MAX_ARROWS)) {
      const tri = eyes ? eyesArrow(a.from, a.to) : arrowTriangles(a.from, a.to);
      colour.set(TONES[a.tone]);
      for (let i = 0; i < tri.length; i += 2, v++) {
        arrowPos.setXYZ(v, tri[i], 0.03, -tri[i + 1]);
        arrowCol.setXYZ(v, colour.r, colour.g, colour.b);
      }
    }
    arrowGeo.setDrawRange(0, v);
    arrowPos.needsUpdate = arrowCol.needsUpdate = true;

    const gs = f.ghosts.slice(0, MAX_GHOST_FIGURES);
    let dv = 0;
    q.identity();
    gs.forEach((g, i) => {
      s.set(scale, scale, scale);
      ghostBodies.setMatrixAt(i, m.compose(p.set(g.to[0], BODY_Y * scale, -g.to[1]), q, s));
      ghostBodies.setColorAt(i, colour.set(g.colour));
      ghostHeads.setMatrixAt(i, m.compose(p.set(g.to[0], HEAD_Y * scale, -g.to[1]), q, s));
      const dx = g.to[0] - g.from[0], dy = g.to[1] - g.from[1], len = Math.hypot(dx, dy);
      for (let d = 0, a = 0; a < len && d < MAX_DASHES; d++, a += DASH + GAP, dv += 2) {
        const b = Math.min(len, a + DASH);
        pathPos.setXYZ(dv, g.from[0] + (dx * a) / len, 0.04, -(g.from[1] + (dy * a) / len));
        pathPos.setXYZ(dv + 1, g.from[0] + (dx * b) / len, 0.04, -(g.from[1] + (dy * b) / len));
      }
    });
    ghostBodies.count = ghostHeads.count = gs.length;
    ghostBodies.instanceMatrix.needsUpdate = ghostHeads.instanceMatrix.needsUpdate = true;
    ghostBodies.instanceColor!.needsUpdate = true;
    pathGeo.setDrawRange(0, dv);
    pathPos.needsUpdate = true;

    const tr = f.trail.slice(-MAX_TRAIL);
    tr.forEach((b, i) => trailPos.setXYZ(i, b[0], 0.05, -b[1]));
    trailGeo.setDrawRange(0, tr.length);
    trailPos.needsUpdate = true;
  }

  const ray = new Raycaster(), grassPlane = new Plane(new Vector3(0, 1, 0), 0), onGrass = new Vector3();
  function pick(ndc: Vec, camera: Camera): number | null {
    ray.setFromCamera(new Vector2(ndc[0], ndc[1]), camera);
    const hit = ray.intersectObject(bodies, false) // a hidden (scale 0) instance must never count as a hit
      .find((h) => h.instanceId !== undefined && h.instanceId < slots.length && slots[h.instanceId] !== hidden);
    if (hit) return slots[hit.instanceId!];
    if (!ray.ray.intersectPlane(grassPlane, onGrass)) return null;
    let best: number | null = null, bestD = PICK_M;
    spots.forEach((at, i) => {
      const d = Math.hypot(at[0] - onGrass.x, at[1] + onGrass.z); // world z = -pitch y
      if (slots[i] !== hidden && d <= bestD) { best = slots[i]; bestD = d; }
    });
    return best;
  }

  function dispose() {
    const mats = new Set<Material>();
    scene.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((x) => mats.add(x));
      if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose();
    });
    mats.forEach((x) => x.dispose());
  }

  return { scene, parts: { bodies, heads, numbers, shadows, ring, ball, arrows, trail, ghostBodies, ghostHeads, ghostPaths }, update, pick, dispose };
}
