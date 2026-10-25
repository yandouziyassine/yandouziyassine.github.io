import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Generic patterns only: the owner's real phone number and email must never be written in this repo.
const DIST = path.resolve("dist");
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const TEXT = new Set([".html", ".xml", ".txt", ".js", ".css", ".json", ".md"]);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

describe("no personal contact details are published", () => {
  it("resume.yaml has no phone number or email", () => {
    const src = fs.readFileSync("src/data/resume.yaml", "utf8");
    expect(src).not.toMatch(PHONE);
    expect(src).not.toMatch(EMAIL);
  });

  it("no built text file contains a phone number or an email address", () => {
    expect(fs.existsSync(DIST), "run npm run build first").toBe(true);
    const hits = files(DIST).filter((f) => TEXT.has(path.extname(f))).flatMap((f) => {
      const text = fs.readFileSync(f, "utf8");
      return [PHONE, EMAIL].filter((re) => re.test(text)).map((re) => `${path.relative(DIST, f)} matches ${re}`);
    });
    expect(hits).toEqual([]);
  });

  it("the PDF exists and is small (printed from the checked page, not a hand-made file)", () => {
    const pdf = path.join(DIST, "cv", "Yassine_Yandouzi_CV.pdf");
    expect(fs.existsSync(pdf)).toBe(true);
    expect(fs.statSync(pdf).size).toBeLessThan(2_000_000);
  });
});
