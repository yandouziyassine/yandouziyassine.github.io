// Copies the project 20 replay export (one match + model weights, from the library's coach/export.py) into
// public/football/. Run by hand after a re-export; the output is committed (CC BY 4.0 data, credited on the page;
// CI has no cv-data checkout):
//   npm run sync:football        FOOTBALL_EXPORT overrides ../cv-data/football-coach/site-export (FOOTBALL_OUT: tests)
// z<i>.bin (the ball's height per frame, int16 cm, for the 3D view) is copied when the export has it.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.resolve(process.env.FOOTBALL_EXPORT || path.join(ROOT, "..", "cv-data", "football-coach", "site-export"));
const OUT = path.resolve(process.env.FOOTBALL_OUT || path.join(ROOT, "public", "football"));

if (!fs.existsSync(path.join(SRC, "match.json"))) {
  console.log(`football: no export in ${SRC}, nothing copied`);
  process.exit(0);
}
const meta = JSON.parse(fs.readFileSync(path.join(SRC, "match.json"), "utf8"));
const models = JSON.parse(fs.readFileSync(path.join(SRC, "models.json"), "utf8"));
if (!Array.isArray(meta.halves)) throw new Error("football: old single-file export (match.bin); re-run coach.export in the library");
if (!/CC BY 4\.0/.test(meta.credit || "")) throw new Error("football: match.json has no CC BY 4.0 credit line");
if (models.trained_without !== meta.match_id) throw new Error(`football: models were not trained without ${meta.match_id}`);
meta.halves.forEach((h, i) => {
  const size = fs.statSync(path.join(SRC, `h${i}.bin`)).size, want = h.frames * (h.slots.length + 1) * 4;
  if (size !== want) throw new Error(`football: h${i}.bin is ${size} bytes, expected ${want}`);
});
const zFiles = meta.halves.flatMap((h, i) => {
  const f = `z${i}.bin`, p = path.join(SRC, f);
  if (!fs.existsSync(p)) return [];
  const size = fs.statSync(p).size;
  if (size !== h.frames * 2) throw new Error(`football: ${f} is ${size} bytes, expected ${h.frames * 2}`);
  return [f];
});
const files = ["match.json", "models.json", ...meta.halves.map((_, i) => `h${i}.bin`), ...zFiles];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of files) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
const mb = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1e6;
console.log(`football: ${meta.match_id}, ${meta.halves.map((h) => h.frames).join(" + ")} frames, ${files.length} files, ${mb.toFixed(1)} MB`);
