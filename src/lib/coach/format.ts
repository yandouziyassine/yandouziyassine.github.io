// Text for the football replay. "Value" is the coach's score: the expected change in net expected goals (xG) from
// choosing that option.
import type { CoachOption } from "./advice";
import type { Outcome, ProChoice } from "./decision";
import type { Carrier, MatchMeta, PlayerInfo } from "./replay";

export const pct = (p: number) => `${Math.round(p * 100)} %`;

export function signedXg(x: number): string {
  const r = Math.round(x * 1000) / 1000;
  return `${r < 0 ? "-" : "+"}${Math.abs(r).toFixed(3)} xG`;
}

/** Carry angle in the normalised frame: > 0 is to the carrier's left (he faces +x). */
export function direction(angle: number): string {
  const a = Math.round(angle);
  return a === 0 ? "straight ahead" : a > 0 ? `${a}° left` : `${-a}° right`;
}

const who = (players: PlayerInfo[], i: number | null | undefined) =>
  i == null || !players[i] ? "a teammate" : `#${players[i].shirt} ${players[i].name}`;

export function optionLabel(o: CoachOption, players: PlayerInfo[]): string {
  const gain = signedXg(o.score);
  if (o.kind === "pass") return `Pass to ${who(players, o.target)} · ${pct(o.p)} arrives · ${gain}`;
  if (o.kind === "carry") return `Carry ${direction(o.angle ?? 0)} · ${pct(o.p)} keeps it · ${gain}`;
  return `Shoot · ${pct(o.p)} goal chance · ${gain}`;
}

/** Short label drawn next to an arrow on the pitch. */
export function arrowLabel(o: CoachOption, players: PlayerInfo[]): string {
  if (o.kind === "pass") return `#${o.target != null && players[o.target] ? players[o.target].shirt : "?"} ${pct(o.p)}`;
  return o.kind === "shot" ? `shot ${pct(o.p)}` : pct(o.p);
}

export function proLabel(pro: Pick<ProChoice, "kind" | "option" | "approx"> & Partial<ProChoice>, players: PlayerInfo[]): string {
  const what =
    pro.kind === "shot" ? "The pro shot"
    : pro.kind === "carry" ? `The pro carried the ball ${direction(pro.option?.angle ?? 0)}`
    : pro.kind === "hold" ? "The pro held the ball"
    : pro.success ? `The pro passed to ${who(players, pro.recipient)}`
    : `The pro's pass ${pro.option ? `towards ${who(players, pro.option.target)} ` : ""}did not arrive`;
  const value = pro.option ? ` (coach value ${signedXg(pro.option.score)})` : pro.kind === "hold" ? "" : " (not one of the coach's options)";
  return `${what}${value}${pro.approx ? ", time from the event log (approximate)" : ""}.`;
}

export const outcomeLabel = (o: Outcome): string => ({ goal: "goal", shot: "a shot", lost: "ball lost", kept: "ball kept" })[o];

/** Dark or light ink for text on a team colour (#rrggbb). */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 140 ? "#0d0e10" : "#ffffff";
}

/** The canvases' aria-label: "<view>, <when>, Home 1–0 Away: #10 Name (Home) has the ball." */
export function frameLabel(m: Pick<MatchMeta, "players" | "meta">, view: string, when: string, score: [number, number], carrier: Carrier | null): string {
  const p = carrier ? m.players[carrier.player] : undefined;
  const who = p ? `#${p.shirt} ${p.name} (${carrier!.team ? m.meta.guest : m.meta.home}) has the ball` : "no player has the ball";
  return `${view}, ${when}, ${m.meta.home} ${score[0]}–${score[1]} ${m.meta.guest}: ${who}.`;
}
