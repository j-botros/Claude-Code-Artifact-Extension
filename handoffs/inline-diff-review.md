# Handoff: inline-diff-review

## Brief (core agent)

**Goal.** Replace the side-by-side review in `src/review/hunkReview.ts` (which opens `vscode.diff` tabs) with an inline review, as Antigravity does. Each proposed hunk shows in place: added lines green, removed lines red. Above each hunk a CodeLens line reads `✓ Accept` and `✗ Reject`, and each one decides that hunk only. A new file shows as a new editor with every line green. Nothing is written until the user runs Apply accepted. The apply path is unchanged.

**Branch.** `task/inline-diff-review-2`. The old `task/inline-diff-review` name is held by a stale branch at the queue commit `443ead4`, already merged. Commit all work on `task/inline-diff-review-2`. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/review/hunkReview.ts`
- `src/plan/` for a new pure module (for example `src/plan/inlineReview.ts`) holding the hunk-to-line mapping and decoration ranges. No VS Code imports in that module.
- `handoffs/inline-diff-review.md`: the "Development" section only.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, or `package.json`. If you need a file outside this scope, stop and report it.

**Design decision (core agent), read this first.** The owner's text says "open the real file, not a diff editor". Added lines cannot be shown inside the real file without changing its text, either on disk or in its buffer. Changing the buffer would make it dirty and put the edit on the undo stack, which breaks the "nothing is written" rule. So:
- The review opens a **read-only inline document** with a virtual scheme (for example `claude-artifact-inline`). Its path and file name are the real file's, so the tab title and the language match the real file. The real file is never opened for editing, never changed, and never read for writing.
- Its text is built from the hunks, in place: unchanged lines are plain; each hunk's removed lines (from the original) are kept and shown red; each hunk's added lines (from the proposed text) are shown green directly after them.
- A **rejected** hunk shows its original lines plain and omits its added lines. An accepted or pending hunk shows both as above. Rebuilding the text on a decision change is allowed; fire the content provider's change event for that URI.
- For a **new file** (not in the workspace), the inline document is the proposed text, every line green.
- The old `ORIGINAL_SCHEME` and `PROPOSED_SCHEME` documents and the `vscode.diff` call are removed. A new virtual scheme replaces them.
- The core agent will report this choice to the owner in STATUS.md. The owner can ask for a different design.

**Requirements.**
1. Remove every `vscode.diff` call from `src/review/hunkReview.ts`. Open each reviewed file with `vscode.window.showTextDocument` on the inline document (preview off, so one tab per file).
2. Map each hunk to line ranges in the inline document: the removed range (red) and the added range (green). Keep the mapping in the pure module and unit-test it through the tester.
3. Decorations: use `isWholeLine` decorations with the existing theme colours (`diffEditor.insertedLineBackground` and `diffEditor.removedLineBackground`) or other existing ThemeColors. Do not add colour literals in `src/review/`.
4. CodeLens: above each hunk's first line, `✓ Accept` and `✗ Reject` (titles may show `✓ Accepted` or `✗ Rejected` after a decision, as today). Each lens calls `claudeArtifact.acceptHunk` or `claudeArtifact.rejectHunk` with `{ sessionId, key }`, as today. Keep the Apply lens and `claudeArtifact.applyAccepted` as they are.
5. `decide` changes the decision for one hunk only, refreshes the lenses, the decorations, and the inline text, and writes nothing.
6. **Keep unchanged:** `writeOneFile`, `applyAccepted`, the confirmation, the freshness and unsaved-changes checks, the per-file results, `applyAcceptedHunks` in `src/plan/applyHunks.ts`, the session-end rules, `resetApplyConfirmationForTests`, and the `startImplementReview` signature and return value. `startImplementReview` must still return `{ ok, message }` and never throw.
7. The apply path reads `file.originalText` and the hunks, as today. It must not read the inline document.
8. Every new function and class gets a doc comment. TypeScript strict mode. No new dependencies.

**Constraints.**
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: one command per call. No `&&`, `;`, or `|`. Use only allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- Requirements 1 to 8 are applied.
- `npm run compile` passes.
- `npm run test:unit` passes after the tester's changes. Before the tester runs, list any old assertions the change breaks in the Development section, but do not edit `test/`.

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- Unit: the hunk-to-line mapping in the new pure module (added and removed ranges, a new file, a rejected hunk, multiple hunks, the position after an earlier hunk shifts lines).
- Integration (VS Code 1.107.0 test host):
  - `startImplementReview` opens the inline document, with no `vscode.diff` call (spy on `executeCommand`).
  - The inline document's text contains the added and removed lines of each pending hunk.
  - Accept and Reject change the decision for one hunk only, and the other hunks are unchanged.
  - Apply accepted still writes only accepted hunks (the existing `applyFlows` cases pass unchanged apart from the diff-tab assertions, which the tester updates).
  - A new file opens with every line green.
- Do not add a UI test that needs a real VS Code window.

## Development (developer)

Commit: d18c2d6 on `task/inline-diff-review-2`.

**What changed**
- `src/plan/inlineReview.ts` (new, pure, no VS Code imports). Exports:
  - `LineSpan { start, count }` (zero-based first line, line count).
  - `InlineHunkRange { index, firstLine, removed: LineSpan | null, added: LineSpan | null }`.
  - `InlineView { text, hunks: InlineHunkRange[] }`.
  - `buildInlineView(originalText, hunks: DiffHunk[], rejected: ReadonlySet<number>): InlineView`. Unchanged lines plain; for a non-rejected hunk, old lines (removed span) then new lines (added span); for a rejected hunk, old lines only, both spans null, `firstLine` still set. An empty original (new file) gives the proposed text with one added span. Spans already account for the shift from earlier hunks.
- `src/review/hunkReview.ts`:
  - `ORIGINAL_SCHEME` and `PROPOSED_SCHEME` replaced by one `INLINE_SCHEME = "claude-artifact-inline"`. URI path is `/<real path>`, query `session=<id>`.
  - `ReviewFile` now has `isNew` and `uri`; `proposedText`, `newStarts`, `leftUri`, `rightUri` removed. `writeOneFile` uses `file.isNew` (was the scheme check). The rest of the apply path is untouched.
  - `startImplementReview` opens each file with `showTextDocument(uri, { preview: false })`; no `vscode.diff`. Signature and return value unchanged.
  - `SessionContentProvider` builds text from `buildInlineView` using current decisions and has an `onDidChange` emitter (`contentChanged`), fired by `decide` for the file of the decided hunk.
  - Decorations and lenses use the view's spans and `firstLine`. Same theme colours as before. Lens commands and args unchanged. Added an `onDidChangeTextDocument` listener (inline scheme only) to repaint after a rebuild.

**Tests run:** `npm run compile` passes. `npm run test:unit`: 17 files, 272 tests pass. Integration and UI not run (tester's job).

**Old assertions that break:** none in unit tests. Integration tests (`applyFlows` etc.) that assert diff tabs or the `claude-artifact-proposed` / `claude-artifact-original` schemes will break; I did not read or edit them.

**Departures from the brief:** none. Note that a rejected hunk's lens position is its first original line, and a pure-insert hunk's lens sits on its first added line.

**Tester should check**
- `buildInlineView`: removed/added spans, new file, rejected hunk, multiple hunks and shifted positions, pure insert and pure delete.
- Integration: inline doc opens with no `vscode.diff`; text contains removed and added lines; accept/reject affect one hunk; text drops added lines after reject (the document reload is asynchronous, so wait for it); apply writes only accepted hunks.

## Testing (tester)

**Commands run:** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`.

