import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fakeExport(dir, { size = 2 * 3 * 4, credit = "Data: someone, CC BY 4.0", trainedWithout = "T", z = null } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const halves = [{ frames: 2, slots: [0, 1], attack: [1, -1] }];
  fs.writeFileSync(path.join(dir, "match.json"), JSON.stringify({ match_id: "T", fps: 12.5, halves, players: [], credit }));
  fs.writeFileSync(path.join(dir, "models.json"), JSON.stringify({ trained_without: trainedWithout }));
  fs.writeFileSync(path.join(dir, "h0.bin"), Buffer.alloc(size));
  if (z !== null) fs.writeFileSync(path.join(dir, "z0.bin"), Buffer.alloc(z)); // ball height: 2 bytes per frame
}
const run = (src, out) => spawnSync(process.execPath, ["scripts/football.mjs"],
  { env: { ...process.env, FOOTBALL_EXPORT: src, FOOTBALL_OUT: out }, encoding: "utf8" });

describe("npm run sync:football", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "football-"));

  it("copies match.json, models.json and one file per half", () => {
    const src = path.join(tmp, "ok"), out = path.join(tmp, "out-ok");
    fakeExport(src);
    const r = run(src, out);
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual(["h0.bin", "match.json", "models.json"]);
  });
  it("refuses a half file of the wrong size", () => {
    const src = path.join(tmp, "size");
    fakeExport(src, { size: 10 });
    const r = run(src, path.join(tmp, "out-size"));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/h0\.bin is 10 bytes, expected 24/);
  });
  it("copies the ball height file of each half when the export has it", () => {
    const src = path.join(tmp, "z"), out = path.join(tmp, "out-z");
    fakeExport(src, { z: 2 * 2 });
    const r = run(src, out);
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual(["h0.bin", "match.json", "models.json", "z0.bin"]);
  });
  it("refuses a ball height file of the wrong size", () => {
    const src = path.join(tmp, "zsize");
    fakeExport(src, { z: 3 });
    const r = run(src, path.join(tmp, "out-zsize"));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/z0\.bin is 3 bytes, expected 4/);
  });
  it("refuses models that saw the replay match, and data without the CC BY credit", () => {
    const a = path.join(tmp, "seen"), b = path.join(tmp, "credit");
    fakeExport(a, { trainedWithout: "OTHER" });
    fakeExport(b, { credit: "no licence" });
    expect(run(a, path.join(tmp, "out-a")).stderr).toMatch(/not trained without T/);
    expect(run(b, path.join(tmp, "out-b")).stderr).toMatch(/CC BY 4\.0/);
  });
  it("does nothing when there is no export", () => {
    const out = path.join(tmp, "out-none");
    const r = run(path.join(tmp, "missing"), out);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/nothing copied/);
    expect(fs.existsSync(out)).toBe(false);
  });
});
