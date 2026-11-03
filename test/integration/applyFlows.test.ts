import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Plan } from "../../src/plan/plan";

/** Repository root; every temporary workspace lives under it (never the OS temp directory). */
const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Parent directory of all per-case temporary workspaces. */
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, "out-test", "apply-workspace");

/** Loads a compiled module from out/ so the test shares module state with the running extension. */
function load<T>(rel: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, "../../../out", rel));
}

const hunkReview = load<typeof import("../../src/review/hunkReview")>("review/hunkReview.js");

/** Builds numbered lines "<prefix>1".."<prefix>N" joined with a trailing newline. */
function lines(prefix: string, count: number, overrides: Record<number, string> = {}): string {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(overrides[i] ?? `${prefix}${i}`);
  }
  return out.join("\n") + "\n";
}

/** Builds a plan whose only purpose is carrying proposedFiles. */
function makePlan(proposedFiles: Array<{ path: string; content: string }>): Plan {
  return {
    title: "Apply flow plan",
    overview: { summary: "Summary.", outOfScope: null },
    proposedChanges: { language: "typescript", code: "export const a = 1;" },
    files: [],
    implementationSteps: ["Step one"],
    verification: ["Run the tests."],
    proposedFiles,
  };
}

/** The decoded argument carried by a hunk or apply lens. */
interface LensArg {
  sessionId: number;
  key?: string;
}

