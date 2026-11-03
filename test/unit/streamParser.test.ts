import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("vscode", () => ({}));

import { parseClaudeStream } from "../../src/claude/streamParser";
import {
  classifyRun,
  looksLikeAuthProblem,
  tail,
  MISSING_CLI_MESSAGE,
  NOT_LOGGED_IN_MESSAGE,
} from "../../src/claude/claudeRunner";
import { parsePlanJson } from "../../src/plan/plan";

/** Reads a saved sample stream from the fixtures folder. */
function fixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf8");
}

describe("parseClaudeStream", () => {
  it("returns the result text for a valid stream, and parsePlanJson accepts it", () => {
    const r = parseClaudeStream(fixture("claude-success.jsonl"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text.startsWith("{\"title\":\"T\"")).toBe(true);
      expect(parsePlanJson(r.text).ok).toBe(true);
    }
  });

  it("returns error-result when is_error is true", () => {
    const r = parseClaudeStream(fixture("claude-error.jsonl"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("error-result");
      expect(r.message).toContain("Invalid API key");
    }
  });

  it("returns no-result when there is no result event", () => {
    const r = parseClaudeStream(fixture("claude-no-result.jsonl"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("no-result");
    }
  });

  it("skips non-JSON lines and still finds the result; fenced text parses", () => {
    const r = parseClaudeStream(fixture("claude-garbage-lines.jsonl"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text.startsWith("```json")).toBe(true);
      expect(parsePlanJson(r.text).ok).toBe(true);
    }
  });

  it("returns empty-result for a blank result string", () => {
    const r = parseClaudeStream('{"type":"result","subtype":"success","is_error":false,"result":"  "}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("empty-result");
    }
  });

  it("treats a non-success subtype as an error result", () => {
    const r = parseClaudeStream('{"type":"result","subtype":"error_max_turns","result":"x"}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("error-result");
    }
  });

  it("handles empty input and CRLF line endings", () => {
    const empty = parseClaudeStream("");
    expect(empty.ok).toBe(false);
    const crlf = parseClaudeStream('{"type":"result","subtype":"success","result":"hi"}\r\n');
    expect(crlf).toEqual({ ok: true, text: "hi" });
  });

  it("uses the last result event", () => {
    const r = parseClaudeStream(
      '{"type":"result","subtype":"success","result":"a"}\n{"type":"result","subtype":"success","result":"b"}'
    );
    expect(r).toEqual({ ok: true, text: "b" });
  });
});

describe("classifyRun", () => {
  it("returns the text on success", () => {
    expect(classifyRun(0, fixture("claude-success.jsonl"), "").ok).toBe(true);
  });

  it("maps auth wording in an error result to not-logged-in", () => {
    const r = classifyRun(1, fixture("claude-error.jsonl"), "");
    expect(r).toEqual({ ok: false, kind: "not-logged-in", message: NOT_LOGGED_IN_MESSAGE });
  });

  it("maps auth wording in stderr to not-logged-in", () => {
    const r = classifyRun(1, "", "Invalid API key. Please run /login");
    expect(r.ok === false && r.kind).toBe("not-logged-in");
  });

  it("returns a failed result with the stderr tail and exit code", () => {
    const r = classifyRun(2, "", "boom happened");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("failed");
      expect(r.message).toContain("exit 2");
      expect(r.message).toContain("boom happened");
    }
  });

  it("keeps long stderr short", () => {
    const r = classifyRun(1, "", "x".repeat(5000));
    expect(r.ok === false && r.message.length < 400).toBe(true);
  });

  it("exposes the exact required messages", () => {
    expect(MISSING_CLI_MESSAGE).toBe(
      "Claude Code CLI (`claude`) was not found. Install Claude Code, then try again."
    );
    expect(NOT_LOGGED_IN_MESSAGE).toBe(
      "Claude Code is not logged in. Run `claude auth login` in a terminal, then try again."
    );
  });
});

describe("looksLikeAuthProblem", () => {
  // "not logged in" is from the task brief wording only, not confirmed against
  // the real CLI. The other two phrases appear in test/unit/fixtures/claude-error.jsonl.
  it("matches 'not logged in' (case-insensitive)", () => {
    expect(looksLikeAuthProblem("Not logged in")).toBe(true);
    expect(looksLikeAuthProblem("error: you are NOT LOGGED IN")).toBe(true);
  });

  it("matches 'please run /login' (case-insensitive)", () => {
    expect(looksLikeAuthProblem("Please run /login")).toBe(true);
    expect(looksLikeAuthProblem("please run /login to continue")).toBe(true);
  });

  it("matches 'invalid api key' (case-insensitive)", () => {
    expect(looksLikeAuthProblem("Invalid API key")).toBe(true);
    expect(looksLikeAuthProblem("Invalid API key. Please run /login")).toBe(true);
  });

  it("no longer matches the old loose auth wording", () => {
    for (const s of ["401 Unauthorized", "authentication failed", "claude auth login", "please log in first", "run /login"]) {
      expect(looksLikeAuthProblem(s)).toBe(false);
    }
  });

  it("does not mislabel ordinary errors", () => {
    for (const s of ["Rate limit exceeded", "ECONNRESET", "Unexpected token in JSON", "Process timed out", "spawn EACCES"]) {
      expect(looksLikeAuthProblem(s)).toBe(false);
    }
  });

  it("does not flag unrelated text that merely mentions login or API key", () => {
    expect(looksLikeAuthProblem("Failed to parse the login page component")).toBe(false);
    expect(looksLikeAuthProblem("The plan adds an api key setting")).toBe(false);
  });

  it("does not match 'log in' inside other words", () => {
    expect(looksLikeAuthProblem("catalog in the registry")).toBe(false);
    expect(looksLikeAuthProblem("The user will log in later")).toBe(false);
  });
});

describe("tail", () => {
  it("returns short text trimmed and long text truncated with an ellipsis", () => {
    expect(tail("  hi  ")).toBe("hi");
    const t = tail("a".repeat(500), 10);
    expect(t).toBe("..." + "a".repeat(10));
  });
});
