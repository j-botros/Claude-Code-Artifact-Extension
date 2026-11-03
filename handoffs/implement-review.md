# Handoff: implement-review

## Brief (written by the core agent)

### Goal
Add the top-right "Implement the Design" button to the artifact view. When clicked, it reads the plan's optional `proposedFiles`, computes a diff per file, and shows each hunk in the editor as green (added) or red (removed) with a ✓ (accept) and ✗ (reject) CodeLens above it. **Nothing is written to disk in this task.** Accept and reject only change in-memory decisions. Writing accepted hunks is the next task, `implement-apply`.

### Branch
`task/implement-review-2` (branched from `origin/dev`; CLAUDE.md change already committed as `35f198f`). Commit only to this branch. The older local branch `task/implement-review` is stale and must not be used.

### Current state
- `src/plan/plan.ts`: `Plan` type, `samplePlan`, `parsePlanJson` (strips a code fence, validates the CLAUDE.md shape). No `proposedFiles` yet.
- `src/plan/planEdits.ts`: `applyPlanEdits(current, input)` returns a new plan built from the edits plus `current`. It does NOT carry over `proposedFiles`, so saving would drop it.
- `src/plan/planPrompt.ts`: `SHAPE_RULES` is shared by `buildPlanPrompt` and `buildReviewPrompt`.
- `src/webview/planPanel.ts`: `renderPlanHtml(plan, nonce, options?)`, `PlanPanel.show(plan, onReview)`, `ReviewHandler`, one nonce'd script (`COMMENT_SCRIPT`), `saveChain` queue. The header has the title input and `button.review`.
- `src/extension.ts`: `runPlanPrompt`, `reviewPlan`, `generatePlan`, `openSamplePlan`, `activate`.
- `test/unit/planPrompt.test.ts` pins `buildPlanPrompt` output. This task changes that output on purpose (see decision 3). The tester updates the pin.

