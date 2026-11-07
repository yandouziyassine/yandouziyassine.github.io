import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  chosenOption, defaultDir, gapText, highlightRows, highlightSentence, optionText, pct1, playerRows, RANDOM_TOP1, RANDOM_TOP3,
  readReport, sameOption, sortAnnouncement, sortRows, spotFor, spotLegend, summaryLines, teamRows, tooFewText,
} from "../src/lib/coach/report.ts";

const players = [
  { team: 0, shirt: 10, name: "D. Ginczek" }, { team: 0, shirt: 8, name: "B. Bee" },
  { team: 1, shirt: 4, name: "C. Cee" }, { team: 1, shirt: 9, name: "E. Eee" },
];
const stats = (n, top1, top3, g) => ({ n, too_few: n < 20, top1, top3, mean_gap: g, total_gap: n * g });
const dec = (o) => ({ event: 1, half: 0, frame: 750, team: 0, carrier: 0, target: 1, best: { kind: "pass", target: 3 }, gap: 0.0167,
  rank: 13, options: 15, p_chosen: 0.273, p_best: 0.926, above_median: 0.004, third: "attacking", outcome: "lost", net_xg: 0, ...o });
const report = () => ({
  match_id: "T", fps: 12.5, trained_without: "T", thresholds: { min_decisions: 20 }, caveats: ["Everything here is the model's opinion."],
  summary: { ...stats(385, 0.086, 0.294, 0.00626), gap_median: 0.00363, open_play_passes: 647 },
  teams: { 0: { name: "Home", ...stats(211, 0.076, 0.275, 0.0059) }, 1: { name: "Guest", ...stats(174, 0.098, 0.316, 0.0068) } },
  players: {
    0: { name: "D. Ginczek", team: 0, shirt: 10, ...stats(12, 0.08, 0.25, 0.009) },
    1: { name: "B. Bee", team: 0, shirt: 8, ...stats(40, 0.05, 0.3, 0.004) },
    2: { name: "C. Cee", team: 1, shirt: 4, ...stats(55, 0.12, 0.4, 0.006) },
    3: { name: "E. Eee", team: 1, shirt: 9, ...stats(25, 0.2, 0.35, 0.002) },
  },
  highlights: { missed: [{ decision: 0, gap: 0.0167 }], best: [{ decision: 1, above_median: 0.0096 }] },
  decisions: [dec({}), dec({ half: 1, frame: 100, best: { kind: "pass", target: 1 }, gap: 0, rank: 1, p_best: 0.7, p_chosen: 0.7, outcome: "kept", above_median: 0.0096 })],
});

describe("readReport", () => {
  it("accepts the expected shape and rejects anything else", () => {
    expect(readReport(report())).not.toBeNull();
    expect(readReport(null)).toBeNull();
    expect(readReport([])).toBeNull();
    expect(readReport({ ...report(), decisions: "x" })).toBeNull();
    expect(readReport({ ...report(), highlights: { missed: [{ decision: 9 }], best: [] } })).toBeNull();
    expect(readReport({ ...report(), caveats: undefined })).toBeNull();
  });
  it("reads the shipped report", () => {
    const p = "public/football/report.json";
    if (!fs.existsSync(p)) return;
    const r = readReport(JSON.parse(fs.readFileSync(p, "utf8")));
    expect(r).not.toBeNull();
    expect(r.highlights.missed).toHaveLength(10);
    expect(r.highlights.best).toHaveLength(10);
  });
});

describe("formatting", () => {
  it("shows shares with one decimal and gaps with their precision", () => {
    expect(pct1(0.086)).toBe("8.6 %");
    expect(pct1(RANDOM_TOP1)).toBe("6.7 %");
    expect(pct1(RANDOM_TOP3)).toBe("20.0 %");
    expect(gapText(0.00363)).toBe("0.0036 xG");
    expect(gapText(0.0167)).toBe("0.017 xG");
    expect(gapText(0)).toBe("0.0000 xG");
  });
  it("describes options", () => {
    expect(optionText({ kind: "pass", target: 1 }, players)).toBe("a pass to #8 B. Bee");
    expect(optionText({ kind: "pass", target: 9 }, players)).toBe("a pass to a teammate");
    expect(optionText({ kind: "carry", angle: -60 }, players)).toBe("a carry 60° right");
    expect(optionText({ kind: "carry", angle: 0 }, players)).toBe("a carry straight ahead");
    expect(optionText({ kind: "shot" }, players)).toBe("a shot");
  });
  it("compares options", () => {
    expect(sameOption({ kind: "pass", target: 1 }, { kind: "pass", target: 1 })).toBe(true);
    expect(sameOption({ kind: "pass", target: 1 }, { kind: "pass", target: 2 })).toBe(false);
    expect(sameOption({ kind: "carry", angle: 30 }, { kind: "carry", angle: 30.2 })).toBe(true);
    expect(sameOption({ kind: "carry", angle: 30 }, { kind: "pass", target: 1 })).toBe(false);
    expect(sameOption({ kind: "shot" }, { kind: "shot" })).toBe(true);
    expect(chosenOption(dec({ target: 2 }))).toEqual({ kind: "pass", target: 2 });
  });
});

