import { defineConfig } from "@playwright/test";
// Tests run against the built site (dist/) on its own port, so a dev server on 4321 is never picked up by mistake.
const PORT = 4322;
export default defineConfig({
  testDir: "tests", testMatch: "*.spec.mjs",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Chromium's fake camera (a moving test pattern) for the painter test; harmless for the other pages.
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  webServer: { command: `npx astro preview --port ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 60_000 },
});
