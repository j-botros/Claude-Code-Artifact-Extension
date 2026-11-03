import { describe, it, expect } from "vitest";

import { isSafeRelativePath, parsePlanJson } from "../../src/plan/plan";
import type { Plan } from "../../src/plan/plan";
import { applyPlanEdits } from "../../src/plan/planEdits";
import { buildPlanPrompt, buildReviewPrompt } from "../../src/plan/planPrompt";

/** Returns a valid plan object as plain data, with optional extra fields. */
function baseData(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "T",
    overview: { summary: "S", outOfScope: null },
    proposedChanges: { language: "typescript", code: "x" },
    files: [{ path: "src/a.ts", change: "Add.", isNew: true }],
    implementationSteps: ["one"],
    verification: ["check"],
    ...extra,
  };
}

describe("isSafeRelativePath", () => {
  it("accepts a normal relative path", () => {
    expect(isSafeRelativePath("src/a.ts")).toBe(true);
    expect(isSafeRelativePath("a.ts")).toBe(true);
  });

  it("rejects empty, absolute, backslash, drive, and parent paths", () => {
    for (const p of ["", "/etc/x", "\\x", "C:/x", "c:x", "../x", "a/../b", "a\\b", "a/.."]) {
      expect(isSafeRelativePath(p), p).toBe(false);
    }
  });

  it("allows dots inside names", () => {
    expect(isSafeRelativePath("a/..b/c")).toBe(true);
    expect(isSafeRelativePath("./a")).toBe(true);
  });
});

describe("parsePlanJson proposedFiles", () => {
  it("adds no key when proposedFiles is absent", () => {
    const r = parsePlanJson(JSON.stringify(baseData()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("proposedFiles" in r.plan).toBe(false);
    }
  });

  it("parses a valid list", () => {
    const list = [
      { path: "src/a.ts", content: "a\n" },
      { path: "src/b.ts", content: "" },
    ];
    const r = parsePlanJson(JSON.stringify(baseData({ proposedFiles: list })));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.proposedFiles).toEqual(list);
    }
  });

  it("accepts an empty array", () => {
    const r = parsePlanJson(JSON.stringify(baseData({ proposedFiles: [] })));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.proposedFiles).toEqual([]);
    }
  });

  it("rejects a non-array", () => {
    for (const bad of ["x", {}, 5, null]) {
      const r = parsePlanJson(JSON.stringify(baseData({ proposedFiles: bad })));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toMatch(/proposedFiles/);
      }
    }
  });

  it("rejects an item with missing content and names the index", () => {
    const r = parsePlanJson(
      JSON.stringify(baseData({ proposedFiles: [{ path: "a.ts", content: "x" }, { path: "b.ts" }] }))
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("proposedFiles[1]");
      expect(r.error).toMatch(/content/);
    }
  });

  it("rejects a missing path", () => {
    const r = parsePlanJson(JSON.stringify(baseData({ proposedFiles: [{ content: "x" }] })));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("proposedFiles[0]");
    }
  });

  it("rejects an unsafe path and names the index", () => {
    const r = parsePlanJson(
      JSON.stringify(
        baseData({ proposedFiles: [{ path: "ok.ts", content: "" }, { path: "../evil", content: "" }] })
      )
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("proposedFiles[1]");
      expect(r.error).toMatch(/path/);
    }
  });
});

describe("applyPlanEdits proposedFiles", () => {
  it("keeps a copy of proposedFiles from the current plan", () => {
    const current: Plan = {
      ...(baseData() as unknown as Plan),
      proposedFiles: [{ path: "src/a.ts", content: "hello" }],
    };
    const r = applyPlanEdits(current, { title: "New", summary: "S2", outOfScope: null, steps: ["x"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.proposedFiles).toEqual([{ path: "src/a.ts", content: "hello" }]);
      expect(r.plan.proposedFiles).not.toBe(current.proposedFiles);
      expect(r.plan.proposedFiles![0]).not.toBe(current.proposedFiles![0]);
    }
  });

  it("adds no key when the current plan has none", () => {
    const current = baseData() as unknown as Plan;
    const r = applyPlanEdits(current, { title: "New", summary: "S2", outOfScope: null, steps: ["x"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("proposedFiles" in r.plan).toBe(false);
    }
  });
});

describe("prompts mention proposedFiles", () => {
  const plan = baseData() as unknown as Plan;
  const prompts: Record<string, string> = {
    plan: buildPlanPrompt("Do a thing"),
    review: buildReviewPrompt(plan, { 0: "Fix" }),
  };

  for (const [name, prompt] of Object.entries(prompts)) {
    it(`${name} prompt describes the optional proposedFiles rule`, () => {
      expect(prompt).toContain('"proposedFiles" (optional');
      expect(prompt).toMatch(/array of objects \{ "path": string.*"content": string/);
      expect(prompt).toMatch(/full new file/);
    });

    it(`${name} prompt still forbids writing files`, () => {
      expect(prompt).toMatch(/Do not edit, create, or write any files/);
      expect(prompt).toMatch(/You still never write files/);
    });
  }
});
