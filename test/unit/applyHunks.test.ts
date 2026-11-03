import { describe, it, expect } from "vitest";

import { applyAcceptedHunks } from "../../src/plan/applyHunks";
import { DiffHunk, splitHunks } from "../../src/plan/diffHunks";
import { Decision } from "../../src/plan/hunkDecisions";

const P = "src/a.ts";

/** Builds a decisions map accepting the given hunk indexes for a path. */
function accept(path: string, indexes: number[]): Map<string, Decision> {
  return new Map(indexes.map((i) => [`${path}#${i}`, "accept" as Decision]));
}

describe("applyAcceptedHunks", () => {
  const original = "a\nb\nc\nd\ne\nf";
  const proposed = "a\nB\nc\nd\nE\nf\ng";

  it("returns the original text when nothing is accepted", () => {
    const hunks = splitHunks(original, proposed);
    const r = applyAcceptedHunks(original, hunks, new Map(), P);
    expect(r.text).toBe(original);
    expect(r.applied).toBe(0);
    expect(r.skipped).toBe(hunks.length);
  });

  it("returns the proposed text when every hunk is accepted", () => {
    const hunks = splitHunks(original, proposed);
    const r = applyAcceptedHunks(original, hunks, accept(P, hunks.map((h) => h.index)), P);
    expect(r.text).toBe(proposed);
    expect(r.applied).toBe(hunks.length);
    expect(r.skipped).toBe(0);
  });

  it("applies only the accepted hunks and keeps the others' original lines", () => {
    const hunks = splitHunks(original, proposed);
    expect(hunks.length).toBe(3);
    const r = applyAcceptedHunks(original, hunks, accept(P, [1]), P);
    expect(r.text).toBe("a\nb\nc\nd\nE\nf");
    expect(r.applied).toBe(1);
    expect(r.skipped).toBe(2);
  });

  it("treats rejected and pending decisions as not accepted", () => {
    const hunks = splitHunks(original, proposed);
    const d = new Map<string, Decision>([
      [`${P}#0`, "reject"],
      [`${P}#1`, "accept"],
    ]);
    const r = applyAcceptedHunks(original, hunks, d, P);
    expect(r.text).toBe("a\nb\nc\nd\nE\nf");
    expect(r.applied).toBe(1);
  });

  it("applies a pure insert", () => {
    const hunks = splitHunks("a\nc", "a\nb\nc");
    expect(applyAcceptedHunks("a\nc", hunks, accept(P, [0]), P).text).toBe("a\nb\nc");
  });

  it("applies a pure delete", () => {
    const hunks = splitHunks("a\nb\nc", "a\nc");
    expect(applyAcceptedHunks("a\nb\nc", hunks, accept(P, [0]), P).text).toBe("a\nc");
  });

  it("applies a hunk on a new file with an empty original", () => {
    const hunks = splitHunks("", "x\ny");
    const r = applyAcceptedHunks("", hunks, accept(P, [0]), P);
    expect(r.text).toBe("x\ny");
    expect(r.applied).toBe(1);
  });

  it("keeps an empty new file empty when not accepted", () => {
    const hunks = splitHunks("", "x\ny");
    expect(applyAcceptedHunks("", hunks, new Map(), P).text).toBe("");
  });

  it("can delete the whole content", () => {
    const hunks = splitHunks("x\ny", "");
    expect(applyAcceptedHunks("x\ny", hunks, accept(P, [0]), P).text).toBe("");
  });

  it("ignores accepted keys that belong to another path", () => {
    const hunks = splitHunks(original, proposed);
    const r = applyAcceptedHunks(original, hunks, accept("src/other.ts", [0, 1, 2]), P);
    expect(r.text).toBe(original);
    expect(r.applied).toBe(0);
  });

  it("rejects overlapping hunks", () => {
    const hunks: DiffHunk[] = [
      { index: 0, oldStart: 0, oldLines: ["a", "b"], newLines: ["X"] },
      { index: 1, oldStart: 1, oldLines: ["b"], newLines: ["Y"] },
    ];
    expect(() => applyAcceptedHunks("a\nb\nc", hunks, accept(P, [0, 1]), P)).toThrow();
  });

  it("rejects out-of-order hunks", () => {
    const hunks: DiffHunk[] = [
      { index: 0, oldStart: 2, oldLines: ["c"], newLines: ["X"] },
      { index: 1, oldStart: 0, oldLines: ["a"], newLines: ["Y"] },
    ];
    expect(() => applyAcceptedHunks("a\nb\nc", hunks, accept(P, [0, 1]), P)).toThrow();
  });

  it("rejects a hunk that reaches past the end of the original", () => {
    const hunks: DiffHunk[] = [{ index: 0, oldStart: 2, oldLines: ["c", "d"], newLines: ["X"] }];
    expect(() => applyAcceptedHunks("a\nb\nc", hunks, accept(P, [0]), P)).toThrow();
  });

  it("does not mutate its inputs", () => {
    const hunks = splitHunks(original, proposed);
    const hunksCopy = JSON.parse(JSON.stringify(hunks));
    const decisions = accept(P, [0, 2]);
    const decisionsCopy = new Map(decisions);
    const originalCopy = original.slice();
    applyAcceptedHunks(original, hunks, decisions, P);
    expect(hunks).toEqual(hunksCopy);
    expect(decisions).toEqual(decisionsCopy);
    expect(original).toBe(originalCopy);
  });
});

describe("applyAcceptedHunks round trip", () => {
  const pairs: Array<[string, string]> = [
    ["", "one"],
    ["one", ""],
    ["a\nb\nc", "a\nb\nc"],
    ["a\nb\nc", "c\nb\na"],
    ["a\nb\nc\n", "a\nX\nc\n"],
    ["a\nb\nc\nd", "a\nc"],
    ["a\nc", "a\nb\nc\nd\ne"],
    ["line1\nline2\nline3\nline4\nline5", "new0\nline1\nline3\nchanged\nline5\nnew6"],
    ["same\n\n\nend", "same\n\nmiddle\n\nend\n"],
  ];

  it.each(pairs)("accepting every hunk reproduces proposed (%j -> %j)", (orig, prop) => {
    const hunks = splitHunks(orig, prop);
    const r = applyAcceptedHunks(orig, hunks, accept(P, hunks.map((h) => h.index)), P);
    expect(r.text).toBe(prop);
    expect(r.applied).toBe(hunks.length);
  });

  it.each(pairs)("accepting no hunk reproduces original (%j)", (orig, prop) => {
    const r = applyAcceptedHunks(orig, splitHunks(orig, prop), new Map(), P);
    expect(r.text).toBe(orig);
  });
});
