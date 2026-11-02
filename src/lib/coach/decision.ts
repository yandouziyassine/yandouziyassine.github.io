// After a pause: what the professional did, how the move ended, and the running tally (viewer vs coach vs pros, each
// the sum of the coach's own score of the chosen option). Pure functions of the match data; the tally lives only in
// the page's memory.
import type { CoachOption } from "./advice";
import { normalise } from "./geometry";
import { ballAt, eventFrame, playerAt, type Carrier, type HalfData, type MatchEvent, type MatchMeta } from "./replay";

export const REVEAL_S = 10;    // the pro's choice: his next pass or shot, at most this long after the pause
export const OUTCOME_S = 15;   // the outcome window (the value model's horizon)
export const LOST_S = 1;       // the opponent must hold the ball this long to count as "lost"
export const BALL_AFTER_S = 1; // failed pass: the intended teammate is the one nearest the ball this long after release
export const CARRY_LOOK_S = 2; // a carry's direction: the carrier's movement over this time
export const MIN_CARRY_M = 1;  // moving less than this is "held the ball"

export type ProKind = "pass" | "shot" | "carry" | "hold";
export interface ProChoice {
  kind: ProKind; revealFrame: number; option: CoachOption | null; recipient: number | null;
  success: boolean | null; source: "event" | "tracking"; approx: boolean;
}
export type Outcome = "goal" | "shot" | "lost" | "kept";

function nearest(opts: CoachOption[], kind: CoachOption["kind"], dist: (o: CoachOption) => number): CoachOption | null {
  let best: CoachOption | null = null;
  for (const o of opts) if (o.kind === kind && (best === null || dist(o) < dist(best))) best = o;
  return best;
}

export function proChoice(m: MatchMeta, half: number, h: HalfData, frame: number, carrier: Carrier, opts: CoachOption[]): ProChoice {
  const fps = m.fps, last = m.halves[half].frames - 1, dir = m.halves[half].attack[carrier.team];
  const horizon = Math.min(last, frame + Math.round(REVEAL_S * fps));
  let next: { e: MatchEvent; f: number } | null = null;
  for (const e of m.events) {
    const f = eventFrame(e);
    if (e.half !== half || f === null || f < frame || f > horizon) continue;
    if (!next || f < next.f) next = { e, f };
  }
  if (next && next.e.player === carrier.player) {
    const { e, f } = next, approx = e.frame === null, base = { revealFrame: f, source: "event" as const, approx };
    if (e.type === "shot")
      return { ...base, kind: "shot", option: opts.find((o) => o.kind === "shot") ?? null, recipient: null, success: e.goal ?? null };
    if (e.success && e.recipient != null && m.players[e.recipient]?.team === carrier.team)
      return { ...base, kind: "pass", option: opts.find((o) => o.kind === "pass" && o.target === e.recipient) ?? null, recipient: e.recipient, success: true };
    // a failed pass: the recorded recipient is the opponent who won the ball, so the intended teammate is inferred
    const ball = ballAt(h, Math.min(last, f + Math.round(BALL_AFTER_S * fps)));
    const end = ball ? normalise(ball, dir) : null;
    const option = end ? nearest(opts, "pass", (o) => Math.hypot(o.to[0] - end[0], o.to[1] - end[1])) : null;
    return { ...base, kind: "pass", option, recipient: e.recipient ?? null, success: false };
  }
  // no pass or shot by the carrier within the window (or another player's came first): read the tracking
  const revealFrame = next ? next.f : horizon;
  const hold: ProChoice = { kind: "hold", revealFrame, option: null, recipient: null, success: null, source: "tracking", approx: false };
  const a = playerAt(h, frame, carrier.player);
  const b = playerAt(h, Math.min(revealFrame, frame + Math.round(CARRY_LOOK_S * fps)), carrier.player);
  if (!a || !b) return hold;
  const d = normalise([b[0] - a[0], b[1] - a[1]], dir);
  if (Math.hypot(d[0], d[1]) < MIN_CARRY_M) return hold;
  const angle = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  return { ...hold, kind: "carry", option: nearest(opts, "carry", (o) => Math.abs((o.angle ?? 0) - angle)) };
}

export function outcome(m: MatchMeta, half: number, frame: number, team: number): Outcome {
  const end = Math.min(m.halves[half].frames - 1, frame + Math.round(OUTCOME_S * m.fps));
  const shots = m.events.filter((e) => {
    const f = eventFrame(e);
    return e.type === "shot" && e.half === half && e.team === team && f !== null && f >= frame && f <= end;
  });
  if (shots.some((e) => e.goal)) return "goal";
  if (shots.length) return "shot";
  const opp = String(2 - team), need = Math.round(LOST_S * m.fps), owner = m.owner[half];
  for (let f = frame + 1, run = 0; f <= end; f++) {
    run = owner[f] === opp ? run + 1 : 0;
    if (run >= need) return "lost";
  }
  return "kept";
}

export interface Tally { decisions: number; followed: number; viewer: number; coach: number; pro: number; proCounted: number }
export const emptyTally = (): Tally => ({ decisions: 0, followed: 0, viewer: 0, coach: 0, pro: 0, proCounted: 0 });

export function decide(t: Tally, opts: CoachOption[], chosen: CoachOption): Tally {
  return { ...t, decisions: t.decisions + 1, followed: t.followed + (chosen === opts[0] ? 1 : 0),
    viewer: t.viewer + chosen.score, coach: t.coach + opts[0].score };
}

export function reveal(t: Tally, pro: Pick<ProChoice, "option">): Tally {
  return pro.option ? { ...t, pro: t.pro + pro.option.score, proCounted: t.proCounted + 1 } : t;
}