**Results**
- Unit: 18 files, 284 tests passed, 0 failed (new `test/unit/inlineReview.test.ts`, 12 tests: replace, pure insert, pure delete, multi-line spans, new file, rejected hunk, two hunks with line shift, reject earlier moves later hunk up, reject later leaves earlier spans, all rejected, trailing newline).
- UI: 75 passed, 0 failed.
- Integration (VS Code 1.107.0): 33 passed, 0 failed.

**Test changes**
- `test/integration/extension.test.ts`: the "diff review" case (it looked for a `TabInputTextDiff`, which my first grep missed) now expects an inline tab on `claude-artifact-inline`, no diff tab, and lenses on the inline URI. Renamed.
- `test/integration/implementFlow.test.ts`: diff-tab helpers replaced by inline-tab helpers; asserts no diff tab.
- `test/integration/applyFlows.test.ts`: `lensesFor` now uses the `claude-artifact-inline` scheme. New cases: no `vscode.diff` call (spy on `executeCommand`), one inline tab titled with the real name, real file not opened and unchanged; inline text holds removed then added lines of both pending hunks; reject of hunk 1 drops only its added lines and sets only its lens title, accept changes no text and writes nothing; new file inline text equals the proposal with one hunk lens at line 0 and nothing created on disk. All existing Apply cases pass unchanged.

**Limits:** decoration colours cannot be read through the VS Code API, so "every line green" for a new file is verified through the pure mapping (added span covers all lines, unit test) plus the inline text and lens in the host.

**Failing output:** none. 

**Verdict: PASS**
