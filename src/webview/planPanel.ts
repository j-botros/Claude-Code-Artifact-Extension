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

/** Builds the full HTML document for a plan. Plan text is always escaped. */
export function renderPlanHtml(plan: Plan, nonce: string): string {
  const items = (list: string[]): string =>
    list.map((s) => `<li>${escapeHtml(s)}</li>`).join("\n");
  const outOfScope =
    plan.overview.outOfScope === null
      ? ""
      : `<h2>Out of scope</h2>\n<p>${escapeHtml(plan.overview.outOfScope)}</p>`;
  const files = plan.files
    .map(
      (f) =>
        `<li><code>${escapeHtml(f.path)}</code>${f.isNew ? " (new)" : ""}: ${escapeHtml(f.change)}</li>`
    )
    .join("\n");
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
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1e1e1e;
      --fg: #e6e6e6;
      --muted: #9da5b0;
      --card: #252526;
      --border: #3c3c3c;
    }
  }
  body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; padding: 1.5rem; max-width: 52rem; margin: 0 auto; }
  .summary { color: var(--muted); }
  ol { padding-left: 1.25rem; }
  li { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 1rem; margin-bottom: 0.75rem; }
  h2 { font-size: 1.05rem; margin: 0.25rem 0; }
</style>
</head>
<body>
<h1>${escapeHtml(plan.title)}</h1>
<p class="summary">${escapeHtml(plan.overview.summary)}</p>
${outOfScope}
<h2>Proposed changes</h2>
<pre><code>${escapeHtml(plan.proposedChanges.code)}</code></pre>
<h2>Files</h2>
<ul>
${files}
</ul>
<h2>Implementation steps</h2>
<ol>
${items(plan.implementationSteps)}
</ol>
<h2>Verification</h2>
<ul>
${items(plan.verification)}
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
