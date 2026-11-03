import { describe, it, expect } from "vitest";

import { splitHunks } from "../../src/plan/diffHunks";
import { setDecision, summarizeDecisions, Decision } from "../../src/plan/hunkDecisions";

describe("splitHunks", () => {
  it("returns no hunks for identical text", () => {
    expect(splitHunks("a\nb\nc", "a\nb\nc")).toEqual([]);
    expect(splitHunks("", "")).toEqual([]);
  });

  it("reports one changed line as one hunk", () => {
    expect(splitHunks("a\nb\nc", "a\nX\nc")).toEqual([
      { index: 0, oldStart: 1, oldLines: ["b"], newLines: ["X"] },
    ]);
  });

  it("reports a pure insert with empty oldLines", () => {
    expect(splitHunks("a\nc", "a\nb\nc")).toEqual([
      { index: 0, oldStart: 1, oldLines: [], newLines: ["b"] },
    ]);
  });

  it("reports a pure delete with empty newLines", () => {
    expect(splitHunks("a\nb\nc", "a\nc")).toEqual([
      { index: 0, oldStart: 1, oldLines: ["b"], newLines: [] },
    ]);
  });

  it("treats an empty original as a new file with all lines added", () => {
    expect(splitHunks("", "a\nb")).toEqual([
      { index: 0, oldStart: 0, oldLines: [], newLines: ["a", "b"] },
    ]);
  });

  it("treats an empty proposal as all lines removed", () => {
    expect(splitHunks("a\nb", "")).toEqual([
      { index: 0, oldStart: 0, oldLines: ["a", "b"], newLines: [] },
    ]);
  });

  it("gives two hunks with the right index and oldStart for separated changes", () => {
    const hunks = splitHunks("a\nb\nc\nd\ne", "a\nB\nc\nd\nE");
    expect(hunks).toEqual([
      { index: 0, oldStart: 1, oldLines: ["b"], newLines: ["B"] },
      { index: 1, oldStart: 4, oldLines: ["e"], newLines: ["E"] },
    ]);
  });

  it("keeps oldStart in original coordinates after an earlier insert", () => {
    const hunks = splitHunks("a\nb\nc", "a\nx\ny\nb\nC");
    expect(hunks.map((h) => h.oldStart)).toEqual([1, 2]);
    expect(hunks.map((h) => h.index)).toEqual([0, 1]);
  });

  it("handles a trailing newline as a final empty line", () => {
    expect(splitHunks("a\nb\n", "a\nb\n")).toEqual([]);
    expect(splitHunks("a\n", "a\nb\n")).toEqual([
      { index: 0, oldStart: 1, oldLines: [], newLines: ["b"] },
    ]);
    expect(splitHunks("a", "a\n")).toEqual([
      { index: 0, oldStart: 1, oldLines: [], newLines: [""] },
    ]);
  });

  it("returns one whole-file hunk when the size cap is exceeded", () => {
    const old = Array.from({ length: 2100 }, (_, i) => `o${i}`);
    const neu = Array.from({ length: 2100 }, (_, i) => (i === 5 ? "changed" : `o${i}`));
    const hunks = splitHunks(old.join("\n"), neu.join("\n"));
    expect(hunks).toHaveLength(1);
    expect(hunks[0].index).toBe(0);
    expect(hunks[0].oldStart).toBe(0);
    expect(hunks[0].oldLines).toEqual(old);
    expect(hunks[0].newLines).toEqual(neu);
  });

  it("still diffs line by line just under the cap", () => {
    const old = Array.from({ length: 1000 }, (_, i) => `o${i}`);
    const neu = old.map((l, i) => (i === 5 ? "changed" : l));
    const hunks = splitHunks(old.join("\n"), neu.join("\n"));
    expect(hunks).toEqual([{ index: 0, oldStart: 5, oldLines: ["o5"], newLines: ["changed"] }]);
  });
});

describe("hunk decisions", () => {
  it("setDecision returns a new map and does not mutate the input", () => {
    const before = new Map<string, Decision>();
    const after = setDecision(before, "a.ts#0", "accept");
    expect(after).not.toBe(before);
    expect(before.size).toBe(0);
    expect(after.get("a.ts#0")).toBe("accept");
  });

  it("setDecision overwrites an earlier decision", () => {
    const one = setDecision(new Map(), "k", "accept");
    const two = setDecision(one, "k", "reject");
    expect(one.get("k")).toBe("accept");
    expect(two.get("k")).toBe("reject");
  });

  it("summarizeDecisions counts accepted, rejected, and pending", () => {
    let d = new Map<string, Decision>();
    d = setDecision(d, "a#0", "accept");
    d = setDecision(d, "a#1", "reject");
    d = setDecision(d, "b#0", "accept");
    expect(summarizeDecisions(5, d)).toEqual({ accepted: 2, rejected: 1, pending: 2 });
    expect(summarizeDecisions(3, new Map())).toEqual({ accepted: 0, rejected: 0, pending: 3 });
  });

  it("summarizeDecisions never reports negative pending", () => {
    const d = setDecision(setDecision(new Map(), "x", "accept"), "y", "accept");
    expect(summarizeDecisions(1, d).pending).toBe(0);
  });
});
