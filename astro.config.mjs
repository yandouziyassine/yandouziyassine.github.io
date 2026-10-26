// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";

/** Figures in case studies: lazy-load all but the first (the first is often the largest paint). */
function rehypeLazyImages() {
  return (/** @type {any} */ tree) => {
    let seen = 0;
    const walk = (/** @type {any} */ node) => {
      if (node.tagName === "img") {
        node.properties.decoding = "async";
        if (seen++ > 0) node.properties.loading = "lazy";
        else node.properties.fetchpriority = "high";
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
  integrations: [sitemap()],
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
