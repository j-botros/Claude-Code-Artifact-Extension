# Handoff: review-comments

## Brief (written by the core agent)

### Goal
Add the top-right "Review Comments" button to the artifact view. When clicked, it sends the plan as currently shown in the webview (including unsaved edits) and the per-step comments to Claude Code, using the same headless path as `claudeArtifact.generatePlan` (`runClaude`, then `parsePlanJson`). The returned plan replaces the rendered view. Nothing is written to disk in this task.

### Branch
`task/review-comments` (branched from `origin/dev`). Commit only to this branch.

### Current state
- `src/extension.ts`: `generatePlan()` asks for a request, calls `runClaude(buildPlanPrompt(request), folder.uri.fsPath)`, then `parsePlanJson(result.text)`, then `PlanPanel.show(parsed.plan)`. Commands are registered in `activate`.
- `src/webview/planPanel.ts`: `renderPlanHtml(plan, nonce)` builds the page. `PlanPanel.show(plan)` creates the panel with `{ enableScripts: true }`. The constructor sets `webview.html` once. `COMMENT_SCRIPT` is a fixed string that restores and saves edits (`state.edits`) and comments (`state.comments`) through `getState` / `setState`. `save()` applies edits with `applyPlanEdits` and writes `.claude/plans/<slug>.json`.
- `src/claude/claudeRunner.ts`: `runClaude(prompt, cwd)` returns `{ ok: true, text }` or a typed error with a user message. It is not changed in this task.
- `src/plan/planPrompt.ts`: `buildPlanPrompt(request)` asks for the CLAUDE.md, Section 3 JSON shape with no file edits. Its output shape is the reference.
- `src/plan/planEdits.ts`: `applyPlanEdits(current, input)` validates webview edits and returns a new plan, or an error. It never throws.
- `src/plan/plan.ts` (`Plan`, `parsePlanJson`, `samplePlan`): do not change.

### Decisions already made by the core agent
1. The webview sends the review message with the edits as shown (title, summary, outOfScope, steps) and the comments map. The host checks the edits with `applyPlanEdits` against the current plan. The host never trusts the webview's copy of the plan.
2. A review with no non-empty comments is not sent to Claude Code. The host shows "Add a comment on a step first." and makes no call.
3. The review prompt uses the same rules as `buildPlanPrompt` (single JSON object, same keys and order, no files written, no commands run). It also asks Claude Code to revise the plan so that each comment is addressed, and to keep the step count and order where possible.
4. The plan and comments go into delimited blocks, as data, not instructions. Plan JSON is serialized with `JSON.stringify`, then `<` is replaced with `<` so the text can never contain a closing tag such as `</plan>`. Comments are shown as `Step <n>: <text>`, with `<n>` one-based, and their text is escaped the same way.
5. After a successful review, the panel re-renders with the returned plan. `panel.title` is set to the new title. The new page starts with empty comments and no restored edits, so the returned plan is what the user sees. Do this with a fixed boolean literal in the script (for example `const resetState = true;`), not by interpolating plan text. Restoring old `state.edits` after a review would overwrite the new plan, so it must not happen.
6. While a review runs, the button is disabled and the status line says "Asking Claude Code to review...". On failure, the button is enabled again and the error shows in the status line. The panel keeps the current plan and comments.
7. The returned plan is not saved to `.claude/plans/`. The user saves it by editing as before.

### Required changes
1. **`src/plan/reviewComments.ts`** (new). Pure functions with doc comments:
   - `parseReviewComments(input: unknown, stepCount: number): { ok: true; comments: Record<number, string> } | { ok: false; error: string }`. Accepts an object whose keys are zero-based step indexes (`"0"`, `"1"`, …) with string values. Rejects a non-object, a key that is not an integer in `[0, stepCount)`, or a non-string value. Trims values and drops empty ones.
   - `formatCommentsForPrompt(comments: Record<number, string>): string`. Returns one line per comment, sorted by index: `Step <n>: <text>`, one-based.
