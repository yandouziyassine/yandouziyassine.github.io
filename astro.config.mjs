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

// SITE_URL is set by the deploy workflow (custom domain); local builds use the current address.
export default defineConfig({
  site: process.env.SITE_URL || "https://yandouziyassine.github.io",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap()],
  markdown: { processor: unified({ rehypePlugins: [rehypeLazyImages] }) },
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
