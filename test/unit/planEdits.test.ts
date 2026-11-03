import { describe, it, expect } from "vitest";

import type { Plan } from "../../src/plan/plan";
import { applyPlanEdits, planFileName } from "../../src/plan/planEdits";

/** Builds a fresh valid plan for each test. */
function makePlan(): Plan {
  return {
    title: "Old title",
    overview: { summary: "Old summary", outOfScope: "Old scope" },
    proposedChanges: { language: "typescript", code: "export function f(): void;" },
    files: [
      { path: "src/a.ts", change: "Add a.", isNew: true },
      { path: "src/b.ts", change: "Edit b.", isNew: false },
    ],
    implementationSteps: ["one", "two"],
    verification: ["check one", "check two"],
  };
}

/** Builds valid edit input, optionally overriding fields. */
function makeEdits(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "New title",
    summary: "New summary",
    outOfScope: "New scope",
    steps: ["first", "second"],
    ...over,
  };
}

describe("planFileName", () => {
  it("turns spaces and punctuation into single dashes", () => {
    expect(planFileName("Add Edit UI!")).toBe("add-edit-ui.json");
    expect(planFileName("a  --  b, c/d")).toBe("a-b-c-d.json");
  });

  it("turns unicode into dashes and trims dashes from both ends", () => {
    expect(planFileName("  Café résumé  ")).toBe("caf-r-sum.json");
    expect(planFileName("日本語 plan 日本語")).toBe("plan.json");
    expect(planFileName("---x---")).toBe("x.json");
  });

  it("gives plan.json for empty or symbol-only titles", () => {
    expect(planFileName("")).toBe("plan.json");
    expect(planFileName("   ")).toBe("plan.json");
    expect(planFileName("!!! ???")).toBe("plan.json");
    expect(planFileName("日本語")).toBe("plan.json");
  });

  it("keeps at most 80 characters before .json", () => {
    const name = planFileName("a".repeat(200));
    expect(name).toBe(`${"a".repeat(80)}.json`);
    const spaced = planFileName("word ".repeat(40));
    expect(spaced.length - ".json".length).toBeLessThanOrEqual(80);
    expect(spaced.endsWith("-.json")).toBe(false);
  });

  it("never contains path separators or dots other than the extension", () => {
    const name = planFileName("../../etc/passwd");
    expect(name).toBe("etc-passwd.json");
    expect(name.slice(0, -5)).not.toMatch(/[./\\]/);
  });

  it("is deterministic", () => {
    expect(planFileName("Same Title")).toBe(planFileName("Same Title"));
  });
});

describe("applyPlanEdits", () => {
  it("merges a valid edit and leaves other fields unchanged", () => {
    const current = makePlan();
    const r = applyPlanEdits(current, makeEdits());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.title).toBe("New title");
      expect(r.plan.overview).toEqual({ summary: "New summary", outOfScope: "New scope" });
      expect(r.plan.implementationSteps).toEqual(["first", "second"]);
      expect(r.plan.files).toEqual(current.files);
      expect(r.plan.proposedChanges).toEqual(current.proposedChanges);
      expect(r.plan.verification).toEqual(current.verification);
    }
  });

  it("trims title, summary, out of scope and steps", () => {
    const r = applyPlanEdits(
      makePlan(),
      makeEdits({ title: "  T  ", summary: "\nS\n", outOfScope: "  O ", steps: [" a ", "\tb\t"] })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.title).toBe("T");
      expect(r.plan.overview.summary).toBe("S");
      expect(r.plan.overview.outOfScope).toBe("O");
      expect(r.plan.implementationSteps).toEqual(["a", "b"]);
    }
  });

  it("turns an empty or whitespace out-of-scope into null", () => {
    for (const value of ["", "   \n"]) {
      const r = applyPlanEdits(makePlan(), makeEdits({ outOfScope: value }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.plan.overview.outOfScope).toBeNull();
      }
    }
  });

  it("accepts a null out-of-scope", () => {
    const r = applyPlanEdits(makePlan(), makeEdits({ outOfScope: null }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.overview.outOfScope).toBeNull();
    }
  });

  it("rejects an empty or whitespace title, naming the field", () => {
    for (const title of ["", "   "]) {
      const r = applyPlanEdits(makePlan(), makeEdits({ title }));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain("title");
      }
    }
  });

  it("rejects an empty summary, naming the field", () => {
    const r = applyPlanEdits(makePlan(), makeEdits({ summary: "  " }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("summary");
    }
  });

  it("rejects an empty step, naming the step", () => {
    const r = applyPlanEdits(makePlan(), makeEdits({ steps: ["ok", "   "] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("steps[1]");
    }
  });

  it("rejects the wrong number of steps", () => {
    for (const steps of [[], ["only"], ["a", "b", "c"]]) {
      const r = applyPlanEdits(makePlan(), makeEdits({ steps }));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain("steps");
      }
    }
  });

  it("rejects non-string and missing fields, naming the field", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["title", makeEdits({ title: 5 })],
      ["title", makeEdits({ title: undefined })],
      ["summary", makeEdits({ summary: {} })],
      ["summary", makeEdits({ summary: null })],
      ["outOfScope", makeEdits({ outOfScope: 7 })],
      ["outOfScope", makeEdits({ outOfScope: undefined })],
      ["steps", makeEdits({ steps: "one,two" })],
      ["steps", makeEdits({ steps: null })],
      ["steps[0]", makeEdits({ steps: [1, "two"] })],
      ["steps[1]", makeEdits({ steps: ["one", null] })],
    ];
    for (const [field, input] of cases) {
      const r = applyPlanEdits(makePlan(), input);
      expect(r.ok, field).toBe(false);
      if (!r.ok) {
        expect(r.error, field).toContain(field);
      }
    }
  });

  it("rejects input that is not an object, without throwing", () => {
    for (const input of [null, undefined, "x", 3, [], true]) {
      const r = applyPlanEdits(makePlan(), input);
      expect(r.ok).toBe(false);
    }
  });

  it("does not mutate the current plan or the input", () => {
    const current = makePlan();
    const snapshot = JSON.parse(JSON.stringify(current));
    const input = makeEdits({ steps: [" x ", " y "] });
    const inputSnapshot = JSON.parse(JSON.stringify(input));
    const r = applyPlanEdits(current, input);
    expect(r.ok).toBe(true);
    expect(current).toEqual(snapshot);
    expect(input).toEqual(inputSnapshot);
    if (r.ok) {
      expect(r.plan).not.toBe(current);
      expect(r.plan.files).not.toBe(current.files);
      expect(r.plan.verification).not.toBe(current.verification);
    }
  });
});
