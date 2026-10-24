// Card thumbnails: public/images/<name>.<ext> -> public/thumbs/<name>-400.webp and -800.webp (generated, not committed).
// GIF covers become their first frame: a grid of cards should not download several MB of animation.
// The full-size originals stay in public/images (case studies, Open Graph previews, the Hugging Face hub page).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "public", "images");
const OUT = path.join(ROOT, "public", "thumbs");
fs.mkdirSync(OUT, { recursive: true });

let made = 0;
for (const file of fs.readdirSync(SRC)) {
  const ext = path.extname(file).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) continue;   // SVGs are already tiny and sharp
  const base = path.basename(file, ext);
  for (const width of [400, 800]) {
    const out = path.join(OUT, `${base}-${width}.webp`);
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(path.join(SRC, file)).mtimeMs) continue;
    await sharp(path.join(SRC, file), { animated: false })
      .resize({ width, height: Math.round((width * 9) / 16), fit: "cover", position: "top" })
      .webp({ quality: 72 })
      .toFile(out);
    made++;
  }
}
console.log(`thumbnails: ${made} generated in public/thumbs`);
