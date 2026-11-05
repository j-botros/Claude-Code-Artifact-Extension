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

_(developer fills this in)_

## Testing

_(tester fills this in)_
