import { spawn } from "child_process";
import { tail } from "../claude/claudeRunner";
import { parseAgyStream } from "./agyStreamParser";

/** Instruction prepended to every prompt sent to agy. Not a security boundary. */
export const AGY_NO_TOOLS_PREFIX =
  "Do not use any tools. Do not read files, run shell commands, search, or fetch anything. Answer only from the text below.\n\n";

/** Message shown when `agy` is not installed (and Claude Code was unavailable too). */
export const AGY_MISSING_MESSAGE =
  "Claude Code is not available and `agy` was not found. Install Claude Code and run `claude auth login`, or install `agy`.";

/** Message shown when agy returns an empty response twice. */
export const AGY_EMPTY_MESSAGE =
  "agy returned an empty response, so no plan was produced. Try again, or log in to Claude Code with `claude auth login`.";

/** Outcome of an agy run: the plan text, or a typed error with a user-facing message. */
export type AgyRunResult =
  | { ok: true; text: string }
  | { ok: false; kind: "missing-cli" | "failed" | "timeout" | "empty-response"; message: string };

/**
 * Classifies a finished agy run from its exit code, stdout and stderr.
 * Pure, so it can be tested without spawning anything.
 */
export function classifyAgyRun(code: number | null, stdout: string, stderr: string): AgyRunResult {
  const parsed = parseAgyStream(stdout);
  if (parsed.ok) {
    return { ok: true, text: parsed.text };
  }
  if (parsed.reason === "empty-response") {
    return { ok: false, kind: "empty-response", message: AGY_EMPTY_MESSAGE };
  }
  const info = tail(stderr) || parsed.message;
  return {
    ok: false,
    kind: "failed",
    message: `agy failed${code !== null ? ` (exit ${code})` : ""}: ${info}`,
  };
}

/**
 * Runs `agy -p <prompt> --output-format stream-json --mode plan --print-timeout 5m`
 * in `cwd` (no shell), with the no-tools prefix added to the prompt.
 * Never passes the flag that skips permission checks.
 */
export function runAgy(prompt: string, cwd: string, timeoutMs = 5 * 60 * 1000): Promise<AgyRunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r: AgyRunResult): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(r);
      }
    };
    const child = spawn(
      "agy",
      ["-p", AGY_NO_TOOLS_PREFIX + prompt, "--output-format", "stream-json", "--mode", "plan", "--print-timeout", "5m"],
      { cwd, stdio: ["ignore", "pipe", "pipe"] }
    );
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, kind: "timeout", message: "agy timed out after 5 minutes." });
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        finish({ ok: false, kind: "missing-cli", message: AGY_MISSING_MESSAGE });
      } else {
        finish({ ok: false, kind: "failed", message: `Could not start agy: ${err.message}` });
      }
    });
    child.on("close", (code) => {
      finish(classifyAgyRun(code, stdout, stderr));
    });
  });
}

/** Runs agy once; if the response is empty, runs it one more time and returns that result. */
export async function runAgyWithRetry(prompt: string, cwd: string): Promise<AgyRunResult> {
  const first = await runAgy(prompt, cwd);
  if (!first.ok && first.kind === "empty-response") {
    return runAgy(prompt, cwd);
  }
  return first;
}