2. **`src/plan/planPrompt.ts`**: add `buildReviewPrompt(plan: Plan, comments: Record<number, string>): string`. It reuses the output-shape rules from `buildPlanPrompt` (extract the shared shape text into a constant so the two prompts cannot drift). Put the plan JSON inside `<plan>` and the comments inside `<comments>`, using the `<` escape described above. Do not change `buildPlanPrompt`'s output: `test/unit/planPrompt.test.ts` pins it.
3. **`src/webview/planPanel.ts`**:
   - Add a header row with the title input on the left and a `<button class="review" type="button">Review Comments</button>` on the right. Use flex. Keep the title input editable.
   - The button has no inline handler. The COMMENT_SCRIPT adds a `click` listener. On click, it posts `{ type: "reviewComments", title, summary, outOfScope, steps, comments }`. `comments` is built from the `state.comments` map (or the comment textareas). Disable the button until the host replies.
   - Handle a `reviewResult` message with `{ ok, message }`. On `ok: false`, re-enable the button and show `message`. On `ok: true`, the host re-renders, so the page reloads and nothing else is needed.
   - `renderPlanHtml(plan, nonce, options?: { resetState: boolean })` (default false). When `resetState` is true, the script clears `state.comments` and `state.edits` before restoring anything.
   - `PlanPanel.show(plan, onReview)`. `onReview` has the type `(plan: Plan, comments: Record<number, string>) => Promise<{ ok: true; plan: Plan } | { ok: false; message: string }>`. The panel's constructor stores it. On `reviewComments`, the panel: (a) runs `applyPlanEdits(currentPlan, msg)`. On error, replies `ok: false`. (b) runs `parseReviewComments(msg.comments, plan.implementationSteps.length)`. On error, replies `ok: false`. (c) If there are no comments, replies `ok: false` with "Add a comment on a step first." (d) Calls `onReview(editedPlan, comments)`. (e) On success: sets `currentPlan`, sets `panel.title`, and sets `panel.webview.html = renderPlanHtml(newPlan, makeNonce(), { resetState: true })`. On failure: replies with the message.
   - Review and save must not overlap. Queue the review on `saveChain`, the same as save.
   - Every function and class needs a doc comment. Colors only through `var(--...)`. The CSP is unchanged: no `'unsafe-inline'`, no new sources. Any new script stays inside the one nonce'd `<script>`.
4. **`src/extension.ts`**: move the run-and-parse step from `generatePlan` into one function (for example `runPlanPrompt(prompt: string): Promise<{ ok: true; plan: Plan } | { ok: false; message: string }>`), used by both `generatePlan` and the review callback. `generatePlan` must behave as before. The review callback builds the prompt with `buildReviewPrompt`, then calls `runPlanPrompt`. Wrap it in `withProgress` with title "Asking Claude Code to review the plan...". Use the first workspace folder as cwd. If there is no folder, return `{ ok: false, message: "Open a folder first." }`. `openSamplePlan` passes the same callback.

### Scope: files you may edit
- `src/plan/reviewComments.ts` (new)
- `src/plan/planPrompt.ts`
- `src/webview/planPanel.ts`
- `src/extension.ts`
- `handoffs/review-comments.md`: only your own "Development" section

Do not edit `src/claude/`, `src/plan/plan.ts`, `src/plan/planEdits.ts`, `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any handoff section other than your own. Do not add dependencies.

### Definition of done
- `npm run compile` exits 0 under `strict`.
- `npm run test:unit` passes. If an existing assertion in `test/unit/planRenderer.test.ts` fails because of the new header or button, say exactly which assertion and why in your Development section. Do not edit `test/`. The tester will update it.
- The page has one button with class `review`, in the header, with no inline handler.
- The only script is still one `<script nonce="...">` with the CSP nonce. No plan text is interpolated into any script.
- `buildPlanPrompt` output is unchanged.
- Review never calls Claude Code when there are no non-empty comments.
- Work is committed on `task/review-comments`: your source changes and your Development section in one commit.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures.

### Test coverage the tester must add or update (test/unit/)
- `parseReviewComments`: valid map; non-object; non-integer key; out-of-range key; negative key; non-string value; whitespace-only value dropped; zero steps with a non-empty map rejected.
- `formatCommentsForPrompt`: one-based numbering, sorted order, empty map gives an empty string.
- `buildReviewPrompt`: contains the output-shape rules; contains the plan JSON and each comment; contains no raw `</plan>` or `</comments>` from user text (inject one in a comment and in a step); no file-edit or command instructions missing.
- `buildPlanPrompt`: existing tests still pass unchanged.
- `renderPlanHtml`: one `button.review` in the header; no `onclick`; still exactly one nonce'd `<script>`; `resetState` true produces the reset line and false does not; the title input is still there.
- Update any `planRenderer` assertion the header change breaks, but keep its intent.

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
- `src/plan/reviewComments.ts` (new): `parseReviewComments` and `formatCommentsForPrompt`.
- `src/plan/planPrompt.ts`: shared `SHAPE_RULES` constant; new `buildReviewPrompt`. Plan JSON and comments go in `<plan>` and `<comments>`, with `<` replaced by the JSON escape `<` (the brief's "`<`" looked like a rendering loss of that). `buildPlanPrompt` output is byte-identical.
- `src/webview/planPanel.ts`: header with title input and `button.review`; script click listener, `reviewResult` handling, `const resetState` literal line before the script (clears state when true); `renderPlanHtml(plan, nonce, options?)`; `PlanPanel.show(plan, onReview)` and `ReviewHandler` type; `review()` queued on `saveChain`.
- `src/extension.ts`: `runPlanPrompt(prompt, cwd)` shared by `generatePlan` and the new `reviewPlan` callback (with `withProgress`); `openSamplePlan` passes the callback.

### Tests
- `npm run compile`: exit 0.
- `npm run test:unit`: 5 files, 87 tests passed. No existing assertion failed.

### Not done / notes
- On a successful review the host re-renders, so no `reviewResult` is sent for success. The "Asking Claude Code to review..." status is set in the webview on click.

### Tester should check
- Items listed in the brief's coverage list, plus: with `resetState` true the HTML has `const resetState = true;`, otherwise `false`; one `button.review`, no `onclick`; one nonce'd `<script>`.

## Testing
