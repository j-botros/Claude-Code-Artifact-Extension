import { describe, it, expect } from "vitest";
import { decidePlanFile, getOwnSaveHashes, hashText, recordOwnSave } from "../../src/plan/planWatch";
import type { Plan } from "../../src/plan/plan";

// A valid plan used as file content.
const plan: Plan = {
  title: "Watcher plan",
  overview: { summary: "Summary.", outOfScope: null },
  proposedChanges: { language: "typescript", code: "export const a = 1;" },
  files: [{ path: "src/a.ts", change: "add a", isNew: true }],
  implementationSteps: ["Step one"],
  verification: ["Run the tests."],
};
const json = JSON.stringify(plan, null, 2) + "\n";

describe("decidePlanFile", () => {
  it("opens a new valid file and returns the parsed plan", () => {
    const d = decidePlanFile(json, hashText(json), new Set());
    expect(d.action).toBe("open");
    if (d.action === "open") {
      expect(d.plan.title).toBe("Watcher plan");
    }
  });

  it("skips a file whose hash is an own save, and keeps the record", () => {
    const own = new Set([hashText(json)]);
    expect(decidePlanFile(json, hashText(json), own).action).toBe("skip");
    expect(own.has(hashText(json))).toBe(true);
    expect(decidePlanFile(json, hashText(json), own).action).toBe("skip");
  });

  it("warns on invalid JSON with an error and does not open", () => {
    const bad = "{ not json";
    const d = decidePlanFile(bad, hashText(bad), new Set());
    expect(d.action).toBe("warn");
    if (d.action === "warn") {
      expect(d.error.length).toBeGreaterThan(0);
    }
  });

  it("opens fenced valid JSON", () => {
    const fenced = "```json\n" + json + "```\n";
    const d = decidePlanFile(fenced, hashText(fenced), new Set());
    expect(d.action).toBe("open");
  });

  it("does not skip when only a different hash is recorded", () => {
    const d = decidePlanFile(json, hashText(json), new Set([hashText("other")]));
    expect(d.action).toBe("open");
  });
});

describe("hashText and own-save record", () => {
  it("gives the same hash for the same text and a different hash for different text", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
    expect(hashText("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("recordOwnSave adds the hash to getOwnSaveHashes", () => {
    const text = "own save text " + Math.random();
    expect(getOwnSaveHashes().has(hashText(text))).toBe(false);
    recordOwnSave(text);
    expect(getOwnSaveHashes().has(hashText(text))).toBe(true);
  });
});
