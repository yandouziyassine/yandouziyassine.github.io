import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** A tiny dist/: the football page loads entry.js (which imports shared.js) and import()s view3d.js -> three.js. */
function fakeDist(dir, { leak = false, threeBytes = 100 } = {}) {
  const a = path.join(dir, "_astro"), page = path.join(dir, "demos", "football");
  fs.mkdirSync(a, { recursive: true });
  fs.mkdirSync(page, { recursive: true });
  fs.writeFileSync(path.join(page, "index.html"), `<html><script type="module" src="/_astro/entry.AAA.js"></script></html>`);
  fs.writeFileSync(path.join(a, "entry.AAA.js"), `import{a}from"./shared.BBB.js";${leak ? "x.isWebGLRenderer=!0;" : ""}const v=()=>import("./view3d.CCC.js");`);
  fs.writeFileSync(path.join(a, "shared.BBB.js"), `export const a=1;`);
  fs.writeFileSync(path.join(a, "view3d.CCC.js"), `import{a}from"./shared.BBB.js";import"./three.DDD.js";export const createView3D=1;`);
  fs.writeFileSync(path.join(a, "three.DDD.js"), `this.isWebGLRenderer=!0;"aCell";` + crypto.randomBytes(threeBytes).toString("base64"));
}
const run = (dist, env = {}) => spawnSync(process.execPath, ["scripts/bundle-3d.mjs"], { env: { ...process.env, BUNDLE_DIST: dist, ...env }, encoding: "utf8" });

describe("npm run test:bundle", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));

  it("reports the lazy 3D files and their gzip size", () => {
    const d = path.join(tmp, "ok");
    fakeDist(d);
    const r = run(d);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/the 3D view adds 2 file\(s\)/);
    expect(r.stdout).toMatch(/_astro\/view3d\.CCC\.js/);
    expect(r.stdout).toMatch(/_astro\/three\.DDD\.js/);
    expect(r.stdout).not.toMatch(/ {2}_astro\/shared/); // shared with the page: not counted as 3D
  });
  it("fails when 3D code is loaded up front", () => {
    const d = path.join(tmp, "leak");
    fakeDist(d, { leak: true });
    const r = run(d);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/3D code is loaded up front in _astro\/entry\.AAA\.js/);
  });
  it("fails over the gzip budget", () => {
    const d = path.join(tmp, "big");
    fakeDist(d, { threeBytes: 4096 });
    const r = run(d, { BUNDLE_BUDGET_KB: "1" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/over the 1 kB budget/);
  });
  it("does nothing when the football page is not built", () => {
    const r = run(path.join(tmp, "none"));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/nothing checked/);
  });
});
