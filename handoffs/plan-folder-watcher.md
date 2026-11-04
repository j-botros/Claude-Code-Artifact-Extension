# Handoff: plan-folder-watcher

## Brief (core agent)

- **Goal:** The extension watches the workspace's `.claude/plans/*.json` and opens the artifact when a new or changed plan file appears. So `/design-plan` (merged in PR #91) shows the plan without a manual step.
  - Files the extension writes itself (edit saves, and the sample plan if it is ever written) must not reopen the artifact. Record the content hash of each save, and skip a change whose content matches a recorded hash.
  - Parse each file with `parsePlanJson` (it accepts fenced or unfenced JSON). If the JSON is invalid, show one warning message with the file name, and do not open or close any panel.
  - Only one watcher per workspace. Dispose it on deactivate (push it onto `context.subscriptions`).
  - Put the decision logic in a pure function (no `vscode` import) and unit-test it. The decision covers: a new file, a file the extension saved itself, and invalid JSON.
- **Branch:** `task/plan-folder-watcher` (from `origin/dev`). Already created.
- **Scope (files the developer may edit):**
  - `src/plan/planWatch.ts`: new file. The pure decision logic and the own-save hash record. No `vscode` import.
  - `src/extension.ts`: create the watcher in `activate`, open the plan through the existing `PlanPanel.show(plan, reviewPlan, implementPlan)`, and dispose on deactivate.
  - `src/webview/planPanel.ts`: only the save path (the `save` method that writes `.claude/plans/<name>`, near line 1437). Record each saved file's hash with the function from `planWatch.ts` before the write. Do not change anything else in this file.
  - `package.json`: `activationEvents` only. Add `onStartupFinished`, so the watcher runs without a command. Do not change anything else.
- **Out of scope:** `README.md`, `TASKS.md`, `STATUS.md`, `handoffs/` other than your own section, and everything under `test/`. The tester owns `test/`. The core agent updates the README.
- **Definition of done:**
  1. `planWatch.ts` exports a pure decision function. Its input is the file content, its hash, and the set of recorded own-save hashes. Its outputs are: open the plan, skip because the extension wrote it, or warn because the JSON is invalid. Include the parse result in the open case, so the caller does not parse twice.
  2. `planWatch.ts` exports a function that records a hash of content the extension is about to write. The hash is SHA-256 of the exact text written, from Node's `crypto`.
  3. The watcher uses `vscode.workspace.createFileSystemWatcher` with a `RelativePattern` on the first workspace folder, pattern `.claude/plans/*.json`. It reacts to create and change events. There is one watcher per activation.
  4. A skipped own-save does not open the panel, and does not clear the record. Keep a record only as long as the session.
  5. `npm run compile` passes. Run `npm run test:unit` and fix anything your change broke.
  6. Commit on the task branch with the trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. Then add your "Development" section to `handoffs/plan-folder-watcher.md` with the Edit tool.
- **Tests (the tester writes them, not you):**
  - Unit: the decision function, for a new file, an own save, and invalid JSON.
  - Integration: write a valid plan file into a temporary workspace, check the artifact opens. Then write the same content through the extension's save path, and check it does not open again.
- **Test commands:**
  - `npm run compile`
  - `npm run test:unit`
- **Stop and report** (do not work around it) if:
  - the watcher needs a file outside your scope.
  - `onStartupFinished` is not accepted by the engine version in `package.json` (`^1.107.0`). Report it; do not pick another event.
  - the save path cannot record the hash without a bigger change to `planPanel.ts` than the one function call. Report it.
- **Owner check not run here:** whether the artifact opens in Antigravity when a plan file appears. Record in the Development section that it was not tested in this run.

## Development (developer)

**Changed**
- `src/plan/planWatch.ts` (new, no `vscode` import): `decidePlanFile(content, hash, ownHashes)` returns `open` (with the parsed plan), `skip` (hash is an own save; the record is kept), or `warn` (invalid JSON, with the error). Also `hashText` (SHA-256 hex via Node `crypto`), `recordOwnSave(text)`, and `getOwnSaveHashes()`. The record lives for the session.
- `src/extension.ts`: `watchPlanFolder` creates one `createFileSystemWatcher` with a `RelativePattern` on the first workspace folder, `.claude/plans/*.json`, on create and change. The watcher and listeners are pushed onto `context.subscriptions`. `handlePlanFile` reads the file, calls `decidePlanFile`, opens through `PlanPanel.show(plan, reviewPlan, implementPlan)`, or shows one warning with the file name. Invalid JSON touches no panel.
- `src/webview/planPanel.ts`: `save` only. It builds the text once and calls `recordOwnSave(text)` before the write; the written bytes are the same text.
- `package.json`: added `activationEvents: ["onStartupFinished"]` (there was no such field before). Nothing else.

**Tests passed:** `npm run compile` OK. `npm run test:unit`: 23 files, 374 tests passed. No tests added (the tester owns `test/`).

**Not run:** the owner check in Antigravity (does the artifact open when a plan file appears) was not tested in this run. Integration tests were not run.

**Tester should check**
- Unit: `decidePlanFile` for a new valid file (open), a matching own hash (skip), fenced JSON (open), invalid JSON (warn).
- Integration: write a valid plan into `.claude/plans/`, check the panel opens; then save the same content through the panel's save path and check it does not open again; write invalid JSON and check one warning and no panel change.
- Known limit: an edit by the panel that changes a plan back to previously saved content is skipped (hash stays recorded for the session), as the brief specifies.

## Testing (tester)

**Verdict: PASS**

**Test files**
- `test/unit/planWatch.test.ts` (7 tests): `decidePlanFile` for new file (open, parsed plan), own-save hash (skip, record kept), invalid JSON (warn with error), fenced JSON (open), unrelated hash (open); `hashText` same/different/64-hex; `recordOwnSave` then `getOwnSaveHashes`.
- `test/integration/planWatcher.test.ts` (2 tests), real watcher in the Extension Development Host: (1) writing a valid plan to `.claude/plans/` opens the webview tab; after closing it, `recordOwnSave(text)` plus writing the same text (the same two steps as `PlanPanel.save`) opens no tab within 3 s; (2) invalid JSON gives exactly one warning naming `watcher-bad.json` and no webview tab.

**Commands and counts**
- `npm run compile`: OK.
- `npm run test:unit`: 24 files, 381 tests passed.
- `npm test`: unit 381 passed; ui 128 passed; integration 35 passing, 0 failing (includes the 2 new tests).

**Not verified**
- The own-save case calls `recordOwnSave` and writes the file directly. It does not click Save in the webview, so the call inside `PlanPanel.save` is not exercised end to end.
- Not run in Antigravity (owner check).
- The "no reopen" check is a 3 s wait, so a very late event would be missed.
