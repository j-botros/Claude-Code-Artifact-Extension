import { describe, it, expect } from "vitest";
import type { Plan } from "../../src/plan/plan";
import {
  blockIdsForPlan,
  blockLabel,
  formatCommentsForPrompt,
  parseReviewComments,
} from "../../src/plan/reviewComments";

/** Builds a plan with two files, three steps, and two verification items. */
function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    title: "T",
    overview: { summary: "S", outOfScope: null },
    proposedChanges: { language: "typescript", code: "x" },
    files: [
      { path: "src/a.ts", change: "a", isNew: true },
      { path: "src/b.ts", change: "b", isNew: false },
    ],
    implementationSteps: ["one", "two", "three"],
    verification: ["v1", "v2"],
    ...over,
  };
}

describe("blockIdsForPlan", () => {
  it("lists title, overview, code, then files, steps, verification in order", () => {
    expect(blockIdsForPlan(makePlan())).toEqual([
      "title",
      "overview",
      "code",
      "code:0",
      "file:0",
      "file:1",
      "step:0",
      "step:1",
      "step:2",
      "verification:0",
      "verification:1",
    ]);
  });

  it("lists only the fixed blocks for an empty plan", () => {
    expect(
      blockIdsForPlan(makePlan({ files: [], implementationSteps: [], verification: [] }))
    ).toEqual(["title", "overview", "code", "code:0"]);
  });
});

describe("parseReviewComments", () => {
  it("accepts block-id keys and trims values", () => {
    expect(
      parseReviewComments({ title: "  rename ", "step:2": "and this", "file:1": "x", "verification:0": "y", code: "c", overview: "o" }, makePlan())
    ).toEqual({
      ok: true,
      comments: { title: "rename", "step:2": "and this", "file:1": "x", "verification:0": "y", code: "c", overview: "o" },
    });
  });

  it("rejects non-objects", () => {
    for (const bad of [null, undefined, "x", 5, true, ["a"]]) {
      expect(parseReviewComments(bad, makePlan()).ok).toBe(false);
    }
  });

  it("rejects the old numeric keys and other unknown keys", () => {
    for (const key of ["0", "1", "a", "step", "step:", "step:a", "step:-1", "step:1.5", "step:01", "file", "Title", " title", "", "steps:0", "title:0"]) {
      expect(parseReviewComments({ [key]: "x" }, makePlan()).ok, key).toBe(false);
    }
  });

  it("rejects out-of-range indexes", () => {
    expect(parseReviewComments({ "step:3": "x" }, makePlan()).ok).toBe(false);
    expect(parseReviewComments({ "file:2": "x" }, makePlan()).ok).toBe(false);
    expect(parseReviewComments({ "verification:2": "x" }, makePlan()).ok).toBe(false);
    expect(parseReviewComments({ "step:99999999999999999999": "x" }, makePlan()).ok).toBe(false);
    expect(parseReviewComments({ "step:0": "x" }, makePlan({ implementationSteps: [] })).ok).toBe(false);
  });

  it("accepts the last valid index", () => {
    expect(parseReviewComments({ "step:2": "x" }, makePlan()).ok).toBe(true);
  });

  it("rejects non-string values", () => {
    for (const bad of [1, null, {}, ["a"], true]) {
      expect(parseReviewComments({ title: bad }, makePlan()).ok).toBe(false);
    }
  });

  it("drops empty and whitespace-only values", () => {
    expect(parseReviewComments({ title: "   \n", "step:0": "keep", code: "" }, makePlan())).toEqual({
      ok: true,
      comments: { "step:0": "keep" },
    });
  });

  it("accepts an empty map", () => {
    expect(parseReviewComments({}, makePlan())).toEqual({ ok: true, comments: {} });
  });
});

describe("blockLabel", () => {
  const plan = makePlan();

  it("labels fixed blocks", () => {
    expect(blockLabel("title", plan)).toBe("Title");
    expect(blockLabel("overview", plan)).toBe("Overview");
    expect(blockLabel("code", plan)).toBe("Code");
  });

  it("numbers steps and verification from one", () => {
    expect(blockLabel("step:0", plan)).toBe("Step 1");
    expect(blockLabel("step:2", plan)).toBe("Step 3");
    expect(blockLabel("verification:0", plan)).toBe("Verification 1");
    expect(blockLabel("verification:1", plan)).toBe("Verification 2");
  });

  it("names files by path", () => {
    expect(blockLabel("file:0", plan)).toBe("File src/a.ts");
    expect(blockLabel("file:1", plan)).toBe("File src/b.ts");
  });

  it("falls back to the number for a file out of range, and to the id for an unknown kind", () => {
    expect(blockLabel("file:9", plan)).toBe("File 10");
    expect(blockLabel("bogus", plan)).toBe("bogus");
  });
});

describe("formatCommentsForPrompt", () => {
  const plan = makePlan();

  it("writes labelled lines in document order, not insertion order", () => {
    const text = formatCommentsForPrompt(
      { "verification:1": "vv", "step:2": "s3", "file:0": "ff", code: "cc", title: "tt", overview: "oo", "step:0": "s1" },
      plan
    );
    expect(text).toBe(
      [
        "Title: tt",
        "Overview: oo",
        "Code: cc",
        "File src/a.ts: ff",
        "Step 1: s1",
        "Step 3: s3",
        "Verification 2: vv",
      ].join("\n")
    );
  });

  it("returns an empty string for an empty map", () => {
    expect(formatCommentsForPrompt({}, plan)).toBe("");
  });

  it("folds newlines in a comment to single spaces", () => {
    expect(formatCommentsForPrompt({ title: "line one\n  line two\r\n\nline three" }, plan)).toBe(
      "Title: line one line two line three"
    );
  });

  it("skips ids that are not in the plan", () => {
    expect(formatCommentsForPrompt({ "step:7": "x", title: "t" }, plan)).toBe("Title: t");
  });
});
