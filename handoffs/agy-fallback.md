# Handoff: agy-fallback

## Brief (written by the core agent)

### Goal
When the `claude` CLI is missing or not logged in, run the plan prompt through `agy` instead, headless, in plan mode with a no-tools instruction. Use the same parsing path as Claude Code (`parsePlanJson`). Retry once when `agy` returns an empty response, then show a failure. Show the README security warning in a modal the first time the fallback runs. Never pass `--dangerously-skip-permissions`.

### Branch
`task/agy-fallback` (branched from `origin/dev`). Commit only to this branch.

### Current state
- `src/extension.ts`: `runPlanPrompt(prompt, cwd)` calls `runClaude`, then `parsePlanJson`. Both `generatePlan` and `reviewPlan` use it. `activate(context)` registers the commands. `context` is not stored anywhere yet.
- `src/claude/claudeRunner.ts`: `runClaude` returns `RunResult`: `{ ok: true, text }` or `{ ok: false, kind, message }` where `kind` is `"missing-cli" | "not-logged-in" | "failed" | "timeout"`. Do not change this file.
- `src/claude/streamParser.ts`: do not change.
- `src/plan/planPrompt.ts`: `buildPlanPrompt` and `buildReviewPrompt`. Do not change their output.
- `README.md` has the `agy` security section. It does NOT have a no-tools prompt. The core agent will update README after merge.

### Decisions already made by the core agent
1. **Fallback trigger.** Fall back to `agy` only when `runClaude` returns `kind` `"missing-cli"` or `"not-logged-in"`. Do not fall back on `"failed"` or `"timeout"`. Show those errors as they are today.
2. **No-tools instruction lives in code.** The README does not contain the prompt, so the exact wording is decided here. Define `export const AGY_NO_TOOLS_PREFIX` in `src/agy/agyRunner.ts`, with this text (plus one trailing blank line):
   `Do not use any tools. Do not read files, run shell commands, search, or fetch anything. Answer only from the text below.`
   The fallback prepends this prefix to the prompt it is given. `buildPlanPrompt` and `buildReviewPrompt` are not changed.
3. **Command.** `agy -p <prompt> --output-format stream-json --mode plan --print-timeout 5m`, spawned with no shell (`spawn("agy", [...], { cwd, stdio: ["ignore","pipe","pipe"] })`), cwd = the workspace folder. Kill the child and return `kind: "timeout"` after 5 minutes, as `runClaude` does. Never add `--dangerously-skip-permissions`, `--sandbox`, or any other flag not listed here.
4. **Model.** Not in this task. `agy` uses its own default model. Do not run `agy models`. The core agent records this as an open item.
5. **Stream format** (from saved test runs; the tester writes fixtures from this description). Output is one JSON object per line. Event types: `init`, `step_update` (fields `step_type` of `user_input`, `agent_response`, or `tool`, and `state` of `ACTIVE`, `DONE`, or `ERROR`), and a final `result` event. The plan text is in `result.response` (string). `result.status` is `"SUCCESS"` even when the response is empty. `result.denied_actions` lists denied tool calls. Ignore blank lines and lines that are not valid JSON. If there is no `result` event, the run failed.
6. **Empty response.** If `result.response` is missing, not a string, or whitespace only, treat the run as an empty response. Retry the `agy` run once. If the second run is also empty, return failure with message: `agy returned an empty response, so no plan was produced. Try again, or log in to Claude Code with `claude auth login`.`
7. **Security warning.** Before the first `agy` run in a user's VS Code installation, show a modal `vscode.window.showWarningMessage` with this text, buttons `"Run agy"` and `"Cancel"`:
   `The agy fallback runs under your own agy permission settings and is not sandboxed. Those settings may allow agy to run shell commands without asking. The extension asks agy not to use tools, but that is not a security boundary. Review ~/.gemini/config/config.json (userSettings: permissionPreset, autoExecutionPolicy) before you continue.`
   Store a flag in `context.globalState` under the key `"agyWarningAccepted"`, set to `true` only after the user clicks "Run agy". If the user cancels, do not run `agy` and return failure with message `The agy fallback was cancelled.` Do not ask again once accepted.
8. **Missing agy.** If `agy` is not found (ENOENT), return kind `"missing-cli"` with message: "Claude Code is not available and `agy` was not found. Install Claude Code and run `claude auth login`, or install `agy`." When both were tried, `runPlanPrompt` returns the `agy` message, not the Claude message.
9. **Result shape.** `runAgy` returns the same shape as `runClaude`, so `runPlanPrompt` can use one path after the fallback: `{ ok: true, text }` or `{ ok: false, kind, message }`. Add `"empty-response"` to the kinds. Use it only inside the agy module.

### Required changes
1. **`src/agy/agyStreamParser.ts`** (new). Pure functions with doc comments:
   - `parseAgyStream(stdout: string): { ok: true; text: string } | { ok: false; reason: "no-result" | "empty-response"; message: string }`. Reads the last `result` event. Returns `ok: true` only when `response` is a non-empty string after trim. Returns `"empty-response"` when `result` exists and its response is empty or missing. Returns `"no-result"` when there is no `result` event.
