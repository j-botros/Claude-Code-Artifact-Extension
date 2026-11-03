# Handoff: e2e-apply

## Brief (core agent)

- **Goal:** Integration tests in `@vscode/test-cli` for Apply accepted (the `claudeArtifact.applyAccepted` path) in a temporary workspace. Stub the confirmation, accept some hunks and reject others, then check on disk that only accepted hunks were written and rejected hunks are untouched. Check that the session ends after a write.
- **Branch:** `task/e2e-apply` (from `origin/dev`). Already created.
- **Current state to know:**
  - `src/review/hunkReview.ts`:
    - `startImplementReview(plan, folder)` is exported. It reads each `proposedFiles` entry from `folder`, splits hunks, creates a new session, and opens the `vscode.diff` editors. Files that are not found on disk are treated as new (`leftUri` uses scheme `claude-artifact-original`). The proposed side uses scheme `claude-artifact-proposed`.
    - The session id is not exported. Get it from the CodeLens command arguments: `vscode.executeCodeLensProvider` on a proposed document (`claude-artifact-proposed:/<path>?session=<id>`) returns lenses whose `command.arguments[0]` is `{ sessionId, key }`, with `key` = `<path>#<hunkIndex>`. Accept and reject are `claudeArtifact.acceptHunk` and `claudeArtifact.rejectHunk`, called with that same argument.
    - `applyAccepted` (command `claudeArtifact.applyAccepted`, argument `{ sessionId }`):
      - Returns silently if there is no session or the id does not match.
      - Shows a modal `vscode.window.showWarningMessage` with the text "Write the accepted hunks to these files in your workspace?" and the button "Apply". Stub this.
      - Sets the module flag `confirmedThisSession = true` only after "Apply" is chosen. The flag persists for the whole test host, so later tests would not see the prompt.
      - Calls `writeOneFile` for each file that has an accepted hunk. Skips a file when: it is unsafe or outside the folder; it is open and dirty; the file changed on disk since review (`changed since review`); or it has no accepted hunks.
      - Writes with `WorkspaceEdit`, then saves the document.
      - Reports results with `vscode.window.showInformationMessage`, one line per file, in the form `<path>: wrote N hunk(s)` or `<path>: <status> (<detail>)`.
      - After at least one file is written, sets `session = undefined`. A second apply with the old id does nothing.
    - Nothing else writes files. `decide` changes only in-memory decisions.
  - `test/integration/planFlows.test.ts` and `test/integration/extension.test.ts` show the test pattern: load `src` modules from `out/` with `require(path.resolve(__dirname, "../../../out/..."))`, and install and restore stubs per test. Look at `planFlows.test.ts` first.
  - Unit tests for the pure hunk logic are in `test/unit/applyHunks.test.ts`. Do not duplicate them.
  - `.vscode-test.mjs` runs `out-test/test/integration/**/*.test.js` in VS Code 1.107.0. The integration workspace folder is `test-results/integration-workspace`. `out/`, `out-test/`, and `test-results/` are gitignored.
- **Scope (files you may edit):**
  - Developer: `src/review/hunkReview.ts` only. Add one test seam (see below). No behaviour change.
  - Tester: `test/integration/` only: a new file, for example `test/integration/applyFlows.test.ts`. Do not edit `src/`, `package.json`, `.vscode-test.mjs`, `TASKS.md`, `STATUS.md`, `README.md`, or `handoffs/` (except the Testing section).
- **Developer requirements (src):**
  1. Add an exported seam in `src/review/hunkReview.ts`: `export function resetApplyConfirmationForTests(): void`. It sets `confirmedThisSession = false` and nothing else. Document it as "read by integration tests; the extension does not use it".
  2. Run `npm run compile` and `npm run test:unit`. Both must pass. Do not add tests. The tester writes them.
- **Tester requirements (test/integration):**
  1. Use a temporary workspace inside the repository, not the OS temp directory (CLAUDE.md, Section 7: never read or write outside the repo). Use `path.resolve(__dirname, "../../..", "out-test", "apply-workspace", <case>)`. Create it per test, and delete it in teardown with `fs.rmSync(dir, { recursive: true, force: true })`. Make sure the path is under the repo root before deleting.
  2. Before each test, call `resetApplyConfirmationForTests()` and close all open editors (`vscode.commands.executeCommand("workbench.action.closeAllEditors")`). This keeps the run independent of test order.
  3. Stub `vscode.window.showWarningMessage` (records calls, returns `"Apply"` or `undefined`), `vscode.window.showInformationMessage` (records calls), and `vscode.window.showErrorMessage` (records calls). Restore all three in teardown.
  4. Write the existing files first (real files, not new ones), then call `startImplementReview(plan, folder)`. Build the plan with `JSON.stringify`-ready objects that match the `Plan` type in `src/plan/plan.ts`. Each file's `content` must have at least two separated hunks, so the test can accept one and reject the other.
  5. Get `sessionId` and each hunk `key` from the CodeLens arguments (see Current state), not by guessing.
