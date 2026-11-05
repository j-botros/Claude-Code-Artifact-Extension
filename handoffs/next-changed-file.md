# Handoff: next-changed-file

## Brief (core agent)

**Goal.** While an Implement the Design review is open, show a status bar item at the bottom of the IDE window, labelled `Next change (N)`, where N is the number of files in the review that still have a pending hunk (a hunk with no Accept or Reject decision). Each click opens the next file with a pending hunk, in plan order, and the next click moves on to the one after it. The owner asked for a button at the bottom of the file, and a status bar item was chosen because it stays visible in every file.

**Visibility rule (core agent's choice).** The item is shown only while a review session exists (started by Implement the Design from a plan with `proposedFiles`). It is hidden when there is no session, including after Apply accepted writes files and ends the session. When N is 0 the item still shows, and clicking it shows the information message "No pending changes to review." (no file is opened).

**Cycle rule (core agent's choice, fixed).**
- Order: the plan order of the session's files (the order of `session.files`).
- Candidates: only files with at least one pending hunk.
- Start point: the file of the active editor, if that editor is one of the session's inline review documents. Otherwise start from the beginning.
- Result: the first candidate after the start point in order, wrapping around to the beginning. The start file itself is returned only when it is the only candidate.
- The file is opened as the review opens files: `vscode.window.showTextDocument(file.uri, { preview: false })`.

**Where the logic lives.**
- Pure functions in a new module, `src/plan/nextChange.ts`, with no VS Code import. Suggested exports: a function that lists the pending paths in order from a path list and a set of decided hunk keys, and a function that picks the next path from the ordered pending list and the current path. Both must be unit-testable without VS Code.
- `src/review/hunkReview.ts` owns the session. Export what the status bar and the command need (for example a function that returns the pending count, and a function that opens the next pending file). Keep the session module-private otherwise.
- The status bar item and the command `claudeArtifact.nextChange` are created and registered in the review module's registration path (`registerHunkReview`) or in `src/extension.ts`, whichever is simpler. The item is created once, shown and hidden by the session state, refreshed whenever the session changes (start, each accept or reject decision, Apply, and session end), and disposed in the existing dispose path.
- Command: `claudeArtifact.nextChange`. Contributing it in `package.json` (`contributes.commands`) is optional. If you add it, use the title "Claude Artifact: Next Change". Do not change any existing command, activation event, or keybinding.

**Scope: files the developer may edit.**
- `src/plan/nextChange.ts` (new, pure).
- `src/review/hunkReview.ts`.
- `src/extension.ts`, only if the command or status bar item is registered there.
- `package.json`, only to add the `contributes.commands` entry for `claudeArtifact.nextChange`, if you choose to add it.
- A doc comment on every new function and class. Strict TypeScript.

Do not edit `test/`, `README.md`, `TASKS.md`, `STATUS.md`, `CLAUDE.md`, or `handoffs/` except the Development section below.

**Behaviour that must not change.**
- Accept and Reject lens titles and commands (`claudeArtifact.acceptHunk`, `claudeArtifact.rejectHunk`) and their arguments.
- Decision markers, line backgrounds, overview ruler colours, and inline document text.
- Decisions, the Apply path, its confirmation, the `confirmedThisSession` flag, and `implement-apply` behaviour.
- The `resetApplyConfirmationForTests` export.

**Developer task.**
1. Add `src/plan/nextChange.ts` with the pure rules above.
2. In `src/review/hunkReview.ts`, add the status bar item and the `claudeArtifact.nextChange` command, and refresh the item at each session change.
3. Record in Development: which functions you added and where the item is registered, whether `package.json` changed, and what you did not verify (a real status bar in VS Code or Antigravity).

**Tester task.**
- Unit tests in `test/unit/nextChange.test.ts` for the pure rules. Cover: the count with no decisions, with some decided, and with all decided (0); the cycle order with several pending files; wrap-around from the last file to the first; a start file that is not in the list; a start file that is the only pending file; a start file that is decided and so not a candidate.
- Integration test in `test/integration/nextChange.test.ts`, following `test/integration/decisionMarkers.test.ts` and `test/integration/applyFlows.test.ts`. Use a temporary workspace under `out-test/` (CLAUDE.md Section 7 bans writes outside the repo). Start a review with at least two files that have hunks. Check: the status bar item is shown with "Next change (2)"; the command opens the first file, then the second, then the first again; accepting every hunk of one file drops the count to 1; Apply ends the session and hides the item. If a status bar spy is needed, wrap `vscode.window.createStatusBarItem` the way the existing tests wrap decoration types, and record that the check is by spy.
- Confirm that the Accept and Reject lens titles are unchanged.

**Definition of done.**
- The status bar item shows only during a review session, with the count of files that have pending hunks, and each click cycles through them in plan order.
- Unit and integration tests cover the rules above.
- `npm run compile`, `npm run test:unit`, `npm run test:ui`, and `npm test` pass.
- Owner check in Antigravity is not done here. Record it as not verified.

**Test commands.** `npm run compile`, `npm run test:unit`, `npm run test:ui`, `npm test`.

**Attribution.** Commit messages end with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Not in scope.** Changing the lens layout, a button inside the editor, the minimap, CLAUDE.md, the README (the core agent updates it), and any change to Apply behaviour.

## Development

**Changed files.** `src/plan/nextChange.ts` (new, pure, no VS Code import) and `src/review/hunkReview.ts`. `package.json` was NOT changed (the command contribution was optional, and `acceptHunk` and the other review commands are not contributed either). `src/extension.ts` was not changed.

**Pure functions (`src/plan/nextChange.ts`).**
- `listPendingPaths(files: {path, hunkCount}[], decidedKeys: ReadonlySet<string>): string[]`. A path is pending if any key `"<path>#<i>"` for `i < hunkCount` is not in `decidedKeys`. Keeps the input order.
- `pickNextPath(allPaths, pending, current): string | undefined`. `allPaths` is the full plan order (needed so a decided start file still has a position). Starts after `current` (or at the beginning when `current` is undefined or not in `allPaths`), wraps, returns the first path in `pending`. Returns `current` only if it is the only candidate. Returns undefined when `pending` is empty.

**Review module (`src/review/hunkReview.ts`).**
- Exports `pendingFileCount()` and `openNextChange()`. Private `pendingPaths()` and `refreshNextChangeItem()`.
- The status bar item (`createStatusBarItem(Left, 100)`, text `Next change (N)`, command `claudeArtifact.nextChange`) is created once in `registerHunkReview`, and pushed to `context.subscriptions` together with the registered command `claudeArtifact.nextChange`.
- It is refreshed (shown with the count, or hidden with no session) at session start in `startImplementReview`, after each decision in `decide`, and when Apply ends the session in `applyAccepted`. It starts hidden.
- `openNextChange` uses the active editor's file if it is a review document, picks via `pickNextPath`, and opens with `showTextDocument(uri, { preview: false })`. With nothing pending it shows the information message "No pending changes to review."
- Lens titles, commands, markers, decorations, Apply path, `confirmedThisSession`, and `resetApplyConfirmationForTests` are untouched.

**Checks.** `npm run compile` passes. I did not run the tests (the tester owns them).

**Not verified.** A real status bar in VS Code or Antigravity, the item's position and visibility in the UI, and the click behaviour. The status bar item is `Left`, priority 100, which is my choice.

## Testing

(to be filled by the tester)
