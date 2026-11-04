import * as vscode from "vscode";
import { Plan, isSafeRelativePath } from "../plan/plan";
import { applyPlanEdits, planFileName } from "../plan/planEdits";
import { parseReviewComments } from "../plan/reviewComments";

/** Asks Claude Code to revise a plan given comments keyed by block id. */
export type ReviewHandler = (
  plan: Plan,
  comments: Record<string, string>
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

/** The comment icon (a speech bubble) drawn inline so no external resource is needed. */
const COMMENT_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2 2.5h12v8H6.5L3.5 13.5v-3H2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

/**
 * Wraps content in a commentable block: the content, plus a right-margin cell with the
 * comment button (shown on hover or focus) and an empty holder the script fills with bubbles.
 */
function renderBlock(id: string, label: string, body: string, extraClass = ""): string {
  const cls = extraClass === "" ? "block" : `block ${extraClass}`;
  return `<div class="${cls}" data-block="${escapeHtml(id)}" data-label="${escapeHtml(label)}"><div class="body">${body}</div><div class="margin"><button class="add-comment" type="button" aria-label="Comment on ${escapeHtml(label)}" title="Comment">${COMMENT_ICON}</button><div class="bubbles"></div></div></div>`;
}

/** Renders text that turns into a field when clicked. `key` names the edited plan field. */
function renderEditable(tag: string, key: string, label: string, text: string, placeholder = ""): string {
  const ph = placeholder === "" ? "" : ` data-placeholder="${escapeHtml(placeholder)}"`;
  return `<${tag} class="editable" data-edit="${escapeHtml(key)}" data-label="${escapeHtml(label)}" tabindex="0" title="Click to edit"${ph}>${escapeHtml(text)}</${tag}>`;
}

/** Fixed script (no plan data): click-to-edit, margin comments, saving edits, and review requests. */
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
const statusEl = document.querySelector("p.status");
const editEls = {};
document.querySelectorAll("[data-edit]").forEach((el) => {
  editEls[el.getAttribute("data-edit")] = el;
});
function readEdits() {
  const steps = [];
  let i = 0;
  while (editEls["step:" + i]) {
    steps.push(editEls["step:" + i].textContent);
    i++;
  }
  return {
    title: editEls.title.textContent,
    summary: editEls.summary.textContent,
    outOfScope: editEls.outOfScope.textContent,
    steps: steps,
  };
}
if (resetState) {
  vscode.setState({});
}
const saved = readState().edits;
if (saved && typeof saved === "object") {
  if (typeof saved.title === "string") { editEls.title.textContent = saved.title; }
  if (typeof saved.summary === "string") { editEls.summary.textContent = saved.summary; }
  if (typeof saved.outOfScope === "string") { editEls.outOfScope.textContent = saved.outOfScope; }
  if (Array.isArray(saved.steps)) {
    saved.steps.forEach((text, i) => {
      if (typeof text === "string" && editEls["step:" + i]) { editEls["step:" + i].textContent = text; }
    });
  }
}
let lastSent = null;
function sendEdits() {
  lastSent = readEdits();
  vscode.postMessage({ type: "savePlan", title: lastSent.title, summary: lastSent.summary, outOfScope: lastSent.outOfScope, steps: lastSent.steps });
}
function startEdit(el) {
  if (el.hidden) { return; }
  const key = el.getAttribute("data-edit");
  const single = key === "title";
  const field = document.createElement(single ? "input" : "textarea");
  if (single) { field.type = "text"; } else { field.rows = 3; }
  field.className = single ? "edit-field edit-title" : "edit-field";
  field.value = el.textContent;
  field.setAttribute("aria-label", "Edit " + el.getAttribute("data-label"));
  let done = false;
  function finish(commit, refocus) {
    if (done) { return; }
    done = true;
    const next = field.value;
    field.remove();
    el.hidden = false;
    if (commit && next !== el.textContent) {
      if (next.trim() === "" && key !== "outOfScope") {
        statusEl.textContent = "This field cannot be empty.";
      } else {
        el.textContent = next;
        sendEdits();
      }
    }
    if (refocus) { el.focus(); }
  }
  field.addEventListener("blur", () => finish(true, false));
  field.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false, true);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finish(true, true);
    }
  });
  el.hidden = true;
  el.parentNode.insertBefore(field, el.nextSibling);
  field.focus();
}
document.querySelectorAll(".editable").forEach((el) => {
  el.addEventListener("click", () => startEdit(el));
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      startEdit(el);
    }
  });
});
function setComment(id, text) {
  const next = Object.assign({}, readComments());
  if (text === "") {
    delete next[id];
  } else {
    next[id] = text;
  }
  vscode.setState(Object.assign({}, readState(), { comments: next }));
}
function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) { el.className = className; }
  if (text) { el.textContent = text; }
  return el;
}
document.querySelectorAll(".block").forEach((block) => {
  const id = block.getAttribute("data-block");
  const label = block.getAttribute("data-label");
  const addBtn = block.querySelector("button.add-comment");
  const holder = block.querySelector(".bubbles");
  function buildBubble(text) {
    const bubble = makeEl("div", "bubble");
    bubble.tabIndex = 0;
    bubble.setAttribute("role", "group");
    bubble.setAttribute("aria-label", "Comment on " + label);
    const marker = makeEl("span", "marker");
    marker.setAttribute("aria-hidden", "true");
    const full = makeEl("div", "full");
    full.appendChild(makeEl("p", "text", text));
    const actions = makeEl("div", "actions");
    const editBtn = makeEl("button", "", "Edit");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => show(true));
    const delBtn = makeEl("button", "", "Delete");
    delBtn.type = "button";
    delBtn.addEventListener("click", () => {
      setComment(id, "");
      show(false);
      addBtn.focus();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    full.appendChild(actions);
    bubble.appendChild(marker);
    bubble.appendChild(full);
    return bubble;
  }
  function buildEditor(text) {
    const bubble = makeEl("div", "bubble editing");
    const full = makeEl("div", "full");
    const box = document.createElement("textarea");
    box.className = "comment-field";
    box.rows = 3;
    box.value = text;
    box.placeholder = "Add a comment";
    box.setAttribute("aria-label", "Comment on " + label);
    const actions = makeEl("div", "actions");
    const saveBtn = makeEl("button", "", "Save");
    saveBtn.type = "button";
    const cancelBtn = makeEl("button", "", "Cancel");
    cancelBtn.type = "button";
    function save() {
      setComment(id, box.value.trim());
      show(false);
    }
    saveBtn.addEventListener("click", save);
    cancelBtn.addEventListener("click", () => show(false));
    box.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        show(false);
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        save();
      }
    });
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    full.appendChild(box);
    full.appendChild(actions);
    bubble.appendChild(full);
    return bubble;
  }
  function show(editing) {
    holder.textContent = "";
    const text = readComments()[id];
    const has = typeof text === "string" && text !== "";
    addBtn.hidden = has || editing;
    if (editing) {
      holder.appendChild(buildEditor(has ? text : ""));
      holder.querySelector("textarea").focus();
    } else if (has) {
      holder.appendChild(buildBubble(text));
    }
  }
  addBtn.addEventListener("click", () => show(true));
  show(false);
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
document.querySelectorAll("a.file-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    vscode.postMessage({ type: "openFile", path: link.getAttribute("data-path") });
  });
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
`;

/** Renders the files section: one commentable row per file, or a "No files." note when empty. */
function renderFiles(files: Plan["files"]): string {
  if (files.length === 0) {
    return "<p>No files.</p>";
  }
  return files
    .map((f, i) => {
      const path = f.isNew
        ? `<code>${escapeHtml(f.path)}</code> <span class="badge">new</span>`
        : `<a href="#" class="file-link" data-path="${escapeHtml(f.path)}"><code>${escapeHtml(f.path)}</code></a>`;
      return renderBlock(
        `file:${i}`,
        `file ${f.path}`,
        `<div class="file-row"><div class="file-path">${path}</div><div class="file-change">${escapeHtml(f.change)}</div></div>`,
        "card"
      );
    })
    .join("\n");
}

/** Renders the implementation steps as numbered, editable, commentable cards. */
function renderSteps(steps: string[]): string {
  return steps
    .map((s, i) =>
      renderBlock(
        `step:${i}`,
        `step ${i + 1}`,
        `<div class="step-row"><span class="num">${i + 1}.</span>${renderEditable("div", `step:${i}`, `step ${i + 1}`, s)}</div>`,
        "card"
      )
    )
    .join("\n");
}

/** Renders the verification items as read-only, commentable cards. */
function renderVerification(items: string[]): string {
  return items
    .map((v, i) => renderBlock(`verification:${i}`, `verification ${i + 1}`, `<div class="verification-item">${escapeHtml(v)}</div>`, "card"))
    .join("\n");
}

/**
 * Builds the full HTML document for a plan. Plan text is always escaped.
 * With `resetState` true, the script clears saved comments and edits first.
 */
export function renderPlanHtml(plan: Plan, nonce: string, options?: { resetState: boolean }): string {
  const resetLine = `const resetState = ${options?.resetState === true ? "true" : "false"};\n`;
  const language = plan.proposedChanges.language;
  const langClass = /^[a-zA-Z0-9+#-]*$/.test(language) && language !== ""
    ? ` class="language-${escapeHtml(language)}"`
    : "";
  const langLabel = language !== ""
    ? `<div class="lang-label">${escapeHtml(language)}</div>`
    : "";
  const titleBlock = renderBlock("title", "title", renderEditable("h1", "title", "title", plan.title));
  const overviewBlock = renderBlock(
    "overview",
    "overview",
    `<h2>Overview</h2>${renderEditable("div", "summary", "summary", plan.overview.summary)}<h3>Out of scope</h3>${renderEditable("div", "outOfScope", "out of scope", plan.overview.outOfScope ?? "", "Nothing excluded")}`
  );
  const codeBlock = renderBlock(
    "code",
    "code",
    `<h2>Proposed changes</h2>${langLabel}<pre><code${langClass}>${escapeHtml(plan.proposedChanges.code)}</code></pre>`
  );
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
    --badge-bg: #1a7f37;
    --badge-fg: #ffffff;
    --link: #0969da;
    --accent: #0969da;
    --bubble-bg: #fff8c5;
    --bubble-border: #d4a72c;
    --shadow: rgba(31, 35, 40, 0.18);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1e1e1e;
      --fg: #e6e6e6;
      --muted: #9da5b0;
      --card: #252526;
      --border: #3c3c3c;
      --badge-bg: #2ea043;
      --badge-fg: #ffffff;
      --link: #58a6ff;
      --accent: #58a6ff;
      --bubble-bg: #3a3320;
      --bubble-border: #9e7f1c;
      --shadow: rgba(0, 0, 0, 0.5);
    }
  }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; margin: 0; padding: 1rem; overflow-wrap: anywhere; }
  .doc { max-width: 60rem; margin: 0 auto; }
  header.top { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; }
  button.review { background: var(--badge-bg); color: var(--badge-fg); border: 0; border-radius: 4px; padding: 0.4rem 0.9rem; font: inherit; cursor: pointer; }
  button.implement { background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 0.4rem 0.9rem; font: inherit; cursor: pointer; }
  button.review:disabled, button.implement:disabled { opacity: 0.6; cursor: default; }
  .status { color: var(--muted); font-size: 0.85rem; min-height: 1.2em; margin: 0.25rem 0 0.5rem; text-align: right; }
  .block { display: grid; grid-template-columns: minmax(0, 1fr) 2.5rem; column-gap: 0.5rem; margin: 0.25rem 0; }
  .block > .body { min-width: 0; }
  .block.card > .body { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.9rem; }
  .margin { position: relative; padding-top: 0.25rem; }
  h1 { font-size: 1.7rem; margin: 0.5rem 0; }
  h2 { font-size: 1.05rem; margin: 1rem 0 0.4rem; }
  h3 { font-size: 0.95rem; color: var(--muted); margin: 1rem 0 0.4rem; }
  .editable { white-space: pre-wrap; border-radius: 4px; cursor: text; }
  .editable:hover, .editable:focus-visible { outline: 1px dashed var(--border); outline-offset: 2px; }
  .editable:empty::before { content: attr(data-placeholder); color: var(--muted); font-style: italic; }
  .edit-field { display: block; width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--accent); border-radius: 4px; font: inherit; padding: 0.3rem 0.5rem; }
  .edit-field.edit-title { font-size: 1.7rem; font-weight: bold; }
  .step-row { display: flex; gap: 0.5rem; }
  .step-row .editable, .step-row .edit-field { flex: 1; min-width: 0; }
  .num { color: var(--muted); }
  .file-row { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
  .file-path { flex: 0 1 auto; }
  .file-change { flex: 1 1 14rem; color: var(--muted); }
  a.file-link { color: var(--link); }
  code { overflow-wrap: anywhere; }
  .lang-label { color: var(--muted); font-size: 0.75rem; margin-bottom: 0.25rem; }
  pre { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 1rem; overflow-x: auto; margin: 0; }
  .badge { background: var(--badge-bg); color: var(--badge-fg); border-radius: 999px; padding: 0 0.5rem; font-size: 0.75rem; margin-left: 0.25rem; }
  button.add-comment { display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; padding: 0; background: var(--card); color: var(--muted); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; opacity: 0; }
  .block:hover button.add-comment, .block:focus-within button.add-comment, button.add-comment:focus-visible { opacity: 1; }
  button.add-comment:hover { color: var(--accent); border-color: var(--accent); }
  .bubble { position: relative; }
  .bubble .marker { display: block; width: 1.5rem; height: 1.5rem; background: var(--bubble-bg); border: 1px solid var(--bubble-border); border-radius: 50% 50% 50% 0; cursor: pointer; }
  .bubble .full { display: none; position: absolute; top: 0; right: 0; z-index: 5; width: 18rem; max-width: calc(100vw - 2rem); background: var(--bubble-bg); border: 1px solid var(--bubble-border); border-radius: 6px; padding: 0.5rem 0.75rem; box-shadow: 0 2px 8px var(--shadow); }
  .bubble:hover .full, .bubble:focus .full, .bubble:focus-within .full, .bubble.editing .full { display: block; }
  .bubble.editing .marker { display: none; }
  .bubble .text { margin: 0 0 0.4rem; white-space: pre-wrap; }
  .bubble .actions { display: flex; gap: 0.5rem; }
  .bubble .actions button { background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 0.15rem 0.6rem; font: inherit; font-size: 0.85rem; cursor: pointer; }
  .comment-field { display: block; width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; font: inherit; margin-bottom: 0.4rem; }
  @media (hover: none), (max-width: 899px) {
    button.add-comment { opacity: 1; }
  }
  @media (max-width: 899px) {
    .block { grid-template-columns: minmax(0, 1fr); }
    .margin { padding-top: 0.25rem; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.25rem; }
    .margin .bubbles { flex: 1 1 100%; }
    .bubble .full { position: static; width: auto; max-width: none; margin-top: 0.25rem; }
    .margin:not(:has(.bubble)) { padding-top: 0; }
  }
</style>
</head>
<body>
<div class="doc">
<header class="top"><button class="review" type="button">Review Comments</button><button class="implement" type="button">Implement the Design</button></header>
<p class="status" role="status"></p>
${titleBlock}
${overviewBlock}
${codeBlock}
<h2>Files</h2>
${renderFiles(plan.files)}
<h2>Implementation steps</h2>
${renderSteps(plan.implementationSteps)}
<h2>Verification</h2>
${renderVerification(plan.verification)}
</div>
<script nonce="${nonce}">${resetLine}${COMMENT_SCRIPT}</script>
</body>
</html>`;
}

