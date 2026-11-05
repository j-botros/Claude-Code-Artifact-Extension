import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Plan } from "../../src/plan/plan";

/** Repository root; the temporary workspace lives under it (never the OS temp directory). */
const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Parent directory of all per-case temporary workspaces. */
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, "out-test", "next-change-workspace");

/** Loads a compiled module from out/ so the test shares module state with the running extension. */
function load<T>(rel: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, "../../../out", rel));
}

const hunkReview = load<typeof import("../../src/review/hunkReview")>("review/hunkReview.js");

/** What the spy has seen for one status bar item. */
interface ItemState {
  text: string;
  visible: boolean;
  command: string | undefined;
}

/** State per status bar item instance, filled in by the prototype spy below. */
const items = new Map<object, ItemState>();

/** Reads the command id from an item's `command`, which is a string or a Command object. */
function commandId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return (value as { command?: string } | undefined)?.command;
}

/** Returns the state record for an item instance, creating it on first sight. */
function stateOf(item: object): ItemState {
  let state = items.get(item);
  if (state === undefined) {
    state = { text: "", visible: false, command: undefined };
    items.set(item, state);
  }
  return state;
}

/**
 * The status bar item spy. The extension creates its item at activation, which may be before
 * this file loads, so wrapping createStatusBarItem could miss it. Instead a throwaway item is
 * created to reach the item prototype, and its text setter, show and hide are wrapped. The
 * check on the status bar is therefore by spy: it records what the extension asked VS Code
 * to show, not what was painted on screen.
 */
const probe = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
const proto = Object.getPrototypeOf(probe) as object;
probe.dispose();

const realText = Object.getOwnPropertyDescriptor(proto, "text");
const realShow = Object.getOwnPropertyDescriptor(proto, "show");
const realHide = Object.getOwnPropertyDescriptor(proto, "hide");

/** Installs the spy on the item prototype. Returns false when the prototype lacks the members. */
function installSpy(): boolean {
  if (!realText?.set || !realText.get || typeof realShow?.value !== "function" || typeof realHide?.value !== "function") {
    return false;
  }
  Object.defineProperty(proto, "text", {
    configurable: true,
    get(this: object) {
      return realText.get!.call(this);
    },
    set(this: object, value: string) {
      stateOf(this).text = value;
      realText.set!.call(this, value);
    },
  });
  Object.defineProperty(proto, "show", {
    configurable: true,
    writable: true,
    value(this: object, ...args: unknown[]) {
      const state = stateOf(this);
      state.visible = true;
      state.command = commandId((this as { command?: unknown }).command);
      return realShow.value.apply(this, args);
    },
  });
  Object.defineProperty(proto, "hide", {
    configurable: true,
    writable: true,
    value(this: object, ...args: unknown[]) {
      const state = stateOf(this);
      state.visible = false;
      state.command = commandId((this as { command?: unknown }).command);
      return realHide.value.apply(this, args);
    },
  });
  return true;
}

/** Removes the spy and restores the original prototype members. */
function removeSpy(): void {
  if (realText) {
    Object.defineProperty(proto, "text", realText);
  }
  if (realShow) {
    Object.defineProperty(proto, "show", realShow);
  }
  if (realHide) {
    Object.defineProperty(proto, "hide", realHide);
  }
}

/** The state of the extension's Next change item, or undefined if it was never shown or hidden. */
function nextItem(): ItemState | undefined {
  return [...items.values()].find((s) => s.command === "claudeArtifact.nextChange");
}

/** Builds numbered lines with optional overrides, joined with a trailing newline. */
function lines(count: number, overrides: Record<number, string> = {}): string {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(overrides[i] ?? `line${i}`);
  }
  return out.join("\n") + "\n";
}

/** Builds a plan whose only purpose is carrying proposedFiles. */
function makePlan(proposedFiles: Array<{ path: string; content: string }>): Plan {
  return {
    title: "Next change plan",
    overview: { summary: "Summary.", outOfScope: null },
    proposedChanges: { language: "typescript", code: "export const a = 1;" },
    files: [],
    implementationSteps: ["Step one"],
    verification: ["Run the tests."],
    proposedFiles,
  };
}

