# Handoff: edit-ui

## Brief (written by the core agent)

### Goal
Make the plan title, the overview (summary and out of scope), and each implementation step's text editable in the artifact view. When the user finishes an edit (the field loses focus or Enter is pressed in the title), the webview sends the edited fields to the extension host. The host validates them, merges them into the current plan, and writes the whole plan as JSON to `<workspace>/.claude/plans/<slug>.json`. The file name comes from the plan title. The step comment boxes from `comments-ui` stay as they are. Nothing is sent to Claude Code in this task.

### Branch
`task/edit-ui` (branched from `origin/dev`). Commit only to this branch.

### Current state
- `src/webview/planPanel.ts` has `renderPlanHtml(plan, nonce)`, `escapeHtml`, the `COMMENT_SCRIPT` constant (one fixed script, no plan data), and `PlanPanel` (`show` creates the panel with `enableScripts: true`; the private constructor sets the HTML). The CSP is `default-src 'none'; style-src 'nonce-…'; script-src 'nonce-…';`.
- `src/plan/plan.ts` has the `Plan` type, `ParseResult`, `parsePlanJson`, and `samplePlan`. It must not change.
- `src/extension.ts` calls `PlanPanel.show(plan)`. It must not change.

### Decisions (already made; do not re-open)
1. **Editable fields:** one `<input type="text" class="edit-title">` for the title, one `<textarea class="edit-summary">` for `overview.summary`, one `<textarea class="edit-outofscope">` for `overview.outOfScope` (always rendered, even when the value is null, so the user can add one), and one `<textarea class="step-text" data-step="<i>">` per step. Each has an `aria-label`. The step-text textarea replaces the step's plain text inside its `<li>`. The existing `textarea.comment` stays below it.
2. **Validation and merge** happen in a new pure module, `src/plan/planEdits.ts` (see Required changes). Trim the title, summary, and each step. An empty title, empty summary, or empty step is rejected. The out-of-scope value becomes `null` when it is empty after trimming. The number of steps must not change. The webview is not trusted: check every field's type.
3. **File name:** `planFileName(title)` lowercases the title, replaces each run of characters outside `a-z0-9` with `-`, trims `-` from both ends, keeps at most 80 characters, uses `plan` when nothing is left, and appends `.json`. The file is never named from anything the webview sends except the validated title.
4. **Write:** through `vscode.workspace.fs` only. Create `.claude/plans/` with `createDirectory`, then `writeFile` with `JSON.stringify(plan, null, 2) + "\n"`. Use the first workspace folder. If there is no folder, reply with the error "Open a folder to save edits." Never delete a file. If the title changes, the old file stays where it is. The owner decides on cleanup later.
5. **Ordering:** saves run one at a time. Chain them on a promise so two quick saves cannot race. Update the host's `currentPlan` only after the write succeeds.
6. **Reply:** after each save, the host posts `{ type: "saveResult", ok: boolean, message: string }` to the webview. The script shows `message` in a `<p class="status" role="status">` element (set with `textContent`, never `innerHTML`). The message is "Saved to .claude/plans/<file>" on success, or the error on failure.
7. **Reload persistence:** on a successful save, the script stores the saved values under `edits` in webview state, next to `comments`: `setState({ comments, edits })`. When the script loads, it applies `state.edits` to the title, summary, out-of-scope, and step fields when present. No re-rendering of the HTML on save.
8. **Messages from the webview:** the script sends `{ type: "savePlan", title, summary, outOfScope, steps }` with `vscode.postMessage`. Read the current values from the DOM at send time. The host handles only this type and ignores any other.

### Required changes
1. `src/plan/planEdits.ts` (new, no `vscode` import, so it can be unit-tested):
   - `export interface PlanEdits { title: string; summary: string; outOfScope: string | null; steps: string[] }`
   - `export function planFileName(title: string): string` (decision 3)
   - `export function applyPlanEdits(current: Plan, input: unknown): ParseResult`. It returns `{ ok: true, plan }`, where `plan` is a new object built from `current` with the edited title, overview, and steps. Other fields are copied unchanged. Otherwise it returns `{ ok: false, error }`, with an error message that names the field. It never throws.
   - Every function and class gets a doc comment.
