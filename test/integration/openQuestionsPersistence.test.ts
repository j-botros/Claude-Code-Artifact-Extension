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
const planModule = load<typeof import("../../src/plan/plan")>("plan/plan.js");
const planEdits = load<typeof import("../../src/plan/planEdits")>("plan/planEdits.js");

/** The panel's private methods, reached through a cast because the webview cannot be driven here. */
interface SavePanel {
  save(input: unknown): Promise<void>;
  review(input: unknown): Promise<void>;
  panel: vscode.WebviewPanel;
}

/** Builds a plan with open questions and a unique title so each test has its own file. */
function makePlan(title: string, questions: string[] | undefined): Plan {
  const plan: Plan = {
    title,
    overview: { summary: `Summary for ${title}.`, outOfScope: null },
    proposedChanges: { language: "typescript", code: "export const a = 1;" },
    files: [{ path: "src/a.ts", change: "add a", isNew: true }],
    implementationSteps: ["First step", "Second step"],
    verification: ["Run the tests."],
  };
  if (questions !== undefined) {
    plan.openQuestions = questions;
  }
  return plan;
}

/** The edits message the webview sends on save, with the given questions. */
function editsOf(plan: Plan, questions: string[] | undefined): Record<string, unknown> {
  const edits: Record<string, unknown> = {
    type: "savePlan",
    title: plan.title,
    summary: plan.overview.summary,
    outOfScope: plan.overview.outOfScope ?? "",
    steps: plan.implementationSteps,
  };
  if (questions !== undefined) {
    edits.questions = questions;
  }
  return edits;
}

