// @ts-check
import fs from "node:fs";
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";

/** "/media/x/confusion_matrix.png" -> "Figure: confusion matrix" (for README figures that have no alt text). */
const altFromFile = (/** @type {string} */ src) =>
  `Figure: ${decodeURIComponent(src.split("/").pop() || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim()}`;

/** WebP copies and sizes of the case-study figures, written by scripts/media.mjs. */
const media = () => {
  try { return JSON.parse(fs.readFileSync("src/data/media.json", "utf8")); } catch { return {}; }
};

/** Figures in case studies: WebP when scripts/media.mjs made one (with its width/height, so nothing jumps), lazy-load
 *  all but the first (the first is often the largest paint), and alt text for every figure (raw HTML <img> tags
 *  copied from the library READMEs often have none). Raw tags and Markdown images count in document order. */
function rehypeLazyImages() {
  const webp = media();
  return (/** @type {any} */ tree) => {
    let seen = 0;
    const walk = (/** @type {any} */ node) => {
      if (node.tagName === "img") {
        const p = node.properties;
        const m = webp[String(p.src)];
        if (!p.alt) p.alt = altFromFile(String(p.src));
        if (m) Object.assign(p, { src: m.src, width: m.width, height: m.height }, m.anim ? { dataAnim: m.anim } : {});
        p.decoding = "async";
        if (seen++ > 0) p.loading = "lazy";
        else p.fetchpriority = "high";
      }
      if (node.type === "raw") {
        node.value = node.value.replace(/<img\b[^>]*>/g, (/** @type {string} */ tag) => {
          const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
          if (!src) return tag;
          const m = webp[src];
          let attrs = tag.replace(/^<img\b/, "").replace(/\s*\/?>$/, "");
          if (m) attrs = attrs.replace(`src="${src}"`, `src="${m.src}"${m.anim ? ` data-anim="${m.anim}"` : ""}`);
          if (!/\balt=/.test(attrs)) attrs += ` alt="${altFromFile(src)}"`;
          // Size hints only when the README did not set its own width (e.g. two figures side by side at 49%).
          if (m && !/\b(width|height)=/.test(attrs)) attrs += ` width="${m.width}" height="${m.height}"`;
          attrs += seen++ > 0 ? ` loading="lazy" decoding="async"` : ` fetchpriority="high" decoding="async"`;
          return `<img${attrs}>`;
        });
      }
      (node.children || []).forEach(walk);
    };
    walk(tree);
  };
}

/** Tables whose header row starts with an empty cell have row labels in column 1: mark them as row headers. */
function rehypeRowHeaders() {
  return (/** @type {any} */ tree) => {
    const walk = (/** @type {any} */ node) => {
      if (node.tagName === "table") {
        const rows = [];
        const collect = (/** @type {any} */ n) => (n.tagName === "tr" ? rows.push(n) : (n.children || []).forEach(collect));
        collect(node);
        const cells = (/** @type {any} */ tr) => tr.children.filter((/** @type {any} */ c) => c.type === "element");
        const corner = rows[0] && cells(rows[0])[0];
        if (corner?.tagName === "th" && !corner.children.some((/** @type {any} */ c) => c.type !== "text" || c.value.trim())) {
          corner.properties.scope = "col";
          corner.children = [{ type: "element", tagName: "span", properties: { className: ["sr-only"] }, children: [{ type: "text", value: "Row" }] }];
          for (const tr of rows.slice(1)) {
            const first = cells(tr)[0];
            if (first?.tagName === "td") { first.tagName = "th"; first.properties.scope = "row"; }
          }
        }
      }
      (node.children || []).forEach(walk);
    };
    walk(tree);
  };
}

// SITE_URL is set by the deploy workflow (custom domain); local builds use the current address.
export default defineConfig({
  site: process.env.SITE_URL || "https://yandouziyassine.github.io",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap({ filter: (page) => !page.includes("/og/") })], // og/ = build-time card templates
  markdown: {
    processor: unified({ rehypePlugins: [rehypeLazyImages, rehypeRowHeaders] }),
    shikiConfig: { theme: "github-dark-high-contrast" }, // the default theme's comments fail WCAG contrast
  },
  // Fonts are downloaded at build time and served by the site itself (no render-blocking Google request),
  // with metric-matched fallbacks so text does not jump when they load.
  fonts: [
    { provider: fontProviders.google(), name: "Instrument Serif", cssVariable: "--font-serif",
      weights: ["400"], styles: ["normal", "italic"], subsets: ["latin"], fallbacks: ["Georgia", "serif"] },
    { provider: fontProviders.google(), name: "Geist", cssVariable: "--font-sans",
      weights: ["400", "500", "600"], styles: ["normal"], subsets: ["latin"], fallbacks: ["sans-serif"] },
    { provider: fontProviders.google(), name: "Geist Mono", cssVariable: "--font-mono",
      weights: ["400", "500"], styles: ["normal"], subsets: ["latin"], fallbacks: ["monospace"] },
  ],
});
