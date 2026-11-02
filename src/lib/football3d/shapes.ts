// Flat shapes for the 3D pitch, in pitch metres (x along the length, y across, centre spot = origin):
// - the line markings, as polylines
// - polylines turned into ground ribbons (triangles)
// - the coach's arrows, as triangles
// - the cell of a shirt number in the 10 x 10 number atlas
// No three.js here, so it is unit-tested in Node; scene.ts lifts the [x, y] pairs to the world as (x, height, -y).
import { HALF_LENGTH, HALF_WIDTH, type Vec } from "../coach/geometry";

const L = HALF_LENGTH, W = HALF_WIDTH;
export const LINE_W = 0.12; // markings are 12 cm wide

function arc(c: Vec, r: number, a0: number, a1: number, n: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

/** Every line marking of a 105 x 68 m pitch as polylines (closed shapes repeat their first point). */
export function pitchMarkings(): Vec[][] {
  const out: Vec[][] = [
    [[-L, -W], [L, -W], [L, W], [-L, W], [-L, -W]], // touchlines and goal lines
    [[0, -W], [0, W]],                              // halfway line
    arc([0, 0], 9.15, 0, 2 * Math.PI, 64),          // centre circle
    arc([0, 0], 0.2, 0, 2 * Math.PI, 12),           // centre spot
  ];
  const a = Math.acos(5.5 / 9.15); // the penalty area's line is 16.5 - 11 = 5.5 m in front of the spot
  for (const s of [-1, 1]) {
    const g = s * L;
    out.push([[g, -20.16], [s * (L - 16.5), -20.16], [s * (L - 16.5), 20.16], [g, 20.16]]); // penalty area
    out.push([[g, -9.16], [s * (L - 5.5), -9.16], [s * (L - 5.5), 9.16], [g, 9.16]]);       // goal area
    out.push(arc([s * (L - 11), 0], 0.2, 0, 2 * Math.PI, 12));                              // penalty spot
    out.push(s > 0 ? arc([L - 11, 0], 9.15, Math.PI - a, Math.PI + a, 24) : arc([-L + 11, 0], 9.15, -a, a, 24)); // penalty arc
    for (const t of [-1, 1]) {
      const a0 = s > 0 ? Math.PI : 0; // corner arcs: the 1 m quarter circle inside the pitch
      out.push(arc([g, t * W], 1, a0, a0 + (s * t > 0 ? Math.PI / 2 : -Math.PI / 2), 8));
    }
  }
  return out;
}

/** Polylines as flat ribbons `width` wide: two triangles per segment, [x, y] per vertex (12 numbers per segment). */
export function ribbon(lines: Vec[][], width = LINE_W): Float32Array {
  const segs = lines.reduce((n, l) => n + Math.max(0, l.length - 1), 0), out = new Float32Array(segs * 12);
  let k = 0;
  for (const l of lines) for (let i = 0; i + 1 < l.length; i++) {
    const [ax, ay] = l[i], [bx, by] = l[i + 1], len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * (width / 2), ny = ((bx - ax) / len) * (width / 2);
    out.set([ax + nx, ay + ny, ax - nx, ay - ny, bx + nx, by + ny, bx + nx, by + ny, ax - nx, ay - ny, bx - nx, by - ny], k);
    k += 12;
  }
  return out;
}

/** A flat arrow from `from` to `to`: a shaft `width` wide and a head (at most half the arrow) 4 × width wide.
 *  3 triangles, [x, y] per vertex (18 numbers); vertex 6 is the tip. */
export function arrowTriangles(from: Vec, to: Vec, width = 0.35, head = 1.6): Float32Array {
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, w = width / 2, hw = width * 2;
  const h = Math.min(head, len / 2), bx = to[0] - ux * h, by = to[1] - uy * h;
  return new Float32Array([
    from[0] + nx * w, from[1] + ny * w, from[0] - nx * w, from[1] - ny * w, bx + nx * w, by + ny * w,
    bx + nx * w, by + ny * w, from[0] - nx * w, from[1] - ny * w, bx - nx * w, by - ny * w,
    to[0], to[1], bx + nx * hw, by + ny * hw, bx - nx * hw, by - ny * hw,
  ]);
}

/** Cell [column, row counted from the bottom] of shirt number n (0–99) in the 10 x 10 atlas drawn row by row from the
 *  top-left (texture v grows upwards). Numbers above 99 share the last cell. */
export function atlasCell(n: number): Vec {
  const k = Math.max(0, Math.min(99, Math.round(n)));
  return [k % 10, 9 - Math.floor(k / 10)];
}
