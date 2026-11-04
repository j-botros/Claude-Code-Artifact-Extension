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
    verification: ["Check one", "Check two"],
    ...over,
  };
}

/** Returns the contents of the single script element. */
function scriptCode(html: string): string {
  const m = html.match(/<script nonce="[^"]*">([\s\S]*?)<\/script>/);
  expect(m).not.toBeNull();
  return m![1];
}

/** Returns every block id in the HTML, in document order. */
function blockIds(html: string): string[] {
  return [...html.matchAll(/<div class="block[^"]*" data-block="([^"]*)"/g)].map((m) => m[1]);
}

/** Returns every data-edit key in the HTML, in document order. */
function editKeys(html: string): string[] {
  return [...html.matchAll(/data-edit="([^"]*)"/g)].map((m) => m[1]);
}

describe("renderPlanHtml", () => {
  it("renders blocks in the order title, overview, code, files, steps, verification", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    // The title lives in the sticky bar, so it is not a commentable block.
    expect(blockIds(html)).toEqual([
      "overview",
      "code",
      "file:0",
      "file:1",
      "step:0",
      "step:1",
      "verification:0",
      "verification:1",
    ]);
    const markers = [
      "<h1",
      "<h2>Overview</h2>",
      "<h3>Out of scope</h3>",
      "<h2>Proposed changes</h2>",
      "<pre><code",
      "<h2>Files</h2>",
      "<h2>Implementation steps</h2>",
      "<h2>Verification</h2>",
    ];
    let last = -1;
    for (const m of markers) {
      const i = html.indexOf(m);
      expect(i, m).toBeGreaterThan(last);
      last = i;
    }
  });

  it("makes only title, summary, outOfScope and steps editable", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(editKeys(html)).toEqual(["title", "summary", "outOfScope", "step:0", "step:1"]);
    // None of the read-only blocks (code, files, verification) contain an editable element.
    for (const id of ["code", "file:0", "file:1", "verification:0", "verification:1"]) {
      const start = html.indexOf(`data-block="${id}"`);
      const end = html.indexOf('<div class="block', start + 1);
      const chunk = html.slice(start, end === -1 ? undefined : end);
      expect(chunk, id).not.toContain("data-edit=");
    }
  });

  it("gives every block a comment button with an aria-label", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    const ids = blockIds(html);
    const buttons = html.match(/<button class="add-comment"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(ids.length);
    for (const b of buttons) {
      expect(b).toMatch(/aria-label="Add inline comment on [^"]+"/);
      expect(b).toContain('title="Add inline comment"');
      expect(b).toContain('type="button"');
    }
    // Each block has its own margin cell and bubble holder.
    expect(html.split('<div class="bubbles"></div>').length - 1).toBe(ids.length);
    expect(html).not.toContain('aria-label="Add inline comment on title"');
    expect(html).not.toContain('data-block="title"');
    expect(html).toContain('aria-label="Add inline comment on step 2"');
    expect(html).toContain('aria-label="Add inline comment on verification 1"');
    expect(html).toContain('aria-label="Add inline comment on file src/old.ts"');
  });

  it("escapes every plan field, with one nonce script and no raw script tag", () => {
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
    expect(html.split("<script").length - 1).toBe(1);
    expect(html.split("</script>").length - 1).toBe(1);
    expect(html).toContain(`<title>${ESCAPED}</title>`);
    expect(html).toContain(`<h1 class="editable" data-edit="title" data-label="title" tabindex="0">${ESCAPED}</h1>`);
    expect(html).toContain(`data-edit="summary" data-label="summary" tabindex="0">${ESCAPED}</div>`);
    expect(html).not.toContain('title="Click to edit"');
    expect(html).toContain(`data-placeholder="Nothing excluded">${ESCAPED}</div>`);
    expect(html).toContain(`<span class="lang-label">${ESCAPED}</span>`);
    expect(html).toContain(`<code>${ESCAPED}</code></pre>`);
    expect(html).toContain(`<code>${ESCAPED}</code> <span class="badge">new</span>`);
    expect(html).toContain(`<div class="file-change">${ESCAPED}</div>`);
    expect(html).toContain(`<div class="verification-item">${ESCAPED}</div>`);
    expect(html).toContain(`tabindex="0">${ESCAPED}</div></div>`);
    // The hostile path in aria-label and data-label attributes is escaped too.
    expect(html).toContain(`aria-label="Add inline comment on file ${ESCAPED}"`);
    expect(html).not.toContain('aria-label="Add inline comment on file <');
  });

  it("renders a callout for a marker, keeps the marker in data-marker, and escapes the body", () => {
    const html = renderPlanHtml(
      makePlan({
        overview: { summary: "NOTE: <b>x</b>", outOfScope: null },
        implementationSteps: ["WARNING: careful", "NOTE:", "note: lower", "Mid NOTE: text"],
        verification: ["TIP: check it"],
      }),
      NONCE
    );
    expect(html).toContain('<div class="callout note"><div class="callout-label">NOTE</div>');
    expect(html).toContain('data-marker="NOTE: "');
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain('<div class="callout warning"><div class="callout-label">WARNING</div>');
    expect(html).toContain('data-marker="NOTE:"');
    expect(html).toContain('<div class="callout tip"><div class="callout-label">TIP</div><div class="verification-item">check it</div>');
    // Lowercase and mid-text markers stay plain text.
    expect(html).toContain(">note: lower</div>");
    expect(html).toContain(">Mid NOTE: text</div>");
    expect(html.split('class="callout-label"').length - 1).toBe(4);
  });

  it("emits a copy button, a short code label, and section rules between sections only", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html.split('class="copy-code"').length - 1).toBe(1);
    expect(html).toContain('<span class="lang-label">ts</span>');
    expect(html.split('<hr class="section-rule">').length - 1).toBe(4);
    expect(html.indexOf("<hr")).toBeGreaterThan(html.indexOf("<h2>Overview</h2>"));
    expect(html.lastIndexOf("<hr")).toBeLessThan(html.indexOf("<h2>Verification</h2>"));
  });

  it("orders the sticky bar as title, Review, Implement, kebab, with the title editable", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    const bar = html.slice(html.indexOf('<header class="top">'), html.indexOf("</header>"));
    const order = ['data-edit="title"', 'class="review"', 'class="implement"', 'class="kebab"'].map((s) => bar.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("position: sticky; top: 0");
  });

  it("sets the Antigravity sizes: content padding, bar padding, 26px buttons, 20px plus", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).toContain("--content-pad: max(9vw, 16px);");
    expect(html).toContain("--bar-pad: 1.4vw;");
    expect(html).toContain(".content { padding-inline: var(--content-pad); }");
    expect(html).toContain(":root { --content-pad: 16px; }");
    expect(html).not.toContain("--content-width");
    expect(html).toMatch(/button\.review \{[^}]*border-radius: 4px; height: 26px; padding: 0 10px;[^}]*font-size: 12px;/);
    expect(html).toMatch(/button\.implement \{[^}]*border-radius: 4px; height: 26px; padding: 0 10px;[^}]*font-size: 12px;/);
    expect(html).toMatch(/button\.add-comment \{[^}]*width: 20px; height: 20px;[^}]*font: bold 10px\/1/);
    expect(html).toContain("header.top h1 { margin: 0; line-height: 1.25; font-size: 1.26em; }");
    // The content wrapper comes after the header and holds the plan sections.
    expect(html.indexOf('<div class="content">')).toBeGreaterThan(html.indexOf("</header>"));
  });

  it("escapes attribute-breaking characters in file paths", () => {
    const html = renderPlanHtml(
      makePlan({ files: [{ path: `a"b'c.ts`, change: "c", isNew: false }] }),
      NONCE
    );
    expect(html).toContain('data-path="a&quot;b&#39;c.ts"');
    expect(html).not.toContain(`data-path="a"b`);
  });

  it("always renders an empty-capable Out of scope field: empty when null, filled for a string", () => {
    const none = renderPlanHtml(makePlan({ overview: { summary: "S", outOfScope: null } }), NONCE);
    expect(none).toContain("<h3>Out of scope</h3>");
    expect(none).toMatch(/data-edit="outOfScope"[^>]*data-placeholder="Nothing excluded"><\/div>/);
    const some = renderPlanHtml(makePlan(), NONCE);
    expect(some).toMatch(/data-edit="outOfScope"[^>]*>Scope text<\/div>/);
  });

  it("shows No files. and no file blocks for an empty file list", () => {
    const html = renderPlanHtml(makePlan({ files: [] }), NONCE);
    expect(html).toContain("<p>No files.</p>");
    expect(blockIds(html).some((id) => id.startsWith("file:"))).toBe(false);
  });

  it("puts the new badge only on isNew rows", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html.split('<span class="badge">new</span>').length - 1).toBe(1);
    const rows = html.split('<div class="file-row">').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("src/new.ts");
    expect(rows[0]).toContain('class="badge"');
    expect(rows[1]).toContain("src/old.ts");
    expect(rows[1]).not.toContain("badge");
  });

  it("includes the CSP meta tag with the nonce and no unsafe-inline", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${NONCE}'; script-src 'nonce-${NONCE}';">`
    );
    expect(html).toContain(`<style nonce="${NONCE}">`);
    expect(html).not.toContain("unsafe-inline");
  });

  it("contains exactly one nonce'd script, and no inline event handler", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html.split("<script").length - 1).toBe(1);
    expect(html).toContain(`<script nonce="${NONCE}">`);
    // The only anchors are the non-new file links (one here: src/old.ts), each with href="#".
    expect(html.split("<a ").length - 1).toBe(1);
    expect(html.split("href=").length - 1).toBe(1);
    expect(html).toContain('<a href="#" class="file-link" data-path="src/old.ts">');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toContain("javascript:");
  });

  it("uses the dark Antigravity palette by default and a light variant", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    for (const v of [
      "--bg: #1f1f1f;",
      "--heading: #cccccc;",
      "--fg: #d5d5d5;",
      "--btn-secondary: #343434;",
      "--popover: #232323;",
      "--border: #292929;",
      "--accent: #3376ce;",
      "--info: #3566ce;",
      "--important: #8259dd;",
      "--inline-code: #e2c98e;",
      "--code-comment: #8693a2;",
      "--code-keyword: #8ae0f6;",
      "--code-string: #bbec56;",
      "--content-pad: max(9vw, 16px);",
      "--review: #3376ce;",
      "--implement: #3fa34d;",
      "--margin-width: 40px;",
    ]) {
      expect(html).toContain(v);
    }
    expect(html).toContain("prefers-color-scheme: light");
    expect(html).not.toContain("prefers-color-scheme: dark");
    expect(html).not.toContain("--side-padding");
  });

  it("adds a language class only for safe values", () => {
    const ok = renderPlanHtml(makePlan({ proposedChanges: { language: "c++", code: "x" } }), NONCE);
    expect(ok).toContain('<code class="language-c++">');
    for (const bad of ["type script", 'ts"onload="x', "a b"]) {
      const html = renderPlanHtml(makePlan({ proposedChanges: { language: bad, code: "x" } }), NONCE);
      expect(html).not.toContain("language-");
      expect(html).toContain("<pre><code>");
    }
  });

  it("renders steps as numbered editable cards and verification as read-only cards", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).toContain('<span class="num">1.</span>');
    expect(html).toContain('<span class="num">2.</span>');
    expect(html).toMatch(/data-edit="step:0"[^>]*>Step one<\/div>/);
    expect(html).toMatch(/data-edit="step:1"[^>]*>Step two<\/div>/);
    expect(html).toContain('<div class="verification-item">Check one</div>');
    expect(html).toContain('<div class="verification-item">Check two</div>');
  });

  it("keeps the status line and review and implement buttons", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html).toContain('<p class="status" role="status"></p>');
    expect(html).toMatch(/<button class="review" type="button"[^>]*>[\s\S]*?<span class="review-label">Review &bull; 0<\/span>[\s\S]*?<\/button>/);
    expect(html).toContain('<button class="implement" type="button">Implement the Design</button>');
  });

  it("keeps plan text out of the script", () => {
    const html = renderPlanHtml(
      makePlan({
        implementationSteps: ["UNIQUE_STEP_TEXT"],
        title: "UNIQUE_TITLE",
        overview: { summary: "UNIQUE_SUMMARY", outOfScope: "UNIQUE_SCOPE" },
      }),
      NONCE
    );
    const code = scriptCode(html);
    expect(code).toContain("acquireVsCodeApi");
    for (const t of ["UNIQUE_STEP_TEXT", "UNIQUE_TITLE", "UNIQUE_SUMMARY", "UNIQUE_SCOPE"]) {
      expect(code).not.toContain(t);
    }
    expect(code.split("acquireVsCodeApi(").length - 1).toBe(1);
  });

  it("script handles savePlan and saveResult, writing text with textContent", () => {
    const code = scriptCode(renderPlanHtml(makePlan(), NONCE));
    expect(code).toContain("savePlan");
    expect(code).toContain("saveResult");
    expect(code).toContain("textContent");
    // The only innerHTML write is the fixed comment icon constant, never plan or comment text.
    expect(code.split("innerHTML").length - 1).toBe(1);
    expect(code).toContain("innerHTML = COMMENT_ICON");
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

  it("escapes step text containing markup", () => {
    const html = renderPlanHtml(makePlan({ implementationSteps: ["Do <b>x</b>"] }), NONCE);
    expect(html).not.toContain("<b>");
    expect(html).toContain("Do &lt;b&gt;x&lt;/b&gt;");
  });

  it("renders no step blocks and no error for zero steps", () => {
    let html = "";
    expect(() => {
      html = renderPlanHtml(makePlan({ implementationSteps: [] }), NONCE);
    }).not.toThrow();
    expect(blockIds(html).some((id) => id.startsWith("step:"))).toBe(false);
    expect(editKeys(html)).toEqual(["title", "summary", "outOfScope"]);
    expect(html).toContain("<h2>Implementation steps</h2>");
  });
});