describe("summary", () => {
  it("states the shares next to the random baselines and the median gap", () => {
    const l = summaryLines(report());
    expect(l.map((x) => x.value)).toEqual(["385", "8.6 %", "29.4 %", "0.0036 xG"]);
    expect(l[0].note).toContain("647 open-play passes");
    expect(l[1].note).toContain("6.7 %");
    expect(l[2].note).toContain("20.0 %");
  });
  it("lists the teams in order", () => {
    const t = teamRows(report());
    expect(t.map((x) => x.name)).toEqual(["Home", "Guest"]);
    expect(t[0]).toMatchObject({ n: 211, top1: "7.6 %", top3: "27.5 %", meanGap: "0.0059 xG" });
  });
});

describe("player table", () => {
  const rows = () => playerRows(report());
  it("builds a row per player with its team name", () => {
    expect(rows()).toHaveLength(4);
    expect(rows()[2]).toMatchObject({ player: 2, name: "C. Cee", teamName: "Guest", n: 55, tooFew: false });
    expect(tooFewText(report())).toBe("fewer than 20 decisions");
  });
  it("sorts text A to Z and numbers largest first, without changing the input", () => {
    const r = rows();
    expect(sortRows(r, "name", "asc").map((x) => x.name)).toEqual(["B. Bee", "C. Cee", "D. Ginczek", "E. Eee"]);
    expect(sortRows(r, "n", "desc").map((x) => x.n)).toEqual([55, 40, 25, 12]);
    expect(sortRows(r, "n", "asc").map((x) => x.n)).toEqual([12, 25, 40, 55]);
    expect(sortRows(r, "team", "asc").map((x) => x.teamName)).toEqual(["Guest", "Guest", "Home", "Home"]);
    expect(r.map((x) => x.player)).toEqual([0, 1, 2, 3]);
    expect(defaultDir("name")).toBe("asc");
    expect(defaultDir("top1")).toBe("desc");
  });
  it("always puts rows with too few decisions last when sorting on a share or the gap", () => {
    const r = rows();
    for (const dir of ["asc", "desc"]) for (const k of ["top1", "top3", "meanGap"])
      expect(sortRows(r, k, dir).at(-1).tooFew).toBe(true);
    expect(sortRows(r, "top1", "desc").map((x) => x.player)).toEqual([3, 2, 1, 0]);
    expect(sortRows(r, "meanGap", "asc").map((x) => x.player)).toEqual([3, 1, 2, 0]);
    expect(sortRows(r, "n", "asc")[0].tooFew).toBe(true); // by decisions the small counts are real numbers
  });
  it("keeps ties in the table's order", () => {
    const r = rows().map((x) => ({ ...x, n: 30 }));
    expect(sortRows(r, "n", "desc").map((x) => x.player)).toEqual([0, 1, 2, 3]);
  });
  it("announces the sort", () => {
    expect(sortAnnouncement("n", "desc")).toBe("Sorted by decisions, largest first.");
    expect(sortAnnouncement("name", "asc")).toBe("Sorted by player, A to Z.");
  });
});

describe("highlights", () => {
  it("describes a missed opportunity as an opinion with both options, the gap and the outcome", () => {
    const [h] = highlightRows(report(), "missed", players);
    expect(h).toMatchObject({ time: "01:00", player: "#10 D. Ginczek", team: "Home", same: false, measure: "gap 0.017 xG" });
    expect(h.chose).toBe("a pass to #8 B. Bee (27 % arrives)");
    expect(h.preferred).toBe("a pass to #9 E. Eee (93 % arrives)");
    expect(highlightSentence(h)).toBe("01:00, #10 D. Ginczek (Home) chose a pass to #8 B. Bee (27 % arrives); the coach valued a pass to #9 E. Eee (93 % arrives) more. gap 0.017 xG. Outcome within 15 s: ball lost.");
  });
  it("describes a best decision by how far above the median option it scored, on the second half's clock", () => {
    const [h] = highlightRows(report(), "best", players);
    expect(h.time).toBe("45:08");
    expect(h.same).toBe(true);
    expect(h.measure).toBe("0.0096 xG above the median option");
    expect(highlightSentence(h)).toContain("which was also the coach's first choice");
    expect(highlightSentence(h)).not.toMatch(/mistake|good|bad|wrong/i);
  });
  it("gives the replay what it needs to seek and draw both options", () => {
    const s = spotFor(report(), 0);
    expect(s).toMatchObject({ half: 0, frame: 750, carrier: 0, chosen: { kind: "pass", target: 1 }, best: { kind: "pass", target: 3 } });
    const l = spotLegend(s, players);
    expect(l.chose).toBe("Green: #10 D. Ginczek chose a pass to #8 B. Bee (27 % arrives).");
    expect(l.preferred).toBe("Orange: the coach valued a pass to #9 E. Eee more (93 % arrives).");
    expect(spotLegend(spotFor(report(), 1), players).preferred).toMatch(/only one arrow/);
  });
});
