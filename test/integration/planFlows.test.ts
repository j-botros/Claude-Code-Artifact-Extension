import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Plan } from "../../src/plan/plan";

/** Root of the repository, used to keep every stub file inside the repo (under out-test/). */
const STUB_ROOT = path.resolve(__dirname, "../../..", "out-test", "stub-bin");

/** Loads a compiled module from out/ so the test shares module state with the running extension. */
function load<T>(rel: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, "../../../out", rel));
}

const agyRunner = load<typeof import("../../src/agy/agyRunner")>("agy/agyRunner.js");
const claudeRunner = load<typeof import("../../src/claude/claudeRunner")>("claude/claudeRunner.js");
const extensionModule = load<typeof import("../../src/extension")>("extension.js");
const planPanelModule = load<typeof import("../../src/webview/planPanel")>("webview/planPanel.js");

/** Builds a valid plan with a unique title so the tab label proves which plan was rendered. */
function makePlan(title: string): Plan {
  return {
    title,
    overview: { summary: `Summary for ${title}.`, outOfScope: null },
    proposedChanges: { language: "typescript", code: "export const a = 1;" },
    files: [{ path: "src/a.ts", change: "add a", isNew: true }],
    implementationSteps: [`First step of ${title}`, `Second step of ${title}`],
    verification: ["Run the tests."],
  };
}

/** Writes an executable `#!/bin/sh` stub plus its fixture file into a per-case directory. */
function writeStub(
  caseDir: string,
  tool: "claude" | "agy",
  opts: { stdout?: string; stderr?: string; exitCode?: number; marker?: boolean }
): void {
  fs.mkdirSync(caseDir, { recursive: true });
  const lines = ["#!/bin/sh", 'D="${0%/*}"'];
  if (opts.marker) {
    lines.push('printf x >> "$D/ran.marker"');
  }
  if (opts.stdout !== undefined) {
    fs.writeFileSync(path.join(caseDir, `${tool}.out`), opts.stdout + "\n");
    lines.push(`/bin/cat "$D/${tool}.out"`);
  }
  if (opts.stderr !== undefined) {
    fs.writeFileSync(path.join(caseDir, `${tool}.err`), opts.stderr + "\n");
    lines.push(`/bin/cat "$D/${tool}.err" >&2`);
  }
  lines.push(`exit ${opts.exitCode ?? 0}`);
  const file = path.join(caseDir, tool);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  fs.chmodSync(file, 0o755);
}

/** One-line stream output for a successful claude run carrying the given plan. */
function claudeOk(plan: Plan): string {
  return JSON.stringify({ type: "result", subtype: "success", is_error: false, result: JSON.stringify(plan) });
}

/** One-line stream output for an agy run with the given response text. */
function agyResponse(response: string): string {
  return JSON.stringify({ type: "result", response });
}

/** Returns the webview tab labels currently open. */
function webviewLabels(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .filter((t) => t.input instanceof vscode.TabInputWebview)
    .map((t) => t.label);
}

