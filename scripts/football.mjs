// Copies the project 20 replay export (one match + model weights, from the library's coach/export.py) into
// public/football/. Run by hand after a re-export; the output is committed (CC BY 4.0 data, credited on the page;
// CI has no cv-data checkout):
//   npm run sync:football        FOOTBALL_EXPORT overrides ../cv-data/football-coach/site-export (FOOTBALL_OUT: tests)
// z<i>.bin (the ball's height per frame, int16 cm, for the 3D view) is copied when the export has it, and so is
// profiles.json (display-only player profiles, built without the replay match; checked below).
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
// profiles.json: player cards. Built from the other matches only, and never allowed to change the advice (a = 0).
const profilesPath = path.join(SRC, "profiles.json");
const hasProfiles = fs.existsSync(profilesPath);
if (hasProfiles) {
  const size = fs.statSync(profilesPath).size;
  if (size > 100_000) throw new Error(`football: profiles.json is ${size} bytes (over 100 kB)`);
  const prof = JSON.parse(fs.readFileSync(profilesPath, "utf8"));
  if (!Array.isArray(prof.built_without) || !prof.built_without.includes(meta.match_id))
    throw new Error(`football: profiles were not built without ${meta.match_id}`);
  if (prof.advice_effect !== "display-only" || Object.values(prof.a || {}).some((a) => a !== 0))
    throw new Error("football: profiles.json would change the advice (the site shows profiles for information only)");
  if (!prof.players || typeof prof.players !== "object") throw new Error("football: profiles.json has no players");
  for (const [i, p] of Object.entries(prof.players)) {
    if (!meta.players[Number(i)]) throw new Error(`football: profiles.json player ${i} is not in match.json`);
    for (const f of ["pass_skill", "finishing"]) {
      const o = p[f];
      if (o && !(Number.isFinite(o.logit) && Number.isInteger(o.n) && o.n >= 0)) throw new Error(`football: profiles.json player ${i} ${f} is malformed`);
    }
  }
}
// The credit for the profiles' data is the match's: IDSSE events of the other matches, CC BY 4.0 (match.json credit).
if (!models.shot_trained_on) console.warn("football: models.json has no shot_trained_on (shot model trained on the other Bundesliga matches only?)");
const files = ["match.json", "models.json", ...(hasProfiles ? ["profiles.json"] : []), ...meta.halves.map((_, i) => `h${i}.bin`), ...zFiles];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of files) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
const mb = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1e6;
console.log(`football: ${meta.match_id}, ${meta.halves.map((h) => h.frames).join(" + ")} frames, ${files.length} files, ${mb.toFixed(1)} MB`);
