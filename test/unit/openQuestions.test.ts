import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({}));

import { parsePlanJson } from "../../src/plan/plan";
import type { Plan } from "../../src/plan/plan";
import { applyPlanEdits } from "../../src/plan/planEdits";
import {
  blockIdsForPlan,
  blockLabel,
  dropOutOfRangeQuestionComments,
  formatCommentsForPrompt,
  parseReviewComments,
} from "../../src/plan/reviewComments";
import { renderPlanHtml } from "../../src/webview/planPanel";

/** Builds a valid plan, optionally with open questions. */
function makePlan(questions?: string[]): Plan {
  const plan: Plan = {
    title: "T",
    overview: { summary: "S", outOfScope: null },
    proposedChanges: { language: "typescript", code: "x" },
    files: [{ path: "src/a.ts", change: "a", isNew: true }],
    implementationSteps: ["one", "two"],
    verification: ["v1"],
  };
  if (questions !== undefined) {
    plan.openQuestions = questions;
  }
  return plan;
}

/** Builds valid edits for makePlan, with overrides. */
function makeEdits(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: "T2", summary: "S2", outOfScope: null, steps: ["a", "b"], ...over };
}

/** Parses a plan with the given openQuestions value (or none when undefined). */
function parseWith(value: unknown) {
  const p = makePlan() as unknown as Record<string, unknown>;
  if (value !== undefined) {
    p.openQuestions = value;
  }
  return parsePlanJson(JSON.stringify(p));
}

