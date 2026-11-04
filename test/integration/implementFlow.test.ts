import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Plan } from "../../src/plan/plan";

/** Folder for the stub claude used by the review case; kept inside the repo under out-test/. */
const STUB_ROOT = path.resolve(__dirname, "../../..", "out-test", "stub-bin-implement");

/** Loads a compiled module from out/ so the test shares module state with the running extension. */
function load<T>(rel: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, "../../../out", rel));
}

const planModule = load<typeof import("../../src/plan/plan")>("plan/plan.js");

/** A message the panel posted back to its webview. */
interface Posted {
  type?: string;
  ok?: boolean;
  message?: string;
}

/** Replaces a property on an object and returns a function that restores the original. */
function replace(target: object, key: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  return () => {
    if (original) {
      Object.defineProperty(target, key, original);
    } else {
      delete (target as Record<string, unknown>)[key];
    }
  };
}

/** Writes an executable stub `claude` that prints a successful stream result carrying the plan. */
function writeClaudeStub(dir: string, plan: Plan): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const out = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: JSON.stringify(plan) });
  fs.writeFileSync(path.join(dir, "claude.out"), out + "\n");
  const file = path.join(dir, "claude");
  fs.writeFileSync(file, '#!/bin/sh\nD="${0%/*}"\n/bin/cat "$D/claude.out"\nexit 0\n');
  fs.chmodSync(file, 0o755);
}

/** Returns the inline review tabs currently open (plain text tabs on the inline scheme). */
function inlineTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .filter((t) => t.input instanceof vscode.TabInputText && t.input.uri.scheme === "claude-artifact-inline");
}

/** Waits (polling) until an inline review tab for the path exists, and returns it. */
async function waitForInline(rel: string): Promise<vscode.Tab> {
  for (let i = 0; i < 100; i++) {
    const found = inlineTabs().find((t) => (t.input as vscode.TabInputText).uri.path.includes(rel));
    if (found) {
      return found;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`no inline tab for ${rel}; open: ${inlineTabs().map((t) => t.label).join(", ")}`);
}

/** Waits (polling) until the fake panel has received a message of the given type. */
async function waitForPosted(posted: Posted[], type: string, from: number): Promise<Posted> {
  for (let i = 0; i < 200; i++) {
    const found = posted.slice(from).find((m) => m.type === type);
    if (found) {
      return found;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`no "${type}" message posted; got: ${JSON.stringify(posted)}`);
}

suite("Implement the Design through the panel handler", () => {
  const originalPath = process.env.PATH;
  let restores: Array<() => void> = [];
  let posted: Posted[] = [];
  let listener: ((msg: unknown) => void) | undefined;
  let fakeHtmlSets = 0;

  setup(async () => {
    posted = [];
    listener = undefined;
    fakeHtmlSets = 0;
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    // A fake webview panel captures the message listener the real PlanPanel registers, so
    // the test can post messages exactly as the webview script does.
    const fakePanel = {
      title: "",
      webview: {
        set html(_value: string) {
          fakeHtmlSets++;
        },
        get html(): string {
          return "";
        },
        onDidReceiveMessage(cb: (msg: unknown) => void): vscode.Disposable {
          listener = cb;
          return new vscode.Disposable(() => {});
        },
        postMessage(msg: Posted): Thenable<boolean> {
          posted.push(msg);
          return Promise.resolve(true);
        },
      },
    };
    restores = [replace(vscode.window, "createWebviewPanel", () => fakePanel)];
  });

  teardown(async () => {
    process.env.PATH = originalPath;
    restores.reverse().forEach((r) => r());
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("sample plan: Implement the Design opens the hunk review for the sample file", async () => {
    await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
    assert.ok(listener, "PlanPanel should register a message listener");
    assert.ok(fakeHtmlSets >= 1, "the panel should set its HTML");

    listener({ type: "implementDesign" });

    const result = await waitForPosted(posted, "implementResult", 0);
    assert.strictEqual(result.ok, true, `implement failed: ${result.message}`);
    assert.notStrictEqual(result.message, "This plan has no proposed files.");
    // Inline tabs are not previews, so one tab per reviewed file stays open.
    const tab = await waitForInline("sample-artifact/");
    assert.ok(tab, "an inline review tab for a sample file should be open");
    const diffs = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputTextDiff);
    assert.strictEqual(diffs.length, 0, "no diff editor tab should open");
  });

  test("Review Comments with a revised plan that has no proposedFiles: Implement still shows hunks", async () => {
    const revised: Plan = {
      ...planModule.samplePlan,
      title: "Revised sample without proposed files",
    };
    delete revised.proposedFiles;
    const dir = path.join(STUB_ROOT, "revised");
    writeClaudeStub(dir, revised);
    process.env.PATH = dir;

    await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
    assert.ok(listener, "PlanPanel should register a message listener");
    const sample = planModule.samplePlan;

    listener({
      type: "reviewComments",
      title: sample.title,
      summary: sample.overview.summary,
      outOfScope: sample.overview.outOfScope,
      steps: sample.implementationSteps,
      comments: { title: "Make the title clearer." },
    });

    // A successful review re-renders the panel (a second HTML set) with the revised plan.
    for (let i = 0; i < 200 && fakeHtmlSets < 2; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(fakeHtmlSets >= 2, `review did not re-render the panel; posted: ${JSON.stringify(posted)}`);

    const before = posted.length;
    listener({ type: "implementDesign" });
    const result = await waitForPosted(posted, "implementResult", before);
    assert.strictEqual(result.ok, true, `implement failed after review: ${result.message}`);
    await waitForInline("sample-artifact/");
  });
});
