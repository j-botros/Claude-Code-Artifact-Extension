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

## Testing (tester)
