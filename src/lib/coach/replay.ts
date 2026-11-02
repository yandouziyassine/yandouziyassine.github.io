// Replay data for the football demo (project 20): decode the per-half files written by the library's
// coach/export.py, rebuild the coach's frame state exactly like coach/features.py state() at the site's rate, find the
// ball carrier, and interpolate positions for drawing. h<i>.bin: little-endian int16 centimetres; for each frame the
// half's player slots (match.json halves[i].slots, ascending player index), then the ball, each (x, y);
// -32768 = absent. Int16Array reads the platform's byte order: little-endian on every browser that runs this site.
import type { State } from "./features";
import { normalise, type Vec } from "./geometry";

export const ABSENT = -32768;
/** Velocity lag: training used 4 frames at 25 fps (0.16 s), which is 2 frames at 12.5 fps. */
export const BACK_FRAMES = 2;
/** The nearest player of the team in possession has the ball when within this distance of it (m). */
export const CARRIER_M = 2.0;

export interface PlayerInfo { team: number; shirt: number; name: string }
export interface HalfInfo { frames: number; slots: number[]; attack: [number, number] }
export interface MatchEvent {
  type: "pass" | "shot"; half: number | null; frame: number | null; nominal?: number | null; team: number;
  player: number | null; recipient?: number | null; success?: boolean; goal?: boolean; xg?: number | null;
  set_piece?: string | null; cross?: boolean; drop?: string | null;
}
export interface MatchMeta {
  match_id: string; fps: number; halves: HalfInfo[]; players: PlayerInfo[];
  meta: { home: string; guest: string; colors: [string, string] };
  owner: string[]; alive: string[]; events: MatchEvent[]; credit: string;
}
export interface HalfData { info: HalfInfo; data: Int16Array; column: Int16Array; stride: number }
export interface Carrier { player: number; team: number }

export function decodeHalf(buf: ArrayBuffer, info: HalfInfo, players: number): HalfData {
  const stride = (info.slots.length + 1) * 2;
  if (buf.byteLength !== info.frames * stride * 2)
    throw new Error(`half file has ${buf.byteLength} bytes, expected ${info.frames * stride * 2}`);
  const column = new Int16Array(players).fill(-1);
  info.slots.forEach((p, c) => (column[p] = c));
  return { info, data: new Int16Array(buf), column, stride };
}

function read(h: HalfData, frame: number, col: number): Vec | null {
  const i = frame * h.stride + col * 2, x = h.data[i];
  return x === ABSENT ? null : [x / 100, h.data[i + 1] / 100];
}
export const playerAt = (h: HalfData, frame: number, player: number): Vec | null =>
  h.column[player] < 0 ? null : read(h, frame, h.column[player]);
export const ballAt = (h: HalfData, frame: number): Vec | null => read(h, frame, h.info.slots.length);

/** Backward difference over `back` frames (fewer at the start of the half); zero when the player was absent. */
export function velocityAt(h: HalfData, frame: number, player: number, fps: number, back = BACK_FRAMES): Vec {
  const b = Math.max(0, frame - back);
  if (frame <= b) return [0, 0];
  const p = playerAt(h, frame, player), q = playerAt(h, b, player);
  if (!p || !q) return [0, 0];
  const k = fps / (frame - b);
  return [(p[0] - q[0]) * k, (p[1] - q[1]) * k];
}

/** The coach's state for `team` at a frame (coach/features.py state() with fps = 12.5, back_frames = 2). */
export function stateAt(m: MatchMeta, half: number, h: HalfData, frame: number, team: number): State {
  const direction = m.halves[half].attack[team];
  const s: State = { att: [], attV: [], def: [], defV: [], attIdx: [], defIdx: [], ball: [NaN, NaN], direction };
  for (const p of h.info.slots) {
    const pos = playerAt(h, frame, p), t = m.players[p].team;
    if (!pos || (t !== team && t !== 1 - team)) continue; // team -1: not on the match sheet
    const v = velocityAt(h, frame, p, m.fps);
    if (t === team) { s.att.push(normalise(pos, direction)); s.attV.push(normalise(v, direction)); s.attIdx.push(p); }
    else { s.def.push(normalise(pos, direction)); s.defV.push(normalise(v, direction)); s.defIdx.push(p); }
  }
  const ball = ballAt(h, frame);
  if (ball) s.ball = normalise(ball, direction);
  return s;
}

