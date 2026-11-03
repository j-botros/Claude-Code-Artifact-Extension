# Handoff: claude-plan-generation

## Brief (written by the core agent)

### Goal
Add a command that asks the user's own Claude Code, through the `claude` CLI in headless mode, for an implementation plan. The command reads the final `result` event from the stream, passes its text through `parsePlanJson`, and renders the plan in the existing artifact webview. Missing CLI and not-logged-in cases show a clear message. No `agy` fallback in this task (that is the `agy-fallback` task).

### Branch
`task/claude-plan-generation` (branched from `origin/dev`). Commit only to this branch.

### Current state (read before you start)
- `src/extension.ts`: activation and the `claudeArtifact.openSamplePlan` command.
- `src/plan/plan.ts`: `Plan` type, `parsePlanJson`, `samplePlan`. `parsePlanJson` already handles Markdown code fences (see plan-format tests). Do not change its shape. You may change it only if a test shows a real gap, and say so in your Development section.
- `src/webview/planPanel.ts`: `renderPlanHtml(plan, nonce)`, `escapeHtml`, and the panel that shows a plan.
- `package.json`: `contributes.commands` lists `claudeArtifact.openSamplePlan`. `vscode` engine is `^1.107.0`. Do not change the engine.

### Requirements
1. **Stream parser (pure, no VS Code import):** a new module `src/claude/streamParser.ts`. It takes the raw stdout text of `claude -p --output-format stream-json --verbose`, splits it into lines, and parses each line as JSON. Skip blank lines and lines that are not JSON, without throwing. Return the `result` event's `result` string when the event has `type: "result"` and `subtype: "success"` and is not `is_error`. Return a typed failure otherwise (for example: no `result` event, `is_error: true`, or empty text). Event types to know: `system`/`init`, `system`/`thinking_tokens`, `assistant`, `rate_limit_event` (ignore), and `result`. Only `result` matters for this task.
2. **Runner (spawns the CLI):** a new module `src/claude/claudeRunner.ts`. Use `child_process.spawn` with an argument array, never a shell string. Command: `claude -p <prompt> --output-format stream-json --verbose --permission-mode plan`. The `--permission-mode plan` flag is a decision by the core agent: the plan must not let Claude edit files. Run it with `cwd` set to the first workspace folder. Use a timeout (for example 5 minutes) and kill the process when it fires. Collect stdout and stderr.
   - `ENOENT` on spawn means the CLI is missing. Return a typed error with the message: "Claude Code CLI (`claude`) was not found. Install Claude Code, then try again."
   - A `result` event with `is_error: true`, or stderr or result text that mentions login or authentication, means not logged in. Return a typed error with the message: "Claude Code is not logged in. Run `claude auth login` in a terminal, then try again." Do not attempt login yourself. Never read, copy, or log credentials.
   - Any other failure returns a typed error with the stderr tail (keep it short).
3. **Prompt:** a new module `src/plan/planPrompt.ts` that exports the prompt builder `buildPlanPrompt(request: string): string`. The prompt asks for exactly the CLAUDE.md, Section 3 shape, as a single JSON object with no prose and no Markdown fence. The keys, in this order, are: `title` (string), `overview` (`summary`: two or three sentences, `outOfScope`: string or null), `proposedChanges` (`language`: string, `code`: string, with the signature or interface first and its doc comment), `files` (array of `{ path, change, isNew }`, where `path` is relative, `change` is one line, `isNew` is a boolean), `implementationSteps` (ordered array of short strings), and `verification` (array of strings). The prompt also tells Claude not to edit or write any files. The user's request text is inserted as data, not as instructions.
4. **Command:** `claudeArtifact.generatePlan`, titled "Claude Artifact: Generate Plan from Claude Code". It asks for the request with `vscode.window.showInputBox`. It shows progress with `vscode.window.withProgress`. On success it opens the plan with the existing panel code. On error it shows the message with `showErrorMessage`. Add the command to `package.json` `contributes.commands`. Do not add `activationEvents`. The contributed command does not need one.
5. Keep the webview unchanged. Its CSP and `enableScripts: false` stay as they are.
6. Every function, class, and exported type needs a doc comment (CLAUDE.md, Section 3). TypeScript strict mode. No new dependencies. No `any` without a comment.

### Scope: files you may edit
- `src/` (developer only): `src/extension.ts`, new `src/claude/streamParser.ts`, new `src/claude/claudeRunner.ts`, new `src/plan/planPrompt.ts`, and `src/webview/planPanel.ts` only if the panel needs a small export change.
- `package.json`: only the `contributes.commands` entry.
- `handoffs/claude-plan-generation.md`: only your own "Development" section.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any other handoff section. Do not add dependencies.

