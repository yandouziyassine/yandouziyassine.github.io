// The 3D scene runs in Node: three.js objects need no WebGL until something renders them.
import { describe, expect, it } from "vitest";
import { Color, Matrix4, OrthographicCamera, PerspectiveCamera } from "three";
import { BALL_VIS_R, createScene } from "../src/lib/football3d/scene.ts";

const fig = (player, x, y, team = 0) => ({ player, at: [x, y], team, shirt: player + 1, colour: team ? "#FFFFFF" : "#9F1922" });
const frame = (over = {}) => ({ figures: [fig(0, 10, 5), fig(1, -20, 0, 1)], ball: [10, 5.5], ballH: 0.11, carrier: 0, arrows: [], trail: [], focus: null, ...over });
const drawables = (scene) => { let n = 0; scene.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) n++; }); return n; };
const scaleOf = (mesh, i) => { const m = new Matrix4(); mesh.getMatrixAt(i, m); return m.elements[0]; };
function above(x, y) { // a perspective camera 30 m straight above pitch point (x, y)
  const cam = new PerspectiveCamera(50, 1.5, 0.3, 600);
  cam.position.set(x, 30, -y); cam.up.set(0, 0, -1); cam.lookAt(x, 0, -y); cam.updateMatrixWorld();
  return cam;
}

describe("3D scene", () => {
  it("draws everything in at most 40 calls, however many players there are", () => {
    const s = createScene(null);
    expect(drawables(s.scene)).toBeLessThanOrEqual(40);
    s.update(frame({ figures: Array.from({ length: 22 }, (_, i) => fig(i, i * 4 - 44, 0, i % 2)) }), null);
    expect(s.parts.bodies.count).toBe(22);
    expect(drawables(s.scene)).toBe(13);
  });
  it("colours each body with its team and hides the player whose eyes we look through", () => {
    const s = createScene(null);
    s.update(frame(), 0);
    expect(scaleOf(s.parts.bodies, 0)).toBe(0);
    expect(scaleOf(s.parts.bodies, 1)).toBe(1);
    const c = new Color();
    s.parts.bodies.getColorAt(1, c);
    expect(c.getHex()).toBe(new Color("#FFFFFF").getHex());
    expect(s.parts.ring.visible).toBe(false); // the carrier ring goes with the hidden carrier
  });
  it("puts the ball at its tracked height, never below its drawn radius", () => {
    const s = createScene(null);
    s.update(frame({ ballH: 3 }), null);
    expect(s.parts.ball.position.y).toBe(3);
    s.update(frame({ ballH: 0.05 }), null);
    expect(s.parts.ball.position.y).toBe(BALL_VIS_R);
    s.update(frame({ ball: null }), null);
    expect(s.parts.ball.visible).toBe(false);
  });
  it("builds one flat arrow (9 vertices) per option and the ball trail", () => {
    const s = createScene(null);
    const arrows = [{ from: [10, 5], to: [30, 0], label: "#9 74 %", tone: "best" }, { from: [10, 5], to: [0, 20], label: "62 %", tone: "other" }];
    s.update(frame({ arrows, trail: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] }), null);
    expect(s.parts.arrows.geometry.drawRange.count).toBe(18);
    expect(s.parts.trail.geometry.drawRange.count).toBe(5);
  });
  it("in the player's eyes the arrows are thin ribbons that start 2.5 m ahead, and the best one stays orange", () => {
    const s = createScene(null);
    const arrows = [{ from: [10, 5], to: [30, 5], label: "best", tone: "best" }, { from: [10, 5], to: [10, 25], label: "other", tone: "other" }];
    const pos = () => s.parts.arrows.geometry.getAttribute("position"), col = () => s.parts.arrows.geometry.getAttribute("color");
    s.update(frame({ arrows }), null, 1, false);
    expect(Math.hypot(pos().getX(0) - 10, pos().getZ(0) + 5)).toBeLessThan(0.3); // normal arrow: starts at the player
    s.update(frame({ arrows }), 0, 1, true);
    expect(s.parts.arrows.geometry.drawRange.count).toBe(18);
    expect(pos().getX(0)).toBeCloseTo(12.5, 5);        // best: 2.5 m along +x, 0.15 m to the side
    expect(Math.abs(pos().getZ(0) + 5)).toBeCloseTo(0.15, 5);
    expect(Math.abs(pos().getZ(1) - pos().getZ(0))).toBeCloseTo(0.3, 5); // shaft 0.3 m wide
    expect(pos().getX(6)).toBeCloseTo(30, 5);          // tip at the target
    const best = new Color("#ff5b1f"), other = new Color("#ecebe6");
    expect(col().getX(0)).toBeCloseTo(best.r, 5);
    expect(col().getY(0)).toBeCloseTo(best.g, 5);
    expect(col().getX(9)).toBeCloseTo(other.r, 5);     // second arrow keeps its own tone
  });
  it("scales the figures up for the tactical view", () => {
    const s = createScene(null);
    s.update(frame(), null, 2.5);
    expect(scaleOf(s.parts.bodies, 0)).toBeCloseTo(2.5, 9);
  });
  it("picks the player under the pointer, or the nearest within 2.5 m of where the ray meets the grass", () => {
    const s = createScene(null);
    s.update(frame(), null);
    const cam = above(10, 5);
    expect(s.pick([0, 0], cam)).toBe(0);     // straight down onto his body
    expect(s.pick([0.05, 0], cam)).toBe(0);  // about 1 m to his side on the grass
    expect(s.pick([0.5, 0], cam)).toBeNull(); // 10 m away: nobody
    const top = new OrthographicCamera(-60, 60, 40, -40, 1, 400);
    top.position.set(0, 200, 0); top.up.set(0, 0, -1); top.lookAt(0, 0, 0); top.updateMatrixWorld();
    expect(s.pick([-20 / 60, 0], top)).toBe(1);
    s.update(frame(), 0);
    expect(s.pick([0, 0], cam)).toBeNull();  // the hidden player cannot be picked
  });
  it("frees every geometry on dispose", () => {
    const s = createScene(null);
    let freed = 0;
    s.scene.traverse((o) => o.geometry?.addEventListener("dispose", () => freed++));
    s.dispose();
    expect(freed).toBe(13);
  });
});

describe("3D view module", () => {
  it("loads without a browser (it touches the DOM only when created)", async () => {
    const v = await import("../src/lib/football3d/view3d.ts");
    expect(typeof v.createView3D).toBe("function");
    expect(v.MAX_DPR).toBe(1.5);
  });
});
