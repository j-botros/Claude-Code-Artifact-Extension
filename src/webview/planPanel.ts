import * as vscode from "vscode";
import { Plan } from "../plan/plan";

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

/** Builds the full HTML document for a plan. Plan text is always escaped. */
export function renderPlanHtml(plan: Plan, nonce: string): string {
  const outOfScope =
    plan.overview.outOfScope === null
      ? ""
      : `<h2>Out of scope</h2>\n<p>${escapeHtml(plan.overview.outOfScope)}</p>`;
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
  .badge { background: var(--badge-bg); color: var(--badge-fg); border-radius: 999px; padding: 0 0.5rem; font-size: 0.75rem; margin-left: 0.25rem; }
</style>
</head>
<body>
<h1>${escapeHtml(plan.title)}</h1>
<p class="summary">${escapeHtml(plan.overview.summary)}</p>
${outOfScope}
<h2>Proposed changes</h2>
${langLabel}<pre><code${langClass}>${escapeHtml(plan.proposedChanges.code)}</code></pre>
<h2>Files</h2>
${renderFiles(plan.files)}
<h2>Implementation steps</h2>
<ol>
${renderItems(plan.implementationSteps)}
</ol>
<h2>Verification</h2>
<ul>
${renderItems(plan.verification)}
</ul>
</body>
</html>`;
}

/** Hosts a webview panel that shows a plan. */
export class PlanPanel {
  /** Opens a new panel showing the given plan. */
  static show(plan: Plan): PlanPanel {
    const panel = vscode.window.createWebviewPanel(
      "claudeArtifact.plan",
      plan.title,
      vscode.ViewColumn.One,
      { enableScripts: false }
    );
    return new PlanPanel(panel, plan);
  }

  /** Sets the panel's HTML from the plan. */
  private constructor(private readonly panel: vscode.WebviewPanel, plan: Plan) {
    this.panel.webview.html = renderPlanHtml(plan, makeNonce());
  }
}
