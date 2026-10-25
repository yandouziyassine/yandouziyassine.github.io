import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests", testMatch: "*.spec.mjs",
  use: {
    baseURL: "http://localhost:4321",
    // Chromium's fake camera (a moving test pattern) for the painter test; harmless for the other pages.
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  webServer: { command: "npm run preview", url: "http://localhost:4321", reuseExistingServer: true, timeout: 60_000 },
});
