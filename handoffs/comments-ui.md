# Handoff: comments-ui

## Brief (written by the core agent)

### Goal
Add a comment box to each implementation step in the artifact view. Comments live in webview state (`vscode.getState` / `vscode.setState`). They survive a webview reload while the panel stays open, and they are not written to disk. Nothing is sent to Claude Code in this task.

### Branch
`task/comments-ui` (branched from `origin/dev`). Commit only to this branch.

### Current state
`src/webview/planPanel.ts` renders the plan. `PlanPanel.show` creates the panel with `{ enableScripts: false }`. The CSP already has `script-src 'nonce-${nonce}'`, but no script is emitted. `src/plan/plan.ts` (`Plan`, `parsePlanJson`, `samplePlan`) must not change.

### Required changes
1. `PlanPanel.show` passes `{ enableScripts: true }`. Nothing else in the panel options changes.
2. Each `<li>` in the "Implementation steps" `<ol>` contains the escaped step text, then a `<textarea>` with:
   - `class="comment"`
   - `data-step="<index>"` (zero-based integer, from the array index)
   - `aria-label="Comment on step <n>"` (one-based n)
   - `rows="2"` and `placeholder="Add a comment"`
   The textarea starts empty in the HTML. The script fills it.
3. One `<script nonce="${nonce}">` appears at the end of `<body>`. Its code is a fixed string with no plan data interpolated into it. It does this:
   - Reads `vscode.getState()`. The state shape is `{ comments: { [stepIndex: string]: string } }`. A missing or malformed state means no comments.
   - Sets each `textarea.comment` value from `comments[data-step]`.
   - On `input`, stores the text under its step index with `vscode.setState(...)`. Empty text removes that key.
   - Calls `acquireVsCodeApi()` once and keeps the result. Do not call it twice.
4. Keep the CSP meta tag exactly as it is. Do not add `'unsafe-inline'`, `img-src`, `connect-src`, or any other source. The script is allowed only by its nonce.
5. Add a little CSS for textareas (full width, uses `var(--bg)`, `var(--fg)`, `var(--border)`, `font: inherit`, `margin-top: 0.4rem`). Do not hard-code colors outside `:root`.
6. Every function and class needs a doc comment (CLAUDE.md, Section 3). TypeScript strict mode.
7. Keep `renderPlanHtml(plan: Plan, nonce: string): string` and `escapeHtml` as they are. Keep the other sections in their current order.

### Known conflict: expected failing test
`test/unit/planRenderer.test.ts` asserts that the output has no `<script`. Once the script is added, that assertion fails. This is expected. Do not edit `test/`. The tester owns that file, and the tester will change the assertion to allow only the nonce'd script. In your Development section, say exactly which assertion fails and why. Every other test must pass.

### Scope: files you may edit
- `src/webview/planPanel.ts`: the only source file you change.
- `handoffs/comments-ui.md`: only your own "Development" section.

Do not edit `src/plan/`, `src/extension.ts`, `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any handoff section other than your own. Do not add dependencies.

### Definition of done
- `npm run compile` exits 0 under `strict`.
- `npm run test:unit`: all tests pass except the expected `no <script` assertion in `planRenderer.test.ts` (see above).
- Each step has one textarea with the correct `data-step` and `aria-label`.
- The only script in the output is one `<script nonce="...">` with the same nonce as the CSP.
- No inline event handler (`on*=`), no `<a>`, no `href`, and no script that interpolates plan text.
- Work is committed on `task/comments-ui`.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures.

### Test coverage the tester must add or update (test/unit/)
- Update the planRenderer "no script" assertion to allow exactly one `<script nonce="<nonce>">` and nothing else. Still no `on*=` and no `href`.
- One textarea per step, in step order, with `data-step` and `aria-label` (one-based).
- The textarea contents are empty in the HTML, and no plan text is placed in the script.
- The script's nonce matches the CSP `script-src` nonce.
- Step text is escaped (for example `<b>` in a step does not appear raw).
- Zero steps: no textarea, and no error.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm ci`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands. Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the commit hash, the test output summary, the expected failing assertion, and what the tester should check. Use the Edit tool. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` only. Use the Edit tool.

## Development

Changed only `src/webview/planPanel.ts`:
- `PlanPanel.show` now passes `{ enableScripts: true }`.
- New `renderSteps` renders each step as `<li>` with escaped text and an empty `<textarea class="comment" data-step="i" aria-label="Comment on step n" rows="2" placeholder="Add a comment">`.
- New constant `COMMENT_SCRIPT` (fixed string, no plan data) calls `acquireVsCodeApi()` once, restores comments from `getState().comments`, and stores them with `setState` on `input` (empty text removes the key). Emitted as one `<script nonce="${nonce}">` at the end of `<body>`.
- CSP meta tag unchanged. Added a `textarea` CSS rule using only `var(--...)` colors.

Results: `npm run compile` exit 0. `npm run test:unit`: 57 passed, 3 failed, all in `test/unit/planRenderer.test.ts` and all caused by this change (expected):
1. "escapes every plan field": `not.toContain("</script>")`. The output now has the legitimate closing tag of our own script.
2. "contains no script, anchor, href, or inline event handler": `not.toContain("<script")`. This is the expected `no <script` assertion.
3. "renders steps in an ol and verification in a ul": regex `/<ol>\s*<li>Step one<\/li>.../` fails because each `<li>` now contains a textarea before `</li>`.

Tester should: loosen those three assertions (allow exactly one nonce'd script; check escaping of plan fields inside the plan content, not the script tag; match the new `<li>` shape), then add the coverage listed in the brief.

## Testing

Verdict: PASS

Commands run:
- `npm run compile`: exit 0 (strict).
- `npm run test:unit`: 4 files, 66 tests passed, 0 failed (planRenderer.test.ts: 17 tests).
- `npm run test:ui` and `npm run test:integration`: not applicable (scripts do not exist yet).

Updated assertions in `test/unit/planRenderer.test.ts`:
- "escapes every plan field": no raw `<script>`; exactly one `<script` and one `</script>` in the output (our own); all escaped-field checks kept. `<li>` check split to `<li>ESCAPED` (step) and `<li>ESCAPED</li>` (verification).
- "contains exactly one nonce'd script, and no anchor, href, or inline event handler": exactly one `<script`, equal to `<script nonce="NONCE">`; `<a `, `href=`, and `on*=` still absent.
- "renders steps in an ol and verification in a ul": step `<li>` must be text, then an empty textarea, then `</li>`; verification regex unchanged.

New tests: one empty textarea per step in order with `class`, `data-step` (zero-based), `aria-label` (one-based), `rows`, `placeholder`; plan text absent from the script and `acquireVsCodeApi(` called once; script nonce equals CSP `script-src` nonce; script sits after the last section and just before `</body>`; `<b>` in a step is escaped; zero steps gives no textarea and no throw.

Product bugs found: none.
