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
  it("renders one Review Comments button in the header, with no inline handler", () => {
    const html = renderPlanHtml(makePlan(), NONCE);
    expect(html.split('class="review"').length - 1).toBe(1);
    expect(html).toContain('<button class="review" type="button">Review Comments</button>');
    const header = html.match(/<header class="top">[\s\S]*?<\/header>/);
    expect(header).not.toBeNull();
    expect(header![0]).toContain('class="review"');
    expect(header![0]).toContain('class="edit-title"');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.split("<script").length - 1).toBe(1);
    expect(html).toContain(`<script nonce="${NONCE}">`);
  });

  it("script posts reviewComments and handles reviewResult", () => {
    const code = scriptCode(renderPlanHtml(makePlan(), NONCE));
    expect(code).toContain("reviewComments");
    expect(code).toContain("reviewResult");
    expect(code).not.toContain("innerHTML");
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
