import * as vscode from "vscode";
import { Plan } from "../plan/plan";
import { applyPlanEdits, planFileName } from "../plan/planEdits";
import { parseReviewComments } from "../plan/reviewComments";

/** Asks Claude Code to revise a plan given per-step comments. */
export type ReviewHandler = (
  plan: Plan,
  comments: Record<number, string>
) => Promise<{ ok: true; plan: Plan } | { ok: false; message: string }>;

/** Starts the hunk review for a plan's proposed files. Must not write files. */
export type ImplementHandler = (
  plan: Plan
) => Promise<{ ok: true; message: string } | { ok: false; message: string }>;

/** Escapes text so it is safe to place inside HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Creates a random nonce for the Content-Security-Policy. */
function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/** Renders a list of strings as escaped `<li>` items. */
function renderItems(list: string[]): string {
  return list.map((s) => `<li>${escapeHtml(s)}</li>`).join("\n");
}

/** Renders implementation steps as `<li>` items, each with an empty comment textarea. */
function renderSteps(steps: string[]): string {
  return steps
    .map(
      (s, i) =>
        `<li><textarea class="step-text" data-step="${i}" aria-label="Edit step ${i + 1}" rows="2">${escapeHtml(s)}</textarea><textarea class="comment" data-step="${i}" aria-label="Comment on step ${i + 1}" rows="2" placeholder="Add a comment"></textarea></li>`
    )
    .join("\n");
}

/** Fixed script (no plan data): comments and edits via webview state, saving edits, and review requests. */
const COMMENT_SCRIPT = `
const vscode = acquireVsCodeApi();
function readState() {
  const state = vscode.getState();
  return state && typeof state === "object" ? state : {};
}
function readComments() {
  const state = readState();
  if (state.comments && typeof state.comments === "object") {
    return state.comments;
  }
  return {};
}
const titleBox = document.querySelector("input.edit-title");
const summaryBox = document.querySelector("textarea.edit-summary");
const scopeBox = document.querySelector("textarea.edit-outofscope");
const stepBoxes = Array.from(document.querySelectorAll("textarea.step-text"));
const statusEl = document.querySelector("p.status");
function readEdits() {
  return {
    title: titleBox.value,
    summary: summaryBox.value,
    outOfScope: scopeBox.value,
    steps: stepBoxes.map((b) => b.value),
  };
}
if (resetState) {
  vscode.setState({});
}
const saved = readState().edits;
if (saved && typeof saved === "object") {
  if (typeof saved.title === "string") { titleBox.value = saved.title; }
  if (typeof saved.summary === "string") { summaryBox.value = saved.summary; }
  if (typeof saved.outOfScope === "string") { scopeBox.value = saved.outOfScope; }
  if (Array.isArray(saved.steps)) {
    stepBoxes.forEach((b, i) => {
      if (typeof saved.steps[i] === "string") { b.value = saved.steps[i]; }
    });
  }
}
let lastSent = null;
function sendEdits() {
  lastSent = readEdits();
  vscode.postMessage({ type: "savePlan", title: lastSent.title, summary: lastSent.summary, outOfScope: lastSent.outOfScope, steps: lastSent.steps });
}
[titleBox, summaryBox, scopeBox].concat(stepBoxes).forEach((box) => {
  box.addEventListener("change", sendEdits);
});
titleBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendEdits();
  }
});
const reviewBtn = document.querySelector("button.review");
reviewBtn.addEventListener("click", () => {
  const edits = readEdits();
  reviewBtn.disabled = true;
  statusEl.textContent = "Asking Claude Code to review...";
  vscode.postMessage({ type: "reviewComments", title: edits.title, summary: edits.summary, outOfScope: edits.outOfScope, steps: edits.steps, comments: readComments() });
});
const implementBtn = document.querySelector("button.implement");
implementBtn.addEventListener("click", () => {
  implementBtn.disabled = true;
  statusEl.textContent = "Preparing the review...";
  vscode.postMessage({ type: "implementDesign" });
});
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg && msg.type === "implementResult") {
    implementBtn.disabled = false;
    statusEl.textContent = typeof msg.message === "string" ? msg.message : "";
    return;
  }
  if (msg && msg.type === "reviewResult") {
    reviewBtn.disabled = false;
    statusEl.textContent = typeof msg.message === "string" ? msg.message : "";
    return;
  }
  if (!msg || msg.type !== "saveResult") { return; }
  statusEl.textContent = typeof msg.message === "string" ? msg.message : "";
  if (msg.ok === true && lastSent) {
    vscode.setState({ comments: readComments(), edits: lastSent });
  }
});
const comments = readComments();
document.querySelectorAll("textarea.comment").forEach((box) => {
  const key = box.getAttribute("data-step");
  const saved = comments[key];
  if (typeof saved === "string") {
    box.value = saved;
  }
  box.addEventListener("input", () => {
    const next = Object.assign({}, readComments());
    if (box.value === "") {
      delete next[key];
    } else {
      next[key] = box.value;
    }
    vscode.setState(Object.assign({}, readState(), { comments: next }));
  });
});
`;

