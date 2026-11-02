// Player cards for the football replay (project 20). public/football/profiles.json (the library's
// coach/export_profiles.py, built WITHOUT the replay match) gives each player of the team that plays in the other
// matches an offset on the logit scale of the pass model (pass_skill) and of the shot xG (finishing), with the number
// of passes / shots behind it. The site shows them for information only: held-out, they did not improve the advice on
// this league (see the page), so `a` is 0 and nothing here feeds the coach. No rating, no good / bad label.

export interface Offset { logit: number; n: number; raw?: number | null }
export interface PlayerProfile { id?: string; name?: string; team?: number; pass_skill?: Offset; finishing?: Offset }
export interface ProfilesJson {
  version: number; built_without: string[]; advice_effect: string; a: Record<string, number>;
  players: Record<string, PlayerProfile>;
}

/** Fewer passes or shots than this and the card says there is too little history to say anything. */
export const MIN_PASSES = 20;
export const MIN_SHOTS = 20;
/** Offsets under this (logit) read "about as expected": about 1 point of completion at 80 %. */
export const SMALL = 0.05;
/** From this offset on the wording loses "slightly": about 3 points of completion at 80 %. */
export const CLEAR = 0.15;

const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const signed = (x: number) => { const r = Math.round(x * 100) / 100; return `${r < 0 ? "-" : "+"}${Math.abs(r).toFixed(2)}`; };

/** "<verb> [slightly] more|less <rest>", or `same` when the offset is within SMALL of 0. */
function wording(logit: number, verb: string, rest: string, same: string): string {
  const a = Math.abs(logit);
  if (a < SMALL) return same;
  return `${verb} ${a < CLEAR ? "slightly " : ""}${logit > 0 ? "more" : "fewer"} ${rest}`;
}

/** "Passing: ..." for one player, from the shrunk offset and the passes behind it. */
export function passingLine(o: Offset | undefined): string {
  if (!o || o.n === 0) return "Passing: no passes in the other matches.";
  const passes = noun(o.n, "pass", "passes");
  if (o.n < MIN_PASSES) return `Passing: only ${passes} in the other matches, too few to say.`;
  const what = wording(o.logit, "completes", "passes than expected", "completes about as many passes as expected");
  return `Passing: ${what} (${passes}; ${signed(o.logit)} logit vs expected, shrunk).`;
}

/** "Shooting: ..." for one player, from the shrunk offset and the shots behind it. */
export function shootingLine(o: Offset | undefined): string {
  if (!o || o.n === 0) return "Shooting: no shots in the other matches.";
  const shots = noun(o.n, "shot", "shots");
  if (o.n < MIN_SHOTS) return `Shooting: only ${shots} in the other matches, too few to say.`;
  const what = wording(o.logit, "scores", "goals than the shots' xG suggests", "scores about as many goals as the shots' xG suggests");
  return `Shooting: ${what} (${shots}; ${signed(o.logit)} logit vs expected, shrunk).`;
}

export const NO_HISTORY = "No history for this player in the other matches.";

/**
 * The card for one player: a title and the lines that exist. `profile` is undefined for a player without history
 * (every player of a team that plays in no other match, or a substitute who never appears there).
 */
export function cardLines(profile: PlayerProfile | undefined): string[] {
  if (!profile || (!profile.pass_skill && !profile.finishing)) return [NO_HISTORY];
  const lines: string[] = [];
  if (profile.pass_skill) lines.push(passingLine(profile.pass_skill));
  if (profile.finishing) lines.push(shootingLine(profile.finishing));
  return lines;
}

/** One sentence for a screen reader (the visible card is a heading and a list). */
export const cardText = (title: string, profile: PlayerProfile | undefined) => `${title}. ${cardLines(profile).join(" ")}`;

/** Minimal shape check of a downloaded profiles.json; anything else is ignored (no cards). */
export function readProfiles(x: unknown): ProfilesJson | null {
  const p = x as ProfilesJson | null;
  if (!p || typeof p !== "object" || !p.players || typeof p.players !== "object") return null;
  return p;
}
