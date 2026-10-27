// Copies the project 14 public pair set into the site: src/data/depth-game.json + public/media/depth-game/*.
// Run by hand after the library publishes a new set (the output is committed, CI has no library checkout):
//   node scripts/depth-game.mjs [path-to-COMPUTER-VISION-PROJECT-LIBRARY]
// Refuses any image whose credit is not a general free licence (owner rule: no copyrighted images online).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIB = path.resolve(process.argv[2] || path.join(ROOT, "..", "COMPUTER-VISION-PROJECT-LIBRARY"));
const DOCS = path.join(LIB, "14-monocular-depth-3d", "docs");
const SRC = path.join(DOCS, "w9_public_pairs.json");
export const FREE_LICENCE = /^(CC0|Public domain|CC BY(-SA)? \d\.\d|MIT|Apache-2\.0)\b/i;

if (!fs.existsSync(SRC)) { console.log(`depth-game: no ${path.relative(LIB, SRC)} yet, nothing copied`); process.exit(0); }
const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
const credit = new Map(data.credits.map((c) => [c.img, c]));
// A composite (a picture pasted on a wall photo) lists the pasted picture under "includes": both must be free.
const free = (c) => !!c && FREE_LICENCE.test(c.license || "") && (!c.includes || FREE_LICENCE.test(c.includes.license || ""));
const bad = data.pairs.filter((p) => !free(credit.get(p.img)));
if (bad.length) throw new Error(`depth-game: ${bad.length} pairs without a free licence, e.g. ${bad[0].img}`);

const OUT = path.join(ROOT, "public", "media", "depth-game");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const rename = (img) => `/media/depth-game/${path.basename(img)}`;
for (const img of new Set(data.pairs.map((p) => p.img))) fs.copyFileSync(path.join(DOCS, img), path.join(ROOT, "public", rename(img)));
const out = {
  ...data,
  pairs: data.pairs.map((p) => ({ ...p, img: rename(p.img) })),
  credits: data.credits.filter((c) => data.pairs.some((p) => p.img === c.img)).map((c) => ({ ...c, img: rename(c.img) })),
};
fs.writeFileSync(path.join(ROOT, "src", "data", "depth-game.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`depth-game: ${out.pairs.length} pairs, ${new Set(out.pairs.map((p) => p.img)).size} images, ${out.models.length} models`);
