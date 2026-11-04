import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({}));

import type { Plan } from "../../src/plan/plan";
import { renderPlanHtml } from "../../src/webview/planPanel";

const NONCE = "abc123NONCE";

/** Builds a small plan, optionally overriding fields. */
function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    title: "Title",
    overview: { summary: "Summary text", outOfScope: null },
    proposedChanges: { language: "typescript", code: "x" },
    files: [],
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

describe("renderPlanHtml review button", () => {
  it("renders one Review button with a count, a chevron, and a hidden Submit comment popover", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html.split('class="review"').length - 1).toBe(1);
    expect(html).toMatch(/<button class="review" type="button" aria-haspopup="dialog" aria-expanded="false"><svg[\s\S]*?<span class="review-label">Review &bull; 0<\/span><svg[\s\S]*?<\/button>/);
    expect(html).toMatch(/<div class="review-pop popover" role="dialog" aria-label="Submit comment" hidden>/);
    expect(html).toContain("<h2>Submit comment</h2>");
    expect(html).toContain('placeholder="Add an optional message"');
    expect(html).toContain('<button class="submit-review primary" type="button">Submit</button>');
    expect(html).toContain('<details class="comment-list" open><summary>Comments (0)</summary>');
    // The kebab menu offers the three actions.
    for (const a of ["copyMarkdown", "copyPath", "exportArtifact"]) {
      expect(html).toContain(`data-action="${a}"`);
    }
    expect(html).toContain(">Copy</button>");
    expect(html).toContain(">Copy Path</button>");
    expect(html).toContain(">Export Artifact</button>");
    const header = html.match(/<header class="top">[\s\S]*?<\/header>/);
    expect(header).not.toBeNull();
    expect(header![0]).toContain('class="review"');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.split("<script").length - 1).toBe(1);
    expect(html).toContain(`<script nonce="${NONCE}">`);
  });

  it("renders one Implement the Design button in the header after Review, with no inline handler", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html.split('class="implement"').length - 1).toBe(1);
    expect(html).toContain('<button class="implement" type="button">Implement the Design</button>');
    const header = html.match(/<header class="top">[\s\S]*?<\/header>/);
    expect(header).not.toBeNull();
    expect(header![0]).toContain('class="implement"');
    expect(header![0].split('class="review"').length - 1).toBe(1);
    expect(header![0].indexOf('class="review"')).toBeLessThan(header![0].indexOf('class="implement"'));
    expect(html).not.toContain("onclick");
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.split("<script").length - 1).toBe(1);
    expect(html.split(`<script nonce="${NONCE}">`).length - 1).toBe(1);
  });

  it("script posts implementDesign and handles implementResult", () => {
    const code = scriptCode(renderPlanHtml(makePlan(), NONCE));
    expect(code).toContain("implementDesign");
    expect(code).toContain("implementResult");
  });

  it("script posts reviewComments and handles reviewResult", () => {
    const code = scriptCode(renderPlanHtml(makePlan(), NONCE));
    expect(code).toContain("reviewComments");
    expect(code).toContain("reviewResult");
    expect(code).toContain("message: messageBox.value");
    expect(code).toContain("actionResult");
    // The only innerHTML write is the fixed comment icon constant.
    expect(code.split("innerHTML").length - 1).toBe(1);
    expect(code).toContain("innerHTML = COMMENT_ICON");
  });

  it("sets resetState to a fixed boolean literal", () => {
    expect(scriptCode(renderPlanHtml(makePlan(), NONCE))).toContain("const resetState = false;");
    expect(scriptCode(renderPlanHtml(makePlan(), NONCE, { resetState: false }))).toContain(
      "const resetState = false;"
    );
    const on = scriptCode(renderPlanHtml(makePlan(), NONCE, { resetState: true }));
    expect(on).toContain("const resetState = true;");
    expect(on).not.toContain("const resetState = false;");
  });

  it("does not interpolate plan text into the script when resetState is true", () => {
    const code = scriptCode(renderPlanHtml(makePlan({ title: "UNIQUE_TITLE" }), NONCE, { resetState: true }));
    expect(code).not.toContain("UNIQUE_TITLE");
  });
});
