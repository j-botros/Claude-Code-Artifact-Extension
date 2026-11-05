import { describe, it, expect } from "vitest";

import { listPendingPaths, pickNextPath } from "../../src/plan/nextChange";

/** Three files with two hunks each, in plan order. */
const FILES = [
  { path: "a.ts", hunkCount: 2 },
  { path: "b.ts", hunkCount: 2 },
  { path: "c.ts", hunkCount: 2 },
];
const ALL = FILES.map((f) => f.path);

describe("listPendingPaths", () => {
  it("lists every file when nothing is decided (count 3)", () => {
    expect(listPendingPaths(FILES, new Set())).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("keeps a file pending while any of its hunks is undecided", () => {
    const decided = new Set(["a.ts#0", "a.ts#1", "b.ts#0"]);
    expect(listPendingPaths(FILES, decided)).toEqual(["b.ts", "c.ts"]);
  });

  it("returns an empty list when every hunk is decided (count 0)", () => {
    const decided = new Set(FILES.flatMap((f) => [`${f.path}#0`, `${f.path}#1`]));
    expect(listPendingPaths(FILES, decided)).toEqual([]);
  });

  it("returns an empty list for no files", () => {
    expect(listPendingPaths([], new Set())).toEqual([]);
  });

  it("ignores decided keys that belong to other paths", () => {
    expect(listPendingPaths([{ path: "a.ts", hunkCount: 1 }], new Set(["b.ts#0"]))).toEqual(["a.ts"]);
  });
});

describe("pickNextPath", () => {
  it("returns undefined when nothing is pending", () => {
    expect(pickNextPath(ALL, [], "a.ts")).toBeUndefined();
    expect(pickNextPath(ALL, [], undefined)).toBeUndefined();
  });

  it("starts at the first pending file when there is no current file", () => {
    expect(pickNextPath(ALL, ["b.ts", "c.ts"], undefined)).toBe("b.ts");
  });

  it("cycles in plan order", () => {
    expect(pickNextPath(ALL, ALL, "a.ts")).toBe("b.ts");
    expect(pickNextPath(ALL, ALL, "b.ts")).toBe("c.ts");
  });

  it("wraps from the last file to the first", () => {
    expect(pickNextPath(ALL, ALL, "c.ts")).toBe("a.ts");
  });

  it("skips files that are not pending", () => {
    expect(pickNextPath(ALL, ["a.ts", "c.ts"], "a.ts")).toBe("c.ts");
    expect(pickNextPath(ALL, ["a.ts", "b.ts"], "b.ts")).toBe("a.ts");
  });

  it("starts from the beginning when the current file is not in the list", () => {
    expect(pickNextPath(ALL, ALL, "other.ts")).toBe("a.ts");
    expect(pickNextPath(ALL, ["b.ts", "c.ts"], "other.ts")).toBe("b.ts");
  });

  it("returns the current file when it is the only pending one", () => {
    expect(pickNextPath(ALL, ["b.ts"], "b.ts")).toBe("b.ts");
  });

  it("moves on from a decided current file using its plan position", () => {
    // b.ts is decided (not pending); the next pending after it is c.ts, then wraps to a.ts.
    expect(pickNextPath(ALL, ["a.ts", "c.ts"], "b.ts")).toBe("c.ts");
    expect(pickNextPath(ALL, ["a.ts"], "b.ts")).toBe("a.ts");
  });

  it("works with a single file in the plan", () => {
    expect(pickNextPath(["a.ts"], ["a.ts"], "a.ts")).toBe("a.ts");
  });
});
