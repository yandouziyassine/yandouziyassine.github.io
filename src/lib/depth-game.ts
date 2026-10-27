// "Can you beat the AI?": which of two points is closer to the camera. Pure logic (round building and scoring),
// shared by the page script and the unit tests. Data format: the project 14 public pair set
// (14-monocular-depth-3d/docs/w9_public_pairs.json in the library), copied by scripts/depth-game.mjs.

export type Side = "a" | "b";
export interface Pair {
  id: string; img: string; w: number; h: number; a: [number, number]; b: [number, number]; closer: Side;
  category: string; why: string; models: Record<string, Side>;
}
export interface GameData {
  version: number;
  models: { id: string; name: string }[];
  pairs: Pair[];
  humans?: Record<string, { acc: number; n: number }>;
  credits: { img: string; source: string; license: string; url: string }[];
}
export interface Answer { pair: Pair; pick: Side; mode: "glance" | "free"; ms?: number; }

/** The project 14 study's answers file (14-monocular-depth-3d/web_study, read by w9_analyze.py): anonymous, a random
 *  session code plus, per trial, the pair id, the choice, the response time and the exposure. */
export function studyFile(answers: Answer[], session: string, started: string) {
  return {
    session, n: answers.length, started, source: "portfolio-game",
    plan: { exposure: answers.map((a) => (a.mode === "glance" ? "flash" : "free")), transform: answers.map(() => "none"), flash_ms: 200 },
    answers: answers.map((a) => ({ id: a.pair.id, choice: a.pick, ms: a.ms, exposure: a.mode === "glance" ? "flash" : "free", transform: "none" })),
  };
}

/** Small seeded PRNG so a round can be replayed in tests. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** `size` pairs spread over the categories as evenly as possible, in random order. */
export function buildRound(pairs: Pair[], size: number, rand = Math.random): Pair[] {
  const byCat = new Map<string, Pair[]>();
  for (const p of pairs) (byCat.get(p.category) ?? byCat.set(p.category, []).get(p.category)!).push(p);
  const pools = [...byCat.values()].map((ps) => shuffle(ps, rand));
  const out: Pair[] = [];
  for (let i = 0; out.length < Math.min(size, pairs.length); i++) {
    const pool = pools[i % pools.length];
    if (pool.length) out.push(pool.pop()!);
  }
  return shuffle(out, rand);
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export interface Score { correct: number; total: number; }
const add = (m: Map<string, Score>, k: string, ok: boolean) => {
  const s = m.get(k) ?? { correct: 0, total: 0 };
  s.correct += ok ? 1 : 0; s.total += 1; m.set(k, s);
};

/** The visitor's score and each model's score on the same pairs, overall and per category. */
export function score(answers: Answer[], models: { id: string }[]) {
  const you = { all: { correct: 0, total: 0 }, byCat: new Map<string, Score>() };
  const them = models.map((m) => ({ id: m.id, all: { correct: 0, total: 0 }, byCat: new Map<string, Score>() }));
  for (const { pair, pick } of answers) {
    const ok = pick === pair.closer;
    you.all.correct += ok ? 1 : 0; you.all.total += 1; add(you.byCat, pair.category, ok);
    for (const t of them) {
      const m = pair.models[t.id];
      if (!m) continue;
      t.all.correct += m === pair.closer ? 1 : 0; t.all.total += 1; add(t.byCat, pair.category, m === pair.closer);
    }
  }
  return { you, models: them };
}
