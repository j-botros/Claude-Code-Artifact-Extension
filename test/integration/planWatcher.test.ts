import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Plan } from "../../src/plan/plan";

/** Loads a compiled module from out/ so the test shares module state with the running extension. */
function load<T>(rel: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, "../../../out", rel));
}

const planWatch = load<typeof import("../../src/plan/planWatch")>("plan/planWatch.js");

/** Builds a valid plan with a unique title so the tab label identifies it. */
function makePlan(title: string): Plan {
  return {
    title,
    overview: { summary: `Summary for ${title}.`, outOfScope: null },
    proposedChanges: { language: "typescript", code: "export const a = 1;" },
    files: [{ path: "src/a.ts", change: "add a", isNew: true }],
    implementationSteps: ["First step"],
    verification: ["Run the tests."],
  };
}

/** Returns the labels of open webview tabs. */
function webviewLabels(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .filter((t) => t.input instanceof vscode.TabInputWebview)
    .map((t) => t.label);
}

/** Waits (polling) until a webview tab with the label is open. */
async function waitForTab(label: string): Promise<void> {
  for (let i = 0; i < 160; i++) {
    if (webviewLabels().includes(label)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`no webview tab "${label}"; open: ${webviewLabels().join(", ")}`);
}

/** Counts open webview tabs with the label. */
function countTabs(label: string): number {
  return webviewLabels().filter((l) => l === label).length;
}

suite("Plan folder watcher", () => {
  let dir: string;

  suiteSetup(async () => {
    await vscode.extensions.getExtension("j-botros.claude-code-artifact")?.activate();
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, "a workspace folder is open");
    dir = path.join(folder.uri.fsPath, ".claude", "plans");
    fs.mkdirSync(dir, { recursive: true });
  });

  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("a new plan file opens the artifact; an own save of the same content does not open it again", async function () {
    this.timeout(30000);
    const title = "Watcher new file plan";
    const text = JSON.stringify(makePlan(title), null, 2) + "\n";
    fs.writeFileSync(path.join(dir, "watcher-new.json"), text);
    await waitForTab(title);
    assert.strictEqual(countTabs(title), 1);

    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    assert.strictEqual(countTabs(title), 0);

    // Same steps as PlanPanel.save: record the hash, then write the exact text.
    planWatch.recordOwnSave(text);
    fs.writeFileSync(path.join(dir, "watcher-new.json"), text);
    await new Promise((r) => setTimeout(r, 3000));
    assert.strictEqual(countTabs(title), 0, "own save must not reopen the panel");
  });

  test("invalid JSON shows one warning naming the file and opens no panel", async function () {
    this.timeout(30000);
    const original = vscode.window.showWarningMessage;
    const messages: string[] = [];
    Object.defineProperty(vscode.window, "showWarningMessage", {
      value: async (m: string) => {
        messages.push(m);
        return undefined;
      },
      configurable: true,
      writable: true,
    });
    try {
      fs.writeFileSync(path.join(dir, "watcher-bad.json"), "{ not json");
      for (let i = 0; i < 100 && messages.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await new Promise((r) => setTimeout(r, 1000));
      assert.strictEqual(messages.length, 1);
      assert.ok(messages[0].includes("watcher-bad.json"), messages[0]);
      assert.strictEqual(webviewLabels().length, 0);
    } finally {
      Object.defineProperty(vscode.window, "showWarningMessage", {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });
});
