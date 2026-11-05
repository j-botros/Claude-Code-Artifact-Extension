# Handoff: design-plan-proposed-files

## Brief (core agent)

- **Goal:** `proposedFiles` is present whenever `files` lists a change. Owner report (2026-11-05): a one-line comment plan listed `src/plan/codeTokens.ts` in Files, but had no `proposedFiles`, so Implement the Design said "This plan has no proposed files". The cause: the plan prompt and `/design-plan` say to omit `proposedFiles` when no file contents are proposed, so the model skipped it.
  - New rule (prompt text): include `proposedFiles` for every path in `files` (the format has no delete marker, so every path counts), with the full new content of that file. Omit `proposedFiles` only when `files` is empty.
  - When `files` is non-empty but `proposedFiles` is missing or empty, Implement the Design must show the cause, not the generic message.
- **Branch:** `task/design-plan-proposed-files` (from `origin/dev`). Already checked out.
- **Scope (files the developer may edit):**
  - `src/plan/planPrompt.ts`: the `proposedFiles` line in `SHAPE_RULES` (the shared rule for the plan prompt and the review prompt). Change it to the new rule.
  - `.claude/commands/design-plan.md`: the `proposedFiles` bullet (line 24) to the same new rule. Note: the core agent's edit to this file was denied by the runner's permissions. If your edit is denied too, do not retry. Report it in the Development section.
  - `src/review/hunkReview.ts`: the `startImplementReview` early return (currently line 155, message "This plan has no proposed files."). Replace the message with `noProposedFilesMessage(plan)`, imported from `../plan/noProposedFiles`. Keep `ok: false`.
  - `src/plan/noProposedFiles.ts`: ALREADY EXISTS, untracked. The core agent created it. It exports the pure function `noProposedFilesMessage(plan: Plan): string`. Use it as written, unless it has a real error. If you change it, say so.
- **Out of scope:**
  - `test/` (the tester owns it). Do not add tests.
  - `CLAUDE.md`: Section 3 still says "omit the field when no files are proposed". The core agent will flag this to the owner. Do not edit it.
  - `README.md`, `TASKS.md`, `STATUS.md`, and any handoff section except your own.
  - Everything else in `src/`.