/** Team in possession at a frame: 0 home, 1 guest, -1 unknown. */
export const ownerAt = (m: MatchMeta, half: number, frame: number) => Number(m.owner[half][frame]) - 1;

export function carrierAt(m: MatchMeta, half: number, h: HalfData, frame: number): Carrier | null {
  const team = ownerAt(m, half, frame), ball = ballAt(h, frame);
  if (m.alive[half][frame] !== "1" || team < 0 || !ball) return null;
  let best = -1, bestD = Infinity;
  for (const p of h.info.slots) {
    if (m.players[p].team !== team) continue;
    const pos = playerAt(h, frame, p);
    if (!pos) continue;
    const d = Math.hypot(pos[0] - ball[0], pos[1] - ball[1]);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best >= 0 && bestD <= CARRIER_M ? { player: best, team } : null;
}

/**
 * The frame closest to `frame` (within `maxBack` s before and `maxForward` s after) at which someone has the ball,
 * or null. The ball-carrier rule above is strict on purpose (the library's parity tests depend on it), so a viewer who
 * pauses while the ball is between two players is moved to the nearest moment where the coach has a player to advise.
 * Ties go to the earlier frame; `frame` itself comes first when it has a carrier.
 */
export function nearestCarrierFrame(m: MatchMeta, half: number, h: HalfData, frame: number, maxBack = 2, maxForward = 2): number | null {
  const back = Math.round(maxBack * m.fps), forward = Math.round(maxForward * m.fps), last = h.info.frames - 1;
  for (let d = 0; d <= Math.max(back, forward); d++) {
    if (d <= back && frame - d >= 0 && frame - d <= last && carrierAt(m, half, h, frame - d)) return frame - d;
    if (d > 0 && d <= forward && frame + d >= 0 && frame + d <= last && carrierAt(m, half, h, frame + d)) return frame + d;
  }
  return null;
}

/** Positions at a fractional frame t (linear between frames; a player missing at either end shows at the nearer). */
export function frameDots(h: HalfData, t: number): { players: { player: number; at: Vec }[]; ball: Vec | null } {
  const last = h.info.frames - 1;
  const f0 = Math.max(0, Math.min(last, Math.floor(t))), f1 = Math.min(last, f0 + 1), a = Math.max(0, Math.min(1, t - f0));
  const mix = (p: Vec | null, q: Vec | null): Vec | null => (p && q ? [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a] : a < 0.5 ? p : q);
  const players: { player: number; at: Vec }[] = [];
  for (const p of h.info.slots) {
    const at = mix(playerAt(h, f0, p), playerAt(h, f1, p));
    if (at) players.push({ player: p, at });
  }
  return { players, ball: mix(ballAt(h, f0), ballAt(h, f1)) };
}

/** Ball positions over the last `seconds` up to frame t. */
export function trail(h: HalfData, t: number, fps: number, seconds = 1): Vec[] {
  const f = Math.max(0, Math.min(h.info.frames - 1, Math.floor(t))), out: Vec[] = [];
  for (let i = Math.max(0, f - Math.round(seconds * fps)); i <= f; i++) {
    const b = ballAt(h, i);
    if (b) out.push(b);
  }
  return out;
}

export function clock(half: number, frame: number, fps: number): string {
  const s = Math.floor(frame / fps) + half * 45 * 60;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Frame of an event: the synced frame, else the nominal one (event clock shifted by the half's offset), else null. */
export const eventFrame = (e: Pick<MatchEvent, "frame" | "nominal">): number | null => e.frame ?? e.nominal ?? null;

export interface Marker { half: number; frame: number; kind: "goal" | "shot"; team: number; label: string }

export function markers(m: MatchMeta): Marker[] {
  const out: Marker[] = [];
  for (const e of m.events) {
    const f = eventFrame(e);
    if (e.type !== "shot" || e.half === null || f === null || (e.team !== 0 && e.team !== 1)) continue;
    const p = e.player != null ? m.players[e.player] : undefined;
    const kind = e.goal ? "goal" : "shot";
    const who = p ? ` · #${p.shirt} ${p.name}` : "";
    out.push({ half: e.half, frame: f, kind, team: e.team,
      label: `${kind === "goal" ? "Goal" : "Shot"} ${clock(e.half, f, m.fps)} · ${e.team ? m.meta.guest : m.meta.home}${who}` });
  }
  return out.sort((a, b) => a.half - b.half || a.frame - b.frame);
}
