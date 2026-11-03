# Handoff: implement-apply

## Brief (written by the core agent)

### Goal
Write only the hunks the user accepted (✓) into the workspace files, in place, through VS Code's edit API. Rejected (✗) hunks and undecided (pending) hunks are left alone. Show each file's result as it is written. Ask for confirmation before the first write in an extension session. Never run automatically: a write happens only after an explicit click on the Apply lens, and only after the confirmation.

### Branch
`task/implement-apply` (branched from `origin/dev`). Commit only to this branch.

### Current state (read before you start)
- `src/review/hunkReview.ts`: `startImplementReview` builds a module-level `session` (files with `path`, `originalText`, `proposedText`, `hunks`, `newStarts`, `leftUri`, `rightUri`; plus `decisions: Map<string, Decision>` and `total`). Keys are `"<path>#<hunk index>"`. It only reads files today. `registerHunkReview(context)` registers the content provider, the `HunkLensProvider` (Accept and Reject lenses on the proposed side), and `claudeArtifact.acceptHunk` / `rejectHunk`.
- `src/plan/diffHunks.ts`: `DiffHunk { index, oldStart, oldLines, newLines }`. `oldStart` is a zero-based line index in the original. `oldLines.length` is the number of original lines the hunk replaces. Text is split on `\n`, so `split("\n").join("\n")` round-trips exactly.
- `src/plan/hunkDecisions.ts`: `Decision`, `setDecision`, `summarizeDecisions`.
- `src/plan/plan.ts`: `isSafeRelativePath(path)` is exported. Use it again before any write.
- `src/extension.ts`: `implementPlan(plan)` calls `startImplementReview` with the first workspace folder.
- `src/webview/planPanel.ts`: the Implement the Design button. Do not change it for this task.
- Existing plan-save code in `planPanel.ts` already writes `.claude/plans/*.json`. It is out of scope.

### Decisions already made by the core agent
1. **Pure apply logic.** New file `src/plan/applyHunks.ts` (no `vscode` import). Export:
   - `applyAcceptedHunks(original: string, hunks: DiffHunk[], decisions: Map<string, Decision>, path: string): { text: string; applied: number; skipped: number }`. Walk the original lines. For each hunk whose key `"<path>#<index>"` is `"accept"`, replace `oldLines.length` lines at `oldStart` with `newLines`. Keep all other lines. Rejected and pending hunks keep the original lines. Hunks are in ascending `oldStart` order from `splitHunks`; add a guard that throws or returns a failure if they overlap or are out of order. `applied` counts accepted hunks. `skipped` counts the rest. If nothing is accepted, `text === original`.
   - Put the logic in pure code so it can be unit-tested. Do not put it in `hunkReview.ts`.
   - Every function and class has a doc comment.
