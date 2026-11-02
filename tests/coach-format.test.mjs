import { describe, expect, it } from "vitest";
import { arrowLabel, direction, frameLabel, optionLabel, outcomeLabel, pct, proLabel, signedXg, textOn } from "../src/lib/coach/format.ts";

const players = [{ team: 0, shirt: 10, name: "D. Ginczek" }, { team: 0, shirt: 8, name: "B" }];
const pass = { kind: "pass", target: 1, to: [0, 0], p: 0.736, value: 0, score: 0.0312 };

describe("labels", () => {
  it("formats numbers", () => {
    expect(pct(0.736)).toBe("74 %");
    expect(signedXg(0.0312)).toBe("+0.031 xG");
    expect(signedXg(-0.0126)).toBe("-0.013 xG");
    expect(signedXg(-0.0004)).toBe("+0.000 xG");
    expect(direction(0)).toBe("straight ahead");
    expect(direction(60)).toBe("60° left");
    expect(direction(-30)).toBe("30° right");
  });
  it("describes each option with its kind, target, chance and value", () => {
    expect(optionLabel(pass, players)).toBe("Pass to #8 B · 74 % arrives · +0.031 xG");
    expect(optionLabel({ kind: "carry", angle: -30, to: [0, 0], p: 0.9, value: 0, score: -0.0004 }, players))
      .toBe("Carry 30° right · 90 % keeps it · +0.000 xG");
    expect(optionLabel({ kind: "shot", to: [52.5, 0], p: 0.094, value: 1, score: 0.05 }, players))
      .toBe("Shoot · 9 % goal chance · +0.050 xG");
    expect(arrowLabel(pass, players)).toBe("#8 74 %");
  });
  it("describes the pro's choice and the outcome", () => {
    expect(proLabel({ kind: "pass", success: true, recipient: 1, option: pass, approx: false }, players))
      .toBe("The pro passed to #8 B (coach value +0.031 xG).");
    expect(proLabel({ kind: "pass", success: false, recipient: 5, option: pass, approx: true }, players))
      .toBe("The pro's pass towards #8 B did not arrive (coach value +0.031 xG), time from the event log (approximate).");
    expect(proLabel({ kind: "hold", option: null, approx: false }, players)).toBe("The pro held the ball.");
    expect(proLabel({ kind: "shot", option: null, approx: false }, players)).toBe("The pro shot (not one of the coach's options).");
    expect(outcomeLabel("lost")).toBe("ball lost");
  });
  it("picks readable shirt-number ink for a team colour", () => {
    expect(textOn("#9F1922")).toBe("#ffffff");
    expect(textOn("#FFFFFF")).toBe("#0d0e10");
  });
});

describe("canvas summary", () => {
  const m = { players, meta: { home: "Home", guest: "Away" } };
  it("says which view, when, the score and who has the ball", () => {
    expect(frameLabel(m, "Pitch", "12:34, first half", [1, 0], { player: 0, team: 0 }))
      .toBe("Pitch, 12:34, first half, Home 1–0 Away: #10 D. Ginczek (Home) has the ball.");
    expect(frameLabel(m, "3D view (tactical view)", "45:00, second half", [2, 3], null))
      .toBe("3D view (tactical view), 45:00, second half, Home 2–3 Away: no player has the ball.");
  });
});
