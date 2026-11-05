import * as assert from "node:assert";
import * as vscode from "vscode";

/** The options object passed to createTextEditorDecorationType, as far as this test reads it. */
type DecorationOptions = vscode.DecorationRenderOptions;

/**
 * Every options object the extension passed to createTextEditorDecorationType. The spy is
 * installed when this file loads, which is before any test runs, so it also sees types the
 * review created lazily during earlier test files (the review caches them per host).
 */
const created: DecorationOptions[] = [];

/** The real function, kept so the spy can forward to it and be removed afterwards. */
const realCreate = vscode.window.createTextEditorDecorationType;

Object.defineProperty(vscode.window, "createTextEditorDecorationType", {
  configurable: true,
  writable: true,
  value: (options: DecorationOptions): vscode.TextEditorDecorationType => {
    created.push(options);
    return realCreate(options);
  },
});

/** Returns the theme colour id of a decoration colour, or undefined when it is not a ThemeColor. */
function themeId(color: unknown): string | undefined {
  return color instanceof vscode.ThemeColor ? (color as unknown as { id: string }).id : undefined;
}

suite("Review decorations: overview ruler colours", () => {
  suiteTeardown(async () => {
    Object.defineProperty(vscode.window, "createTextEditorDecorationType", {
      configurable: true,
      writable: true,
      value: realCreate,
    });
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("added and removed decoration types set overviewRulerColor to the diff ruler theme colours", async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    let listener: ((msg: unknown) => void) | undefined;
    const posted: Array<{ type?: string; ok?: boolean; message?: string }> = [];
    const fakePanel = {
      title: "",
      webview: {
        set html(_value: string) {},
        get html(): string {
          return "";
        },
        onDidReceiveMessage(cb: (msg: unknown) => void): vscode.Disposable {
          listener = cb;
          return new vscode.Disposable(() => {});
        },
        postMessage(msg: { type?: string }): Thenable<boolean> {
          posted.push(msg);
          return Promise.resolve(true);
        },
      },
    };
    const originalPanel = Object.getOwnPropertyDescriptor(vscode.window, "createWebviewPanel");
    Object.defineProperty(vscode.window, "createWebviewPanel", { value: () => fakePanel, configurable: true, writable: true });
    try {
      await vscode.commands.executeCommand("claudeArtifact.openSamplePlan");
      assert.ok(listener, "PlanPanel should register a message listener");
      listener({ type: "implementDesign" });
      for (let i = 0; i < 200 && !posted.some((m) => m.type === "implementResult"); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const result = posted.find((m) => m.type === "implementResult");
      assert.ok(result?.ok, `implement did not succeed: ${JSON.stringify(posted)}`);
    } finally {
      if (originalPanel) {
        Object.defineProperty(vscode.window, "createWebviewPanel", originalPanel);
      }
    }

    const ids = created.map((o) => ({
      background: themeId(o.backgroundColor),
      ruler: themeId(o.overviewRulerColor),
    }));
    const added = ids.find((i) => i.background === "diffEditor.insertedLineBackground");
    const removed = ids.find((i) => i.background === "diffEditor.removedLineBackground");
    assert.ok(added, `no added decoration type was created; saw ${JSON.stringify(ids)}`);
    assert.ok(removed, `no removed decoration type was created; saw ${JSON.stringify(ids)}`);
    assert.strictEqual(added.ruler, "editorOverviewRuler.addedForeground");
    assert.strictEqual(removed.ruler, "editorOverviewRuler.deletedForeground");
  });
});
