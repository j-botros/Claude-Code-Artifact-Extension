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

const planPanelModule = load<typeof import("../../src/webview/planPanel")>("webview/planPanel.js");
const planMarkdown = load<typeof import("../../src/plan/planMarkdown")>("plan/planMarkdown.js");

/** The panel's private action runner, reached through a cast because the webview cannot be driven here. */
interface ActionPanel {
  runAction(kind: string, input: unknown): Promise<void>;
  panel: vscode.WebviewPanel;
}

/** Builds a valid plan with a unique title so the exported file name is unique. */
function makePlan(title: string): Plan {
  return {
    title,
    overview: { summary: `Summary for ${title}.`, outOfScope: null },
    proposedChanges: { language: "typescript", code: "export const a = 1;" },
    files: [{ path: "src/a.ts", change: "add a", isNew: true }],
    implementationSteps: ["First step", "Second step"],
    verification: ["Run the tests."],
  };
}

/** The edits message the webview sends with each kebab action. */
function editsOf(plan: Plan): Record<string, unknown> {
  return {
    title: plan.title,
    summary: plan.overview.summary,
    outOfScope: plan.overview.outOfScope ?? "",
    steps: plan.implementationSteps,
  };
}

suite("Kebab menu actions (Copy, Copy Path, Export Artifact)", () => {
  let posted: Array<{ type?: string; ok?: boolean; message?: string }>;

  /** Opens a panel for the plan and records the messages it posts to the webview. */
  function openPanel(plan: Plan): ActionPanel {
    const panel = planPanelModule.PlanPanel.show(plan, async () => ({ ok: false, message: "n/a" }), async () => ({ ok: false, message: "n/a" })) as unknown as ActionPanel;
    const webview = panel.panel.webview;
    const original = webview.postMessage.bind(webview);
    Object.defineProperty(webview, "postMessage", {
      configurable: true,
      value: (m: { type?: string; ok?: boolean; message?: string }) => {
        posted.push(m);
        return original(m);
      },
    });
    return panel;
  }

  const SENTINEL = "kebab-test-sentinel";
  let savedClipboard = "";

  /** Returns what the clipboard holds as a list: empty when untouched since setup. */
  async function clipboardWrites(): Promise<string[]> {
    const text = await vscode.env.clipboard.readText();
    return text === SENTINEL ? [] : [text];
  }

  setup(async () => {
    posted = [];
    // The clipboard API cannot be replaced, so use the real one with a sentinel, and restore it after.
    savedClipboard = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(SENTINEL);
  });

  teardown(async () => {
    await vscode.env.clipboard.writeText(savedClipboard);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("Copy puts the plan as Markdown on the clipboard", async () => {
    const plan = makePlan("Kebab copy plan");
    const p = openPanel(plan);
    await p.runAction("copyMarkdown", editsOf(plan));
    assert.deepStrictEqual(await clipboardWrites(), [planMarkdown.planToMarkdown(plan)]);
    assert.strictEqual(posted.at(-1)?.type, "actionResult");
    assert.strictEqual(posted.at(-1)?.ok, true);
  });

  test("Copy uses the webview's unsaved edits", async () => {
    const plan = makePlan("Kebab copy edits");
    const p = openPanel(plan);
    await p.runAction("copyMarkdown", { ...editsOf(plan), steps: ["Edited first", "Second step"] });
    const writes = await clipboardWrites();
    assert.strictEqual(writes.length, 1);
    assert.ok(writes[0].includes("1. Edited first"));
  });

  test("Copy Path says not saved yet, and copies nothing, before any save", async () => {
    const plan = makePlan("Kebab path unsaved");
    const p = openPanel(plan);
    await p.runAction("copyPath", editsOf(plan));
    assert.deepStrictEqual(await clipboardWrites(), []);
    assert.strictEqual(posted.at(-1)?.ok, false);
    assert.match(posted.at(-1)?.message ?? "", /Not saved yet/);
  });

  test("Export Artifact writes .claude/plans/<slug>.md in the workspace", async () => {
    const plan = makePlan("Kebab Export Plan");
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, "the integration run has a workspace folder");
    const file = path.join(folder.uri.fsPath, ".claude", "plans", "kebab-export-plan.md");
    fs.rmSync(file, { force: true });
    const p = openPanel(plan);
    await p.runAction("exportArtifact", editsOf(plan));
    assert.ok(fs.existsSync(file), "the .md file exists");
    assert.strictEqual(fs.readFileSync(file, "utf8"), planMarkdown.planToMarkdown(plan));
    assert.strictEqual(posted.at(-1)?.ok, true);
    assert.strictEqual(posted.at(-1)?.message, "Exported to .claude/plans/kebab-export-plan.md");
    // Exporting again overwrites without error.
    await p.runAction("exportArtifact", editsOf(plan));
    assert.strictEqual(posted.at(-1)?.ok, true);
    fs.rmSync(file, { force: true });
  });

  test("an invalid edits message is reported, not thrown", async () => {
    const plan = makePlan("Kebab bad edits");
    const p = openPanel(plan);
    await p.runAction("copyMarkdown", { title: 5 });
    assert.deepStrictEqual(await clipboardWrites(), []);
    assert.strictEqual(posted.at(-1)?.ok, false);
  });
});
