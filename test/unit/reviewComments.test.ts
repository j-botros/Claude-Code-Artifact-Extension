import { describe, it, expect } from "vitest";
import { parseReviewComments, formatCommentsForPrompt } from "../../src/plan/reviewComments";

describe("parseReviewComments", () => {
  it("accepts a valid map and trims values", () => {
    expect(parseReviewComments({ "0": "  fix this ", "2": "and this" }, 3)).toEqual({
      ok: true,
      comments: { 0: "fix this", 2: "and this" },
    });
  });

  it("rejects non-objects", () => {
    for (const bad of [null, undefined, "x", 5, true, ["a"]]) {
      expect(parseReviewComments(bad, 3).ok).toBe(false);
    }
  });

  it("rejects keys that are not integers", () => {
    for (const key of ["a", "1.5", "01", "1e1", " 1", ""]) {
      expect(parseReviewComments({ [key]: "x" }, 5).ok, key).toBe(false);
    }
  });

  it("rejects negative and out-of-range keys", () => {
    expect(parseReviewComments({ "-1": "x" }, 3).ok).toBe(false);
    expect(parseReviewComments({ "3": "x" }, 3).ok).toBe(false);
    expect(parseReviewComments({ "99999999999999999999": "x" }, 3).ok).toBe(false);
  });

  it("rejects non-string values", () => {
    for (const bad of [1, null, {}, ["a"], true]) {
      expect(parseReviewComments({ "0": bad }, 3).ok).toBe(false);
    }
  });

  it("drops whitespace-only values", () => {
    expect(parseReviewComments({ "0": "   \n", "1": "keep" }, 2)).toEqual({
      ok: true,
      comments: { 1: "keep" },
    });
  });

  it("accepts an empty map", () => {
    expect(parseReviewComments({}, 0)).toEqual({ ok: true, comments: {} });
  });

  it("rejects a non-empty map when there are zero steps", () => {
    expect(parseReviewComments({ "0": "x" }, 0).ok).toBe(false);
  });
});

describe("formatCommentsForPrompt", () => {
  it("numbers from one and sorts by step", () => {
    expect(formatCommentsForPrompt({ 10: "ten", 2: "two", 0: "zero" })).toBe(
      "Step 1: zero\nStep 3: two\nStep 11: ten"
    );
  });

  it("returns an empty string for an empty map", () => {
    expect(formatCommentsForPrompt({})).toBe("");
  });
});
