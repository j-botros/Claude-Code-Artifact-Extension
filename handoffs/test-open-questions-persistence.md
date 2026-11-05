# Handoff: test-open-questions-persistence

## Brief (core agent)

**Goal.** Test saving and reloading open questions, and fix any bug the tests find. Cover:
1. An open question saved to `.claude/plans/<title>.json` keeps its `openQuestions` after a reload.
2. An edited question saves to that file.
3. A question removed from a plan is removed from the file. The UI does not offer deleting a question (the `open-questions-section` brief made `applyPlanEdits` keep the question count fixed). So the developer first checks which path, if any, can remove a question (for example a revised plan from Review Comments that is saved to the file). Test that path. If no path can remove a question, record that in the Development section, and the tester tests that a save with a different question count is refused and leaves the file unchanged. Do not add delete UI: that is a new feature and out of scope.
4. Comments on questions survive a panel reload while the panel stays open.

Export as Markdown dropping open questions is a separate known gap. It is not in this task.

**Branch.** `task/test-open-questions-persistence` (from `origin/dev`). Commit on this branch only. Never push to `main` or `dev`.

**Scope: files the developer may edit.** Only `src/` files on the save and reload path: `src/webview/planPanel.ts`, `src/plan/planEdits.ts`, `src/plan/planPrompt.ts`, `src/plan/reviewComments.ts`, `src/plan/plan.ts`, and the extension host file that saves plans (`src/extension.ts` or the file it calls). Change code only to fix a bug that a test would expose. Do not change behaviour otherwise.

Do not edit `test/`, `README.md`, `TASKS.md`, `STATUS.md`, `CLAUDE.md`, or `handoffs/` except the Development section below.

**Developer task (first).**
- Read the save path: `applyPlanEdits`, `savePlan` in the webview, and the host's write of `.claude/plans/<slug>.json`. Read the reload path: webview `getState`/`setState`, and how the panel re-renders a saved plan.
- Look for bugs that would fail the four checks above, and fix them in `src/` if found. Keep fixes minimal.
- Record in Development: the save path and the reload path (file and function names), which path (if any) can remove a question, each bug found and fixed (or "none found"), and anything you could not confirm by reading.

**Tester task (second).**
- Add integration tests in `test/integration/` in a temporary workspace under `out-test/` (CLAUDE.md Section 7 bans writes outside the repo). Use the existing integration patterns, for example `test/integration/applyFlows.test.ts` and `test/integration/planFlows.test.ts`.
- Cover the four checks above. Add unit tests in `test/unit/` for any pure logic the developer changed or added.
- Run the tests. Record the results in Testing.

**Definition of done.**
- The four checks above each have a passing test (or, for check 3, the test described above).
- Any bug found is fixed in `src/`, with a test that fails before the fix and passes after it. If the tester cannot confirm that, say so in Testing.
- Every new function and class has a doc comment (CLAUDE.md Section 3). Strict TypeScript compiles.
- `npm run compile`, `npm run test:unit`, `npm run test:ui`, and `npm test` pass.

**Test commands.** `npm run compile`, `npm run test:unit`, `npm run test:ui`, `npm test`.

**Attribution.** Commit messages end with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Not in scope.** Delete UI for questions, Markdown export of questions, CLAUDE.md, the README, and any change to existing plan fields.

## Development

**Result: no bug found by reading. No `src/` change.** `npm run compile` passes.

**Save path.**
- Webview script in `src/webview/planPanel.ts`: `readEdits()` collects `question:<i>` elements into `questions`; `sendEdits()` posts `{type: "savePlan", ..., questions, code}`.
- Host: `PlanPanel.save(input)` (`src/webview/planPanel.ts`) calls `applyPlanEdits` (`src/plan/planEdits.ts`), then `recordOwnSave(text)` and writes `JSON.stringify(plan, null, 2) + "\n"` to `<first workspace folder>/.claude/plans/<planFileName(title)>` with `vscode.workspace.fs.writeFile`. On success it sets `currentPlan`, `savedName`, and replies `saveResult`.
- `applyPlanEdits` trims each question, rejects a non-string or blank one, keeps `openQuestions` in the output when the current plan has it, and copies `proposedFiles` unchanged.

