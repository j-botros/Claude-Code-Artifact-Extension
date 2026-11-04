import { describe, it, expect } from "vitest";

import {
  codeLineCount,
  codeLineId,
  codeLineIndex,
  codeLineLabel,
  dropOutOfRangeLineComments,
  splitCodeLines,
  splitTokensByLine,
} from "../../src/plan/codeLines";
import type { Plan } from "../../src/plan/plan";
import { applyPlanEdits } from "../../src/plan/planEdits";
import {
  blockIdsForPlan,
  blockLabel,
  formatCommentsForPrompt,
  parseReviewComments,
} from "../../src/plan/reviewComments";

/** Builds a plan whose code is the given string. */
function planWithCode(code: string): Plan {
  return {
    title: "T",
    overview: { summary: "S", outOfScope: null },
    proposedChanges: { language: "typescript", code },
    files: [],
    implementationSteps: ["one"],
    verification: [],
  };
}

/** Builds valid edit input, optionally overriding fields. */
function edits(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: "t", summary: "s", outOfScope: "", steps: ["a"], ...over };
}

describe("splitCodeLines", () => {
  it("splits on newlines", () => {
    expect(splitCodeLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("does not add a line for one trailing newline", () => {
    expect(splitCodeLines("a\nb\n")).toEqual(["a", "b"]);
    expect(codeLineCount("a\nb\n")).toBe(2);
  });

  it("keeps a second trailing empty line", () => {
    expect(splitCodeLines("a\n\n")).toEqual(["a", ""]);
  });

  it("gives one empty line for empty code", () => {
    expect(splitCodeLines("")).toEqual([""]);
    expect(codeLineCount("")).toBe(1);
  });

  it("keeps blank lines in the middle", () => {
    expect(splitCodeLines("a\n\nb")).toEqual(["a", "", "b"]);
  });
});

describe("code line ids and labels", () => {
  it("maps index to id and label, 0-based id and 1-based label", () => {
    expect(codeLineId(0)).toBe("code:0");
    expect(codeLineId(4)).toBe("code:4");
    expect(codeLineLabel(0)).toBe("Code line 1");
    expect(codeLineLabel(2)).toBe("Code line 3");
  });

  it("parses a line id back to its index and rejects other ids", () => {
    expect(codeLineIndex("code:0")).toBe(0);
    expect(codeLineIndex("code:12")).toBe(12);
    for (const bad of ["code", "code:", "code:01", "code:-1", "code:1.5", "step:1", "xcode:1", "code:1 "]) {
      expect(codeLineIndex(bad), bad).toBeNull();
    }
  });

  it("blockLabel labels line ids and keeps the plain code label", () => {
    const plan = planWithCode("a\nb\nc");
    expect(blockLabel("code:2", plan)).toBe("Code line 3");
    expect(blockLabel("code", plan)).toBe("Code");
  });
});

describe("splitTokensByLine", () => {
  it("cuts a multi-line token so each line keeps its kind", () => {
    const lines = splitTokensByLine([
      { kind: "comment", text: "/* a\nb */" },
      { kind: "plain", text: " x" },
    ] as never);
    expect(lines).toEqual([
      [{ kind: "comment", text: "/* a" }],
      [
        { kind: "comment", text: "b */" },
        { kind: "plain", text: " x" },
      ],
    ]);
  });

  it("does not add an extra line for a trailing newline", () => {
    expect(splitTokensByLine([{ kind: "plain", text: "a\n" }] as never)).toHaveLength(1);
  });
});

describe("dropOutOfRangeLineComments", () => {
  it("drops only code line ids at or past the count and reports the number", () => {
    const input = { "code:0": "a", "code:2": "b", "code:3": "c", code: "whole", "step:5": "s" };
    const r = dropOutOfRangeLineComments(input, 2);
    expect(r.dropped).toBe(2);
    expect(r.comments).toEqual({ "code:0": "a", code: "whole", "step:5": "s" });
    expect(Object.keys(input)).toHaveLength(5);
  });
});

describe("blockIdsForPlan with code lines", () => {
  it("puts one code:<i> per line right after code", () => {
    expect(blockIdsForPlan(planWithCode("a\nb\nc\n"))).toEqual([
      "title",
      "overview",
      "code",
      "code:0",
      "code:1",
      "code:2",
      "step:0",
    ]);
  });
});

describe("parseReviewComments with code lines", () => {
  const plan = planWithCode("a\nb\nc");

  it("accepts in-range line ids, including the last line", () => {
    expect(parseReviewComments({ "code:0": " x ", "code:2": "y" }, plan)).toEqual({
      ok: true,
      comments: { "code:0": "x", "code:2": "y" },
    });
  });

  it("rejects out-of-range and malformed line ids", () => {
    for (const key of ["code:3", "code:99999999999999999999", "code:-1", "code:01", "code:1.5", "code:"]) {
      expect(parseReviewComments({ [key]: "x" }, plan).ok, key).toBe(false);
    }
  });

  it("a trailing newline does not make the next line valid", () => {
    expect(parseReviewComments({ "code:3": "x" }, planWithCode("a\nb\nc\n")).ok).toBe(false);
  });
});

describe("formatCommentsForPrompt with code lines", () => {
  it("labels a line comment Code line N and orders it after Code", () => {
    const plan = planWithCode("a\nb\nc");
    const text = formatCommentsForPrompt({ "step:0": "s", "code:1": "bad name", code: "whole" }, plan);
    expect(text).toBe(["Code: whole", "Code line 2: bad name", "Step 1: s"].join("\n"));
  });
});

describe("applyPlanEdits code", () => {
  it("keeps the current code when code is absent", () => {
    const r = applyPlanEdits(planWithCode("keep me"), edits());
    expect(r.ok && r.plan.proposedChanges.code).toBe("keep me");
  });

  it("stores valid code, trimming trailing whitespace and keeping inner text and language", () => {
    const r = applyPlanEdits(planWithCode("old"), edits({ code: "  a\n\n  b  \n\n  \n" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.proposedChanges.code).toBe("  a\n\n  b");
      expect(r.plan.proposedChanges.language).toBe("typescript");
    }
  });

  it("rejects blank code", () => {
    for (const bad of ["", "   ", "\n\n\t "]) {
      const r = applyPlanEdits(planWithCode("old"), edits({ code: bad }));
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain("code");
      }
    }
  });

  it("rejects non-string code", () => {
    for (const bad of [1, null, {}, ["a"], true]) {
      const r = applyPlanEdits(planWithCode("old"), edits({ code: bad }));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain("code");
      }
    }
  });
});