2. `src/webview/planPanel.ts`:
   - `renderPlanHtml(plan: Plan, nonce: string): string` keeps its signature. Put the editable fields in the places described in decision 1. Escape every value with `escapeHtml`, including attribute values.
   - The `<title>` element and the `<h1>` show the escaped title. The `<h1>` may hold the title input.
   - Extend `COMMENT_SCRIPT` to do decisions 6, 7, and 8. Keep exactly one `<script nonce="${nonce}">` in the output. Call `acquireVsCodeApi()` once. Keep the comment behaviour as it is.
   - Add a `status` element and CSS for the new inputs. The inputs use `var(--bg)`, `var(--fg)`, and `var(--border)`. Add no colors outside `:root`. Keep the CSP meta tag exactly as it is.
   - `PlanPanel` keeps `panel` and `currentPlan`. Add `panel.webview.onDidReceiveMessage` in the constructor. On `savePlan`: call `applyPlanEdits`. On failure, post `saveResult` with `ok: false`. On success, write the file (decision 4), serialized (decision 5), then update `currentPlan` and post `saveResult` with `ok: true`.
   - Every function and class gets a doc comment.

### Scope: files you may edit
- `src/plan/planEdits.ts` (new): you may create it.
- `src/webview/planPanel.ts`: the only existing source file you change.
- `handoffs/edit-ui.md`: only your own "Development" section.

