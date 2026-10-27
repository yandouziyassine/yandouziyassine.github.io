import { describe, expect, it } from "vitest";
import { buildRound, rng, score, studyFile } from "../src/lib/depth-game.ts";

const pair = (id, category, closer, models) => ({ id, img: `${id}.jpg`, w: 100, h: 100, a: [10, 10], b: [90, 90], closer, category, why: "", models });
const pairs = [
  ...Array.from({ length: 6 }, (_, i) => pair(`n${i}`, "normal", "a", { m1: "a", m2: "a" })),
  ...Array.from({ length: 3 }, (_, i) => pair(`m${i}`, "mirror", "b", { m1: "a", m2: "b" })),
  ...Array.from({ length: 2 }, (_, i) => pair(`g${i}`, "glass", "a", { m1: "b" })),
];

describe("buildRound", () => {
  it("spreads the round over the categories before repeating one", () => {
    const round = buildRound(pairs, 6, rng(1));
    const cats = round.map((p) => p.category);
    expect(cats.filter((c) => c === "glass")).toHaveLength(2);
    expect(cats.filter((c) => c === "mirror")).toHaveLength(2);
    expect(new Set(round.map((p) => p.id)).size).toBe(6);
  });
  it("never asks for more pairs than exist", () => {
    expect(buildRound(pairs, 50, rng(2))).toHaveLength(pairs.length);
  });
  it("is reproducible with the same seed", () => {
    expect(buildRound(pairs, 5, rng(7)).map((p) => p.id)).toEqual(buildRound(pairs, 5, rng(7)).map((p) => p.id));
  });
});

describe("score", () => {
  it("scores the visitor and each model on the same pairs, per category", () => {
    const answers = [
      { pair: pairs[0], pick: "a", mode: "free" },   // normal, right
      { pair: pairs[6], pick: "b", mode: "glance" }, // mirror, right (m1 wrong, m2 right)
      { pair: pairs[9], pick: "b", mode: "free" },   // glass, wrong (m1 wrong, m2 has no answer)
    ];
    const s = score(answers, [{ id: "m1" }, { id: "m2" }]);
    expect(s.you.all).toEqual({ correct: 2, total: 3 });
    expect(s.you.byCat.get("glass")).toEqual({ correct: 0, total: 1 });
    expect(s.models[0].all).toEqual({ correct: 1, total: 3 });
    expect(s.models[1].all).toEqual({ correct: 2, total: 2 });
  });
});

describe("studyFile", () => {
  it("writes the project 14 study format (id, choice, ms, exposure), with nothing personal", () => {
    const f = studyFile([{ pair: pairs[0], pick: "a", mode: "glance", ms: 812 }, { pair: pairs[6], pick: "b", mode: "free", ms: 1500 }], "abc123", "2026-10-26T00:00:00Z");
    expect(f.answers).toEqual([
      { id: "n0", choice: "a", ms: 812, exposure: "flash", transform: "none" },
      { id: "m0", choice: "b", ms: 1500, exposure: "free", transform: "none" },
    ]);
    expect(Object.keys(f).sort()).toEqual(["answers", "n", "plan", "session", "source", "started"]);
  });
});
