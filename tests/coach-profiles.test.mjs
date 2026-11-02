import { describe, expect, it } from "vitest";
import { NO_HISTORY, cardLines, cardText, passingLine, readProfiles, shootingLine } from "../src/lib/coach/profiles.ts";

describe("player card text", () => {
  it("says a player without history has none", () => {
    expect(cardLines(undefined)).toEqual([NO_HISTORY]);
    expect(cardLines({ name: "X" })).toEqual([NO_HISTORY]);
    expect(NO_HISTORY).toBe("No history for this player in the other matches.");
  });
  it("words the passing offset plainly with its sample size", () => {
    expect(passingLine({ logit: 0.06, n: 212 })).toBe("Passing: completes slightly more passes than expected (212 passes; +0.06 logit vs expected, shrunk).");
    expect(passingLine({ logit: -0.06, n: 212 })).toBe("Passing: completes slightly fewer passes than expected (212 passes; -0.06 logit vs expected, shrunk).");
    expect(passingLine({ logit: 0.3, n: 60 })).toMatch(/^Passing: completes more passes than expected \(60 passes; \+0\.30 logit/);
    expect(passingLine({ logit: -0.3, n: 60 })).toMatch(/completes fewer passes than expected/);
    expect(passingLine({ logit: 0.004, n: 94 })).toBe("Passing: completes about as many passes as expected (94 passes; +0.00 logit vs expected, shrunk).");
    expect(passingLine({ logit: -0.0004, n: 94 })).toContain("+0.00 logit"); // no "-0.00"
  });
  it("does not read an offset out of a handful of passes", () => {
    expect(passingLine({ logit: 0.9, n: 6 })).toBe("Passing: only 6 passes in the other matches, too few to say.");
    expect(passingLine({ logit: 0.9, n: 1 })).toBe("Passing: only 1 pass in the other matches, too few to say.");
    expect(passingLine({ logit: 0, n: 0 })).toBe("Passing: no passes in the other matches.");
    expect(shootingLine({ logit: 1, n: 3 })).toBe("Shooting: only 3 shots in the other matches, too few to say.");
    expect(shootingLine({ logit: 0.2, n: 40 })).toMatch(/^Shooting: scores more goals than the shots' xG suggests \(40 shots/);
  });
  it("uses no judgemental label", () => {
    const all = [-1, -0.3, -0.1, 0, 0.1, 0.3, 1].flatMap((x) => [passingLine({ logit: x, n: 100 }), shootingLine({ logit: x, n: 100 })]).join(" ");
    expect(all).not.toMatch(/\b(good|bad|poor|great|best|worst|elite|weak|strong|reliable|unreliable|rating)\b/i);
  });
  it("builds the lines that exist and one screen-reader sentence", () => {
    const p = { pass_skill: { logit: 0.01, n: 30 }, finishing: { logit: 0, n: 2 } };
    expect(cardLines(p)).toHaveLength(2);
    expect(cardLines({ pass_skill: { logit: 0.01, n: 30 } })).toHaveLength(1);
    expect(cardText("#4 Hendrix, ball carrier", p)).toMatch(/^#4 Hendrix, ball carrier\. Passing: .* Shooting: only 2 shots/);
  });
  it("ignores a profiles file of the wrong shape", () => {
    expect(readProfiles(null)).toBeNull();
    expect(readProfiles({ players: 3 })).toBeNull();
    expect(readProfiles({ players: {} })).not.toBeNull();
  });
});
