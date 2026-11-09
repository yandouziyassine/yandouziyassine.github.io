// Ghost runs and ghost defenders: port of coach/ghosts.py. Counterfactual positions scored with the same models; pure
// functions of one normalised frame state. Fan of 7 points REACH metres around the player's heading (his velocity
// direction when he moves at >= MIN_SPEED, else +x), clipped to the pitch. The moved player stands still at his ghost
// point; nobody else reacts (a limit of the counterfactual). Ties keep the lower row and fan index (strict compares).
import { options as adviceOptions, arrivalAt, valueAt, type Coach } from "./advice";
import { PASS_FEATURES, laneLossPoint, passFeatures, vector, type State } from "./features";
import { HALF_LENGTH, HALF_WIDTH, type Vec } from "./geometry";

export const SPEED = 5.0, HORIZON_S = 1.5, REACH = SPEED * HORIZON_S;
export const FAN_DEG = [-90.0, -60.0, -30.0, 0.0, 30.0, 60.0, 90.0];
export const MIN_SPEED = 1.0, RUN_MIN_GAIN = 0.005, DEF_MIN_GAIN = 0.002, MAX_GHOSTS = 3;

export interface GhostRun { row: number; player: number; from: Vec; to: Vec; fanIndex: number; scoreNow: number; score: number; gain: number }
export interface GhostDefender { row: number; player: number; from: Vec; to: Vec; fanIndex: number; bestBefore: number; bestAfter: number; gain: number }
export interface Ghosts { runs: GhostRun[]; defence: GhostDefender[] }

const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function fan(pos: Vec, vel: Vec): Vec[] {
  const speed = Math.hypot(vel[0], vel[1]);
  const heading = speed >= MIN_SPEED ? Math.atan2(vel[1], vel[0]) : 0;
  return FAN_DEG.map((d) => {
    const a = heading + d * (Math.PI / 180);
    return [clip(pos[0] + REACH * Math.cos(a), -HALF_LENGTH, HALF_LENGTH), clip(pos[1] + REACH * Math.sin(a), -HALF_WIDTH, HALF_WIDTH)] as Vec;
  });
}

export function moved(s: State, side: "att" | "def", row: number, point: Vec): State {
  const pos = s[side].slice(), vel = s[side === "att" ? "attV" : "defV"].slice();
  pos[row] = [point[0], point[1]];
  vel[row] = [0, 0];
  return side === "att" ? { ...s, att: pos, attV: vel } : { ...s, def: pos, defV: vel };
}

/** advice's score of the pass carrier -> target in state s. */
function passScore(s: State, carrier: number, target: number, coach: Coach, vNow: number): number {
  const here = s.att[carrier], to = s.att[target];
  const p = coach.predict.pass(vector(passFeatures(s, carrier, target, coach.pc), PASS_FEATURES));
  const loss = laneLossPoint(s, here, to);
  return p * arrivalAt(coach, to) - (1 - p) * valueAt(coach, [-loss[0], -loss[1]]) - vNow;
}

export function ghostRuns(s: State, carrier: number, coach: Coach): GhostRun[] {
  const vNow = valueAt(coach, s.att[carrier]);
  const out: GhostRun[] = [];
  for (let j = 0; j < s.att.length; j++) {
    if (j === carrier) continue;
    const pts = fan(s.att[j], s.attV[j]);
    const now = passScore(s, carrier, j, coach, vNow);
    let k = 0, best = -Infinity;
    pts.forEach((pt, i) => {
      const v = passScore(moved(s, "att", j, pt), carrier, j, coach, vNow);
      if (v > best) { best = v; k = i; }
    });
    const gain = best - now;
    if (gain > RUN_MIN_GAIN) out.push({ row: j, player: s.attIdx[j], from: [s.att[j][0], s.att[j][1]], to: pts[k], fanIndex: k, scoreNow: now, score: best, gain });
  }
  out.sort((a, b) => b.gain - a.gain || a.row - b.row);
  return out.slice(0, MAX_GHOSTS);
}

const bestScore = (s: State, carrier: number, coach: Coach) => adviceOptions(s, carrier, coach)[0].score;

interface Pick { gain: number; d: number; k: number; pt: Vec; after: number }

export function ghostDefence(s: State, carrier: number, coach: Coach): GhostDefender[] {
  const out: GhostDefender[] = [];
  let cur = s, before = bestScore(cur, carrier, coach);
  const left = s.def.map((_, i) => i);
  for (let step = 0; step < MAX_GHOSTS; step++) {
    let best: Pick | null = null;
    for (const d of left) {
      const pts = fan(cur.def[d], cur.defV[d]);
      for (let k = 0; k < pts.length; k++) {
        const after = bestScore(moved(cur, "def", d, pts[k]), carrier, coach);
        const gain = before - after;
        if (best === null || gain > best.gain) best = { gain, d, k, pt: pts[k], after };
      }
    }
    if (best === null || best.gain <= DEF_MIN_GAIN) break;
    const { gain, d, k, pt, after } = best;
    out.push({ row: d, player: s.defIdx[d], from: [cur.def[d][0], cur.def[d][1]], to: pt, fanIndex: k, bestBefore: before, bestAfter: after, gain });
    cur = moved(cur, "def", d, pt);
    before = after;
    left.splice(left.indexOf(d), 1);
  }
  return out;
}

/** Both kinds of ghost for one frame (call on pause only: the defence ranks every option up to 211 times). */
export function ghosts(s: State, carrier: number, coach: Coach): Ghosts {
  return { runs: ghostRuns(s, carrier, coach), defence: ghostDefence(s, carrier, coach) };
}