/** The argument carried by a hunk or apply lens. */
interface LensArg {
  sessionId: number;
  key?: string;
}

suite("Next change status bar item", () => {
  let dir: string;
  let folder: vscode.Uri;
  let restores: Array<() => void> = [];
  let infos: string[] = [];
  let caseCounter = 0;
  let spyInstalled = false;

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

  /** Writes a workspace file. */
  function put(rel: string, content: string): void {
    fs.writeFileSync(path.join(dir, rel), content);
  }

  /** Starts a review of a.txt and b.txt, each with two hunks, and asserts it worked. */
  async function startTwoFiles(): Promise<void> {
    put("a.txt", lines(10));
    put("b.txt", lines(10));
    const proposed = lines(10, { 2: "CHANGED two", 9: "CHANGED nine" });
    const result = await hunkReview.startImplementReview(
      makePlan([
        { path: "a.txt", content: proposed },
        { path: "b.txt", content: proposed },
      ]),
      folder
    );
    assert.ok(result.ok, result.message);
  }

  /** Returns the lenses of the open inline document for a path. */
  async function lensesFor(rel: string): Promise<vscode.CodeLens[]> {
    // Documents of earlier sessions can linger after their tabs close; use the newest session id.
    const sessionOf = (d: vscode.TextDocument): number => Number(/session=(\d+)/.exec(d.uri.query)?.[1] ?? -1);
    const doc = vscode.workspace.textDocuments
      .filter((d) => d.uri.scheme === "claude-artifact-inline" && d.uri.path === `/${rel}`)
      .sort((x, y) => sessionOf(y) - sessionOf(x))[0];
    assert.ok(doc, `no inline document open for ${rel}`);
    const found = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", doc.uri);
    assert.ok(found && found.length > 0, `no code lenses for ${rel}`);
    return found;
  }

  /** Returns the arguments of every lens with the given command, in document order. */
  async function argsOf(rel: string, command: string): Promise<LensArg[]> {
    return (await lensesFor(rel))
      .filter((l) => l.command?.command === command)
      .map((l) => (l.command?.arguments ?? [])[0] as LensArg);
  }

  /** Accepts every hunk of one file. */
  async function acceptAll(rel: string): Promise<void> {
    for (const arg of await argsOf(rel, "claudeArtifact.acceptHunk")) {
      await vscode.commands.executeCommand("claudeArtifact.acceptHunk", arg);
    }
  }

  /** The path of the active editor if it is an inline review document, else undefined. */
  function activeInlinePath(): string | undefined {
    const uri = vscode.window.activeTextEditor?.document.uri;
    return uri?.scheme === "claude-artifact-inline" ? uri.path : undefined;
  }

  suiteSetup(async () => {
    // Activate the extension so the review commands and the status bar item exist.
    await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
    spyInstalled = installSpy();
  });

  setup(async () => {
    assert.ok(spyInstalled, "could not install the status bar item spy on the item prototype");
    caseCounter++;
    dir = path.join(WORKSPACE_ROOT, `case-${caseCounter}`);
    assert.ok(dir.startsWith(REPO_ROOT + path.sep), "temporary workspace must be inside the repo");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    folder = vscode.Uri.file(dir);

    hunkReview.resetApplyConfirmationForTests();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    items.clear();

    infos = [];
    restores = [
      replace(vscode.window, "showWarningMessage", async () => "Apply"),
      replace(vscode.window, "showInformationMessage", async (m: string) => {
        infos.push(m);
        return undefined;
      }),
    ];
  });

  teardown(async () => {
    restores.reverse().forEach((r) => r());
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    assert.ok(dir.startsWith(WORKSPACE_ROOT + path.sep), "refusing to delete outside out-test/next-change-workspace");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suiteTeardown(() => {
    removeSpy();
    fs.rmSync(WORKSPACE_ROOT, { recursive: true, force: true });
  });

  test("item is shown as 'Next change (2)' with two pending files (by spy)", async () => {
    await startTwoFiles();
    const item = nextItem();
    assert.ok(item, `no Next change item seen; items: ${JSON.stringify([...items.values()])}`);
    assert.strictEqual(item.text, "Next change (2)");
    assert.strictEqual(item.visible, true);
    assert.strictEqual(hunkReview.pendingFileCount(), 2);
  });

  test("the command opens the files in plan order and wraps around", async () => {
    await startTwoFiles();
    // Starting a review opens every file, so b.txt is active. The next one after it wraps to a.txt.
    assert.strictEqual(activeInlinePath(), "/b.txt");
    await vscode.commands.executeCommand("claudeArtifact.nextChange");
    assert.strictEqual(activeInlinePath(), "/a.txt");
    await vscode.commands.executeCommand("claudeArtifact.nextChange");
    assert.strictEqual(activeInlinePath(), "/b.txt");
    await vscode.commands.executeCommand("claudeArtifact.nextChange");
    assert.strictEqual(activeInlinePath(), "/a.txt");
    assert.deepStrictEqual(infos, []);
  });

  test("accepting every hunk of one file drops the count to 1, and the command skips it", async () => {
    await startTwoFiles();
    await acceptAll("a.txt");
    assert.strictEqual(nextItem()?.text, "Next change (1)");
    assert.strictEqual(nextItem()?.visible, true);
    assert.strictEqual(hunkReview.pendingFileCount(), 1);

    // Partly deciding the other file keeps it pending.
    const [first] = await argsOf("b.txt", "claudeArtifact.rejectHunk");
    await vscode.commands.executeCommand("claudeArtifact.rejectHunk", first);
    assert.strictEqual(nextItem()?.text, "Next change (1)");

    await vscode.commands.executeCommand("claudeArtifact.nextChange");
    assert.strictEqual(activeInlinePath(), "/b.txt", "only b.txt still has a pending hunk");
  });

  test("with nothing pending the item shows 0 and the command shows an information message", async () => {
    await startTwoFiles();
    await acceptAll("a.txt");
    await acceptAll("b.txt");
    assert.strictEqual(nextItem()?.text, "Next change (0)");
    assert.strictEqual(nextItem()?.visible, true);
    const before = activeInlinePath();
    await vscode.commands.executeCommand("claudeArtifact.nextChange");
    assert.deepStrictEqual(infos, ["No pending changes to review."]);
    assert.strictEqual(activeInlinePath(), before, "no file is opened");
  });

  test("Apply ends the session and hides the item", async () => {
    await startTwoFiles();
    await acceptAll("a.txt");
    const [applyArg] = await argsOf("a.txt", "claudeArtifact.applyAccepted");
    assert.strictEqual(nextItem()?.visible, true);

    await vscode.commands.executeCommand("claudeArtifact.applyAccepted", applyArg);

    assert.strictEqual(nextItem()?.visible, false, "item hidden after Apply wrote files");
    assert.strictEqual(hunkReview.pendingFileCount(), 0);
    assert.strictEqual(
      fs.readFileSync(path.join(dir, "a.txt"), "utf8"),
      lines(10, { 2: "CHANGED two", 9: "CHANGED nine" })
    );
    // With no session the command does nothing and shows no message.
    infos.length = 0;
    await vscode.commands.executeCommand("claudeArtifact.nextChange");
    assert.deepStrictEqual(infos, []);
  });

  test("Accept and Reject lens titles are unchanged", async () => {
    await startTwoFiles();
    const titles = (await lensesFor("a.txt")).map((l) => l.command?.title);
    assert.deepStrictEqual(titles.slice(1), ["✓ Accept", "✗ Reject", "✓ Accept", "✗ Reject"]);
    assert.ok(titles[0]?.startsWith("▶ Apply accepted ("), `apply lens title: ${titles[0]}`);
    const commands = (await lensesFor("a.txt")).map((l) => l.command?.command);
    assert.deepStrictEqual(commands.slice(1), [
      "claudeArtifact.acceptHunk",
      "claudeArtifact.rejectHunk",
      "claudeArtifact.acceptHunk",
      "claudeArtifact.rejectHunk",
    ]);
  });
});