/** Waits (polling) until a webview tab with the label is open. */
async function waitForTab(label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (webviewLabels().includes(label)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`no webview tab "${label}"; open: ${webviewLabels().join(", ")}`);
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

suite("Plan flows with stub claude and agy", () => {
  const originalPath = process.env.PATH;
  let restores: Array<() => void> = [];
  let errors: string[] = [];
  let warnings: number;
  let warningAnswer: string | undefined;
  let inputAnswer: string | undefined;

  /** Points PATH at only the given case directory (so only its stubs exist). */
  function usePath(caseName: string, setup: (dir: string) => void): string {
    const dir = path.join(STUB_ROOT, caseName);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    setup(dir);
    process.env.PATH = dir;
    return dir;
  }

  /** Runs the real generate-plan command with the stubbed UI. */
  async function runGenerate(): Promise<void> {
    await vscode.commands.executeCommand("claudeArtifact.generatePlan");
  }

  suiteSetup(async () => {
    // Activate the extension so its context (globalState) is set before any flow runs.
    await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
  });

  setup(() => {
    errors = [];
    warnings = 0;
    warningAnswer = "Run agy";
    inputAnswer = "Plan something";
    restores = [
      replace(vscode.window, "showInputBox", async () => inputAnswer),
      replace(vscode.window, "showWarningMessage", async () => {
        warnings++;
        return warningAnswer;
      }),
      replace(vscode.window, "showErrorMessage", async (m: string) => {
        errors.push(m);
        return undefined;
      }),
    ];
  });

  teardown(async () => {
    process.env.PATH = originalPath;
    restores.reverse().forEach((r) => r());
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  // Cancel runs first: the accept flag is remembered for the whole host once accepted.
  test("claude missing, warning cancelled: error shown and agy never runs", async () => {
    const dir = usePath("cancel", (d) => writeStub(d, "agy", { stdout: agyResponse("x"), marker: true }));
    // Remove claude: the dir holds only agy, so claude is missing.
    warningAnswer = undefined;
    await runGenerate();
    assert.strictEqual(warnings, 1, "the warning modal should be shown (flag not yet set)");
    assert.deepStrictEqual(errors, ["The agy fallback was cancelled."]);
    assert.strictEqual(fs.existsSync(path.join(dir, "ran.marker")), false, "agy must not run");
  });

  test("claude succeeds: plan tab opens and HTML has sections in order", async () => {
    const plan = makePlan("Flow plan claude ok");
    usePath("claude-ok", (d) => writeStub(d, "claude", { stdout: claudeOk(plan) }));
    await runGenerate();
    await waitForTab(plan.title);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(warnings, 0, "no agy warning when claude works");
    const html = planPanelModule.PlanPanel.lastRenderedHtml;
    assert.ok(html, "lastRenderedHtml should be set");
    const order = [plan.title, plan.overview.summary, "src/a.ts", plan.implementationSteps[0], plan.implementationSteps[1], "Run the tests."];
    let last = -1;
    for (const text of order) {
      const at = html.indexOf(text, last + 1);
      assert.ok(at > last, `"${text}" missing or out of order in the HTML`);
      last = at;
    }
  });

  test("claude not logged in, agy succeeds: plan rendered, modal shown once", async () => {
    const plan = makePlan("Flow plan agy ok");
    usePath("agy-ok", (d) => {
      writeStub(d, "claude", { stderr: "Not logged in · Please run /login", exitCode: 1 });
      writeStub(d, "agy", { stdout: agyResponse(JSON.stringify(plan)) });
    });
    await runGenerate();
    await waitForTab(plan.title);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(warnings, 1, "the modal should be shown once");
    assert.ok(planPanelModule.PlanPanel.lastRenderedHtml?.includes(plan.title));
  });

  test("flag remembered: modal is not shown again after it was accepted", async () => {
    const plan = makePlan("Flow plan agy second run");
    usePath("agy-again", (d) => {
      writeStub(d, "claude", { stderr: "Not logged in", exitCode: 1 });
      writeStub(d, "agy", { stdout: agyResponse(JSON.stringify(plan)) });
    });
    await runGenerate();
    await waitForTab(plan.title);
    assert.strictEqual(warnings, 0, "modal must not repeat once accepted");
  });

  test("claude missing and agy missing: AGY_MISSING_MESSAGE", async () => {
    usePath("both-missing", () => {});
    await runGenerate();
    assert.deepStrictEqual(errors, [agyRunner.AGY_MISSING_MESSAGE]);
  });

  test("claude not logged in, agy missing: AGY_MISSING_MESSAGE, not the login message", async () => {
    usePath("login-agy-missing", (d) =>
      writeStub(d, "claude", { stderr: "Not logged in · Please run /login", exitCode: 1 })
    );
    await runGenerate();
    assert.deepStrictEqual(errors, [agyRunner.AGY_MISSING_MESSAGE]);
    assert.ok(!errors.includes(claudeRunner.NOT_LOGGED_IN_MESSAGE));
  });

  test("claude not logged in, agy empty twice: AGY_EMPTY_MESSAGE after two runs", async () => {
    const dir = usePath("agy-empty", (d) => {
      writeStub(d, "claude", { stderr: "Not logged in", exitCode: 1 });
      writeStub(d, "agy", { stdout: agyResponse(""), marker: true });
    });
    await runGenerate();
    assert.deepStrictEqual(errors, [agyRunner.AGY_EMPTY_MESSAGE]);
    const runs = fs.readFileSync(path.join(dir, "ran.marker"), "utf8").length;
    assert.strictEqual(runs, 2, "agy should run exactly twice");
  });

  test("reviewPlan with claude succeeding returns the revised plan", async () => {
    const revised = makePlan("Revised by claude");
    usePath("review-ok", (d) => writeStub(d, "claude", { stdout: claudeOk(revised) }));
    const result = await extensionModule.reviewPlan(makePlan("Original"), { "step:0": "note" });
    assert.ok(result.ok, result.ok ? "" : result.message);
    assert.strictEqual(result.plan.title, "Revised by claude");
  });

  test("reviewPlan with claude not logged in and agy missing returns AGY_MISSING_MESSAGE", async () => {
    usePath("review-login", (d) =>
      writeStub(d, "claude", { stderr: "Not logged in · Please run /login", exitCode: 1 })
    );
    const result = await extensionModule.reviewPlan(makePlan("Original"), { 0: "note" });
    assert.deepStrictEqual(result, { ok: false, message: agyRunner.AGY_MISSING_MESSAGE });
  });

  // A missing claude always goes to the agy fallback, so MISSING_CLI_MESSAGE is never returned here.
  test("reviewPlan with claude and agy missing returns AGY_MISSING_MESSAGE, never MISSING_CLI_MESSAGE", async () => {
    usePath("review-missing", () => {});
    const result = await extensionModule.reviewPlan(makePlan("Original"), { 0: "note" });
    assert.deepStrictEqual(result, { ok: false, message: agyRunner.AGY_MISSING_MESSAGE });
    assert.notStrictEqual(result.ok ? "" : result.message, claudeRunner.MISSING_CLI_MESSAGE);
  });
});