### Decisions already made by the core agent
1. **Plan field.** Add `export interface ProposedFile { path: string; content: string }` and an optional `proposedFiles?: ProposedFile[]` on `Plan`. `parsePlanJson` accepts the field when it is absent. When it is present it must be an array. Each item needs a `path` string and a `content` string. Only add the `proposedFiles` key to the parsed plan when the input had it, so existing `toEqual` checks keep passing.
2. **Path safety.** Export `isSafeRelativePath(path: string): boolean` from `plan.ts`. It is false for an empty string, a leading `/` or `\`, a Windows drive prefix (`/^[a-zA-Z]:/`), a backslash anywhere, or any `..` segment. `parsePlanJson` rejects a `proposedFiles` path that fails this check with an error naming the index. The hunk review re-checks the same function before it reads any file.
3. **Prompt.** Add one line to `SHAPE_RULES` describing `proposedFiles` as optional: an array of `{ "path": string (relative path inside the workspace), "content": string (the full new file) }`, to be included only when the plan proposes file contents. Keep the rule that Claude never writes files. Both prompts get the change because both use `SHAPE_RULES`. `buildPlanPrompt` output changes on purpose.
4. **Pure hunk splitting.** New file `src/plan/diffHunks.ts` (pure, no `vscode` import). Export:
   - `interface DiffHunk { index: number; oldStart: number; oldLines: string[]; newLines: string[] }`. `oldStart` is the zero-based line index in the original. `oldLines` are the removed lines and `newLines` the added lines. A pure insert has empty `oldLines`, and a pure delete has empty `newLines`.
   - `splitHunks(original: string, proposed: string): DiffHunk[]`. Split both on `\n`. Compute a line-level LCS diff. Group each maximal run of non-equal operations into one hunk, with no context lines. Identical text returns `[]`. A new file (`original === ""`) gives one hunk with all lines added. If `oldLines.length * newLines.length > 4_000_000`, return one hunk that replaces the whole file, so the cost stays bounded.
   - Do not add a diff dependency. Write the LCS yourself.
5. **Decision state, pure.** Put the accept/reject state in `diffHunks.ts` or a new pure file `src/plan/hunkDecisions.ts`:
   - `type Decision = "accept" | "reject"`.
   - `setDecision(decisions: Map<string, Decision>, key: string, value: Decision): Map<string, Decision>` returns a new map.
   - `summarizeDecisions(total: number, decisions: Map<string, Decision>): { accepted: number; rejected: number; pending: number }`.
   - Keys are `"<path>#<hunk index>"`. The VS Code layer uses these.
6. **VS Code wiring.** New file `src/review/hunkReview.ts`. It is the only file that imports `vscode` for this task. Behaviour:
   - `startImplementReview(plan: Plan, folder: vscode.Uri): Promise<{ ok: true; message: string } | { ok: false; message: string }>`. It never throws.
     - If `plan.proposedFiles` is absent or empty, return `{ ok: false, message: "This plan has no proposed files." }`.
     - For each proposed file: check `isSafeRelativePath`, then build the URI with `vscode.Uri.joinPath` (split on `/`). Read the original with `vscode.workspace.fs.readFile`. A missing file counts as new, with an empty original. Call `splitHunks`. Skip files with no hunks.
     - Store the session in a module-level variable. A new click replaces the previous session. Each session holds the proposed texts and the decisions.
     - Open each file with `vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title)`. The left side is the real file. For a new file it is a virtual empty document. The right side is a virtual document with the proposed content. Register a `TextDocumentContentProvider` for both virtual schemes (`claude-artifact-original`, `claude-artifact-proposed`). Both are read-only and serve content from the session.
     - Green decorations (added lines) go on the right side. Red decorations (removed lines) go on the left side. Use `createTextEditorDecorationType` with `var`-free VS Code theme colours (`diffEditor.insertedLineBackground` and `diffEditor.removedLineBackground`, or the `new ThemeColor(...)` equivalents). Re-apply them when `vscode.window.onDidChangeVisibleTextEditors` fires.
     - A `CodeLensProvider` on the right-side scheme gives each hunk a "✓ Accept" and a "✗ Reject" lens above its first proposed line. The lenses call `claudeArtifact.acceptHunk` and `claudeArtifact.rejectHunk` with `{ sessionId, key }`. The handlers call `setDecision`, refresh the decorations and lenses, and show `summarizeDecisions` in the message.
     - Message on success: `"Review the hunks in the editor. Nothing has been written. Accepted: N, rejected: M, pending: P."` Update the message after each decision.
   - **No writes.** This task must not call `vscode.workspace.fs.writeFile`, `createDirectory`, `delete`, or `WorkspaceEdit` / `applyEdit`. Reads are fine.
   - Register the two commands and the content provider in `activate` through `context.subscriptions`. Add them to `contributes.commands` in `package.json` only if you also hide them from the palette with `contributes.menus.commandPalette` and `"when": "false"`. Do not add a dependency.
   - Every function and class has a doc comment. Colours come from VS Code theme colours, not hard-coded values.
7. **Webview.** `src/webview/planPanel.ts`:
   - Header: add `<button class="implement" type="button">Implement the Design</button>` next to `button.review`, in the same flex row, to the right of it. No inline handler. Add the matching CSS with `var(--...)` only. Keep one `button.review` and the title input.
   - The `COMMENT_SCRIPT` click listener posts `{ type: "implementDesign" }`. Disable the button until a reply arrives. A reply `{ type: "implementResult", ok, message }` shows `message` in the status line and re-enables the button. It is sent on both success and failure.
   - `PlanPanel.show(plan, onReview, onImplement)`. Add `export type ImplementHandler = (plan: Plan) => Promise<{ ok: true; message: string } | { ok: false; message: string }>`. The implement path runs on `saveChain`, the same as review and save. It uses `this.currentPlan`, not unsaved webview edits, and says so in the doc comment.
   - Never let the handler throw. Catch and reply `ok: false`.
   - The CSP is unchanged. The one nonce'd script stays the only script. No plan text is interpolated into script.
8. **extension.ts.** Add `implementPlan(plan: Plan)`. It resolves the first workspace folder, calls `startImplementReview`, and returns its result. Pass it as the third argument in both `generatePlan` and `openSamplePlan`. If there is no folder, return `{ ok: false, message: "Open a folder first." }`.
9. **Plan preservation.** `applyPlanEdits` copies `current.proposedFiles` into its result when the field is present, and copies each item (`{ path, content }`). The edits never set it.

### Scope: files you may edit
- `src/plan/plan.ts`
- `src/plan/planEdits.ts`
- `src/plan/planPrompt.ts`
- `src/plan/diffHunks.ts` (new)
- `src/plan/hunkDecisions.ts` (new, only if you split the decision logic out)
- `src/review/hunkReview.ts` (new)
- `src/webview/planPanel.ts`
- `src/extension.ts`
- `package.json`: only for `contributes.commands` and `contributes.menus.commandPalette` as in decision 6. No other change.
- `handoffs/implement-review.md`: only your own "Development" section

Do not edit `src/claude/`, `src/agy/`, `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any handoff section other than your own. Do not add dependencies.

### Definition of done
- `npm run compile` exits 0 under `strict`.
- `npm run test:unit` passes, except for the assertions this task changes on purpose. Name each of those in your Development section and say why. These are the `buildPlanPrompt` pin in `test/unit/planPrompt.test.ts` and any header assertion in `planRenderer*.test.ts`. Do not edit `test/`. The tester updates them.
- `parsePlanJson` still accepts plans without `proposedFiles`.
- `splitHunks` is pure and has no `vscode` import.
- No file write, delete, or workspace edit exists anywhere in `src/` after this change. Grep for `writeFile`, `createDirectory`, `delete`, `applyEdit`, and `WorkspaceEdit` and confirm there are none in `src/review/`.
- The page has one `button.implement` in the header, with no inline handler. The script is still the one nonce'd `<script>`.
- Work is committed on `task/implement-review-2`. The source changes and your Development section go in one commit.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures.