**Reload path.**
- File to panel: `watchPlanFolder` and `handlePlanFile` in `src/extension.ts` read the file, `decidePlanFile` (`src/plan/planWatch.ts`) skips the extension's own saves by hash, else `parsePlanJson` (`src/plan/plan.ts`, copies `openQuestions`) and `PlanPanel.show`. `renderOpenQuestionsSection` renders the questions.
- Webview state: on `saveResult` ok, the script calls `vscode.setState({ comments: readComments(), edits: lastSent })`; comment handlers use `setState(Object.assign({}, readState(), { comments }))`. On load, the script reads `getState().edits` and re-applies `questions[i]` into `question:<i>` elements via `applySaved`. Comments are read from `getState().comments`. `resetState: true` (only after a Review Comments revision) clears both.

**Which path can remove a question.**
- The webview cannot: `applyPlanEdits` refuses a `questions` array whose length differs from the current count (`questions must have N items`), and the file is not written.
- The only path is Review Comments: `PlanPanel.review` replaces `currentPlan` with the revised plan from `onReview` (the prompt in `planPrompt.ts` lets Claude drop a question that a comment answers). That path does NOT write the file: it sets `savedName = undefined` and re-renders with `resetState: true`. The file is updated only when the user then edits and saves, because `save` writes `currentPlan` plus edits. After that, the saved file has the revised question count. Edge: if the revised plan has no `openQuestions`, `applyPlanEdits` sends `questions: []` against expected 0, which is accepted and the saved file has no `openQuestions`.
- A hand edit of the JSON file that removes a question is reloaded by the watcher (`handlePlanFile`) as a new plan.

**Bugs found and fixed.** None found.

**Not confirmed by reading.**
- Real behaviour of `vscode.getState`/`setState` across a panel reload (needs the integration/UI tests).
- Whether the file watcher fires and `decidePlanFile` skips an own save in a real Extension Host (timing of `recordOwnSave` vs the watcher event).
- Test hint: for check 4, the comment state lives in the webview (`getState().comments`), so it can only be checked in the UI/Playwright layer or by re-rendering with the same state, not through the host.

## Testing

**Verdict: PASS.** No bug found. No `src/` change.

**Commands run.**
- `npm run compile`: passed.
- `npm run test:unit`: 24 files, 381 tests, all passed (no new unit tests; the developer changed no pure logic).
- `npm run test:ui`: 130 passed, 0 failed (includes 2 new tests).
- `npm test` (unit, ui, then integration): all passed. Integration: 41 passing, 0 failing (includes 5 new tests).

**Tests added.**

Integration, `test/integration/openQuestionsPersistence.test.ts` (drives the real `PlanPanel` `save` and `review` methods against `.claude/plans/<slug>.json` in the integration workspace, which is `test-results/integration-workspace` inside the repo; each test deletes its own file):
1. Saved questions keep `openQuestions` in the file; re-parsing the file with `parsePlanJson` and opening a new panel renders the "Open Questions" section and the questions (check 1).
2. An edited, untrimmed question is saved trimmed to the file and survives a reload; a later save without a `questions` field keeps the saved questions (check 2).
3. A save with fewer, more, or a blank question is refused (`questions must have 2 items`) and the file bytes are unchanged (check 3, refusal part).
4. Review Comments with a revised plan that has fewer questions: the review does not write the file; the old two-question save is then refused; a one-question save is accepted and the file holds the revised list (check 3, review route).
5. Review Comments with a revised plan that has no questions: a save with `questions: []` succeeds and the file has no `openQuestions` key (check 3, edge case).

UI (Playwright), `test/ui/openQuestions.spec.ts`:
6. Question comments survive `page.reload()`: bubbles come back, review count is 2, and `getState().comments` is unchanged (check 4).
7. An edited question and a comment on another question both survive `page.reload()` (checks 2 and 4 in the webview).

**Could not confirm.**
- Check 4 is only tested in the webview state stub (`sessionStorage` standing in for `getState`/`setState`). Real VS Code `retainContextWhenHidden` or panel-hide behaviour is not tested, because the integration host cannot read webview DOM or state.
- The `Review Comments` tests call `PlanPanel.review` with a stubbed `onReview`. They do not run the real `claude` revision.
- The file-watcher skip of the extension's own save is covered by the existing `planWatcher.test.ts`, not by the new tests.
- The tests were not run against a deliberately broken `src/`, so "fails before the fix" is not applicable (no fix was made).

**Bugs.** None found.