/**
 * Opens a workspace file for an openFile message. Rejects non-string, absolute, or ".."
 * paths silently. Shows an information message with no workspace folder and an error
 * message when the file cannot be opened. Never throws.
 */
export async function openWorkspaceFile(path: unknown): Promise<void> {
  if (typeof path !== "string" || !isSafeRelativePath(path)) {
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showInformationMessage("Open a folder to open files from the plan.");
    return;
  }
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder.uri, path));
    await vscode.window.showTextDocument(doc);
  } catch {
    void vscode.window.showErrorMessage(`Could not open ${path}`);
  }
}

/** Hosts a webview panel that shows a plan. */
export class PlanPanel {
  /** The HTML most recently set on a panel; read by integration tests; the extension does not use it. */
  static lastRenderedHtml: string | undefined;

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
    PlanPanel.lastRenderedHtml = this.panel.webview.html;
    this.panel.webview.onDidReceiveMessage((msg: unknown) => {
      if (typeof msg !== "object" || msg === null) {
        return;
      }
      const type = (msg as { type?: unknown }).type;
      if (type === "savePlan") {
        this.saveChain = this.saveChain.then(() => this.save(msg));
      } else if (type === "reviewComments") {
        this.saveChain = this.saveChain.then(() => this.review(msg));
      } else if (type === "openFile") {
        void openWorkspaceFile((msg as { path?: unknown }).path);
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
   * success re-renders the panel with the returned plan. If the revised plan drops
   * `proposedFiles`, the ones sent for review are kept, so Implement the Design still
   * has files to show. Never throws.
   */
  private async review(input: unknown): Promise<void> {
    try {
      const edited = applyPlanEdits(this.currentPlan, input);
      if (!edited.ok) {
        this.replyReview(edited.error);
        return;
      }
      const rawComments = (input as { comments?: unknown }).comments;
      const parsed = parseReviewComments(rawComments, edited.plan);
      if (!parsed.ok) {
        this.replyReview(parsed.error);
        return;
      }
      if (Object.keys(parsed.comments).length === 0) {
        this.replyReview("Add a comment first.");
        return;
      }
      const result = await this.onReview(edited.plan, parsed.comments);
      if (!result.ok) {
        this.replyReview(result.message);
        return;
      }
      const revised = result.plan;
      if (revised.proposedFiles === undefined && edited.plan.proposedFiles !== undefined) {
        revised.proposedFiles = edited.plan.proposedFiles.map((f) => ({ path: f.path, content: f.content }));
      }
      this.currentPlan = revised;
      this.panel.title = revised.title;
      this.panel.webview.html = renderPlanHtml(revised, makeNonce(), { resetState: true });
      PlanPanel.lastRenderedHtml = this.panel.webview.html;
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
