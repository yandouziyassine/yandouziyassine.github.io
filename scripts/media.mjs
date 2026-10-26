// Case-study figures: public/media/projects/**/*.{png,jpg,jpeg,gif} -> public/media-webp/<same path>.webp (generated,
// not committed), max 1600 px wide, animated for GIFs. src/data/media.json (also generated) maps each original
// to its WebP and its size; the rehype plugin in astro.config.mjs swaps the src and sets width/height from it.
// The originals stay in public/media (GitHub, the Hugging Face hub page and old links still use them).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "public", "media");
const OUT = path.join(ROOT, "public", "media-webp");
const MANIFEST = path.join(ROOT, "src", "data", "media.json");
const MAX_W = 1600;

const files = fs.readdirSync(SRC, { recursive: true }).map(String).filter((f) => /\.(png|jpe?g|gif)$/i.test(f));
const manifest = {};
let made = 0;
for (const rel of files) {
  const src = path.join(SRC, rel);
  const outRel = rel.replace(/\.[a-z]+$/i, ".webp");
  const out = path.join(OUT, outRel);
  const animated = /\.gif$/i.test(rel);
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(src, { animated }).resize({ width: MAX_W, withoutEnlargement: true })
      .webp({ quality: animated ? 70 : 80, effort: 5 }).toFile(out);
    made++;
  }
  const meta = await sharp(out).metadata();
  const height = meta.pageHeight || meta.height; // animated WebP: height of one frame
  // Keep the original when WebP does not save at least 10 % (small diagrams are often already tiny PNGs).
  if (fs.statSync(out).size > 0.9 * fs.statSync(src).size) continue;
  const key = `/media/${rel.split(path.sep).join("/")}`;
  const url = (p) => `/media-webp/${p.split(path.sep).join("/")}`;
  manifest[key] = { src: url(outRel), width: meta.width, height };
  if (animated && (meta.pages || 1) > 1) {
    // First frame, shown first: an animation only counts as painted once all its frames have downloaded.
    const stillRel = outRel.replace(/\.webp$/, ".still.webp");
    const still = path.join(OUT, stillRel);
    if (!fs.existsSync(still) || fs.statSync(still).mtimeMs < fs.statSync(out).mtimeMs)
      await sharp(src, { animated: false }).resize({ width: MAX_W, withoutEnlargement: true }).webp({ quality: 80 }).toFile(still);
    manifest[key] = { ...manifest[key], src: url(stillRel), anim: url(outRel) };
  }
}

const json = JSON.stringify(manifest, null, 1) + "\n";
const before = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, "utf8") : "";
if (json !== before) {
  fs.writeFileSync(MANIFEST, json);
  // Astro caches rendered Markdown; a new manifest must re-render the case studies.
  for (const cache of [path.join(ROOT, "node_modules", ".astro", "data-store.json"), path.join(ROOT, ".astro", "data-store.json")])
    fs.rmSync(cache, { force: true });
}
console.log(`media: ${made} WebP generated, ${Object.keys(manifest).length} figures swapped`);