Do not edit `src/plan/plan.ts`, `src/extension.ts`, `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any handoff section other than your own. Do not add dependencies.

### Definition of done
- `npm run compile` exits 0 under `strict`.
- `npm run test:unit`: all tests pass, except assertions that the new markup breaks on purpose. In your Development section, list each failing test by name and say why it fails. The tester updates those assertions.
- Each step has one `textarea.step-text` and one `textarea.comment`, both with the correct `data-step`. Each editable field has an `aria-label`.
- The output still has exactly one `<script nonce="...">`, with the same nonce as the CSP. No `on*=` attributes, no `<a>`, no `href`.
- No plan text is interpolated into the script. The host never uses a path from the webview.
- Work is committed on `task/edit-ui`.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures.

### Test coverage the tester must add or update (test/unit/)
- New `test/unit/planEdits.test.ts`:
  - `planFileName`: spaces, punctuation, and unicode become `-`; empty or symbol-only titles give `plan.json`; output is at most 80 characters before `.json`; the same title always gives the same name.
  - `applyPlanEdits`: a valid edit merges into the plan and leaves `files`, `proposedChanges`, and `verification` unchanged; empty title, empty summary, empty step, wrong step count, and non-string fields are rejected with a message naming the field; an empty out-of-scope becomes `null`; input values are trimmed; the input plan object is not mutated.
- `test/unit/planRenderer.test.ts`: update the assertions the new markup breaks. Add: editable inputs exist with their `aria-label`; each step has one `textarea.step-text` with the escaped step text; out-of-scope is rendered as an empty textarea when null; the script still has one `<script nonce>` and calls `acquireVsCodeApi(` once; the script references `savePlan` and `saveResult`; plan text does not appear in the script.
- Do not test the file write or the message handling here. That needs the VS Code host, and it is out of scope for this task. Say so in the test report.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm ci`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands. Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the commit hash, the test output summary, the failing assertions (by name), and what the tester should check. Use the Edit tool. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` only. Use the Edit tool.

## Development

Commit: 3ecb053 on `task/edit-ui` (source only; this section is added after it and left uncommitted for the core agent).

What changed:
- `src/plan/planEdits.ts` (new): `PlanEdits`, `planFileName`, `applyPlanEdits` (pure, never throws, never mutates).
- `src/webview/planPanel.ts`: title input, summary and out-of-scope textareas (out-of-scope always rendered), per-step `textarea.step-text` before `textarea.comment`; `p.status[role=status]`; CSS for the inputs (no colors outside `:root`); `COMMENT_SCRIPT` sends `savePlan` on `change` (and Enter in the title), shows `saveResult` via `textContent`, stores `{ comments, edits }` in state and restores `edits`. Comment writes now keep other state keys. `PlanPanel` has `currentPlan`, a promise save chain, and a `savePlan` handler writing through `vscode.workspace.fs`.

Results: `npm run compile` exits 0. `npm run test:unit`: 7 failures, all expected from the new markup:
- `plan.test.ts > renderPlanHtml > omits out-of-scope text when outOfScope is null` (the `<textarea>` for out-of-scope is now always rendered; the test sees "null"? it matches the new markup, the tester should recheck the assertion).
- `planRenderer.test.ts > renders sections in the required order` (`class="summary"` no longer exists; summary is `textarea.edit-summary`).
- `planRenderer.test.ts > escapes every plan field` (`<h1>` now holds an input; title is in the `value` attribute).
- `planRenderer.test.ts > omits Out of scope when null and shows it for a string` (heading and textarea always present).
- `planRenderer.test.ts > renders steps in an ol and verification in a ul` (each `<li>` starts with `textarea.step-text`).
- `planRenderer.test.ts > renders one empty textarea per step, in order, with data-step and aria-label` (now 8 textareas; need to select `textarea.comment`).
- `planRenderer.test.ts > renders no textarea and no error for zero steps` (summary and out-of-scope textareas always exist).

Tester should check: the above assertions, new `planEdits` tests, and that the host save/message code (not unit-testable) matches decisions 4 to 6. Not done: no write/message tests (needs VS Code host).

## Testing

Verdict: PASS

Commands run:
- `npm run compile`: exit 0 (strict tsc, no errors).
- `npm run test:unit`: 5 files, 87 tests, 87 passed, 0 failed.
- `npm run test:ui` and `npm run test:integration`: not applicable (scripts do not exist yet).

Test files: planEdits 17, plan 27, planRenderer 21, streamParser 18, planPrompt 4.

Changes under `test/unit/`:
- New `planEdits.test.ts` (17 tests). `planFileName`: punctuation, unicode, and path-like input (`../../etc/passwd`) become dashes; empty and symbol-only titles give `plan.json`; the 80-character cap with no trailing dash; deterministic output. `applyPlanEdits`: valid merge leaves `files`, `proposedChanges`, and `verification` equal; trimming; an empty out-of-scope becomes `null`; an empty title, summary, or step is rejected with the field named; wrong step counts; non-string and missing fields; non-object input; no mutation of the plan or the input.
- `planRenderer.test.ts`: updated the 6 broken assertions for the new markup (section order, escaping, out-of-scope, steps in `ol`, comment textareas selected by `class="comment"`, zero steps). Added tests for: each editable field has an `aria-label` (7 fields for a 2-step plan); one `textarea.step-text` per step with escaped text, `data-step`, and `aria-label`; the script references `savePlan` and `saveResult`, uses `textContent`, never uses `innerHTML`, and calls `acquireVsCodeApi(` once; summary and out-of-scope text stay out of the script.
- `plan.test.ts`: renamed and fixed `omits out-of-scope text when outOfScope is null` (now `renders an empty out-of-scope textarea when outOfScope is null`).

Why the `plan.test.ts` test failed (the developer was unsure): the old assertion `expect(html).not.toContain("null")` searched the whole HTML. The new fixed script contains the word `null` (`let lastSent = null;`), so it matched. This is a test problem, not a bug in `src/`. The new test inspects only the markup before `<script`, checks that it contains no `null`, and checks that the out-of-scope textarea is empty.

Not tested (as the brief says): the file write and the `savePlan` message handling in `PlanPanel` need the VS Code host. A read of `src/webview/planPanel.ts` found the code matches decisions 4 to 6 (writes through `vscode.workspace.fs`, creates `.claude/plans/` first, the "Open a folder to save edits." error, a promise save chain, `currentPlan` updated only after the write, and `saveResult` replies). This was a read, not a test.

Note: the Edit tool was not available in this session, so the test files and this section were written with Write.