### Test coverage the tester must add or update (test/unit/)
- `splitHunks`: identical text gives `[]`; one changed line; pure insert; pure delete; new file (empty original); proposed empty; two separated changes give two hunks with the right `index` and `oldStart`; CRLF-free trailing newline handled; the size cap gives one whole-file hunk.
- `isSafeRelativePath`: accepts `src/a.ts`; rejects `""`, `/etc/x`, `\\x`, `C:/x`, `../x`, `a/../b`.
- `parsePlanJson`: no `proposedFiles` gives no key; a valid list parses; a non-array is rejected; a missing `content` is rejected; an unsafe path is rejected with the index named.
- `applyPlanEdits`: keeps `proposedFiles` from `current`.
- `buildPlanPrompt` and `buildReviewPrompt`: the optional `proposedFiles` rule is present in both; the no-file-write rule is still present. Update the existing pin to the new text.
- Decision logic (if pure): `setDecision` returns a new map and does not mutate; `summarizeDecisions` counts correctly.
- `renderPlanHtml`: one `button.implement` in the header, with the text "Implement the Design"; no `onclick`; still exactly one nonce'd `<script>`; `button.review` still there; the script posts `implementDesign`.
- Update any assertion the header change breaks, but keep its intent.
- `src/review/hunkReview.ts` needs the VS Code host. Leave it untested here and say so in your Testing section.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm ci`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands. Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the commit hash, the test output summary, the list of intentionally changed assertions, and what the tester should check. Use Edit. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` and your Testing section only. Do not stage anything else. Use Edit if it is available. If Edit is not available, use Write and keep every other section unchanged.

## Development

Commit: see `git log -1` on `task/implement-review-2` (the commit contains the source changes and this section).

### What changed
- `src/plan/plan.ts`: `ProposedFile`, optional `Plan.proposedFiles`, exported `isSafeRelativePath`, validation in `parsePlanJson` (array, `path` string and safe, `content` string; errors name `proposedFiles[i]`). The key is added only when the input had it.
- `src/plan/planEdits.ts`: `applyPlanEdits` copies `proposedFiles` from `current` when present.
- `src/plan/planPrompt.ts`: one optional `proposedFiles` line in `SHAPE_RULES` (both prompts); the no-file-write rule is unchanged.
- `src/plan/diffHunks.ts` (new, pure): `DiffHunk`, `splitHunks` (own LCS, no context lines, 4,000,000-cell cap gives one whole-file hunk). The empty string counts as zero lines on either side, so a new file is one all-added hunk and an emptied file is one all-removed hunk. A trailing newline yields a final empty line, as `split("\n")` does.
- `src/plan/hunkDecisions.ts` (new, pure): `Decision`, `setDecision`, `summarizeDecisions`.
- `src/review/hunkReview.ts` (new, only file importing `vscode` for this feature): `startImplementReview`, `registerHunkReview` (content provider for both schemes, CodeLens provider, `claudeArtifact.acceptHunk` / `rejectHunk`, decoration refresh on `onDidChangeVisibleTextEditors`). Reads only. Rejected hunks lose their colour; lens titles change to "Accepted" / "Rejected".
- `src/webview/planPanel.ts`: `button.implement` in the header, CSS with `var(--...)`, script click handler posting `implementDesign`, `implementResult` reply handling, `ImplementHandler`, `PlanPanel.show(plan, onReview, onImplement)`, `implement()` on `saveChain` using `currentPlan` (last saved plan, not unsaved webview edits).
- `src/extension.ts`: `implementPlan`, passed in both `show` calls; `registerHunkReview(context)` in `activate`.
- `package.json`: the two commands and `commandPalette` entries with `"when": "false"`.

### Tests
- `npm run compile`: exit 0.
- `npm run test:unit`: 9 files, 123 tests, all passed. No existing assertion broke, so there are no intentionally broken assertions (the `buildPlanPrompt` pin in `test/unit/planPrompt.test.ts` and the header tests still pass as written). The tester should still add the coverage listed in the brief.
- I could not run grep (shell rules). By reading, `src/review/hunkReview.ts` has no `writeFile`, `createDirectory`, `delete`, `applyEdit`, or `WorkspaceEdit`; the only fs call is `readFile`. The tester should grep to confirm.

### What the tester should check
- `splitHunks` cases from the brief, especially `oldStart` after earlier hunks and the empty-string handling above.
- `renderPlanHtml` header has one `button.implement`, no `onclick`, one nonce'd script.
- `hunkReview.ts` is untested here (needs the VS Code host). Manual check: click the button on a plan with `proposedFiles`.