suite("Apply accepted flows in a temporary workspace", () => {
  let dir: string;
  let folder: vscode.Uri;
  let restores: Array<() => void> = [];
  let warnings: Array<{ message: string; options: unknown; items: string[] }> = [];
  let infos: string[] = [];
  let errors: string[] = [];
  let warningAnswer: string | undefined;
  let caseCounter = 0;

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

  /** Writes a workspace file, creating its parent folders. */
  function put(rel: string, content: string): void {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  /** Reads a workspace file as text. */
  function read(rel: string): string {
    return fs.readFileSync(path.join(dir, rel), "utf8");
  }

  /** Starts a review and asserts it worked. */
  async function start(proposedFiles: Array<{ path: string; content: string }>): Promise<void> {
    const result = await hunkReview.startImplementReview(makePlan(proposedFiles), folder);
    assert.ok(result.ok, result.message);
  }

  /** Returns the lenses of the newest proposed document for a path (highest session id). */
  async function lensesFor(rel: string): Promise<vscode.CodeLens[]> {
    // The newest session id is the highest id among any open proposed document. With several
    // files, VS Code may keep only the last diff open, so build this file's URI from that id.
    let newestId = -1;
    for (let i = 0; i < 100 && newestId < 0; i++) {
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.uri.scheme !== "claude-artifact-proposed") {
          continue;
        }
        newestId = Math.max(newestId, Number(/session=(\d+)/.exec(doc.uri.query)?.[1] ?? -1));
      }
      if (newestId < 0) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    assert.ok(newestId >= 0, `no proposed document open for ${rel}`);
    const best = vscode.Uri.from({ scheme: "claude-artifact-proposed", path: `/${rel}`, query: `session=${newestId}` });
    await vscode.workspace.openTextDocument(best);
    const found = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", best);
    assert.ok(found && found.length > 0, `no code lenses for ${rel}`);
    return found;
  }

  /** Returns the command arguments of every lens with the given command, in document order. */
  async function argsOf(rel: string, command: string): Promise<LensArg[]> {
    const found = await lensesFor(rel);
    return found
      .filter((l) => l.command?.command === command)
      .map((l) => (l.command?.arguments ?? [])[0] as LensArg);
  }

  suiteSetup(async () => {
    // Activate the extension so the hunk review commands are registered.
    await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
  });

  setup(async () => {
    caseCounter++;
    dir = path.join(WORKSPACE_ROOT, `case-${caseCounter}`);
    assert.ok(dir.startsWith(REPO_ROOT + path.sep), "temporary workspace must be inside the repo");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    folder = vscode.Uri.file(dir);

    hunkReview.resetApplyConfirmationForTests();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");

    warnings = [];
    infos = [];
    errors = [];
    warningAnswer = "Apply";
    restores = [
      replace(vscode.window, "showWarningMessage", async (message: string, options: unknown, ...items: string[]) => {
        warnings.push({ message, options, items });
        return warningAnswer;
      }),
      replace(vscode.window, "showInformationMessage", async (m: string) => {
        infos.push(m);
        return undefined;
      }),
      replace(vscode.window, "showErrorMessage", async (m: string) => {
        errors.push(m);
        return undefined;
      }),
    ];
  });

  teardown(async () => {
    restores.reverse().forEach((r) => r());
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    assert.ok(dir.startsWith(WORKSPACE_ROOT + path.sep), "refusing to delete outside out-test/apply-workspace");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suiteTeardown(() => {
    fs.rmSync(WORKSPACE_ROOT, { recursive: true, force: true });
  });

  /** Two edits (lines 2 and 9) far apart so they form two separate hunks. */
  const ORIGINAL = lines("line", 10);
  const PROPOSED = lines("line", 10, { 2: "CHANGED two", 9: "CHANGED nine" });

  test("accept hunk 0, reject hunk 1: only hunk 0 is written", async () => {
    put("a.txt", ORIGINAL);
    await start([{ path: "a.txt", content: PROPOSED }]);
    const accepts = await argsOf("a.txt", "claudeArtifact.acceptHunk");
    const rejects = await argsOf("a.txt", "claudeArtifact.rejectHunk");
    assert.strictEqual(accepts.length, 2, "expected two hunks");
    assert.strictEqual(accepts[0].key, "a.txt#0");
    assert.strictEqual(accepts[1].key, "a.txt#1");
    await vscode.commands.executeCommand("claudeArtifact.acceptHunk", accepts[0]);
    await vscode.commands.executeCommand("claudeArtifact.rejectHunk", rejects[1]);
    const [applyArg] = await argsOf("a.txt", "claudeArtifact.applyAccepted");

    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);

    assert.strictEqual(warnings.length, 1, "confirmation shown once");
    assert.strictEqual(warnings[0].message, "Write the accepted hunks to these files in your workspace?");
    assert.strictEqual((warnings[0].options as { modal?: boolean }).modal, true);
    assert.deepStrictEqual(warnings[0].items, ["Apply"]);
    assert.strictEqual(read("a.txt"), lines("line", 10, { 2: "CHANGED two" }));
    assert.deepStrictEqual(infos, ["a.txt: wrote 1 hunk"]);
    assert.deepStrictEqual(errors, []);
  });

  test("multiple files: the all-rejected file is untouched and has no info line", async () => {
    put("one.txt", ORIGINAL);
    put("two.txt", ORIGINAL);
    await start([
      { path: "one.txt", content: PROPOSED },
      { path: "two.txt", content: PROPOSED },
    ]);
    const oneAccepts = await argsOf("one.txt", "claudeArtifact.acceptHunk");
    for (const arg of oneAccepts) {
      await vscode.commands.executeCommand("claudeArtifact.acceptHunk", arg);
    }
    const twoRejects = await argsOf("two.txt", "claudeArtifact.rejectHunk");
    for (const arg of twoRejects) {
      await vscode.commands.executeCommand("claudeArtifact.rejectHunk", arg);
    }
    const [applyArg] = await argsOf("one.txt", "claudeArtifact.applyAccepted");

    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);

    assert.strictEqual(read("one.txt"), PROPOSED);
    assert.strictEqual(read("two.txt"), ORIGINAL);
    assert.strictEqual(infos.length, 1);
    assert.ok(infos[0].includes("one.txt: wrote 2 hunks"), infos[0]);
    assert.ok(!infos[0].includes("two.txt"), "no line for the rejected file");
  });

  test("new file in a new folder: created with the accepted content", async () => {
    const content = "alpha\nbeta\ngamma\n";
    await start([{ path: "newdir/sub/n.txt", content }]);
    const accepts = await argsOf("newdir/sub/n.txt", "claudeArtifact.acceptHunk");
    assert.ok(accepts.length >= 1);
    for (const arg of accepts) {
      await vscode.commands.executeCommand("claudeArtifact.acceptHunk", arg);
    }
    const [applyArg] = await argsOf("newdir/sub/n.txt", "claudeArtifact.applyAccepted");

    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);

    assert.ok(fs.statSync(path.join(dir, "newdir", "sub")).isDirectory(), "parent directory created");
    assert.strictEqual(read("newdir/sub/n.txt"), content);
    assert.ok(infos[0].startsWith("newdir/sub/n.txt: wrote"), infos[0]);
  });

  test("confirmation cancelled: nothing written, and the next apply prompts again", async () => {
    put("a.txt", ORIGINAL);
    await start([{ path: "a.txt", content: PROPOSED }]);
    const accepts = await argsOf("a.txt", "claudeArtifact.acceptHunk");
    await vscode.commands.executeCommand("claudeArtifact.acceptHunk", accepts[0]);
    const [applyArg] = await argsOf("a.txt", "claudeArtifact.applyAccepted");

    warningAnswer = undefined;
    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);
    assert.strictEqual(warnings.length, 1);
    assert.strictEqual(read("a.txt"), ORIGINAL, "nothing written after cancel");
    assert.deepStrictEqual(infos, []);

    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);
    assert.strictEqual(warnings.length, 2, "prompted again in the same session");
    assert.strictEqual(read("a.txt"), ORIGINAL);

    warningAnswer = "Apply";
    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);
    assert.strictEqual(warnings.length, 3);
    assert.strictEqual(read("a.txt"), lines("line", 10, { 2: "CHANGED two" }));
  });

  test("session ends after a write: second apply and later accept do nothing", async () => {
    put("a.txt", ORIGINAL);
    await start([{ path: "a.txt", content: PROPOSED }]);
    const accepts = await argsOf("a.txt", "claudeArtifact.acceptHunk");
    await vscode.commands.executeCommand("claudeArtifact.acceptHunk", accepts[0]);
    const [applyArg] = await argsOf("a.txt", "claudeArtifact.applyAccepted");
    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);
    const afterFirst = read("a.txt");
    assert.strictEqual(afterFirst, lines("line", 10, { 2: "CHANGED two" }));
    const warningsAfterFirst = warnings.length;
    const infosAfterFirst = infos.length;

    // Same id again: no prompt (even after a reset), no message, no change.
    hunkReview.resetApplyConfirmationForTests();
    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);
    assert.strictEqual(warnings.length, warningsAfterFirst, "no prompt for an ended session");
    assert.strictEqual(infos.length, infosAfterFirst, "no message for an ended session");
    assert.strictEqual(read("a.txt"), afterFirst);

    // The old accept argument must not record a decision or write anything.
    await vscode.commands.executeCommand("claudeArtifact.acceptHunk", accepts[1]);
    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);
    assert.strictEqual(warnings.length, warningsAfterFirst);
    assert.strictEqual(read("a.txt"), afterFirst);
    assert.deepStrictEqual(errors, []);
  });

  test("changed since review: the new text is kept and the message says so", async () => {
    put("a.txt", ORIGINAL);
    await start([{ path: "a.txt", content: PROPOSED }]);
    const accepts = await argsOf("a.txt", "claudeArtifact.acceptHunk");
    await vscode.commands.executeCommand("claudeArtifact.acceptHunk", accepts[0]);
    const [applyArg] = await argsOf("a.txt", "claudeArtifact.applyAccepted");

    const edited = "edited on disk after review\n";
    put("a.txt", edited);
    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);

    assert.strictEqual(read("a.txt"), edited);
    assert.strictEqual(infos.length, 1);
    assert.ok(infos[0].includes("a.txt: skipped (changed since review)"), infos[0]);
  });

  test("confirmation remembered: a second review in the same host does not prompt", async () => {
    put("a.txt", ORIGINAL);
    await start([{ path: "a.txt", content: PROPOSED }]);
    let accepts = await argsOf("a.txt", "claudeArtifact.acceptHunk");
    await vscode.commands.executeCommand("claudeArtifact.acceptHunk", accepts[0]);
    let [applyArg] = await argsOf("a.txt", "claudeArtifact.applyAccepted");
    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);
    assert.strictEqual(warnings.length, 1);
    const afterFirst = lines("line", 10, { 2: "CHANGED two" });
    assert.strictEqual(read("a.txt"), afterFirst);

    // New review on the already-changed file: propose a change to line 9 only.
    const second = lines("line", 10, { 2: "CHANGED two", 9: "SECOND nine" });
    await start([{ path: "a.txt", content: second }]);
    accepts = await argsOf("a.txt", "claudeArtifact.acceptHunk");
    assert.strictEqual(accepts.length, 1);
    await vscode.commands.executeCommand("claudeArtifact.acceptHunk", accepts[0]);
    [applyArg] = await argsOf("a.txt", "claudeArtifact.applyAccepted");
    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);

    assert.strictEqual(warnings.length, 1, "confirmation not shown a second time");
    assert.strictEqual(read("a.txt"), second);
  });
});