/** Renders the files section: a table, or a "No files." note when empty. */
function renderFiles(files: Plan["files"]): string {
  if (files.length === 0) {
    return "<p>No files.</p>";
  }
  const rows = files
    .map(
      (f) =>
        `<tr><td><code>${escapeHtml(f.path)}</code>${f.isNew ? ' <span class="badge">new</span>' : ""}</td><td>${escapeHtml(f.change)}</td></tr>`
    )
    .join("\n");
  return `<table>
<thead><tr><th>Path</th><th>Change</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

/**
 * Builds the full HTML document for a plan. Plan text is always escaped.
 * With `resetState` true, the script clears saved comments and edits first.
 */
export function renderPlanHtml(plan: Plan, nonce: string, options?: { resetState: boolean }): string {
  const resetLine = `const resetState = ${options?.resetState === true ? "true" : "false"};\n`;
  const outOfScope = `<h2>Out of scope</h2>\n<textarea class="edit-outofscope" aria-label="Edit out of scope" rows="2" placeholder="Nothing excluded">${escapeHtml(plan.overview.outOfScope ?? "")}</textarea>`;
  const language = plan.proposedChanges.language;
  const langClass = /^[a-zA-Z0-9+#-]*$/.test(language) && language !== ""
    ? ` class="language-${escapeHtml(language)}"`
    : "";
  const langLabel = language !== ""
    ? `<div class="lang-label">${escapeHtml(language)}</div>\n`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(plan.title)}</title>
<style nonce="${nonce}">
  :root {
    --bg: #ffffff;
    --fg: #1f2328;
    --muted: #57606a;
    --card: #f6f8fa;
    --border: #d0d7de;
    --table-border: #d0d7de;
    --table-head-bg: #eaeef2;
    --badge-bg: #1a7f37;
    --badge-fg: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1e1e1e;
      --fg: #e6e6e6;
      --muted: #9da5b0;
      --card: #252526;
      --border: #3c3c3c;
      --table-border: #3c3c3c;
      --table-head-bg: #2d2d30;
      --badge-bg: #2ea043;
      --badge-fg: #ffffff;
    }
  }
  body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; padding: 1.5rem; max-width: 52rem; margin: 0 auto; }
  .summary { color: var(--muted); }
  ol { padding-left: 1.25rem; }
  li { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 1rem; margin-bottom: 0.75rem; }
  h2 { font-size: 1.05rem; margin: 1.5rem 0 0.5rem; }
  code { overflow-wrap: anywhere; }
  .lang-label { color: var(--muted); font-size: 0.75rem; margin-bottom: 0.25rem; }
  pre { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 1rem; overflow-x: auto; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid var(--table-border); padding: 0.4rem 0.75rem; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: var(--table-head-bg); }
  textarea { display: block; box-sizing: border-box; width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; font: inherit; margin-top: 0.4rem; }
  input.edit-title { display: block; box-sizing: border-box; width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; font: inherit; font-size: 1.5rem; font-weight: bold; padding: 0.25rem 0.5rem; }
  header.top { display: flex; align-items: center; gap: 0.75rem; }
  header.top h1 { flex: 1; margin: 0.67rem 0; }
  button.review { background: var(--badge-bg); color: var(--badge-fg); border: 0; border-radius: 4px; padding: 0.4rem 0.9rem; font: inherit; cursor: pointer; white-space: nowrap; }
  button.implement { background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 0.4rem 0.9rem; font: inherit; cursor: pointer; white-space: nowrap; }
  button.review:disabled, button.implement:disabled { opacity: 0.6; cursor: default; }
  .status { color: var(--muted); font-size: 0.85rem; min-height: 1.2em; margin: 0.25rem 0 0.75rem; }
  .badge { background: var(--badge-bg); color: var(--badge-fg); border-radius: 999px; padding: 0 0.5rem; font-size: 0.75rem; margin-left: 0.25rem; }
</style>
</head>
<body>
<header class="top"><h1><input type="text" class="edit-title" aria-label="Edit title" value="${escapeHtml(plan.title)}"></h1><button class="review" type="button">Review Comments</button><button class="implement" type="button">Implement the Design</button></header>
<p class="status" role="status"></p>
<textarea class="edit-summary" aria-label="Edit summary" rows="3">${escapeHtml(plan.overview.summary)}</textarea>
${outOfScope}
<h2>Proposed changes</h2>
${langLabel}<pre><code${langClass}>${escapeHtml(plan.proposedChanges.code)}</code></pre>
<h2>Files</h2>
${renderFiles(plan.files)}
<h2>Implementation steps</h2>
<ol>
${renderSteps(plan.implementationSteps)}
</ol>
<h2>Verification</h2>
<ul>
${renderItems(plan.verification)}
</ul>
<script nonce="${nonce}">${resetLine}${COMMENT_SCRIPT}</script>
</body>
</html>`;
}

