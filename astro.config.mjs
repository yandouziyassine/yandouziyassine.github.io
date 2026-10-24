// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// SITE_URL is set by the deploy workflow (custom domain); local builds use the current address.
export default defineConfig({
  site: process.env.SITE_URL || "https://yandouziyassine.github.io",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap()],
});
