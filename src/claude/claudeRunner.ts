import { spawn } from "child_process";
import { parseClaudeStream } from "./streamParser";

/** Message shown when the `claude` CLI is not installed. */
export const MISSING_CLI_MESSAGE =
  "Claude Code CLI (`claude`) was not found. Install Claude Code, then try again.";

/** Message shown when the `claude` CLI is not logged in. */
export const NOT_LOGGED_IN_MESSAGE =
  "Claude Code is not logged in. Run `claude auth login` in a terminal, then try again.";

/** Outcome of running the CLI: the plan text, or a typed error with a user-facing message. */
export type RunResult =
  | { ok: true; text: string }
  | { ok: false; kind: "missing-cli" | "not-logged-in" | "failed" | "timeout"; message: string };

/** Returns true when text mentions login or authentication problems. */
export function looksLikeAuthProblem(text: string): boolean {
  return /log(ged)?[ -]?in|authenticat|unauthori[sz]ed|\/login|auth login|api key/i.test(text);
}

/** Keeps only the last few hundred characters of stderr so messages stay short. */
export function tail(text: string, max = 300): string {
  const t = text.trim();
  return t.length <= max ? t : "..." + t.slice(t.length - max);
}

/**
 * Classifies a finished run from its exit code, stdout and stderr.
 * Pure, so it can be tested without spawning anything.
 */
export function classifyRun(code: number | null, stdout: string, stderr: string): RunResult {
  const parsed = parseClaudeStream(stdout);
  if (parsed.ok) {
    return { ok: true, text: parsed.text };
  }
  const detail = parsed.reason === "error-result" ? parsed.message : "";
  if (looksLikeAuthProblem(detail) || looksLikeAuthProblem(stderr)) {
    return { ok: false, kind: "not-logged-in", message: NOT_LOGGED_IN_MESSAGE };
  }
  const info = tail(stderr) || detail || parsed.message;
  return {
    ok: false,
    kind: "failed",
    message: `Claude Code failed${code !== null ? ` (exit ${code})` : ""}: ${info}`,
  };
}

/**
 * Runs `claude -p <prompt> --output-format stream-json --verbose --permission-mode plan`
 * in `cwd` (no shell) and resolves with the plan text or a typed error.
 * Never reads credentials; the CLI uses the user's own login.
 */
export function runClaude(prompt: string, cwd: string, timeoutMs = 5 * 60 * 1000): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r: RunResult): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(r);
      }
    };
    const child = spawn(
      "claude",
      ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "plan"],
      { cwd, stdio: ["ignore", "pipe", "pipe"] }
    );
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, kind: "timeout", message: "Claude Code timed out after 5 minutes." });
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        finish({ ok: false, kind: "missing-cli", message: MISSING_CLI_MESSAGE });
      } else {
        finish({ ok: false, kind: "failed", message: `Could not start Claude Code: ${err.message}` });
      }
    });
    child.on("close", (code) => {
      finish(classifyRun(code, stdout, stderr));
    });
  });
}
