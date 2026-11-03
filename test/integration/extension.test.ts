import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Plan } from "../../src/plan/plan";

const EXTENSION_ID = "j-botros.claude-code-artifact";
const PANEL_VIEW_TYPE = "claudeArtifact.plan";
const SAMPLE_TITLE = "Sample Implementation Plan";

/**
 * Loads the review module from the compiled extension (out/), not from src/, so the test
 * shares the same module state (the session) as the extension's registered lens provider.
 */
function loadReviewModule(): typeof import("../../src/review/hunkReview") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, "../../../out/review/hunkReview.js"));
}

/** Returns the webview tabs currently open in any tab group. */
function webviewTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .filter((t) => t.input instanceof vscode.TabInputWebview);
}

suite("Claude Code Artifact extension", () => {
  // Close every editor after each test so tests do not leak state into one another.
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  // The extension is installed and becomes active once one of its commands has run.
  test("activates when a command runs", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, "extension should be installed in the host");
    await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
    assert.strictEqual(ext.isActive, true);
  });

  // The sample-plan command is registered and runs without throwing.
  test("openSamplePlan is registered and runs", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("claudeArtifact.openSamplePlan"));
    await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
  });

  // The sample-plan command opens a webview tab with the plan panel's view type and title.
  test("openSamplePlan opens the plan webview tab", async () => {
    // The tab list updates asynchronously, so listen for the change before running the command.
    const changed = new Promise<void>((resolve) => {
      const sub = vscode.window.tabGroups.onDidChangeTabs(() => {
        sub.dispose();
        resolve();
      });
    });
    await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
    if (webviewTabs().length === 0) {
      await changed;
    }
    const tabs = webviewTabs();
    const match = tabs.find(
      (t) =>
        t.label === SAMPLE_TITLE &&
        t.input instanceof vscode.TabInputWebview &&
        t.input.viewType.endsWith(PANEL_VIEW_TYPE)
    );
    assert.ok(match, `expected a webview tab; found: ${tabs.map((t) => t.label).join(", ")}`);
  });

  // The diff review opens a diff editor and offers accept and reject CodeLenses, writing nothing.
  test("diff review opens a diff and offers accept and reject lenses", async () => {
    const review = loadReviewModule();
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    assert.ok(folder, "a workspace folder should be open");
    const plan: Plan = {
      title: "Integration test plan",
      overview: { summary: "Test plan.", outOfScope: null },
      proposedChanges: { language: "typescript", code: "export const a = 1;" },
      files: [{ path: "integration-review-target.txt", change: "new file", isNew: true }],
      implementationSteps: ["Review the diff."],
      verification: ["Integration test."],
      proposedFiles: [{ path: "integration-review-target.txt", content: "line one\nline two\n" }],
    };

    const result = await review.startImplementReview(plan, folder);
    assert.strictEqual(result.ok, true, result.message);

    const tab = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .find((t) => t.input instanceof vscode.TabInputTextDiff);
    assert.ok(tab, "a diff editor tab should be open");
    const input = tab.input as vscode.TabInputTextDiff;

    const lenses = (await vscode.commands.executeCommand(
      "vscode.executeCodeLensProvider",
      input.modified
    )) as vscode.CodeLens[];
    const ids = lenses.map((l) => l.command?.command);
    assert.ok(ids.includes("claudeArtifact.acceptHunk"), "accept lens missing");
    assert.ok(ids.includes("claudeArtifact.rejectHunk"), "reject lens missing");

    // Nothing was written to the workspace.
    const target = vscode.Uri.joinPath(folder, "integration-review-target.txt");
    await assert.rejects(async () => vscode.workspace.fs.stat(target));
  });
});
