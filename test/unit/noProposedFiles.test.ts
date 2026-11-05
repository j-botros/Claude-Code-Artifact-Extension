import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

import type { Plan } from "../../src/plan/plan";
import { noProposedFilesMessage } from "../../src/plan/noProposedFiles";
import { buildPlanPrompt, buildReviewPrompt } from "../../src/plan/planPrompt";

/** Returns a valid plan with the given files list and no proposedFiles. */
function makePlan(files: Plan["files"]): Plan {
  return {
    title: "T",
    overview: { summary: "S", outOfScope: null },
    proposedChanges: { language: "typescript", code: "x" },
    files,
    implementationSteps: ["one"],
    verification: ["check"],
  };
}

describe("noProposedFilesMessage", () => {
  it("names the cause when files is non-empty and proposedFiles is missing", () => {
    const msg = noProposedFilesMessage(makePlan([{ path: "src/a.ts", change: "Edit.", isNew: false }]));
    expect(msg).toContain("lists changed files under Files");
    expect(msg).toContain("no proposedFiles");
    expect(msg).not.toBe("This plan has no proposed files.");
  });

  it("gives the generic message when files is empty", () => {
    expect(noProposedFilesMessage(makePlan([]))).toBe("This plan has no proposed files.");
  });
});

// The rule every prompt must state: include for every path in files, omit only when files is empty.
const RULE_INCLUDE = /include it for every path in "files"/;
const RULE_CONTENT = /full new content of that file/;
const RULE_OMIT = /omit it only when "files" is empty/;

describe("prompt text states the proposedFiles rule", () => {
  const prompts: Record<string, string> = {
    plan: buildPlanPrompt("Do a thing"),
    review: buildReviewPrompt(makePlan([]), { 0: "Fix" }),
  };

  for (const [name, prompt] of Object.entries(prompts)) {
    it(`${name} prompt: include for every path in files, omit only when files is empty`, () => {
      expect(prompt).toMatch(RULE_INCLUDE);
      expect(prompt).toMatch(RULE_CONTENT);
      expect(prompt).toMatch(RULE_OMIT);
    });

    it(`${name} prompt no longer says to omit when no file contents are proposed`, () => {
      expect(prompt).not.toMatch(/proposes no file contents/);
    });
  }
});

describe("/design-plan command file states the proposedFiles rule", () => {
  const REPO = resolve(__dirname, "../..");
  const text = readFileSync(join(REPO, ".claude/commands/design-plan.md"), "utf8");

  it("says include for every path in files, with full content, omit only when files is empty", () => {
    expect(text).toMatch(RULE_INCLUDE);
    expect(text).toMatch(RULE_CONTENT);
    expect(text).toMatch(RULE_OMIT);
  });

  it("does not keep the old omit-when-no-contents wording", () => {
    expect(text).not.toMatch(/proposes no file contents/);
  });

  it("still names every required plan field", () => {
    const required = [
      "title", "overview", "summary", "outOfScope", "proposedChanges",
      "language", "code", "files", "path", "change", "isNew",
      "implementationSteps", "verification",
    ];
    for (const field of required) {
      expect(text, field).toContain(`"${field}"`);
    }
  });
});