/** Hosts a webview panel that shows a plan. */
export class PlanPanel {
  /**
   * Opens a new panel showing the given plan; `onReview` handles Review Comments clicks
   * and `onImplement` handles Implement the Design clicks.
   */
  static show(plan: Plan, onReview: ReviewHandler, onImplement: ImplementHandler): PlanPanel {
    const panel = vscode.window.createWebviewPanel(
      "claudeArtifact.plan",
      plan.title,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    return new PlanPanel(panel, plan, onReview, onImplement);
  }

  /** The plan as last saved (or as first shown). */
  private currentPlan: Plan;

  /** Tail of the save queue, so saves run one at a time. */
  private saveChain: Promise<void> = Promise.resolve();

  /** Sets the panel's HTML from the plan and listens for save messages. */
  private constructor(
    private readonly panel: vscode.WebviewPanel,
    plan: Plan,
    private readonly onReview: ReviewHandler,
    private readonly onImplement: ImplementHandler
  ) {
    this.currentPlan = plan;
    this.panel.webview.html = renderPlanHtml(plan, makeNonce());
    this.panel.webview.onDidReceiveMessage((msg: unknown) => {
      if (typeof msg !== "object" || msg === null) {
        return;
      }
      const type = (msg as { type?: unknown }).type;
      if (type === "savePlan") {
        this.saveChain = this.saveChain.then(() => this.save(msg));
      } else if (type === "reviewComments") {
        this.saveChain = this.saveChain.then(() => this.review(msg));
      } else if (type === "implementDesign") {
        this.saveChain = this.saveChain.then(() => this.implement());
      }
    });
  }

  /**
   * Starts the hunk review for the current plan (the last saved plan, not unsaved
   * webview edits) and replies with the outcome. Never throws.
   */
  private async implement(): Promise<void> {
    let ok = false;
    let message: string;
    try {
      const result = await this.onImplement(this.currentPlan);
      ok = result.ok;
      message = result.message;
    } catch (err) {
      message = `Implement failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    void this.panel.webview.postMessage({ type: "implementResult", ok, message });
  }

  /** Posts a review result to the webview. */
  private replyReview(message: string): void {
    void this.panel.webview.postMessage({ type: "reviewResult", ok: false, message });
  }

  /**
   * Validates the edits and comments, asks Claude Code to revise the plan, and on
   * success re-renders the panel with the returned plan. Never throws.
   */
  private async review(input: unknown): Promise<void> {
    try {
      const edited = applyPlanEdits(this.currentPlan, input);
      if (!edited.ok) {
        this.replyReview(edited.error);
        return;
      }
      const rawComments = (input as { comments?: unknown }).comments;
      const parsed = parseReviewComments(rawComments, this.currentPlan.implementationSteps.length);
      if (!parsed.ok) {
        this.replyReview(parsed.error);
        return;
      }
      if (Object.keys(parsed.comments).length === 0) {
        this.replyReview("Add a comment on a step first.");
        return;
      }
      const result = await this.onReview(edited.plan, parsed.comments);
      if (!result.ok) {
        this.replyReview(result.message);
        return;
      }
      this.currentPlan = result.plan;
      this.panel.title = result.plan.title;
      this.panel.webview.html = renderPlanHtml(result.plan, makeNonce(), { resetState: true });
    } catch (err) {
      this.replyReview(`Review failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Posts a save result to the webview. */
  private reply(ok: boolean, message: string): void {
    void this.panel.webview.postMessage({ type: "saveResult", ok, message });
  }

  /** Validates edits, writes the plan file, then updates the current plan. Never throws. */
  private async save(input: unknown): Promise<void> {
    const result = applyPlanEdits(this.currentPlan, input);
    if (!result.ok) {
      this.reply(false, result.error);
      return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.reply(false, "Open a folder to save edits.");
      return;
    }
    try {
      const dir = vscode.Uri.joinPath(folder.uri, ".claude", "plans");
      const name = planFileName(result.plan.title);
      await vscode.workspace.fs.createDirectory(dir);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(dir, name),
        new TextEncoder().encode(JSON.stringify(result.plan, null, 2) + "\n")
      );
      this.currentPlan = result.plan;
      this.reply(true, `Saved to .claude/plans/${name}`);
    } catch (err) {
      this.reply(false, `Could not save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
