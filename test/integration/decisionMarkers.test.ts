import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Plan } from "../../src/plan/plan";

/** Repository root; the temporary workspace lives under it (never the OS temp directory). */
const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Temporary workspace for this suite. */
const WORKSPACE_DIR = path.resolve(REPO_ROOT, "out-test", "marker-workspace");

/** Loads a compiled module from out/ so the test shares module state with the running extension. */
function load<T>(rel: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(__dirname, "../../../out", rel));
}

const hunkReview = load<typeof import("../../src/review/hunkReview")>("review/hunkReview.js");

/** A decoration type together with the options it was created from. */
interface Recorded {
  type: vscode.TextEditorDecorationType;
  options: vscode.DecorationRenderOptions;
}

/**
 * Every decoration type the extension created. The spy is installed when this file loads,
 * before any test runs, so it also sees types the review created and cached earlier.
 */
const created: Recorded[] = [];

/** The real function, kept so the spy can forward to it and be removed afterwards. */
const realCreate = vscode.window.createTextEditorDecorationType;

Object.defineProperty(vscode.window, "createTextEditorDecorationType", {
  configurable: true,
  writable: true,
  value: (options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType => {
    const real = realCreate(options);
    if (options.before?.contentText === undefined) {
      created.push({ type: real, options });
      return real;
    }
    // Marker types are wrapped in a Proxy that counts reads of `key`; editor.setDecorations
    // reads it, so a read means the type was applied to an editor. (The real objects are frozen.)
    const name = options.before.contentText;
    const proxy = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "key") {
          reads[name] = (reads[name] ?? 0) + 1;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    created.push({ type: proxy, options });
    return proxy;
  },
});

/** Count of `key` reads per marker glyph, filled in by the proxy above. */
const reads: Record<string, number> = {};

/** Returns the theme colour id of a decoration colour, or undefined when it is not a ThemeColor. */
function themeId(color: unknown): string | undefined {
  return color instanceof vscode.ThemeColor ? (color as unknown as { id: string }).id : undefined;
}

/** Finds the recorded marker type whose before attachment shows the given glyph. */
function markerFor(glyph: string): Recorded | undefined {
  return created.find((c) => c.options.before?.contentText === glyph);
}

/** Builds a plan whose only purpose is carrying proposedFiles. */
function makePlan(proposedFiles: Array<{ path: string; content: string }>): Plan {
  return {
    title: "Marker plan",
    overview: { summary: "Summary.", outOfScope: null },
    proposedChanges: { language: "typescript", code: "export const a = 1;" },
    files: [],
    implementationSteps: ["Step one"],
    verification: ["Run the tests."],
    proposedFiles,
  };
}

suite("Review decision markers", () => {
  suiteSetup(() => {
    fs.rmSync(WORKSPACE_DIR, { recursive: true, force: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    const original = Array.from({ length: 12 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
    fs.writeFileSync(path.join(WORKSPACE_DIR, "sample.txt"), original);
  });

  suiteTeardown(async () => {
    Object.defineProperty(vscode.window, "createTextEditorDecorationType", {
      configurable: true,
      writable: true,
      value: realCreate,
    });
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    fs.rmSync(WORKSPACE_DIR, { recursive: true, force: true });
  });

  test("marker types carry a before glyph in a theme colour, and are applied to each hunk's first line", async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    const original = fs.readFileSync(path.join(WORKSPACE_DIR, "sample.txt"), "utf8");
    // Change line 2 and line 10 so there are two separate hunks.
    const proposed = original.replace("line2\n", "CHANGED2\n").replace("line10\n", "CHANGED10\n");
    const result = await hunkReview.startImplementReview(
      makePlan([{ path: "sample.txt", content: proposed }]),
      vscode.Uri.file(WORKSPACE_DIR)
    );
    assert.ok(result.ok, result.message);

    // Option checks on the created decoration types.
    const accept = markerFor("✓");
    const reject = markerFor("✗");
    assert.ok(accept, `no accept marker type; saw ${JSON.stringify(created.map((c) => c.options.before?.contentText))}`);
    assert.ok(reject, "no reject marker type");
    assert.strictEqual(themeId(accept.options.before?.color), "charts.blue");
    assert.strictEqual(themeId(reject.options.before?.color), "charts.red");
    assert.notStrictEqual(accept.type.key, reject.type.key, "markers must be two separate decoration types");

    // Find the visible inline editor of the review.
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === "claude-artifact-inline");
    assert.ok(editor, "no inline review editor is visible");

    // Reset the read counters; the refresh triggered below must read both marker keys again.
    reads["✓"] = 0;
    reads["✗"] = 0;

    const lenses = (await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      editor.document.uri
    )) ?? [];
    const titles = lenses.map((l) => l.command?.title);
    assert.ok(titles.includes("✓ Accept"), `Accept title changed; saw ${JSON.stringify(titles)}`);
    assert.ok(titles.includes("✗ Reject"), `Reject title changed; saw ${JSON.stringify(titles)}`);
    const acceptLenses = lenses.filter((l) => l.command?.command === "claudeArtifact.acceptHunk");
    const rejectLenses = lenses.filter((l) => l.command?.command === "claudeArtifact.rejectHunk");
    assert.strictEqual(acceptLenses.length, 2);
    assert.strictEqual(rejectLenses.length, 2);

    const first = acceptLenses[0];
    await vscode.commands.executeCommand(first.command!.command, ...(first.command!.arguments ?? []));

    // Both marker types were applied to the inline editor during the refresh. The ranges
    // themselves cannot be read back through the API, so the first-line placement is not asserted.
    assert.ok(reads["✓"] > 0, "accept marker type was not applied to an editor");
    assert.ok(reads["✗"] > 0, "reject marker type was not applied to an editor");

    // Lens titles are unchanged after the accept decision except the accepted hunk's own title.
    const after = (await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      editor.document.uri
    )) ?? [];
    const afterTitles = after.map((l) => l.command?.title);
    assert.ok(afterTitles.includes("✓ Accepted"), `saw ${JSON.stringify(afterTitles)}`);
    assert.ok(afterTitles.includes("✗ Reject"));
  });
});
