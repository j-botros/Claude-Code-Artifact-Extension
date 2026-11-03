import { defineConfig, devices } from "@playwright/test";

/** Playwright config: headless Chromium against the built webview HTML, no VS Code host. */
export default defineConfig({
  testDir: "test/ui",
  outputDir: "test-results/output",
  retries: 0,
  reporter: "list",
  use: { headless: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
