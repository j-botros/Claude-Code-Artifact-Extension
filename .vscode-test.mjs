import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@vscode/test-cli";

const root = dirname(fileURLToPath(import.meta.url));
const workspaceFolder = resolve(root, "test-results/integration-workspace");

// The workspace folder must exist before VS Code opens it.
mkdirSync(workspaceFolder, { recursive: true });

/** Integration test config: runs the compiled specs in an Extension Development Host. */
export default defineConfig({
  files: "out-test/integration/**/*.test.js",
  version: "1.107.0",
  extensionDevelopmentPath: root,
  workspaceFolder,
  mocha: { timeout: 60000 },
});
