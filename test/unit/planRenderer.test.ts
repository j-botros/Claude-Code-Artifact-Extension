import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({}));

import type { Plan } from "../../src/plan/plan";
import { renderPlanHtml } from "../../src/webview/planPanel";

const NONCE = "abc123NONCE";
const EVIL = `<script>alert("x")</script>`;
const ESCAPED = "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;";

/** Builds a plan, optionally overriding top-level fields. */
function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    title: "Title",
    overview: { summary: "Summary text", outOfScope: "Scope text" },
    proposedChanges: { language: "typescript", code: "export function f(): void;" },
    files: [
      { path: "src/new.ts", change: "Add it", isNew: true },
      { path: "src/old.ts", change: "Edit it", isNew: false },
    ],
    implementationSteps: ["Step one", "Step two"],
    verification: ["Check one"],
    ...over,
  };
}

describe("renderPlanHtml", () => {
  it("renders sections in the required order", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    const markers = [
      "<h1>",
      'class="summary"',
      "<h2>Out of scope</h2>",
      "<h2>Proposed changes</h2>",
      "<pre><code",
      "<h2>Files</h2>",
      "<table>",
      "<h2>Implementation steps</h2>",
      "<ol>",
      "<h2>Verification</h2>",
      "<ul>",
    ];
    let last = -1;
    for (const m of markers) {
      const i = html.indexOf(m);
      expect(i, m).toBeGreaterThan(last);
      last = i;
    }
  });

  it("escapes every plan field", () => {
    const html = renderPlanHtml(
      makePlan({
        title: EVIL,
        overview: { summary: EVIL, outOfScope: EVIL },
        proposedChanges: { language: EVIL, code: EVIL },
        files: [{ path: EVIL, change: EVIL, isNew: true }],
        implementationSteps: [EVIL],
        verification: [EVIL],
      }),
      NONCE
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
    // title (h1 and <title>), summary, outOfScope, language, code, path, change, step, verification
    expect(html.split(ESCAPED).length - 1).toBeGreaterThanOrEqual(10);
    expect(html).toContain(`<h1>${ESCAPED}</h1>`);
    expect(html).toContain(`<p class="summary">${ESCAPED}</p>`);
    expect(html).toContain(`<p>${ESCAPED}</p>`);
    expect(html).toContain(`<div class="lang-label">${ESCAPED}</div>`);
    expect(html).toContain(`<code>${ESCAPED}</code></pre>`);
    expect(html).toContain(`<td><code>${ESCAPED}</code>`);
    expect(html).toContain(`<td>${ESCAPED}</td>`);
    expect(html).toContain(`<li>${ESCAPED}</li>`);
  });

  it("omits Out of scope when null and shows it for a string", () => {
    const none = renderPlanHtml(makePlan({ overview: { summary: "S", outOfScope: null } }), NONCE);
    expect(none).not.toContain("Out of scope");
    const some = renderPlanHtml(makePlan(), NONCE);
    expect(some).toContain("<h2>Out of scope</h2>");
    expect(some).toContain("<p>Scope text</p>");
  });

  it("shows No files. and no table for an empty file list", () => {
    const html = renderPlanHtml(makePlan({ files: [] }), NONCE);
    expect(html).toContain("<p>No files.</p>");
    expect(html).not.toContain("<table>");
  });

  it("shows the table header and a file row", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).toContain("<th>Path</th><th>Change</th>");
    expect(html).not.toContain("No files.");
  });

  it("puts the new badge only on isNew rows", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html.split('<span class="badge">new</span>').length - 1).toBe(1);
    const rows = html.split("<tr>").filter((r) => r.includes("<td>"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("src/new.ts");
    expect(rows[0]).toContain('class="badge"');
    expect(rows[1]).toContain("src/old.ts");
    expect(rows[1]).not.toContain("badge");
    const none = renderPlanHtml(
      makePlan({ files: [{ path: "a.ts", change: "c", isNew: false }] }),
      NONCE
    );
    expect(none).not.toContain('<span class="badge">');
  });

  it("includes the CSP meta tag with the nonce", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${NONCE}'; script-src 'nonce-${NONCE}';">`
    );
    expect(html).toContain(`<style nonce="${NONCE}">`);
  });

  it("contains no script, anchor, href, or inline event handler", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("supports the dark color scheme", () => {
    expect(renderPlanHtml(makePlan(), NONCE)).toContain("prefers-color-scheme: dark");
  });

  it("adds a language class only for safe values", () => {
    const ok = renderPlanHtml(makePlan({ proposedChanges: { language: "c++", code: "x" } }), NONCE);
    expect(ok).toContain('<code class="language-c++">');
    for (const bad of ['type script', 'ts"onload="x', "a b"]) {
      const html = renderPlanHtml(makePlan({ proposedChanges: { language: bad, code: "x" } }), NONCE);
      expect(html).not.toContain("language-");
      expect(html).toContain("<pre><code>");
    }
  });

  it("renders steps in an ol and verification in a ul", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).toMatch(/<ol>\s*<li>Step one<\/li>\s*<li>Step two<\/li>\s*<\/ol>/);
    expect(html).toMatch(/<ul>\s*<li>Check one<\/li>\s*<\/ul>/);
  });
});
