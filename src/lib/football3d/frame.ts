// What the football replay's 3D view draws at one moment (phase 3), from the same clock and data as the 2D pitch:
// - the figures, with team colour and shirt number
// - the ball and its height
// - the ball carrier
// - the coach's arrows
// - the ball trail
// - for the player's-eyes camera, the followed player's position and speed
// Pure (no three.js), so it is unit-tested in Node. z<i>.bin (library coach/export.py) is the ball's height per frame,
// int16 cm, -32768 = unknown.
import type { Vec } from "../coach/geometry";
import { ABSENT, frameDots, trail, velocityAt, type HalfData, type MatchMeta } from "../coach/replay";

export const BALL_R = 0.11; // m: the ball's radius, so the height of its centre when it rests on the grass
const NO_TEAM = "#777777";  // players who are not on the match sheet (grey, as in 2D)

export type Tone = "best" | "pick" | "other";
export interface ArrowSpec { from: Vec; to: Vec; label: string; tone: Tone; why?: string }
/** A ghost (coach insight B): where a teammate (run) or a defender would stand, drawn faint with a dashed path and a label. */
export interface GhostSpec { from: Vec; to: Vec; colour: string; label: string; kind: "run" | "defender" }
export interface Figure { player: number; at: Vec; team: number; shirt: number; colour: string }
export interface Frame3D {
  figures: Figure[]; ball: Vec | null; ballH: number; carrier: number | null; arrows: ArrowSpec[]; ghosts: GhostSpec[]; trail: Vec[];
  focus: { player: number; at: Vec; vel: Vec } | null;
}
export interface FrameInput { t: number; z: Int16Array | null; carrier: number | null; arrows: ArrowSpec[]; ghosts?: GhostSpec[]; focus: number | null; trail: boolean }
export interface EyesChoice { player: number; label: string }

export function decodeBallZ(buf: ArrayBuffer, frames: number): Int16Array {
  if (buf.byteLength !== frames * 2) throw new Error(`ball height file has ${buf.byteLength} bytes, expected ${frames * 2}`);
  return new Int16Array(buf);
}

/** The ball centre's height (m) at a fractional frame; the resting height without a file or below it. */
export function ballHeight(z: Int16Array | null, t: number): number {
  if (!z || !z.length) return BALL_R;
  const last = z.length - 1, f0 = Math.max(0, Math.min(last, Math.floor(t))), f1 = Math.min(last, f0 + 1);
  const a = Math.max(0, Math.min(1, t - f0)), v0 = z[f0], v1 = z[f1];
  const cm = v0 === ABSENT ? (v1 === ABSENT ? 0 : v1) : v1 === ABSENT ? v0 : v0 + (v1 - v0) * a;
  return Math.max(BALL_R, cm / 100);
}

export function buildFrame(m: MatchMeta, h: HalfData, inp: FrameInput): Frame3D {
  const { players, ball } = frameDots(h, inp.t);
  const figures = players.map(({ player, at }): Figure => {
    const p = m.players[player];
    return { player, at, team: p.team, shirt: p.shirt, colour: p.team === 0 || p.team === 1 ? m.meta.colors[p.team] : NO_TEAM };
  });
  const f = inp.focus === null ? undefined : figures.find((x) => x.player === inp.focus);
  return {
    figures, ball, ballH: ballHeight(inp.z, inp.t), carrier: inp.carrier, arrows: inp.arrows, ghosts: inp.ghosts ?? [],
    trail: inp.trail ? trail(h, inp.t, m.fps) : [],
    focus: f ? { player: f.player, at: f.at, vel: velocityAt(h, Math.floor(inp.t), f.player, m.fps) } : null,
  };
}

/** Players of either team who appear in this half, home first, by shirt number: the "Whose eyes" menu. */
export function eyesChoices(m: MatchMeta, h: HalfData): EyesChoice[] {
  return h.info.slots
    .filter((p) => m.players[p].team === 0 || m.players[p].team === 1)
    .sort((a, b) => m.players[a].team - m.players[b].team || m.players[a].shirt - m.players[b].shirt || a - b)
    .map((p) => {
      const i = m.players[p];
      return { player: p, label: `#${i.shirt} ${i.name} (${i.team ? m.meta.guest : m.meta.home})` };
    });
}
