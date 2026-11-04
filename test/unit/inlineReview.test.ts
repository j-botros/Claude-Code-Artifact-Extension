import { describe, expect, it } from "vitest";
import { splitHunks } from "../../src/plan/diffHunks";
import { buildInlineView } from "../../src/plan/inlineReview";

/** Builds the inline view for an original and proposed text with the given rejected hunks. */
function view(original: string, proposed: string, rejected: number[] = []) {
  return buildInlineView(original, splitHunks(original, proposed), new Set(rejected));
}

describe("buildInlineView", () => {
  it("returns the original text and no hunks when nothing changed", () => {
    const result = view("a\nb\nc", "a\nb\nc");
    expect(result.text).toBe("a\nb\nc");
    expect(result.hunks).toEqual([]);
  });

  it("shows a replaced line as removed then added", () => {
    const result = view("a\nb\nc", "a\nB\nc");
    expect(result.text).toBe("a\nb\nB\nc");
    expect(result.hunks).toEqual([
      { index: 0, firstLine: 1, removed: { start: 1, count: 1 }, added: { start: 2, count: 1 } },
    ]);
  });

  it("maps a pure insert to an added span only", () => {
    const result = view("a\nc", "a\nb\nc");
    expect(result.text).toBe("a\nb\nc");
    expect(result.hunks).toEqual([{ index: 0, firstLine: 1, removed: null, added: { start: 1, count: 1 } }]);
  });

  it("maps a pure delete to a removed span only and keeps the lines", () => {
    const result = view("a\nb\nc", "a\nc");
    expect(result.text).toBe("a\nb\nc");
    expect(result.hunks).toEqual([{ index: 0, firstLine: 1, removed: { start: 1, count: 1 }, added: null }]);
  });

  it("maps multi-line removed and added runs", () => {
    const result = view("a\nx\ny\nd", "a\nP\nQ\nR\nd");
    expect(result.text).toBe("a\nx\ny\nP\nQ\nR\nd");
    expect(result.hunks[0].removed).toEqual({ start: 1, count: 2 });
    expect(result.hunks[0].added).toEqual({ start: 3, count: 3 });
  });

  it("treats a new file (empty original) as all added lines", () => {
    const result = view("", "one\ntwo\nthree");
    expect(result.text).toBe("one\ntwo\nthree");
    expect(result.hunks).toEqual([{ index: 0, firstLine: 0, removed: null, added: { start: 0, count: 3 } }]);
  });

  it("shows a rejected hunk as its original lines with no spans", () => {
    const result = view("a\nb\nc", "a\nB\nc", [0]);
    expect(result.text).toBe("a\nb\nc");
    expect(result.hunks).toEqual([{ index: 0, firstLine: 1, removed: null, added: null }]);
  });

  it("handles several hunks and shifts later positions by earlier added lines", () => {
    const original = "l1\nl2\nl3\nl4\nl5\nl6\nl7";
    const proposed = "l1\nX\nY\nl3\nl4\nl5\nZ\nl7";
    const result = view(original, proposed);
    // Hunk 0 replaces l2 with X,Y; hunk 1 replaces l6 with Z.
    expect(result.text).toBe("l1\nl2\nX\nY\nl3\nl4\nl5\nl6\nZ\nl7");
    expect(result.hunks).toEqual([
      { index: 0, firstLine: 1, removed: { start: 1, count: 1 }, added: { start: 2, count: 2 } },
      { index: 1, firstLine: 7, removed: { start: 7, count: 1 }, added: { start: 8, count: 1 } },
    ]);
  });

  it("rejecting an earlier hunk moves a later hunk back up", () => {
    const original = "l1\nl2\nl3\nl4\nl5\nl6\nl7";
    const proposed = "l1\nX\nY\nl3\nl4\nl5\nZ\nl7";
    const result = view(original, proposed, [0]);
    expect(result.text).toBe("l1\nl2\nl3\nl4\nl5\nl6\nZ\nl7");
    expect(result.hunks[0]).toEqual({ index: 0, firstLine: 1, removed: null, added: null });
    expect(result.hunks[1]).toEqual({
      index: 1,
      firstLine: 5,
      removed: { start: 5, count: 1 },
      added: { start: 6, count: 1 },
    });
  });

  it("rejecting a later hunk leaves the earlier hunk spans unchanged", () => {
    const original = "l1\nl2\nl3\nl4\nl5\nl6\nl7";
    const proposed = "l1\nX\nY\nl3\nl4\nl5\nZ\nl7";
    const result = view(original, proposed, [1]);
    expect(result.text).toBe("l1\nl2\nX\nY\nl3\nl4\nl5\nl6\nl7");
    expect(result.hunks[0].added).toEqual({ start: 2, count: 2 });
    expect(result.hunks[1]).toEqual({ index: 1, firstLine: 7, removed: null, added: null });
  });

  it("with every hunk rejected the text equals the original", () => {
    const original = "a\nb\nc\nd\ne\nf";
    const proposed = "a\nB\nc\nd\nE\nf";
    expect(view(original, proposed, [0, 1]).text).toBe(original);
  });

  it("keeps a trailing newline in the text", () => {
    const result = view("a\nb\n", "a\nB\n");
    expect(result.text).toBe("a\nb\nB\n");
  });
});
