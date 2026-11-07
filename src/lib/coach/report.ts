// The match report of the football demo (project 20, library coach/export_report.py): for every pass of the replay match
// that the event sync placed on the tracking, what the player chose against what the coach (models trained WITHOUT this
// match) valued most. Pure text and sorting for the page; the numbers come from report.json. The report is the model's
// opinion: no "good" or "bad" labels anywhere.
import { direction, outcomeLabel, pct } from "./format";
import { clock, type PlayerInfo } from "./replay";

/** What a player picks at random among the coach's ~15 options (held-out Bundesliga matches, library README). */
export const RANDOM_TOP1 = 0.067;
export const RANDOM_TOP3 = 0.2;

export interface ReportOption { kind: "pass" | "carry" | "shot"; target?: number; angle?: number }
export type ReportOutcome = "goal" | "shot" | "lost" | "kept";
export interface ReportDecision {
  event: number; half: number; frame: number; team: number; carrier: number; target: number;
  best: ReportOption; gap: number; rank: number; options: number; p_chosen: number; p_best: number;
  above_median: number; third: string; outcome: ReportOutcome; net_xg: number;
}
export interface ReportStats { n: number; too_few: boolean; top1: number; top3: number; mean_gap: number; total_gap: number }
export interface ReportPlayer extends ReportStats { name: string; team: number; shirt: number }
export interface ReportJson {
  match_id: string; fps: number; trained_without: string;
  thresholds: { min_decisions: number };
  caveats: string[];
  summary: ReportStats & { gap_median: number; open_play_passes?: number };
  teams: Record<string, ReportStats & { name: string }>;
  players: Record<string, ReportPlayer>;
  highlights: { missed: { decision: number; gap?: number }[]; best: { decision: number; above_median?: number }[] };
  decisions: ReportDecision[];
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** The parsed report, or null when it is not in the expected shape (the section then stays hidden). */
export function readReport(raw: unknown): ReportJson | null {
  if (!isObj(raw)) return null;
  const { decisions, players, highlights, summary, teams, caveats, thresholds } = raw;
  if (!Array.isArray(decisions) || !isObj(players) || !isObj(highlights) || !isObj(summary) || !isObj(teams)) return null;
  if (!Array.isArray(caveats) || !isObj(thresholds) || typeof raw.fps !== "number") return null;
  if (!Array.isArray(highlights.missed) || !Array.isArray(highlights.best)) return null;
  const ok = (h: unknown) => isObj(h) && Number.isInteger(h.decision) && isObj(decisions[h.decision as number]);
  if (![...highlights.missed, ...highlights.best].every(ok)) return null;
  return raw as unknown as ReportJson;
}

export const pct1 = (p: number) => `${(p * 100).toFixed(1)} %`;

/** A gap or a margin in expected goals: three decimals, four below 0.01 (most gaps are a few thousandths). */
export function gapText(g: number): string {
  const a = Math.abs(g);
  return `${(a < 0.01 ? a.toFixed(4) : a.toFixed(3))} xG`;
}

const who = (players: PlayerInfo[], i: number | null | undefined) =>
  i == null || !players[i] ? "a teammate" : `#${players[i].shirt} ${players[i].name}`;

/** "a pass to #7 Name", "a carry 60° right", "a shot". */
export function optionText(o: ReportOption, players: PlayerInfo[]): string {
  if (o.kind === "pass") return `a pass to ${who(players, o.target)}`;
  if (o.kind === "carry") return `a carry ${direction(o.angle ?? 0)}`;
  return "a shot";
}

const pText = (o: ReportOption, p: number) =>
  `${pct(p)} ${o.kind === "pass" ? "arrives" : o.kind === "carry" ? "keeps the ball" : "goal chance"}`;

export const sameOption = (a: ReportOption, b: ReportOption) =>
  a.kind === b.kind && (a.kind === "pass" ? a.target === b.target : a.kind === "carry" ? Math.abs((a.angle ?? 0) - (b.angle ?? 0)) < 0.5 : true);

/** What the player chose in a decision: the pass to the receiver the report recorded. */
export const chosenOption = (d: ReportDecision): ReportOption => ({ kind: "pass", target: d.target });

// ---------- team summary ----------
export interface SummaryLine { label: string; value: string; note: string }

export function summaryLines(r: ReportJson): SummaryLine[] {
  const s = r.summary;
  return [
    { label: "Decisions", value: String(s.n),
      note: s.open_play_passes ? `of ${s.open_play_passes} open-play passes: those the event sync placed on the tracking` : "passes the event sync placed on the tracking" },
    { label: "Chose the coach's first option", value: pct1(s.top1), note: `choosing at random among its options would give ${pct1(RANDOM_TOP1)}` },
    { label: "Chose one of its top 3", value: pct1(s.top3), note: `choosing at random would give ${pct1(RANDOM_TOP3)}` },
    { label: "Median gap to its best option", value: gapText(s.gap_median), note: "half of the passes are closer than this to what the coach valued most" },
  ];
}

export interface TeamRow { team: number; name: string; n: number; top1: string; top3: string; meanGap: string }
export function teamRows(r: ReportJson): TeamRow[] {
  return Object.entries(r.teams).sort(([a], [b]) => Number(a) - Number(b)).map(([k, t]) => ({
    team: Number(k), name: t.name, n: t.n,
    top1: t.too_few ? "" : pct1(t.top1), top3: t.too_few ? "" : pct1(t.top3), meanGap: t.too_few ? "" : gapText(t.mean_gap),
  }));
}

// ---------- player table ----------
export type SortKey = "name" | "team" | "n" | "top1" | "top3" | "meanGap";
export type SortDir = "asc" | "desc";
export interface PlayerRow {
  player: number; name: string; team: number; teamName: string; shirt: number;
  n: number; tooFew: boolean; top1: number; top3: number; meanGap: number;
}
export const SORT_LABELS: Record<SortKey, string> = {
  name: "Player", team: "Team", n: "Decisions", top1: "Coach's first option", top3: "Coach's top 3", meanGap: "Mean gap",
};
/** Names and teams start A to Z; numbers start with the largest. */
export const defaultDir = (k: SortKey): SortDir => (k === "name" || k === "team" ? "asc" : "desc");
export const tooFewText = (r: ReportJson) => `fewer than ${r.thresholds.min_decisions} decisions`;

export function playerRows(r: ReportJson): PlayerRow[] {
  return Object.entries(r.players).map(([k, p]) => ({
    player: Number(k), name: p.name, team: p.team, teamName: r.teams[String(p.team)]?.name ?? "", shirt: p.shirt,
    n: p.n, tooFew: p.too_few, top1: p.top1, top3: p.top3, meanGap: p.mean_gap,
  }));
}

/** A new sorted array. Ties keep the table's order. The shares and the gap are only comparable with enough decisions,
 *  so rows with too few always come after the others when sorting on those columns. */
export function sortRows(rows: PlayerRow[], key: SortKey, dir: SortDir): PlayerRow[] {
  const sign = dir === "asc" ? 1 : -1, stat = key === "top1" || key === "top3" || key === "meanGap";
  const cmp = (a: PlayerRow, b: PlayerRow): number => {
    if (stat && a.tooFew !== b.tooFew) return a.tooFew ? 1 : -1;
    const x = key === "name" ? a.name : key === "team" ? a.teamName : a[key], y = key === "name" ? b.name : key === "team" ? b.teamName : b[key];
    const c = typeof x === "string" ? x.localeCompare(y as string, "en") : (x as number) - (y as number);
    return c * sign;
  };
  return rows.map((row, i) => ({ row, i })).sort((a, b) => cmp(a.row, b.row) || a.i - b.i).map((e) => e.row);
}

export const sortAnnouncement = (key: SortKey, dir: SortDir) =>
  `Sorted by ${SORT_LABELS[key].toLowerCase()}, ${dir === "asc" ? (key === "name" || key === "team" ? "A to Z" : "smallest first") : "largest first"}.`;

// ---------- highlights ----------
export type HighlightKind = "missed" | "best";
export interface HighlightRow {
  kind: HighlightKind; decision: number; time: string; half: number; frame: number;
  player: string; team: string; chose: string; preferred: string; same: boolean;
  /** The figure the list is about: the gap (missed opportunities) or how far above the median option the choice scored (best). */
  measure: string; outcome: string;
}

export function highlightRows(r: ReportJson, kind: HighlightKind, players: PlayerInfo[]): HighlightRow[] {
  return r.highlights[kind].map((h) => {
    const d = r.decisions[h.decision];
    const chosen = chosenOption(d), same = sameOption(chosen, d.best);
    const measure = kind === "missed" ? `gap ${gapText(d.gap)}` : `${gapText(d.above_median)} above the median option`;
    return {
      kind, decision: h.decision, time: clock(d.half, d.frame, r.fps), half: d.half, frame: d.frame,
      player: who(players, d.carrier), team: r.teams[String(d.team)]?.name ?? "",
      chose: `${optionText(chosen, players)} (${pText(chosen, d.p_chosen)})`,
      preferred: same ? "the same option" : `${optionText(d.best, players)} (${pText(d.best, d.p_best)})`,
      same, measure, outcome: `Outcome within 15 s: ${outcomeLabel(d.outcome)}`,
    };
  });
}

/** One sentence for a highlight (the button's accessible name and the tests). */
export function highlightSentence(h: HighlightRow): string {
  const pref = h.same ? "which was also the coach's first choice" : `the coach valued ${h.preferred} more`;
  return `${h.time}, ${h.player} (${h.team}) chose ${h.chose}; ${pref}. ${h.measure}. ${h.outcome}.`;
}

// ---------- seeking the replay ----------
export interface Spot { half: number; frame: number; carrier: number; chosen: ReportOption; best: ReportOption; p_chosen: number; p_best: number }

export function spotFor(r: ReportJson, decision: number): Spot {
  const d = r.decisions[decision];
  return { half: d.half, frame: d.frame, carrier: d.carrier, chosen: chosenOption(d), best: d.best, p_chosen: d.p_chosen, p_best: d.p_best };
}

/** The legend line under the replay: green is what the player chose, orange what the coach preferred. */
export function spotLegend(s: Spot, players: PlayerInfo[]): { chose: string; preferred: string } {
  const same = sameOption(s.chosen, s.best);
  return {
    chose: `Green: ${who(players, s.carrier)} chose ${optionText(s.chosen, players)} (${pText(s.chosen, s.p_chosen)}).`,
    preferred: same ? "It is also the coach's first choice, so there is only one arrow."
      : `Orange: the coach valued ${optionText(s.best, players)} more (${pText(s.best, s.p_best)}).`,
  };
}