describe("parsePlanJson openQuestions", () => {
  it("keeps a valid array", () => {
    const r = parseWith(["Which DB?", "Keep v1?"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.openQuestions).toEqual(["Which DB?", "Keep v1?"]);
    }
  });

  it("leaves the field absent when missing", () => {
    const r = parseWith(undefined);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.openQuestions).toBeUndefined();
    }
  });

  it("accepts an empty array", () => {
    const r = parseWith([]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.openQuestions ?? []).toEqual([]);
    }
  });

  it("rejects a non-array", () => {
    for (const bad of ["a question", 5, { a: 1 }, null, true]) {
      expect(parseWith(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects non-string items", () => {
    for (const bad of [[1], ["ok", null], [{}], [["x"]]]) {
      expect(parseWith(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects blank items", () => {
    for (const bad of [[""], ["ok", "   "], ["\n\t"]]) {
      const r = parseWith(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("question block ids and labels", () => {
  it("lists question ids last, after verification", () => {
    const ids = blockIdsForPlan(makePlan(["q1", "q2"]));
    expect(ids.slice(-3)).toEqual(["verification:0", "question:0", "question:1"]);
  });

  it("adds no question ids without the field or with []", () => {
    expect(blockIdsForPlan(makePlan()).some((i) => i.startsWith("question:"))).toBe(false);
    expect(blockIdsForPlan(makePlan([])).some((i) => i.startsWith("question:"))).toBe(false);
  });

  it("labels question:<i> as Open question <i+1>", () => {
    const plan = makePlan(["q1", "q2"]);
    expect(blockLabel("question:0", plan)).toBe("Open question 1");
    expect(blockLabel("question:1", plan)).toBe("Open question 2");
  });

  it("accepts in-range question comments and rejects out-of-range or malformed ones", () => {
    const plan = makePlan(["q1", "q2"]);
    const ok = parseReviewComments({ "question:1": "  answer  " }, plan);
    expect(ok).toEqual({ ok: true, comments: { "question:1": "answer" } });
    expect(parseReviewComments({ "question:2": "x" }, plan).ok).toBe(false);
    expect(parseReviewComments({ "question:01": "x" }, plan).ok).toBe(false);
    expect(parseReviewComments({ "question:-1": "x" }, plan).ok).toBe(false);
    expect(parseReviewComments({ "question:0": "x" }, makePlan()).ok).toBe(false);
  });

  it("formats question comments after verification with their labels", () => {
    const plan = makePlan(["q1", "q2"]);
    const text = formatCommentsForPrompt(
      { "question:1": "no", "verification:0": "v", "question:0": "yes" },
      plan
    );
    expect(text).toBe("Verification 1: v\nOpen question 1: yes\nOpen question 2: no");
  });
});

describe("dropOutOfRangeQuestionComments", () => {
  it("drops question comments at or past the count and reports how many", () => {
    const r = dropOutOfRangeQuestionComments(
      { "question:0": "a", "question:1": "b", "question:2": "c", "step:5": "s", title: "t" },
      2
    );
    expect(r.dropped).toBe(1);
    expect(r.comments).toEqual({ "question:0": "a", "question:1": "b", "step:5": "s", title: "t" });
  });

  it("drops every question comment when the count is 0", () => {
    const r = dropOutOfRangeQuestionComments({ "question:0": "a", "question:3": "b", overview: "o" }, 0);
    expect(r.dropped).toBe(2);
    expect(r.comments).toEqual({ overview: "o" });
  });

  it("drops nothing when all are in range, and does not mutate the input", () => {
    const input = { "question:0": "a" };
    const r = dropOutOfRangeQuestionComments(input, 1);
    expect(r.dropped).toBe(0);
    expect(r.comments).toEqual({ "question:0": "a" });
    expect(input).toEqual({ "question:0": "a" });
  });
});

describe("applyPlanEdits questions", () => {
  it("applies and trims a valid questions edit without mutating current", () => {
    const current = makePlan(["q1", "q2"]);
    const r = applyPlanEdits(current, makeEdits({ questions: ["  new1 ", "new2"] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.openQuestions).toEqual(["new1", "new2"]);
    }
    expect(current.openQuestions).toEqual(["q1", "q2"]);
  });

  it("rejects a blank question", () => {
    const r = applyPlanEdits(makePlan(["q1", "q2"]), makeEdits({ questions: ["ok", "   "] }));
    expect(r.ok).toBe(false);
  });

  it("rejects a wrong length", () => {
    const current = makePlan(["q1", "q2"]);
    expect(applyPlanEdits(current, makeEdits({ questions: ["only"] })).ok).toBe(false);
    expect(applyPlanEdits(current, makeEdits({ questions: ["a", "b", "c"] })).ok).toBe(false);
    expect(applyPlanEdits(makePlan(), makeEdits({ questions: ["a"] })).ok).toBe(false);
  });

  it("rejects a non-array and non-string items", () => {
    const current = makePlan(["q1"]);
    expect(applyPlanEdits(current, makeEdits({ questions: "q" })).ok).toBe(false);
    expect(applyPlanEdits(current, makeEdits({ questions: [5] })).ok).toBe(false);
  });

  it("keeps the current questions when the edit omits them", () => {
    const r = applyPlanEdits(makePlan(["q1", "q2"]), makeEdits());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.openQuestions).toEqual(["q1", "q2"]);
    }
  });

  it("keeps a plan without the field free of it, and accepts an empty list", () => {
    const a = applyPlanEdits(makePlan(), makeEdits());
    expect(a.ok && a.plan.openQuestions).toBeFalsy();
    const b = applyPlanEdits(makePlan(), makeEdits({ questions: [] }));
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.plan.openQuestions ?? []).toEqual([]);
    }
  });
});

describe("renderPlanHtml open questions", () => {
  it("omits the section without the field or with []", () => {
    expect(renderPlanHtml(makePlan(), "n")).not.toContain("Open Questions");
    expect(renderPlanHtml(makePlan([]), "n")).not.toContain("Open Questions");
  });

  it("renders the section after Verification with editable question blocks", () => {
    const html = renderPlanHtml(makePlan(["Which DB?", "Keep v1?"]), "n");
    expect(html.indexOf("<h2>Open Questions</h2>")).toBeGreaterThan(html.indexOf("<h2>Verification</h2>"));
    expect(html).toContain('data-block="question:0"');
    expect(html).toContain('data-block="question:1"');
    expect(html).toContain('data-edit="question:1"');
  });
});