- **Definition of done:**
  1. `planPrompt.ts` `SHAPE_RULES` and `design-plan.md` both state the new rule (every path in `files`, full content, omit only when `files` is empty).
  2. `startImplementReview` returns `noProposedFilesMessage(plan)` for the no-proposedFiles case. For a plan with an empty `files` array the text is still "This plan has no proposed files."
  3. `npm run compile` passes.
  4. `npm run test:unit` runs. Fix anything your change broke in `src/`. Tests that assert the old wording belong to the tester: list them in your report. Do not edit `test/`.
  5. Commit on the task branch with the trailer `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. Then add your "Development" section to `handoffs/design-plan-proposed-files.md` with the Edit tool.
- **Tests (the tester writes them, not you):**
  - Unit: `noProposedFilesMessage` for files non-empty (cause message) and files empty (generic message). The prompt text states the new rule in both `buildPlanPrompt` and `buildReviewPrompt`. The command file names every required field and the new rule.
  - Integration: `test/integration/implementFlow.test.ts` line 131 asserts the message is not the generic one. It may need no change.
- **Test commands:**
  - `npm run compile`
  - `npm run test:unit`
- **Stop and report** (do not work around it) if:
  - the change needs a file outside your scope;
  - `design-plan.md` edits are denied (report it; do not retry);
  - the unit tests fail in a way that needs a `test/` change to fix.
- **Owner check not run here:** the owner reports it runs `/design-plan` in Antigravity and clicks Implement the Design. Record in the Development section that this was not tested in this run.
- **Not for this run:** the owner also asked for the Implement the Design message to appear in Antigravity. That is the owner's check.

## Development (developer)

Commit: 4be3403 on `task/design-plan-proposed-files`.

What changed:
- `src/plan/planPrompt.ts`: the `proposedFiles` line in `SHAPE_RULES` now says to include it for every path in "files" with the full new content (the format has no delete marker), and to omit it only when "files" is empty.
- `src/review/hunkReview.ts`: `startImplementReview` returns `noProposedFilesMessage(plan)` (imported from `../plan/noProposedFiles`) with `ok: false`.
- `src/plan/noProposedFiles.ts`: committed as written by the core agent, unchanged.

Not done (blocked):
- `.claude/commands/design-plan.md` line 24: my Edit was denied by the runner's permissions. I did not retry or work around it. The core agent or owner needs to apply the same wording as `SHAPE_RULES`: `(optional; include it for every path in "files", with the full new content of that file, because the format has no delete marker so every path counts; omit it only when "files" is empty)`.

Tests:
- `npm run compile`: passed.
- `npm run test:unit`: 24 files, 381 tests, all passed. No tests in `test/` fail on the old wording.

For the tester:
- Unit: `noProposedFilesMessage` with files non-empty (cause message) and files empty ("This plan has no proposed files."); the new rule appears in `buildPlanPrompt` and `buildReviewPrompt`; the command file states the new rule once the edit is applied.
- Integration: `test/integration/implementFlow.test.ts` line 131 was not run here.

Not tested in this run: the owner check of `/design-plan` in Antigravity followed by Implement the Design.

Note: the brief asked for the trailer `Co-Authored-By: Claude Haiku 5.5`; I used it as written.

## Testing (tester)

Added `test/unit/noProposedFiles.test.ts` (9 tests). No existing test needed updating: the old tests check only `"proposedFiles" (optional`, which the new wording keeps.

Commands run:
- `npm run compile`: passed.
- `npm run test:unit`: 25 files, 390 tests: 388 passed, 2 failed.
- `npm run test:ui` and `npm run test:integration`: not run (shell rules for this run allow only compile and unit tests).

Passing: `noProposedFilesMessage` (files non-empty gives the cause message; files empty gives "This plan has no proposed files."); `buildPlanPrompt` and `buildReviewPrompt` each state "include it for every path in "files"", "full new content of that file", and "omit it only when "files" is empty", and no longer say "proposes no file contents".

Failing (both caused by the denied edit to `.claude/commands/design-plan.md`, which still says `omit it when the plan proposes no file contents`):
- `/design-plan command file states the proposedFiles rule > says include for every path in files, with full content, omit only when files is empty`: `expected '---\ndescription: Design a change and…' to match /include it for every path in "files"/`
- `/design-plan command file states the proposedFiles rule > does not keep the old omit-when-no-contents wording`: `expected '---\ndescription: Design a change and…' not to match /proposes no file contents/`

The third command-file test (required plan fields still present) passes. The tests were not weakened. They will pass once line 24 of the command file gets the wording from `SHAPE_RULES`.

Verdict: FAIL, only because of the denied command-file edit.

### Round 2 (tester)

The Development section's "Not done (blocked)" line about `.claude/commands/design-plan.md` is resolved by commit 913beb6 (applied outside this task's developer round). Line 24 now carries the new wording.

Commands run on `task/design-plan-proposed-files-2`:
- `npm run compile`: passed.
- `npm run test:unit`: 25 files, 390 tests, all passed.
- `npm run test:ui`: 128 tests, all passed.
- `npm test` (unit, UI, integration): unit 390/390 and UI 128/128 passed. Integration: 35 passing, 1 failing; `npm test` exit code 1.

Integration failure:
- `Review decorations: overview ruler colours > added and removed decoration types set overviewRulerColor to the diff ruler theme colours`: `AssertionError: Expected values to be strictly equal: + actual - expected: undefined vs 'editorOverviewRuler.addedForeground'` at `out-test/test/integration/overviewRuler.test.js:113`.
- This test has no source in `test/` or `src/` (no `overviewRuler` match under either). It runs from a stale compiled file in `out-test/test/integration/` left from an earlier build. It is unrelated to this task (no change touches decorations). The core agent or owner should remove the stale `out-test/` files and re-run. I did not delete them (shell rules).
- All other integration tests pass, including "Implement the Design through the panel handler" and the apply-accepted flows.

Check of `test/unit/noProposedFiles.test.ts`: it covers `noProposedFilesMessage` (files non-empty gives the cause message; files empty gives "This plan has no proposed files."), the prompt rule in `buildPlanPrompt` and `buildReviewPrompt`, and the rule in `.claude/commands/design-plan.md`. No test file was changed this round.

Not run here: the owner check of `/design-plan` in Antigravity followed by Implement the Design.

Verdict: PASS for this task's changes (the two round 1 failures are fixed). Caveat: `npm test` exits 1 because of the stale `out-test` integration test above.
