import { defineConfig } from "vitest/config";

/** Vitest config: unit tests only; UI (Playwright) and integration specs are excluded. */
export default defineConfig({
  test: {
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "out/**", "out-test/**", "test/ui/**", "test/integration/**"],
  },
});
