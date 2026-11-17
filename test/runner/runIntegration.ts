import { mkdirSync } from "node:fs";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

/** Launches VS Code 1.107.0 with the extension and runs the in-host test entry; exits non-zero on failure. */
async function main(): Promise<void> {
  // This file compiles to out-test/test/runner/runIntegration.js, three levels below the repo root.
  const root = path.resolve(__dirname, "..", "..", "..");
  const workspaceFolder = path.resolve(root, "test-results/integration-workspace");
  // The workspace folder must exist before VS Code opens it.
  mkdirSync(workspaceFolder, { recursive: true });

  await runTests({
    version: "1.107.0",
    extensionDevelopmentPath: root,
    extensionTestsPath: path.resolve(__dirname, "index"),
    launchArgs: [workspaceFolder],
  });
}

main().catch((err: unknown) => {
  console.error("Integration tests failed:", err);
  process.exit(1);
});
