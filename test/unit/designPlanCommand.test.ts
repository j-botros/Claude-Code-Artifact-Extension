import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

// Repo root, and the slash command file this test checks.
const REPO = resolve(__dirname, "../..");
const text = readFileSync(join(REPO, ".claude/commands/design-plan.md"), "utf8");

describe("/design-plan command file", () => {
  it("names the plans folder", () => {
    expect(text).toContain(".claude/plans/");
  });

  it("gives the slug rule", () => {
    expect(text).toMatch(/slug/i);
    expect(text).toMatch(/title/);
    expect(text).toMatch(/lowercase/i);
    expect(text).toMatch(/hyphen/i);
  });

  it("names every required field", () => {
    const required = [
      "title", "overview", "summary", "outOfScope", "proposedChanges",
      "language", "code", "files", "path", "change", "isNew",
      "implementationSteps", "verification",
    ];
    for (const field of required) {
      expect(text, field).toContain(`"${field}"`);
    }
  });

  it("names the optional fields and says to omit them", () => {
    expect(text).toContain("proposedFiles");
    expect(text).toContain("openQuestions");
    expect(text.match(/omit/gi)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("mentions every callout marker", () => {
    for (const marker of ["NOTE:", "TIP:", "IMPORTANT:", "WARNING:", "CAUTION:"]) {
      expect(text, marker).toContain(marker);
    }
  });

  it("forbids answering in chat and editing source files", () => {
    expect(text).toMatch(/Do not answer in chat/i);
    expect(text).toMatch(/Do not edit, create, or delete any source files/i);
  });
});