suite("Open questions persistence (.claude/plans/<title>.json)", () => {
  let posted: Array<{ type?: string; ok?: boolean; message?: string }>;
  let files: string[] = [];

  /** Absolute path of the plan file for a title in the integration workspace. */
  function fileFor(title: string): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, "the integration run has a workspace folder");
    const file = path.join(folder.uri.fsPath, ".claude", "plans", planEdits.planFileName(title));
    fs.rmSync(file, { force: true });
    files.push(file);
    return file;
  }

  /** Opens a panel for the plan, records posted messages, and uses the given review handler. */
  function openPanel(plan: Plan, onReview?: (p: Plan) => Promise<{ ok: true; plan: Plan }>): SavePanel {
    const review = onReview
      ? async (p: Plan) => onReview(p)
      : async () => ({ ok: false as const, message: "n/a" });
    const panel = planPanelModule.PlanPanel.show(
      plan,
      review as never,
      async () => ({ ok: false, message: "n/a" })
    ) as unknown as SavePanel;
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

  /** Reads and parses a saved plan file. */
  function readPlan(file: string): Plan {
    const result = planModule.parsePlanJson(fs.readFileSync(file, "utf8"));
    assert.ok(result.ok, result.ok ? "" : result.error);
    return result.plan;
  }

  setup(() => {
    posted = [];
    files = [];
  });

  teardown(async () => {
    files.forEach((f) => fs.rmSync(f, { force: true }));
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("saved questions keep openQuestions in the file and after a reload", async () => {
    const plan = makePlan("OQ persist reload", ["Which database?", "Keep v1?"]);
    const file = fileFor(plan.title);
    const p = openPanel(plan);
    await p.save(editsOf(plan, plan.openQuestions));
    assert.strictEqual(posted.at(-1)?.ok, true, posted.at(-1)?.message);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, "utf8")).openQuestions, ["Which database?", "Keep v1?"]);

    // Reload: parse the file and open it in a fresh panel; the questions are rendered.
    const reloaded = readPlan(file);
    assert.deepStrictEqual(reloaded.openQuestions, ["Which database?", "Keep v1?"]);
    openPanel(reloaded);
    const html = planPanelModule.PlanPanel.lastRenderedHtml ?? "";
    assert.ok(html.includes("Open Questions"));
    assert.ok(html.includes("Which database?") && html.includes("Keep v1?"));
  });

  test("an edited question is saved to the file and survives a reload", async () => {
    const plan = makePlan("OQ persist edit", ["Which database?", "Keep v1?"]);
    const file = fileFor(plan.title);
    const p = openPanel(plan);
    await p.save(editsOf(plan, ["  Which datastore?  ", "Keep v1?"]));
    assert.strictEqual(posted.at(-1)?.ok, true, posted.at(-1)?.message);
    assert.deepStrictEqual(readPlan(file).openQuestions, ["Which datastore?", "Keep v1?"]);

    // A second save without a questions field keeps the saved questions (current plan was updated).
    await p.save(editsOf(plan, undefined));
    assert.strictEqual(posted.at(-1)?.ok, true, posted.at(-1)?.message);
    assert.deepStrictEqual(readPlan(file).openQuestions, ["Which datastore?", "Keep v1?"]);

    openPanel(readPlan(file));
    assert.ok((planPanelModule.PlanPanel.lastRenderedHtml ?? "").includes("Which datastore?"));
  });

  test("a save with a different question count is refused and leaves the file unchanged", async () => {
    const plan = makePlan("OQ persist count", ["Q one", "Q two"]);
    const file = fileFor(plan.title);
    const p = openPanel(plan);
    await p.save(editsOf(plan, ["Q one", "Q two"]));
    const before = fs.readFileSync(file, "utf8");

    await p.save(editsOf(plan, ["Q one"]));
    assert.strictEqual(posted.at(-1)?.ok, false);
    assert.match(posted.at(-1)?.message ?? "", /questions must have 2 items/);
    assert.strictEqual(fs.readFileSync(file, "utf8"), before, "file unchanged after a refused removal");

    await p.save(editsOf(plan, ["Q one", "Q two", "Q three"]));
    assert.strictEqual(posted.at(-1)?.ok, false);
    assert.strictEqual(fs.readFileSync(file, "utf8"), before, "file unchanged after a refused addition");

    await p.save(editsOf(plan, ["Q one", "   "]));
    assert.strictEqual(posted.at(-1)?.ok, false);
    assert.strictEqual(fs.readFileSync(file, "utf8"), before, "file unchanged after a blank question");
  });

  test("Review Comments with fewer questions: file is not written until the next save, then holds the revised list", async () => {
    const plan = makePlan("OQ persist review", ["Q one", "Q two"]);
    const file = fileFor(plan.title);
    const revised = makePlan("OQ persist review", ["Q two"]);
    const p = openPanel(plan, async () => ({ ok: true, plan: revised }));
    await p.save(editsOf(plan, ["Q one", "Q two"]));
    assert.deepStrictEqual(readPlan(file).openQuestions, ["Q one", "Q two"]);

    await p.review({ ...editsOf(plan, ["Q one", "Q two"]), comments: { "question:0": "Answered: use Postgres." } });
    assert.ok((planPanelModule.PlanPanel.lastRenderedHtml ?? "").includes("Q two"));
    assert.deepStrictEqual(
      readPlan(file).openQuestions,
      ["Q one", "Q two"],
      "review alone does not write the file"
    );

    // The old two-question save is now refused; the revised one-question save is accepted.
    await p.save(editsOf(revised, ["Q one", "Q two"]));
    assert.strictEqual(posted.at(-1)?.ok, false);
    assert.deepStrictEqual(readPlan(file).openQuestions, ["Q one", "Q two"]);
    await p.save(editsOf(revised, ["Q two"]));
    assert.strictEqual(posted.at(-1)?.ok, true, posted.at(-1)?.message);
    assert.deepStrictEqual(readPlan(file).openQuestions, ["Q two"]);
  });

  test("Review Comments with no questions left: the saved file has no openQuestions", async () => {
    const plan = makePlan("OQ persist review none", ["Q one"]);
    const file = fileFor(plan.title);
    const revised = makePlan("OQ persist review none", undefined);
    const p = openPanel(plan, async () => ({ ok: true, plan: revised }));
    await p.save(editsOf(plan, ["Q one"]));
    await p.review({ ...editsOf(plan, ["Q one"]), comments: { "question:0": "Answered." } });
    await p.save(editsOf(revised, []));
    assert.strictEqual(posted.at(-1)?.ok, true, posted.at(-1)?.message);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(JSON.parse(fs.readFileSync(file, "utf8")), "openQuestions"), false);
  });
});
