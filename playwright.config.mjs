import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests", testMatch: "*.spec.mjs",
  use: { baseURL: "http://localhost:4321" },
  webServer: { command: "npm run preview", url: "http://localhost:4321", reuseExistingServer: true, timeout: 60_000 },
});
