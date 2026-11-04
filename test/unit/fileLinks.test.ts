import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { folders: undefined as undefined | { uri: { path: string } }[] },
  openTextDocument: vi.fn(),
  showTextDocument: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  joinPath: vi.fn((base: { path: string }, p: string) => ({ path: `${base.path}/${p}` })),
}));

vi.mock("vscode", () => ({
  workspace: {
    get workspaceFolders() {
      return mocks.state.folders;
    },
    openTextDocument: mocks.openTextDocument,
  },
  window: {
    showTextDocument: mocks.showTextDocument,
    showInformationMessage: mocks.showInformationMessage,
    showErrorMessage: mocks.showErrorMessage,
  },
  Uri: { joinPath: mocks.joinPath },
  ViewColumn: { One: 1 },
}));

import type { Plan } from "../../src/plan/plan";
import { renderPlanHtml, openWorkspaceFile } from "../../src/webview/planPanel";

const NONCE = "abc123NONCE";

/** Builds a plan with the given files. */
function planWith(files: Plan["files"]): Plan {
  return {
    title: "T",
    overview: { summary: "S", outOfScope: null },
    proposedChanges: { language: "ts", code: "x" },
    files,
    implementationSteps: ["one"],
    verification: ["v"],
  };
}

describe("Files table links", () => {
  it("renders non-new files as links with the data-path", () => {
    const html = renderPlanHtml(planWith([{ path: "src/a.ts", change: "c", isNew: false }]), NONCE);
    expect(html).toContain('<a href="#" class="file-link" data-path="src/a.ts"><code class="file-mention">src/a.ts</code></a>');
    expect(html).not.toContain('class="badge">new');
  });

  it("renders new files without a link and with the new badge", () => {
    const html = renderPlanHtml(planWith([{ path: "src/n.ts", change: "c", isNew: true }]), NONCE);
    expect(html).toContain('<code class="file-mention">src/n.ts</code> <span class="badge">new</span>');
    // The CSS rule and script mention file-link, so check the markup only.
    expect(html).not.toContain('class="file-link"');
    expect(html).not.toContain("data-path=\"src/n.ts\"");
    expect(html).not.toContain("<a ");
  });

  it("escapes the path in data-path and the code text", () => {
    const evil = `a"><img src=x onerror=alert(1)>.ts`;
    const html = renderPlanHtml(planWith([{ path: evil, change: "c", isNew: false }]), NONCE);
    expect(html).toContain('data-path="a&quot;&gt;&lt;img src=x onerror=alert(1)&gt;.ts"');
    expect(html).not.toContain("<img");
  });

  it("mixes links and new files, one link per non-new file", () => {
    const html = renderPlanHtml(
      planWith([
        { path: "a.ts", change: "c", isNew: false },
        { path: "b.ts", change: "c", isNew: true },
        { path: "c.ts", change: "c", isNew: false },
      ]),
      NONCE
    );
    expect(html.split('class="file-link"').length - 1).toBe(2);
    expect(html.split('class="badge">new').length - 1).toBe(1);
  });

  it("keeps the CSP with one nonce reference per directive and no unsafe-inline", () => {
    const html = renderPlanHtml(planWith([{ path: "a.ts", change: "c", isNew: false }]), NONCE);
    const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)![1];
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp.split("script-src").length - 1).toBe(1);
    expect(csp.split(`'nonce-${NONCE}'`).length - 1).toBe(2); // style-src and script-src
    expect(html.split("<script").length - 1).toBe(1);
  });

  it("click script prevents default and posts openFile", () => {
    const html = renderPlanHtml(planWith([]), NONCE);
    expect(html).toContain('a.file-link');
    expect(html).toContain("event.preventDefault()");
    expect(html).toContain('type: "openFile"');
  });
});

describe("openWorkspaceFile", () => {
  beforeEach(() => {
    mocks.state.folders = [{ uri: { path: "/ws" } }];
    mocks.openTextDocument.mockReset();
    mocks.showTextDocument.mockReset();
    mocks.showInformationMessage.mockReset();
    mocks.showErrorMessage.mockReset();
    mocks.joinPath.mockClear();
    mocks.openTextDocument.mockResolvedValue({ doc: true });
    mocks.showTextDocument.mockResolvedValue(undefined);
  });

  it("opens a valid relative path under the first workspace folder", async () => {
    await openWorkspaceFile("src/a.ts");
    expect(mocks.joinPath).toHaveBeenCalledWith({ path: "/ws" }, "src/a.ts");
    expect(mocks.openTextDocument).toHaveBeenCalledWith({ path: "/ws/src/a.ts" });
    expect(mocks.showTextDocument).toHaveBeenCalledWith({ doc: true });
    expect(mocks.showErrorMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["non-string number", 5],
    ["null", null],
    ["undefined", undefined],
    ["object", { a: 1 }],
    ["empty string", ""],
    ["absolute posix", "/etc/passwd"],
    ["parent segment", "../x.ts"],
    ["embedded parent segment", "a/../../x.ts"],
    ["backslash", "a\\b.ts"],
    ["windows absolute", "C:\\x.ts"],
  ])("rejects %s silently", async (_name, value) => {
    await openWorkspaceFile(value);
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
    expect(mocks.showTextDocument).not.toHaveBeenCalled();
    expect(mocks.showInformationMessage).not.toHaveBeenCalled();
    expect(mocks.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows an information message when there is no workspace folder", async () => {
    mocks.state.folders = undefined;
    await openWorkspaceFile("src/a.ts");
    expect(mocks.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
  });

  it("shows an information message when the folder list is empty", async () => {
    mocks.state.folders = [];
    await openWorkspaceFile("src/a.ts");
    expect(mocks.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(mocks.openTextDocument).not.toHaveBeenCalled();
  });

  it("shows an error naming the path when open fails, and does not throw", async () => {
    mocks.openTextDocument.mockRejectedValue(new Error("nope"));
    await expect(openWorkspaceFile("src/missing.ts")).resolves.toBeUndefined();
    expect(mocks.showErrorMessage).toHaveBeenCalledTimes(1);
    expect(mocks.showErrorMessage.mock.calls[0][0]).toContain("src/missing.ts");
    expect(mocks.showTextDocument).not.toHaveBeenCalled();
  });

  it("shows an error when showTextDocument fails", async () => {
    mocks.showTextDocument.mockRejectedValue(new Error("x"));
    await openWorkspaceFile("src/a.ts");
    expect(mocks.showErrorMessage.mock.calls[0][0]).toContain("src/a.ts");
  });
});