2. **`src/agy/agyRunner.ts`** (new):
   - `export const AGY_NO_TOOLS_PREFIX` (see decision 2).
   - `export function classifyAgyRun(code, stdout, stderr)`: pure. Uses `parseAgyStream`. On `ok`, returns `{ ok: true, text }`. Otherwise returns `{ ok: false, kind: "empty-response" | "failed", message }`. The message for "failed" includes the exit code and a short tail of stderr, like `classifyRun` does.
   - `export function runAgy(prompt: string, cwd: string, timeoutMs = 5 * 60 * 1000): Promise<RunResult-like>` that spawns `agy` as in decision 3. The prompt sent is `AGY_NO_TOOLS_PREFIX + prompt`. ENOENT gives kind `"missing-cli"` (decision 8).
   - `export async function runAgyWithRetry(prompt, cwd)`: one run; if `kind === "empty-response"`, run once more; return the second result.
   - Each function and class has a doc comment.
3. **`src/extension.ts`**:
   - Store the `ExtensionContext` in a module-level variable in `activate`.
   - In `runPlanPrompt`: if `runClaude` returns `kind` `"missing-cli"` or `"not-logged-in"`, call a new `runAgyFallback(prompt, cwd)`. That function: (a) checks the warning flag and shows the modal if needed (decision 7); (b) calls `runAgyWithRetry`; (c) returns the result. Parse the returned text with `parsePlanJson` as now. Use the same error handling for the agy result as for the Claude result.
   - Keep `generatePlan` and `reviewPlan` behavior the same for the Claude path.
   - Use `vscode.window.withProgress` text "Asking agy for a plan..." only when the fallback runs. Do not put the progress inside `runAgy` itself.

### Scope: files you may edit
- `src/agy/agyStreamParser.ts` (new)
- `src/agy/agyRunner.ts` (new)
- `src/extension.ts`
- `handoffs/agy-fallback.md`: only your own "Development" section

Do not edit `src/claude/`, `src/plan/`, `src/webview/`, `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any handoff section other than your own. Do not add dependencies.

### Definition of done
- `npm run compile` exits 0 under `strict`.
- `npm run test:unit` passes. No existing test changes.
- No file contains `dangerously-skip-permissions` as an argument string. A comment that mentions the flag by name is allowed.
- `runClaude` and its tests are unchanged.
- Work is committed on `task/agy-fallback`: your source changes and your Development section in one commit.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures.

### Test coverage the tester must add (test/unit/)
- `parseAgyStream`: a success stream (init, step_update, result with a plan string); a stream with an empty `response`; a stream with whitespace-only `response`; a stream with no `result` event; blank lines and a non-JSON line are skipped; a `result` with `denied_actions` and a non-empty response still returns ok.
- `classifyAgyRun`: success; empty response gives `"empty-response"`; no result gives `"failed"` with the exit code in the message.
- `AGY_NO_TOOLS_PREFIX`: non-empty; contains "Do not use any tools".
- Put the fixture streams as strings in the test file or under `test/unit/fixtures/`. Do not call the real `agy`.
- `runAgy`, `runAgyWithRetry`, and the warning flow need a VS Code host or a spawned process, so they are not unit tested. Say so in your Testing section.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm ci`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands. Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the commit hash, the test output summary, the expected failing assertion (if any), and what the tester should check. Use Edit. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` and your Testing section only. Do not stage anything else. Use Edit if it is available. If Edit is not available, use Write and keep every other section unchanged.

## Development

### What changed
- `src/agy/agyStreamParser.ts` (new): `parseAgyStream` reads the last `result` event, skips blank and non-JSON lines, returns `ok` only for a non-empty string `response`, else `empty-response` or `no-result`.
- `src/agy/agyRunner.ts` (new): `AGY_NO_TOOLS_PREFIX` (with trailing blank line), `classifyAgyRun`, `runAgy` (spawn, no shell, fixed flags only, 5 minute kill, ENOENT gives `missing-cli`), `runAgyWithRetry` (one retry on `empty-response`), plus `AgyRunResult` type. It imports `tail` from `src/claude/claudeRunner.ts` (read only, file unchanged).
- `src/extension.ts`: stores the context in a module variable; `runPlanPrompt` falls back to `runAgyFallback` only for `missing-cli` or `not-logged-in`; `runAgyFallback` shows the modal once (`globalState` key `agyWarningAccepted`, set only after "Run agy"), cancel returns `The agy fallback was cancelled.`, then runs `runAgyWithRetry` inside `withProgress` "Asking agy for a plan...". Parse error message says "agy" or "Claude Code" depending on the source.

### Tests
- `npm run compile`: exit 0.
- `npm run test:unit`: 8 files, 109 tests passed. No existing tests changed.

### Notes and deviations
- The commit trailer uses `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (the attribution line given to me by the session), not the Haiku line in the shell rules.
- `AGY_EMPTY_MESSAGE` is returned by `classifyAgyRun` already for each empty run, so the final failure after the retry has the required text.
- Cancelled modal returns `kind: "failed"` (no dedicated kind).
- No file contains the skip-permissions flag.

### What the tester should check
- `parseAgyStream` and `classifyAgyRun` cases listed in the brief, and `AGY_NO_TOOLS_PREFIX` content.
- `runAgy`, `runAgyWithRetry`, and the warning flow are not unit testable without VS Code or a spawned process.