- **Cases to cover (minimum):**
  1. **Accept some, reject some (one file):** Accept hunk 0, reject hunk 1, run `claudeArtifact.applyAccepted`. Check the confirmation was shown once (modal true). On disk, hunk 0 is applied and hunk 1's original lines are unchanged. Assert the full file contents exactly.
  2. **Multiple files:** Two files. One has accepted hunks. The other has all hunks rejected. The rejected file is untouched on disk, and the info message has no line for it.
  3. **New file:** a `proposedFiles` path that does not exist. Accept its hunk. The file is created with the accepted content. Check the parent directory is created when the path has a folder.
  4. **Confirmation cancelled:** The warning stub returns `undefined`. Nothing is written. A second apply in the same session prompts again.
  5. **Session ends after a write:** After case 1, run `claudeArtifact.applyAccepted` again with the same `sessionId` and check: no confirmation prompt, no change on disk. Also check that `claudeArtifact.acceptHunk` with the old argument does not change anything.
  6. **Changed since review:** Write new text to a reviewed file after `startImplementReview` and before apply. Apply. The file keeps the new text, and the info message says `changed since review`.
  7. **Confirmation remembered:** After one successful apply, start a new review in the same test and apply again. The confirmation is not shown a second time in that host.
- **Definition of done:**
  1. Developer: the seam is in place. `npm run compile` and `npm run test:unit` pass. No behaviour change.
  2. Tester: the integration tests pass in the VS Code 1.107.0 host through `npm run test:integration`. The existing integration tests still pass.
  3. `npm test` passes (unit, UI, integration).
  4. No file outside `src/review/hunkReview.ts` and `test/integration/` is changed. Temp workspaces exist only under `out-test/` and are cleaned up.
- **Stop and report** (do not work around it) if:
  - a test needs a change to `package.json`, `.vscode-test.mjs`, or `src/` beyond the seam
  - `showWarningMessage` cannot be stubbed in the extension host (report the error)
  - the CodeLens arguments do not carry `sessionId` and `key` (report what you saw)
- **Test commands:**
  - Developer: `npm run compile`, `npm run test:unit`
  - Tester: `npm run compile`, `npm run test:unit`, `npm run test:integration`, then `npm test`
- **Notes for the README (core agent will write it, not you):** the stub-based tests cover control flow and disk results in a temp workspace. They do not prove the owner's real Antigravity run (`antigravity-test-2`).

## Development (developer)

**What changed:** In `src/review/hunkReview.ts` I added the exported seam `resetApplyConfirmationForTests(): void`, placed right after the `confirmedThisSession` declaration. It sets `confirmedThisSession = false` and nothing else. Its doc comment says integration tests read it and the extension does not use it. No behaviour change.

**Results:**
- `npm run compile`: passed (no errors).
- `npm run test:unit`: passed, 14 files, 214 tests.

**Unsure:** Nothing. The seam does not touch `applying` or `session`, as the brief asked.

**Tester should check:** the seam is reachable from `out/review/hunkReview.js` via `require`, and that calling it makes the next `claudeArtifact.applyAccepted` show the modal again.

## Testing (tester)

**Verdict: PASS**

**File added:** `test/integration/applyFlows.test.ts` (7 cases). No changes to `src/`, `package.json`, or `.vscode-test.mjs`.

**Commands run:**
- `npm run compile`: passed.
- `npm run test:unit`: 14 files, 214 tests passed.
- `npm run test:integration` (VS Code 1.107.0): 21 passing, 0 failing (14 existing + 7 new).
- `npm test`: unit 214 passed, UI 4 passed, integration 21 passed.

**Cases (all pass):**
1. Accept hunk 0, reject hunk 1: modal shown once (text, `modal: true`, button "Apply"); file equals the original with only line 2 changed; info is `a.txt: wrote 1 hunk`.
2. Multiple files: `one.txt` fully accepted and written; `two.txt` all rejected, byte-identical; the single info message has no `two.txt` line.
3. New file `newdir/sub/n.txt`: parent folders created, content exact.
4. Confirmation cancelled: nothing written, no info message, the second apply prompts again (2 prompts), then "Apply" writes (3 prompts).
5. Session ends after a write: a second apply with the same id (even after the seam reset) shows no prompt and no message and does not change the disk; `acceptHunk` with the old argument followed by apply changes nothing.
6. Changed since review: the file keeps the on-disk edit; info contains `a.txt: skipped (changed since review)`.
7. Confirmation remembered: a second review and apply in the same test shows no second prompt; the file ends with the second proposal.

**How it works:** `sessionId` and hunk `key` values come from the CodeLens arguments of `vscode.executeCodeLensProvider` (confirmed to carry `{ sessionId, key }`). Workspaces are `out-test/apply-workspace/case-N`, with a path check before every delete; they are removed in teardown and in suiteTeardown. `showWarningMessage`, `showInformationMessage`, and `showErrorMessage` are stubbed and restored per test. The seam `resetApplyConfirmationForTests()` is called before each test and works from `out/review/hunkReview.js`.

**Test-side note:** with several files, VS Code keeps only the last diff document open, so the helper builds each file's proposed URI from the newest open session id and opens it itself. This is not a bug in `src/`.

**Not verified:** Real Antigravity behaviour (`antigravity-test-2`); the real modal dialog; the dirty-open-file skip path (not in the brief's required cases); the notification progress UI.
