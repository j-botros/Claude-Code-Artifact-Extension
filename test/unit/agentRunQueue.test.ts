import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join, resolve } from "path";

// Repo root: the tests run from there, and the script path is relative to it.
const REPO = resolve(__dirname, "../..");
const FIXTURES = join(__dirname, "fixtures");

/**
 * Runs "bash scripts/agent-run.sh --check-queue <file>" from the repo root.
 * This mode has no side effects. The main path of the script is never run here.
 */
function checkQueue(file: string) {
  return spawnSync("bash", ["scripts/agent-run.sh", "--check-queue", file], {
    cwd: REPO,
    encoding: "utf8",
  });
}

describe("agent-run.sh --check-queue", () => {
  it("exits 1 with empty stdout when no developer or tester row is todo", () => {
    const r = checkQueue(join(FIXTURES, "no-todo-TASKS.md"));
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
  });

  it("exits 0 and prints the ID of the first runnable row", () => {
    const r = checkQueue(join(FIXTURES, "one-todo-TASKS.md"));
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("next-feature");
  });

  it("does not count an owner row whose description mentions developer", () => {
    const r = checkQueue(join(FIXTURES, "owner-todo-TASKS.md"));
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
  });

  it("exits 1 for a missing file", () => {
    const r = checkQueue(join(FIXTURES, "does-not-exist.md"));
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
  });

  it("creates no PAUSE file", () => {
    const pausePath = join(REPO, "PAUSE");
    if (existsSync(pausePath)) {
      // A PAUSE file already existed before this test, so the assertion is skipped.
      console.warn("PAUSE already exists; skipping the no-PAUSE assertion.");
      return;
    }
    checkQueue(join(FIXTURES, "no-todo-TASKS.md"));
    expect(existsSync(pausePath)).toBe(false);
  });
});
