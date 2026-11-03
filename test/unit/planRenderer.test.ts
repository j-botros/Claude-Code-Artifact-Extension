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

/** Returns the contents of the single script element. */
function scriptCode(html: string): string {
  const m = html.match(/<script nonce="[^"]*">([\s\S]*?)<\/script>/);
  expect(m).not.toBeNull();
  return m![1];
}

describe("renderPlanHtml", () => {
  it("renders sections in the required order", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    const markers = [
      "<h1>",
      'class="edit-summary"',
      "<h2>Out of scope</h2>",
      'class="edit-outofscope"',
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
    // No raw plan script tag; only our own nonce'd script (one open, one close) exists.
    expect(html).not.toContain("<script>");
    expect(html.split("<script").length - 1).toBe(1);
    expect(html.split("</script>").length - 1).toBe(1);
    // title (<title> and input value), summary, outOfScope, language, code, path, change, step, verification
    expect(html.split(ESCAPED).length - 1).toBeGreaterThanOrEqual(10);
    expect(html).toContain(`<title>${ESCAPED}</title>`);
    expect(html).toContain(`aria-label="Edit title" value="${ESCAPED}">`);
    expect(html).toContain(`rows="3">${ESCAPED}</textarea>`);
    expect(html).toContain(`placeholder="Nothing excluded">${ESCAPED}</textarea>`);
    expect(html).toContain(`<div class="lang-label">${ESCAPED}</div>`);
    expect(html).toContain(`<code>${ESCAPED}</code></pre>`);
    expect(html).toContain(`<td><code>${ESCAPED}</code>`);
    expect(html).toContain(`<td>${ESCAPED}</td>`);
    // Step text sits in its step-text textarea; verification <li> is plain.
    expect(html).toContain(`rows="2">${ESCAPED}</textarea><textarea class="comment"`);
    expect(html).toContain(`<li>${ESCAPED}</li>`);
  });

  it("always renders Out of scope: empty textarea when null, filled for a string", () => {
    const none = renderPlanHtml(makePlan({ overview: { summary: "S", outOfScope: null } }), NONCE);
    expect(none).toContain("<h2>Out of scope</h2>");
    expect(none).toMatch(/<textarea class="edit-outofscope"[^>]*><\/textarea>/);
    const some = renderPlanHtml(makePlan(), NONCE);
    expect(some).toContain("<h2>Out of scope</h2>");
    expect(some).toMatch(/<textarea class="edit-outofscope"[^>]*>Scope text<\/textarea>/);
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

  it("contains exactly one nonce'd script, and no anchor, href, or inline event handler", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    // Exactly one script, and it carries the CSP nonce.
    expect(html.split("<script").length - 1).toBe(1);
    expect(html).toContain(`<script nonce="${NONCE}">`);
    // The only anchors are the non-new file links (one here: src/old.ts), each with href="#".
    expect(html.split("<a ").length - 1).toBe(1);
    expect(html.split("href=").length - 1).toBe(1);
    expect(html).toContain('<a href="#" class="file-link" data-path="src/old.ts">');
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
    const li = (text: string): string =>
      `<li><textarea class="step-text"[^>]*>${text}</textarea>\\s*<textarea class="comment"[^>]*></textarea>\\s*</li>`;
    expect(html).toMatch(new RegExp(`<ol>\\s*${li("Step one")}\\s*${li("Step two")}\\s*</ol>`));
    expect(html).toMatch(/<ul>\s*<li>Check one<\/li>\s*<\/ul>/);
  });

  it("renders one empty comment textarea per step, in order, with data-step and aria-label", () => {
    const html = renderPlanHtml(makePlan({ implementationSteps: ["A", "B", "C"] }), NONCE);
    const areas = html.match(/<textarea class="comment"[^>]*>[\s\S]*?<\/textarea>/g) ?? [];
    expect(areas).toHaveLength(3);
    areas.forEach((a, i) => {
      expect(a).toContain('class="comment"');
      expect(a).toContain(`data-step="${i}"`);
      expect(a).toContain(`aria-label="Comment on step ${i + 1}"`);
      expect(a).toContain('rows="2"');
      expect(a).toContain('placeholder="Add a comment"');
      expect(a).toMatch(/><\/textarea>$/);
    });
  });

  it("renders editable fields, each with an aria-label", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).toContain('<input type="text" class="edit-title" aria-label="Edit title" value="Title">');
    expect(html).toMatch(/<textarea class="edit-summary" aria-label="Edit summary"[^>]*>Summary text<\/textarea>/);
    expect(html).toMatch(/<textarea class="edit-outofscope" aria-label="Edit out of scope"[^>]*>/);
    expect(html).toContain('<p class="status" role="status"></p>');
    const fields = html.match(/<(?:textarea|input)\b[^>]*>/g) ?? [];
    // title + summary + out of scope + 2 steps * (text + comment)
    expect(fields).toHaveLength(7);
    for (const f of fields) {
      expect(f).toMatch(/aria-label="[^"]+"/);
    }
  });

  it("renders one step-text textarea per step with escaped text, data-step and aria-label", () => {
    const html = renderPlanHtml(makePlan({ implementationSteps: ["A & B", "<i>C</i>"] }), NONCE);
    const areas = html.match(/<textarea class="step-text"[^>]*>[\s\S]*?<\/textarea>/g) ?? [];
    expect(areas).toHaveLength(2);
    expect(areas[0]).toContain('data-step="0"');
    expect(areas[0]).toContain('aria-label="Edit step 1"');
    expect(areas[0]).toContain(">A &amp; B</textarea>");
    expect(areas[1]).toContain('data-step="1"');
    expect(areas[1]).toContain('aria-label="Edit step 2"');
    expect(areas[1]).toContain(">&lt;i&gt;C&lt;/i&gt;</textarea>");
    expect(html).not.toContain("<i>");
  });

  it("keeps plan text out of the script", () => {
    const html = renderPlanHtml(
      makePlan({ implementationSteps: ["UNIQUE_STEP_TEXT"], title: "UNIQUE_TITLE" }),
      NONCE
    );
    const code = scriptCode(html);
    expect(code).toContain("acquireVsCodeApi");
    expect(code).not.toContain("UNIQUE_STEP_TEXT");
    expect(code).not.toContain("UNIQUE_TITLE");
    expect(code).not.toContain("Summary text");
    // acquireVsCodeApi is called exactly once.
    expect(code.split("acquireVsCodeApi(").length - 1).toBe(1);
  });

  it("keeps summary and out-of-scope text out of the script", () => {
    const html = renderPlanHtml(
      makePlan({ overview: { summary: "UNIQUE_SUMMARY", outOfScope: "UNIQUE_SCOPE" } }),
      NONCE
    );
    const code = scriptCode(html);
    expect(code).not.toContain("UNIQUE_SUMMARY");
    expect(code).not.toContain("UNIQUE_SCOPE");
  });

  it("script handles savePlan and saveResult, writing status with textContent", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    const code = scriptCode(html);
    expect(code).toContain("savePlan");
    expect(code).toContain("saveResult");
    expect(code).toContain("textContent");
    expect(code).not.toContain("innerHTML");
    expect(code.split("acquireVsCodeApi(").length - 1).toBe(1);
    expect(html.split("<script").length - 1).toBe(1);
  });

  it("uses the same nonce for the script and the CSP script-src", () => {
    const html = renderPlanHtml(makePlan(), "zzNonce9");
    const csp = html.match(/script-src 'nonce-([^']+)'/);
    const script = html.match(/<script nonce="([^"]+)">/);
    expect(csp?.[1]).toBe("zzNonce9");
    expect(script?.[1]).toBe(csp?.[1]);
  });

  it("puts the script at the end of the body", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html.indexOf("<script")).toBeGreaterThan(html.indexOf("<h2>Verification</h2>"));
    expect(html).toMatch(/<\/script>\s*<\/body>/);
  });

  it("escapes step text containing markup inside the step textarea", () => {
    const html = renderPlanHtml(makePlan({ implementationSteps: ["Do <b>x</b>"] }), NONCE);
    expect(html).not.toContain("<b>");
    expect(html).toContain("Do &lt;b&gt;x&lt;/b&gt;");
  });

  it("renders no step or comment textarea and no error for zero steps", () => {
    let html = "";
    expect(() => {
      html = renderPlanHtml(makePlan({ implementationSteps: [] }), NONCE);
    }).not.toThrow();
    expect(html).not.toContain('class="step-text"');
    expect(html).not.toContain('class="comment"');
    // Summary and out-of-scope textareas are always present.
    expect(html).toContain('class="edit-summary"');
    expect(html).toContain('class="edit-outofscope"');
    expect(html).toContain("<h2>Implementation steps</h2>");
  });
});
