// Builds the Hugging Face Space "yandyassine/cv-project-library" (a static project browser) into dist-hf/:
// hf-hub/index.html + README.md, and projects.js from legacy/data/projects.js with site-relative links made absolute
// and a map from project number to its case-study page. Upload (owner's own Hugging Face login):
//   python -c "from huggingface_hub import upload_folder; upload_folder(repo_id='yandyassine/cv-project-library',
//              repo_type='space', folder_path='dist-hf')"
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SITE = "https://yandouziyassine.github.io";
const OUT = path.join(ROOT, "dist-hf");
fs.mkdirSync(OUT, { recursive: true });

const data = fs.readFileSync(path.join(ROOT, "legacy", "data", "projects.js"), "utf8")
  .replace(/href: "\/(?!\/)/g, `href: "${SITE}/`);
const cases = {};
const dir = path.join(ROOT, "src", "content", "projects");
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  const n = fs.readFileSync(path.join(dir, f), "utf8").match(/^number: '?(\d+)'?$/m)?.[1];
  if (n) cases[n] = f.replace(/\.md$/, "");
}
fs.writeFileSync(path.join(OUT, "projects.js"),
  `${data.trimEnd()}\n\n// Added by scripts/build-hf-hub.mjs: project number -> case-study page on ${SITE}.\n` +
  `window.CASE_STUDIES = ${JSON.stringify(cases)};\n`);
for (const f of ["index.html", "README.md"]) fs.copyFileSync(path.join(ROOT, "hf-hub", f), path.join(OUT, f));
console.log(`dist-hf/: ${Object.keys(cases).length} case-study links, relative links made absolute`);