2. **Trigger.** Add one Apply lens on line 0 of the proposed side in `HunkLensProvider`: title `"▶ Apply accepted (N)"`, where N is the accepted count, command `claudeArtifact.applyAccepted`, argument `{ sessionId }`. It is the only way to write. Register the command in `registerHunkReview`. Hide it from the palette with `contributes.menus.commandPalette` and `"when": "false"`, as the accept and reject commands already are. The handler is a no-op if `sessionId` does not match the current session.
3. **Confirmation.** Before the first write in an extension session, show `vscode.window.showWarningMessage` with `{ modal: true }`. The message lists the files and the accepted hunk count per file. Buttons: `"Apply"` and nothing else (a cancel is the modal's close). Keep a module-level flag `confirmedThisSession`. Set it only after the user clicks Apply. A cancel leaves the flag false, so the next click asks again. A session with zero accepted hunks shows "No hunks accepted. Nothing to write." and does not ask.
4. **Freshness check.** Before writing a file, re-read it from disk with `vscode.workspace.fs.readFile`. A missing file is allowed only if the review treated it as new (`leftUri` was virtual). If the current text differs from `originalText`, skip that file and report "changed since review". Also skip a file if `vscode.workspace.textDocuments` has it open and `isDirty` is true, and report "has unsaved changes". Never overwrite a changed file silently.
5. **Path safety.** Re-check `isSafeRelativePath(path)` and build the URI with `vscode.Uri.joinPath(folder, ...)` the same way `startImplementReview` does. Refuse any path that does not start with the folder URI. Use the folder from the first workspace folder, as before.
6. **How it is written.** Use `vscode.WorkspaceEdit`, not `fs.writeFile`:
   - Existing file: `edit.replace(uri, fullRange, newText)`, where `fullRange` covers the whole document from the freshly read text.
   - New file: create parent directories with `vscode.workspace.fs.createDirectory`, then `edit.createFile(uri, { ignoreIfExists: false })` and `edit.insert(uri, new vscode.Position(0, 0), newText)`.
   - Call `vscode.workspace.applyEdit(edit)` once per file, then `doc.save()` on the real document (open it with `vscode.workspace.openTextDocument`) so the change is on disk. Skip the save if `applyEdit` returns false.
   - Write one file at a time. Show progress with `vscode.window.withProgress` (location `Notification`, cancellable false), updating the message to the file name as each file is written.
7. **Per-file result.** After each file, record `{ path, status: "written" | "skipped" | "failed", detail }`. At the end show one information message with a line per file, for example `"src/a.ts: wrote 2 hunks"`, `"src/b.ts: skipped (changed since review)"`. Keep the detail to one line.
8. **Session end.** After a run that wrote at least one file, set the module-level `session` to `undefined`, fire `lensChanged`, and clear the decorations. The diff editors stay open, with no lenses. A second Apply requires a new Implement the Design click. This prevents double writes.
9. **Never throw.** `applyAccepted` catches every error, reports it as a message, and returns. Do not let an exception reach the command host.
10. **No other writes.** Writes are allowed only in the apply path. Nothing else in `src/review/` may call `writeFile`, `createDirectory` (except for the parent-directory step above), `delete`, or `rename`. Plan saving in `planPanel.ts` is unchanged.
11. **Undo.** Each file is one `WorkspaceEdit`, so VS Code's undo works per file. Do not add a custom undo.

### Scope: files you may edit
- `src/plan/applyHunks.ts` (new, pure)
- `src/review/hunkReview.ts`: the Apply lens, the `applyAccepted` command, the confirmation, the freshness check, the write path, the per-file results, the session end
- `package.json`: only the `claudeArtifact.applyAccepted` entry in `contributes.commands` and its `commandPalette` entry with `"when": "false"`. No other change.
- `handoffs/implement-apply.md`: only your own "Development" section

Do not edit `src/claude/`, `src/agy/`, `src/webview/`, `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any handoff section other than your own. Do not add dependencies.

### Definition of done
- `npm run compile` exits 0 under `strict`.
- `npm run test:unit` passes, with no existing assertion changed.
- `applyAcceptedHunks` is pure, has no `vscode` import, and does not mutate its inputs.
- In `src/review/`, every write goes through `WorkspaceEdit` or the one `createDirectory` for parent folders. Grep `src/review/` for `writeFile`, `delete`, `rename`, `createDirectory`, `applyEdit`, `WorkspaceEdit`, and confirm each hit is in the apply path.
- Applying never runs automatically. The only trigger is the Apply lens.
- Work is committed on `task/implement-apply`. The source changes and your Development section go in one commit.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures.

### Test coverage the tester must add (test/unit/)
- `applyAcceptedHunks`: no accepted hunks gives the original text; accepting all hunks gives the proposed text (use `splitHunks` to build hunks); accepting only some leaves the others' original lines; a pure insert and a pure delete; accepting a hunk on a new file (empty original); a hunk whose key belongs to another path is ignored; overlapping or out-of-order hunks are rejected; the input map and hunks are not mutated.
- Round trip: for several original and proposed pairs, accepting every hunk from `splitHunks` gives back `proposed`.
- `src/review/hunkReview.ts` needs the VS Code host. Leave it untested here and say so in your Testing section. The confirmation, freshness check, and write path need a manual check in the Extension Development Host.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm ci`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands. Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the commit hash, the test output summary, and what the tester should check. Use Edit. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` and your Testing section only. Do not stage anything else. Use Edit if it is available. If Edit is not available, use Write and keep every other section unchanged.

## Development

### What changed
- `src/plan/applyHunks.ts` (new, pure): `applyAcceptedHunks(original, hunks, decisions, path)` returns `{ text, applied, skipped }`. It throws if hunks overlap, are out of order, or reach past the original. It does not mutate inputs. With no accepted hunks, `text === original`.
- `src/review/hunkReview.ts`: `ReviewSession` now stores `folder`. `HunkLensProvider` adds one "▶ Apply accepted (N)" lens on line 0 of each proposed document. New command `claudeArtifact.applyAccepted` (`applyAccepted`): no-op on session id mismatch or while another run is active; "No hunks accepted. Nothing to write." for zero accepted; modal confirmation (button "Apply", files and counts in `detail`) until `confirmedThisSession` is set; then `withProgress` writes one file at a time through `writeOneFile`. `writeOneFile` re-checks path safety and folder prefix, skips dirty open documents ("has unsaved changes"), re-reads the file and skips if different from `originalText` ("changed since review"), or if a "new" file now exists. Existing file: `WorkspaceEdit.replace` over the whole document, then save. New file: `createDirectory` for parents, `createFile` plus `insert`, then save. One summary information message lists each file. After at least one file is written the session is cleared, lenses refreshed, decorations cleared. All errors are caught.
- `package.json`: `claudeArtifact.applyAccepted` command and hidden palette entry.

### Results
- `npm run compile`: exit 0.
- `npm run test:unit`: 11 files, 156 tests passed.
- grep of `src/review/` for writeFile, delete, rename, createDirectory, applyEdit, WorkspaceEdit: hits only in `writeOneFile` (createDirectory line 329, WorkspaceEdit 325, applyEdit 339) and its doc comment. No writeFile, delete, or rename.

### Decisions beyond the brief
- Confirmation file list is passed in the modal `detail`, with a short message.
- Full-range replace uses `doc.validateRange` on the range computed from the fresh text, to handle CRLF.
- The Apply lens appears on every proposed file's document (one per document), all with the same session id.
- Added an `applying` flag so a double click cannot start two runs.
- Files with zero accepted hunks are not listed or reported.

### Tester should check
- Unit tests for `applyAcceptedHunks` per the brief. `hunkReview.ts` needs the Extension Development Host: manual check of confirmation (cancel then retry), freshness skip, dirty skip, new file in nested folder, undo per file.
- Commit hash is in the final report (a commit cannot contain its own hash).

## Testing

### Commands run
- `npm run compile`: exit 0 (strict).
- `npm run test:unit`: 12 files, 188 tests passed, 0 failed (156 existing plus 32 new).
- `npm run test:ui` and `npm run test:integration`: not applicable (do not exist yet).

### Tests added
`test/unit/applyHunks.test.ts` (32 tests): none accepted gives original; all accepted gives proposed; partial accept keeps other hunks' original lines; reject and pending not applied; pure insert; pure delete; new file (empty original); empty new file stays empty unaccepted; delete whole content; keys of another path ignored; overlapping, out-of-order, and past-the-end hunks throw; inputs not mutated; round trip over 9 original/proposed pairs (accept all gives proposed, accept none gives original).

### Not verified
`src/review/hunkReview.ts` needs the VS Code host and is untested here. Needs a manual check in the Extension Development Host: modal confirmation (cancel then retry), freshness skip, dirty-document skip, new file in a nested folder, undo per file, session end after write.

### Verdict
PASS (for the pure logic). No bugs found in `applyAcceptedHunks`.
