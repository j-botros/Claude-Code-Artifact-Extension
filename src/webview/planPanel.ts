import * as vscode from "vscode";
import { codeLabel, splitCallout } from "../plan/callouts";
import { Plan, isSafeRelativePath } from "../plan/plan";
import { applyPlanEdits, planFileName } from "../plan/planEdits";
import { planMarkdownFileName, planToMarkdown } from "../plan/planMarkdown";
import { parseReviewComments } from "../plan/reviewComments";

/** Asks Claude Code to revise a plan given comments keyed by block id and an optional overall message. */
export type ReviewHandler = (
  plan: Plan,
  comments: Record<string, string>,
  message?: string
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

/** The kebab (three vertical dots) icon for the more-actions menu. */
const KEBAB_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="8" cy="3" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="13" r="1.4" fill="currentColor"/></svg>';

/** The small downward chevron shown on the Review button. */
const CHEVRON_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Wraps content in a commentable block: the content, plus a right-margin cell with the
 * comment button (shown on hover or focus) and an empty holder the script fills with bubbles.
 */
function renderBlock(id: string, label: string, body: string, extraClass = ""): string {
  const cls = extraClass === "" ? "block" : `block ${extraClass}`;
  return `<div class="${cls}" data-block="${escapeHtml(id)}" data-label="${escapeHtml(label)}"><div class="body">${body}</div><div class="margin"><button class="add-comment" type="button" aria-label="Add inline comment on ${escapeHtml(label)}" title="Add inline comment">+</button><div class="bubbles"></div></div></div>`;
}

/** Renders text that turns into a field when clicked. `key` names the edited plan field. */
function renderEditable(tag: string, key: string, label: string, text: string, placeholder = ""): string {
  const ph = placeholder === "" ? "" : ` data-placeholder="${escapeHtml(placeholder)}"`;
  return `<${tag} class="editable" data-edit="${escapeHtml(key)}" data-label="${escapeHtml(label)}" tabindex="0"${ph}>${escapeHtml(text)}</${tag}>`;
}

/**
 * Renders editable text. When the text starts with a callout marker (NOTE:, TIP:, IMPORTANT:,
 * WARNING:, CAUTION:), wraps it in a callout with the marker as a label. The editable element
 * then holds only the body and keeps the removed prefix in `data-marker`, so the script can
 * put it back when saving.
 */
function renderTextBlock(key: string, label: string, text: string, placeholder = ""): string {
  const callout = splitCallout(text);
  if (callout === null) {
    return renderEditable("div", key, label, text, placeholder);
  }
  const ph = placeholder === "" ? "" : ` data-placeholder="${escapeHtml(placeholder)}"`;
  return `<div class="callout ${callout.kind}"><div class="callout-label">${callout.marker}</div><div class="editable" data-edit="${escapeHtml(key)}" data-label="${escapeHtml(label)}" data-marker="${escapeHtml(callout.prefix)}" tabindex="0"${ph}>${escapeHtml(callout.body)}</div></div>`;
}

/** Renders read-only text, as a callout when it starts with a callout marker. */
function renderPlainText(className: string, text: string): string {
  const callout = splitCallout(text);
  if (callout === null) {
    return `<div class="${className}">${escapeHtml(text)}</div>`;
  }
  return `<div class="callout ${callout.kind}"><div class="callout-label">${callout.marker}</div><div class="${className}">${escapeHtml(callout.body)}</div></div>`;
}

/** Fixed script (no plan data): click-to-edit, margin comments, saving edits, and review requests. */
const COMMENT_SCRIPT = `
const vscode = acquireVsCodeApi();
const COMMENT_ICON = ${JSON.stringify(COMMENT_ICON)};
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
function fullText(el) {
  const marker = el.getAttribute("data-marker") || "";
  if (marker === "") { return el.textContent; }
  return el.textContent === "" ? marker.trimEnd() : marker + el.textContent;
}
function setFullText(el, text) {
  const marker = el.getAttribute("data-marker") || "";
  if (marker !== "" && text.startsWith(marker)) {
    el.textContent = text.slice(marker.length);
  } else if (marker !== "" && text === marker.trimEnd()) {
    el.textContent = "";
  } else {
    el.textContent = text;
  }
}
function readEdits() {
  const steps = [];
  let i = 0;
  while (editEls["step:" + i]) {
    steps.push(fullText(editEls["step:" + i]));
    i++;
  }
  return {
    title: fullText(editEls.title),
    summary: fullText(editEls.summary),
    outOfScope: fullText(editEls.outOfScope),
    steps: steps,
  };
}
if (resetState) {
  vscode.setState({});
}
const saved = readState().edits;
if (saved && typeof saved === "object") {
  if (typeof saved.title === "string") { setFullText(editEls.title, saved.title); }
  if (typeof saved.summary === "string") { setFullText(editEls.summary, saved.summary); }
  if (typeof saved.outOfScope === "string") { setFullText(editEls.outOfScope, saved.outOfScope); }
  if (Array.isArray(saved.steps)) {
    saved.steps.forEach((text, i) => {
      if (typeof text === "string" && editEls["step:" + i]) { setFullText(editEls["step:" + i], text); }
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
const reviewBtn = document.querySelector("button.review");
const reviewLabel = reviewBtn.querySelector(".review-label");
const reviewPop = document.querySelector(".review-pop");
const reviewList = reviewPop.querySelector(".comment-items");
const reviewSummary = reviewPop.querySelector("summary");
const messageBox = reviewPop.querySelector("textarea.review-message");
const submitBtn = reviewPop.querySelector("button.submit-review");
function blockLabelFor(id) {
  const el = document.querySelector('.block[data-block="' + id + '"]');
  return el ? el.getAttribute("data-label") : id;
}
function refreshReview() {
  const comments = readComments();
  const ids = Array.from(document.querySelectorAll(".block")).map((b) => b.getAttribute("data-block")).filter((id) => typeof comments[id] === "string" && comments[id] !== "");
  reviewLabel.textContent = "Review \\u2022 " + ids.length;
  reviewBtn.classList.toggle("has-comments", ids.length > 0);
  reviewSummary.textContent = "Comments (" + ids.length + ")";
  reviewList.textContent = "";
  ids.forEach((id) => {
    const item = makeEl("li", "comment-item");
    item.appendChild(makeEl("strong", "", blockLabelFor(id)));
    item.appendChild(makeEl("span", "", " " + comments[id]));
    reviewList.appendChild(item);
  });
  if (ids.length === 0) {
    reviewList.appendChild(makeEl("li", "comment-item empty", "No comments yet."));
  }
}
function setComment(id, text) {
  const next = Object.assign({}, readComments());
  if (text === "") {
    delete next[id];
  } else {
    next[id] = text;
  }
  vscode.setState(Object.assign({}, readState(), { comments: next }));
  refreshReview();
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
    marker.innerHTML = COMMENT_ICON;
    const full = makeEl("div", "full");
    full.appendChild(makeEl("p", "text", text));
    const actions = makeEl("div", "actions");
    const delBtn = makeEl("button", "delete-comment", "Delete");
    delBtn.type = "button";
    delBtn.addEventListener("click", () => {
      setComment(id, "");
      show(false);
      addBtn.focus();
    });
    const editBtn = makeEl("button", "edit-comment", "Edit Comment");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => show(true));
    actions.appendChild(delBtn);
    actions.appendChild(editBtn);
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
    const saveBtn = makeEl("button", "save-comment primary", text === "" ? "Add Comment" : "Save Comment");
    saveBtn.type = "button";
    const cancelBtn = makeEl("button", "cancel-comment", "Cancel");
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
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
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
refreshReview();
const kebab = document.querySelector("button.kebab");
const menu = document.querySelector(".menu");
function closePopovers() {
  reviewPop.hidden = true;
  reviewBtn.setAttribute("aria-expanded", "false");
  menu.hidden = true;
  kebab.setAttribute("aria-expanded", "false");
}
reviewBtn.addEventListener("click", () => {
  const open = reviewPop.hidden;
  closePopovers();
  if (open) {
    reviewPop.hidden = false;
    reviewBtn.setAttribute("aria-expanded", "true");
    messageBox.focus();
  }
});
kebab.addEventListener("click", () => {
  const open = menu.hidden;
  closePopovers();
  if (open) {
    menu.hidden = false;
    kebab.setAttribute("aria-expanded", "true");
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".review-wrap") && !event.target.closest(".kebab-wrap")) { closePopovers(); }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closePopovers(); }
});
submitBtn.addEventListener("click", () => {
  if (Object.keys(readComments()).length === 0) {
    statusEl.textContent = "Add a comment first.";
    return;
  }
  const edits = readEdits();
  submitBtn.disabled = true;
  reviewBtn.disabled = true;
  closePopovers();
  statusEl.textContent = "Asking Claude Code to review...";
  vscode.postMessage({ type: "reviewComments", title: edits.title, summary: edits.summary, outOfScope: edits.outOfScope, steps: edits.steps, comments: readComments(), message: messageBox.value });
});
menu.querySelectorAll("button[data-action]").forEach((item) => {
  item.addEventListener("click", () => {
    const edits = readEdits();
    closePopovers();
    vscode.postMessage({ type: item.getAttribute("data-action"), title: edits.title, summary: edits.summary, outOfScope: edits.outOfScope, steps: edits.steps });
  });
});
const implementBtn = document.querySelector("button.implement");
implementBtn.addEventListener("click", () => {
  implementBtn.disabled = true;
  statusEl.textContent = "Preparing the review...";
  vscode.postMessage({ type: "implementDesign" });
});
const copyCodeBtn = document.querySelector("button.copy-code");
if (copyCodeBtn) {
  copyCodeBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "copyCode" });
  });
}
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
  if (msg && msg.type === "actionResult") {
    statusEl.textContent = typeof msg.message === "string" ? msg.message : "";
    return;
  }
  if (msg && msg.type === "reviewResult") {
    reviewBtn.disabled = false;
    submitBtn.disabled = false;
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
        `<div class="step-row"><span class="num">${i + 1}.</span>${renderTextBlock(`step:${i}`, `step ${i + 1}`, s)}</div>`,
        "card"
      )
    )
    .join("\n");
}

/** Renders the verification items as read-only, commentable cards. */
function renderVerification(items: string[]): string {
  return items
    .map((v, i) => renderBlock(`verification:${i}`, `verification ${i + 1}`, renderPlainText("verification-item", v), "card"))
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
  const label = codeLabel(language);
  const langLabel = label !== ""
    ? `<span class="lang-label">${escapeHtml(label)}</span>`
    : "";
  const titleEl = renderEditable("h1", "title", "title", plan.title);
  const overviewBlock = renderBlock(
    "overview",
    "overview",
    `<h2>Overview</h2>${renderTextBlock("summary", "summary", plan.overview.summary)}<h3>Out of scope</h3>${renderTextBlock("outOfScope", "out of scope", plan.overview.outOfScope ?? "", "Nothing excluded")}`
  );
  const codeBlock = renderBlock(
    "code",
    "code",
    `<h2>Proposed changes</h2><div class="code-wrap">${langLabel}<button class="copy-code" type="button" aria-label="Copy code" title="Copy code">Copy</button><pre><code${langClass}>${escapeHtml(plan.proposedChanges.code)}</code></pre></div>`
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
    --bg: #1f1f1f;
    --heading: #cccccc;
    --fg: #d5d5d5;
    --muted: #9a9a9a;
    --btn-secondary: #343434;
    --popover: #232323;
    --card: #232323;
    --code-bg: #232323;
    --border: #292929;
    --badge-bg: #2ea043;
    --badge-fg: #ffffff;
    --link: #6aa5ec;
    --accent: #3376ce;
    --accent-fg: #ffffff;
    --review: #3376ce;
    --review-fg: #ffffff;
    --implement: #3fa34d;
    --implement-fg: #1f1f1f;
    --info: #3566ce;
    --note: #3566ce;
    --tip: #3fa34d;
    --important: #8259dd;
    --warning: #d9a441;
    --caution: #d1575a;
    --inline-code: #e2c98e;
    --code-comment: #8693a2;
    --code-keyword: #8ae0f6;
    --code-string: #bbec56;
    --bubble-bg: #232323;
    --bubble-border: #292929;
    --shadow: rgba(0, 0, 0, 0.5);
    --font-body: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    --font-code: ui-monospace, "SF Mono", Menlo, monospace;
    --font-size: 14px;
    --content-width: 77vw;
    --margin-width: 40px;
    --side-padding: 24px;
  }
  /* Light variant: secondary; chosen for contrast, not sampled from screenshots. */
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #ffffff;
      --heading: #1f1f1f;
      --fg: #2b2b2b;
      --muted: #5f6368;
      --btn-secondary: #ececec;
      --popover: #f7f7f7;
      --card: #f7f7f7;
      --code-bg: #f3f3f3;
      --border: #dcdcdc;
      --link: #1f5fbf;
      --accent: #2a64b8;
      --review: #2a64b8;
      --implement: #2b7d37;
      --implement-fg: #ffffff;
      --info: #2a55b8;
      --note: #2a55b8;
      --tip: #2b7d37;
      --important: #6b44c4;
      --warning: #8a6200;
      --caution: #b3363a;
      --inline-code: #8a5a00;
      --code-comment: #5d6b7a;
      --code-keyword: #0b6d8c;
      --code-string: #3d7a0a;
      --bubble-bg: #f7f7f7;
      --bubble-border: #dcdcdc;
      --shadow: rgba(0, 0, 0, 0.18);
    }
  }
  [hidden] { display: none !important; }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font-family: var(--font-body); font-size: var(--font-size); line-height: 1.5; margin: 0; padding: 0 var(--side-padding) 1rem; overflow-wrap: anywhere; }
  .doc { width: var(--content-width); max-width: 100%; margin: 0 auto; }
  header.top { position: sticky; top: 0; z-index: 20; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.6rem 0; background: var(--bg); border-bottom: 1px solid var(--border); }
  header.top .title-wrap { flex: 1 1 12rem; min-width: 0; }
  header.top h1 { margin: 0; line-height: 1.25; }
  .bar-actions { display: flex; align-items: center; gap: 0.5rem; }
  button.review { display: inline-flex; align-items: center; gap: 0.4rem; background: var(--review); color: var(--review-fg); border: 0; border-radius: 4px; padding: 0.4rem 0.9rem; font: inherit; cursor: pointer; }
  .review-wrap, .kebab-wrap { position: relative; }
  button.kebab { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; padding: 0; background: transparent; color: var(--fg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
  .popover { position: absolute; top: calc(100% + 0.3rem); right: 0; z-index: 10; background: var(--popover); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 16px var(--shadow); }
  .menu { display: flex; flex-direction: column; min-width: 11rem; padding: 0.25rem; }
  .menu button { background: transparent; color: var(--fg); border: 0; border-radius: 4px; padding: 0.4rem 0.7rem; text-align: left; font: inherit; cursor: pointer; }
  .menu button:hover, .menu button:focus-visible { background: var(--btn-secondary); }
  .review-pop { width: 22rem; max-width: calc(100vw - 2rem); padding: 0.75rem; }
  .review-pop h2 { margin: 0 0 0.5rem; }
  .review-pop .comment-field { margin-bottom: 0.5rem; }
  .review-pop .comment-list { margin-top: 0.6rem; }
  .review-pop summary { cursor: pointer; color: var(--muted); }
  .comment-items { list-style: none; margin: 0.4rem 0 0; padding: 0; max-height: 12rem; overflow-y: auto; }
  .comment-item { padding: 0.3rem 0; border-top: 1px solid var(--border); font-size: 0.9rem; }
  .comment-item.empty { color: var(--muted); border-top: 0; }
  button.primary { background: var(--accent); color: var(--accent-fg); border: 0; border-radius: 4px; padding: 0.3rem 0.8rem; font: inherit; cursor: pointer; }
  button.submit-review:disabled { opacity: 0.6; cursor: default; }
  button.implement { background: var(--implement); color: var(--implement-fg); border: 0; border-radius: 4px; padding: 0.4rem 0.9rem; font: inherit; cursor: pointer; }
  button.review:disabled, button.implement:disabled { opacity: 0.6; cursor: default; }
  .status { color: var(--muted); font-size: 0.85rem; min-height: 1.2em; margin: 0.25rem 0 0.5rem; text-align: right; }
  .block { display: grid; grid-template-columns: minmax(0, 1fr) var(--margin-width); column-gap: 0.5rem; margin: 0.25rem 0; }
  .block > .body { min-width: 0; }
  .block.card > .body { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.9rem; }
  .margin { position: relative; padding-top: 0.25rem; }
  h1, h2, h3 { color: var(--heading); }
  h1 { font-size: 1.8em; margin: 0.5rem 0; }
  h2 { font-size: 1.4em; margin: 1rem 0 0.4rem; }
  h3 { font-size: 1.15em; color: var(--muted); margin: 1rem 0 0.4rem; }
  hr.section-rule { border: 0; border-top: 1px solid var(--border); margin: 1.25rem 0 0; }
  .editable { position: relative; white-space: pre-wrap; border-radius: 4px; cursor: text; }
  .editable:hover, .editable:focus-visible { outline: 1px dashed var(--border); outline-offset: 2px; }
  .editable::after { content: "Click to edit"; position: absolute; right: 100%; top: 0; margin-right: 0.6rem; padding: 0.1rem 0.4rem; background: var(--popover); color: var(--muted); border: 1px solid var(--border); border-radius: 4px; font: 12px/1.4 var(--font-body); font-weight: normal; white-space: nowrap; pointer-events: none; opacity: 0; z-index: 4; }
  .editable:hover::after { opacity: 1; }
  .editable:empty::before { content: attr(data-placeholder); color: var(--muted); font-style: italic; }
  .edit-field { display: block; width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--accent); border-radius: 4px; font: inherit; padding: 0.3rem 0.5rem; }
  .edit-field.edit-title { font-size: 1.8em; font-weight: bold; }
  .step-row { display: flex; gap: 0.5rem; }
  .step-row .editable, .step-row .edit-field, .step-row > .callout { flex: 1; min-width: 0; }
  .num { color: var(--muted); }
  .file-row { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
  .file-path { flex: 0 1 auto; }
  .file-change { flex: 1 1 14rem; color: var(--muted); }
  a.file-link { color: var(--link); }
  code { font-family: var(--font-code); font-size: 13px; color: var(--inline-code); overflow-wrap: anywhere; }
  pre code { color: var(--fg); }
  pre code .tok-comment { color: var(--code-comment); }
  pre code .tok-keyword { color: var(--code-keyword); }
  pre code .tok-string { color: var(--code-string); }
  .callout { --callout-color: var(--info); border-left: 3px solid var(--callout-color); padding: 0.4rem 0.8rem; border-radius: 4px; background: var(--card); color: var(--fg); }
  .callout.info { --callout-color: var(--info); }
  .callout.note { --callout-color: var(--note); }
  .callout.tip { --callout-color: var(--tip); }
  .callout.important { --callout-color: var(--important); }
  .callout.warning { --callout-color: var(--warning); }
  .callout.caution { --callout-color: var(--caution); }
  .callout { border-left-color: var(--callout-color); }
  .callout-label { color: var(--callout-color); font-weight: 600; font-size: 0.85em; margin-bottom: 0.15rem; }
  .code-wrap { position: relative; }
  .lang-label { position: absolute; top: 0.4rem; left: 1rem; color: var(--muted); font-size: 0.75rem; }
  button.copy-code { position: absolute; top: 0.35rem; right: 0.5rem; background: var(--btn-secondary); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 0.1rem 0.5rem; font: inherit; font-size: 0.75rem; cursor: pointer; }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 2rem 1rem 0.75rem; overflow-x: auto; margin: 0; }
  .badge { background: var(--badge-bg); color: var(--badge-fg); border-radius: 999px; padding: 0 0.5rem; font-size: 0.75rem; margin-left: 0.25rem; }
  button.add-comment { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; background: var(--accent); color: var(--accent-fg); border: 0; border-radius: 4px; font: bold 16px/1 var(--font-body); cursor: pointer; opacity: 0; }
  .block:hover button.add-comment, .block:focus-within button.add-comment, button.add-comment:focus-visible { opacity: 1; }
  .bubble { position: relative; }
  .bubble .marker { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; color: var(--accent); cursor: pointer; }
  .bubble .full { display: none; position: absolute; top: 0; right: 0; z-index: 5; width: 18rem; max-width: calc(100vw - 2rem); background: var(--bubble-bg); border: 1px solid var(--bubble-border); border-radius: 6px; padding: 0.5rem 0.75rem; box-shadow: 0 2px 8px var(--shadow); }
  .bubble:hover .full, .bubble:focus .full, .bubble:focus-within .full, .bubble.editing .full { display: block; }
  .bubble.editing .marker { display: none; }
  .bubble .text { margin: 0 0 0.4rem; white-space: pre-wrap; }
  .bubble .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .bubble .actions button.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .bubble .actions button { background: var(--btn-secondary); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 0.15rem 0.6rem; font: inherit; font-size: 0.85rem; cursor: pointer; }
  .comment-field { display: block; width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; font: inherit; margin-bottom: 0.4rem; }
  @media (hover: none), (max-width: 899px) {
    button.add-comment { opacity: 1; }
  }
  @media (max-width: 899px) {
    :root { --side-padding: 16px; --content-width: 100%; }
    .editable::after { display: none; }
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
<header class="top">
<div class="title-wrap">${titleEl}</div>
<div class="bar-actions">
<div class="kebab-wrap"><button class="kebab" type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">${KEBAB_ICON}</button>
<div class="menu popover" role="menu" hidden><button type="button" role="menuitem" data-action="copyMarkdown">Copy</button><button type="button" role="menuitem" data-action="copyPath">Copy Path</button><button type="button" role="menuitem" data-action="exportArtifact">Export Artifact</button></div></div>
<div class="review-wrap"><button class="review" type="button" aria-haspopup="dialog" aria-expanded="false">${COMMENT_ICON}<span class="review-label">Review &bull; 0</span>${CHEVRON_ICON}</button>
<div class="review-pop popover" role="dialog" aria-label="Submit comment" hidden><h2>Submit comment</h2><textarea class="review-message comment-field" rows="3" placeholder="Add an optional message" aria-label="Optional message"></textarea><button class="submit-review primary" type="button">Submit</button><details class="comment-list" open><summary>Comments (0)</summary><ul class="comment-items"></ul></details></div></div>
<button class="implement" type="button">Implement the Design</button></div></header>
<p class="status" role="status"></p>
${overviewBlock}
<hr class="section-rule">
${codeBlock}
<hr class="section-rule">
<h2>Files</h2>
${renderFiles(plan.files)}
<hr class="section-rule">
<h2>Implementation steps</h2>
${renderSteps(plan.implementationSteps)}
<hr class="section-rule">
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

  /** File name under .claude/plans/ once the plan has been saved by an edit; undefined before. */
  private savedName: string | undefined;

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
      } else if (type === "copyMarkdown" || type === "copyPath" || type === "exportArtifact") {
        this.saveChain = this.saveChain.then(() => this.runAction(type, msg));
      } else if (type === "copyCode") {
        this.saveChain = this.saveChain.then(() => this.copyCode());
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

  /**
   * Copies the plan's proposed code to the clipboard through the extension host (the webview
   * clipboard may be blocked) and replies with the outcome. Never throws.
   */
  private async copyCode(): Promise<void> {
    try {
      await vscode.env.clipboard.writeText(this.currentPlan.proposedChanges.code);
      this.replyAction(true, "Copied the code.");
    } catch (err) {
      this.replyAction(false, `Copy failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Posts the outcome of a kebab-menu action (Copy, Copy Path, Export Artifact) to the webview. */
  private replyAction(ok: boolean, message: string): void {
    void this.panel.webview.postMessage({ type: "actionResult", ok, message });
  }

  /**
   * Handles a kebab-menu action. Copy puts the plan (with the webview's unsaved edits)
   * on the clipboard as Markdown. Copy Path puts `.claude/plans/<file>.json` on the
   * clipboard when the plan was saved, else says it is not saved yet. Export Artifact
   * writes `.claude/plans/<slug>.md` in the first workspace folder. Never throws.
   */
  private async runAction(kind: string, input: unknown): Promise<void> {
    try {
      if (kind === "copyPath") {
        if (this.savedName === undefined) {
          this.replyAction(false, "Not saved yet. Edit the plan to save it, or use Export Artifact.");
          return;
        }
        const relative = `.claude/plans/${this.savedName}`;
        await vscode.env.clipboard.writeText(relative);
        this.replyAction(true, `Copied ${relative}`);
        return;
      }
      const edited = applyPlanEdits(this.currentPlan, input);
      if (!edited.ok) {
        this.replyAction(false, edited.error);
        return;
      }
      const markdown = planToMarkdown(edited.plan);
      if (kind === "copyMarkdown") {
        await vscode.env.clipboard.writeText(markdown);
        this.replyAction(true, "Copied the plan as Markdown.");
        return;
      }
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        this.replyAction(false, "Open a folder to export the artifact.");
        return;
      }
      const dir = vscode.Uri.joinPath(folder.uri, ".claude", "plans");
      const name = planMarkdownFileName(edited.plan.title);
      await vscode.workspace.fs.createDirectory(dir);
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, name), new TextEncoder().encode(markdown));
      this.replyAction(true, `Exported to .claude/plans/${name}`);
    } catch (err) {
      this.replyAction(false, `Action failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
      const rawMessage = (input as { message?: unknown }).message;
      const note = typeof rawMessage === "string" ? rawMessage.trim().slice(0, 4000) : "";
      const result = await this.onReview(edited.plan, parsed.comments, note === "" ? undefined : note);
      if (!result.ok) {
        this.replyReview(result.message);
        return;
      }
      const revised = result.plan;
      if (revised.proposedFiles === undefined && edited.plan.proposedFiles !== undefined) {
        revised.proposedFiles = edited.plan.proposedFiles.map((f) => ({ path: f.path, content: f.content }));
      }
      this.currentPlan = revised;
      this.savedName = undefined;
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
      this.savedName = name;
      this.reply(true, `Saved to .claude/plans/${name}`);
    } catch (err) {
      this.reply(false, `Could not save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