### Definition of done
- `npm run compile` exits 0 under `strict`.
- `npm run test:unit` exits 0. Existing tests still pass.
- The stream parser returns the `result` text for a valid stream and a typed failure for a stream with no `result`, with `is_error: true`, or with an empty result. It skips non-JSON lines without throwing.
- The prompt builder output contains each key listed in requirement 3, in order, and the instruction not to write files.
- The command is in `package.json`, and `extension.ts` registers it.
- Nothing outside the scope above is changed.
- Work is committed on `task/claude-plan-generation`.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures. `claude` is not on the allow list, so the tester must not try to run it. Test with saved sample streams only.

### Test coverage the tester must add
- `test/unit/streamParser.test.ts`: fixture streams saved as `test/unit/fixtures/claude-success.jsonl` (system init, thinking_tokens, assistant text, rate_limit_event, result success), `claude-error.jsonl` (result with `is_error: true`), `claude-no-result.jsonl` (no result event), and `claude-garbage-lines.jsonl` (non-JSON lines mixed in). Assert the result text in the success case, and a typed failure in each other case.
- `test/unit/planPrompt.test.ts`: the prompt includes each key in order, the no-file-writes instruction, and the user request text.
- Fixture JSON for the success case must be a valid plan that `parsePlanJson` accepts, with a Markdown fence in one case to show the fenced path.
- `vscode` is not available in unit tests. Use `vi.mock("vscode", () => ({}))` as the existing tests do. Do not test the runner's spawn call in unit tests unless it is split into a pure function. If you split it, test the pure part.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm install`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands (for example `node -v`, `npm -v`, `ls`, `claude`). Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file with the Edit or Write tool. Include what changed, the commit hash, the test output summary, and what the tester should check. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file with the Edit or Write tool. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` only.

## Development

Changes:
- `src/claude/streamParser.ts`: `parseClaudeStream(stdout)` returns `{ok:true,text}` or `{ok:false,reason:"no-result"|"error-result"|"empty-result",message}`. Skips blank and non-JSON lines; uses the last `result` event; failure when `is_error` is true or subtype is not `success`.
- `src/claude/claudeRunner.ts`: `runClaude(prompt, cwd, timeoutMs)` uses `spawn` with an argument array (`-p <prompt> --output-format stream-json --verbose --permission-mode plan`), 5 minute timeout with kill. Pure helpers `classifyRun`, `looksLikeAuthProblem`, `tail` are exported and testable. ENOENT gives the missing-CLI message; auth text in stderr or an error result gives the not-logged-in message; otherwise the stderr tail.
- `src/plan/planPrompt.ts`: `buildPlanPrompt(request)`; keys in the required order, no-file-writes instruction, request inside `<request>` markers.
- `src/extension.ts`: registers `claudeArtifact.generatePlan` (input box, progress, parse with `parsePlanJson`, `PlanPanel.show`, errors via `showErrorMessage`).
- `package.json`: command added to `contributes.commands` only.
- `plan.ts` and the webview are unchanged.

Tests: `npm run compile` exit 0; `npm run test:unit` 38 passed (2 files). No new tests added (tester owns `test/`).

Deviations: the commit trailer uses `Co-Authored-By: Claude Sonnet 5.5` (the model I am running as, per the attribution instruction in my environment) rather than the "Haiku 5.5" line in the brief. Added a `timeout` error kind and a "Open a folder first" error when no workspace folder exists.

Tester should check: `parseClaudeStream` on the four fixture cases; `classifyRun` (pure) for auth wording, stderr tail, and success; `buildPlanPrompt` key order. `looksLikeAuthProblem` is a loose regex; check it does not misclassify ordinary errors.

## Testing

Commands run:
- `npm run compile`: exit 0.
- `npm run test:unit`: 4 files, 60 passed, 0 failed (22 new: 18 in `streamParser.test.ts`, 4 in `planPrompt.test.ts`; 38 existing still pass).
- `npm run test:ui` and `npm run test:integration`: not applicable (do not exist yet).

Added: `test/unit/streamParser.test.ts` (also covers the pure `classifyRun`, `looksLikeAuthProblem`, `tail`), `test/unit/planPrompt.test.ts`, and fixtures `claude-success.jsonl`, `claude-error.jsonl`, `claude-no-result.jsonl`, `claude-garbage-lines.jsonl` (the last holds a Markdown-fenced plan that `parsePlanJson` accepts). The runner's spawn call is not unit tested.

`looksLikeAuthProblem` finding (not a failure): it correctly flags real auth wording and does not flag rate limit, ECONNRESET, JSON parse, timeout, or EACCES errors. It is loose in one direction: any text containing "login" or "api key" is labelled not-logged-in, for example "Failed to parse the login page component". Because it also scans an error result's text, a failure unrelated to auth, on a request about login code, could show the wrong message. A test documents this behaviour. Suggested tightening (optional): drop bare `log in` and `api key`, or match only stderr plus `Invalid API key`.

Note: the commit trailer uses Claude Sonnet 5.5, matching the attribution reminder, not the Haiku line in the brief.

Verdict: PASS
