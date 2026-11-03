# STATUS

Owned by the core agent only. Keep the latest run first. Keep only the last few runs.

## Current state
- Stage: early idea, with a working scaffold. `Claude Artifact: Open Sample Plan` opens a webview with a sample plan. The owner confirmed it renders in Antigravity.
- Branches: `main` and `dev` exist on GitHub. `dev` includes PRs #1 through #6, #12, #18, #23, and #26.
- Packaging: `npm run package` produces a `.vsix` that installs in Antigravity 1.107.0. `engines.vscode` is `^1.107.0` and `@types/vscode` is pinned to `1.107.0`.
- Compile: `npm run compile` passes. Unit tests: `npm run test:unit` passes (11 tests).
- `.vscode/launch.json` exists.
- Agent setup: `.claude/agents/developer.md`, `.claude/agents/tester.md`, and `.claude/settings.json` are committed.
- Scheduler: the launchd job is NOT installed. The owner has to install it. The `PAUSE` file is in the repo root until the owner removes it.

## Run log

### Run 13 (2026-11-03)
- Task: `integration-tests` (developer, then tester). Result: blocked before the developer ran. No commits; branch `task/integration-tests` was created from `origin/dev` and has no changes. TASKS.md row is `blocked`.
- Why: the task needs `@vscode/test-cli` and `@vscode/test-electron` in `devDependencies`. Neither is in `package.json`, so adding them needs `npm install` to update `package-lock.json`. `npm install` is not on the shell allow list. This is the same lock-file blocker as `ui-tests` (run 12). `npx vscode-test` (which downloads VS Code) is also not on the allow list.
- Requests for the owner (not run here):
  - Allow `npm install --save-dev @vscode/test-cli @vscode/test-electron` for this task, or update the lock yourself and tell me.
  - Allow the VS Code download that `vscode-test` does on first run (roughly 100 MB or more, from Microsoft's CDN).
- Not done: `ui-tests` stays `blocked`. `pause-and-alert` is still `todo` and is the next runnable task. It edits only `scripts/agent-run.sh` and needs no `npm` install. Stopped after one task, as the run rules say.
- Note for the next run: the runner picks the first `todo` row, so `integration-tests` will be skipped while it is `blocked`. The next run should pick `pause-and-alert` on its own.

### Run 12 (2026-11-03)
- Task: `ui-tests` (developer, then tester). Result: blocked before the developer ran. No commits; branch `task/ui-tests` was created from `origin/dev` and has no changes. TASKS.md row is `blocked`.
- Why: the task needs Playwright in `devDependencies`. Adding it needs `npm install` to update `package-lock.json`. The shell allow list has `npm ci`, not `npm install`. I tested this: with `@playwright/test` added to `package.json` (then reverted), `npm ci` failed with `EUSAGE`, "Missing: @playwright/test@1.55.0 from lock file". Playwright is not in `node_modules` today. The version in that test was a placeholder, not a choice; the real pin needs to be at least two weeks old.
- Requests for the owner (not run here):
  - Allow `npm install --save-dev @playwright/test@<version>` for this one task, or update the lock yourself and tell me.
  - Allow `npx playwright install chromium` (downloads a browser, about 150 MB, from Playwright's CDN).
  - `npm run test:unit` was not run this run because nothing changed.
- Not done: `integration-tests` and `pause-and-alert` remain `todo`. Stopped after one task, as the run rules say. `integration-tests` will likely hit the same lock-file problem for `@vscode/test-cli` and `@vscode/test-electron`. `pause-and-alert` only edits `scripts/agent-run.sh` and does not need `npm`, so it is the next runnable task.
- Next: `pause-and-alert` (developer, then tester) is the next `todo` for developer or tester in table order, once `ui-tests` is unblocked or skipped by the owner.

### Run 11 (2026-11-03)
- Task: `implement-apply` (developer, then tester). Developer added `src/plan/applyHunks.ts` (pure `applyAcceptedHunks`), and in `src/review/hunkReview.ts` the Apply lens, the `claudeArtifact.applyAccepted` command, the confirmation, the freshness and unsaved-changes checks, the `WorkspaceEdit` write, per-file results, and the session end (commit `4573137`). Tester added 32 tests in `test/unit/applyHunks.test.ts` (commit `902d4a8`). Verdict PASS for the pure logic. 188 unit tests.
- Core agent re-ran `npm run compile` (exit 0) and `npm run test:unit` (188 passed). Read the write path in `hunkReview.ts`: writes only in `writeOneFile`, through `WorkspaceEdit`, with `createDirectory` only for parent folders of new files. Updated the README feature and status text. Opened PR #34 into `dev`. Marked the task `done`.
- Not verified: `src/review/hunkReview.ts` needs the VS Code host. Owner: open a plan with `proposedFiles`, accept some hunks, click Apply accepted, and check the confirmation, the file contents, undo per file, and that the session ends after a write. Use a throwaway workspace.
- Decisions (not in CLAUDE.md):
  - The confirmation is per extension session (a module flag). It is set only after the user clicks Apply. A cancel asks again next time.
  - A successful run ends the session. A second apply needs a new Implement the Design click.
  - Each proposed file has its own Apply lens. Any of them applies the whole session.
- Known limits (not fixed):
  - CRLF files may get mixed line endings, because the proposed text from the plan is usually LF.
- Process notes:
  - The tester could not use Edit and rewrote its handoff with Write. The core agent checked that the Brief and Development sections are unchanged. The tester tools list in `.claude/agents/tester.md` still needs Edit (open since run 4).
  - The tester's commit uses the Sonnet 5.5 trailer from the attribution reminder. The brief asked for Haiku 5.5. Left as is.
- Next: `ui-tests` (developer, then tester) is the next `todo` in table order.

### Run 10 (2026-11-03)
- Task: `implement-review` (developer, then tester). Developer added `src/plan/diffHunks.ts` (pure `splitHunks`), `src/plan/hunkDecisions.ts`, `src/review/hunkReview.ts` (read-only diff editor with ✓ and ✗ CodeLens), the `proposedFiles` field in `plan.ts` and `planPrompt.ts`, and the Implement the Design button in `planPanel.ts` (commit `a59d552`). The core agent added the optional `proposedFiles` field to CLAUDE.md, Section 3 (commit `35f198f`).
- Tester added 33 unit tests, in `test/unit/diffHunks.test.ts` and `test/unit/proposedFiles.test.ts`, and updated `planRendererReview.test.ts` (commit `87a23d8`). Verdict PASS. 156 unit tests. The tester could not commit: its `git add` was denied, so the core agent committed the test files and the Testing section.
- Core agent re-ran `npm run compile` (exit 0) and `npm run test:unit` (156 passed). Grepped `src/review/` for write calls: none. Updated the README status and feature lines (commit `b397586`). Opened PR #32 into `dev` and merged it. Marked the task `done`.
- Branch name: `task/implement-review` already existed locally and on origin. It points at `ff767b6`, an older merged commit that is already in `dev`. The core agent did not reset or delete it, and used `task/implement-review-2` instead.
- Decisions (not in CLAUDE.md):
  - `proposedFiles` is optional. Paths must be relative with no `..`, and `parsePlanJson` rejects anything else. `applyPlanEdits` keeps the field.
  - Accept and reject are in-memory only and are not persisted. A new click replaces the previous review session.
  - The review uses VS Code's diff editor, with virtual read-only documents for the proposed side. Decorations and CodeLens are placed on that diff.
  - The developer added one behaviour the brief did not ask for: a decided hunk loses its colour, and its lens shows "Accepted" or "Rejected".
- Not verified: `src/review/hunkReview.ts` needs the VS Code host and a real click. Owner: open a plan with `proposedFiles` (a generated plan, or one written by hand), click Implement the Design, and check the diff, colours, and lenses. Nothing should be written.
- Process notes:
  - The tester's `git add` was denied, even though it is on the allow list. Its handoff and tests were committed by the core agent. The runner's permission setup for the tester may need checking.
- Owner: delete the stale `task/implement-review` branch (local and origin) when convenient. It is fully merged, so it is safe to delete. Deleting it needs your sign-off under CLAUDE.md, Section 4.
- Next: `implement-apply` (developer, then tester) is the next `todo` in table order.

### Run 9 (2026-11-03)
- Task: `agy-fallback` (developer, then tester). Developer added `src/agy/agyStreamParser.ts` and `src/agy/agyRunner.ts`, and changed `runPlanPrompt` and a warning modal in `src/extension.ts` (commit `7a87646`). Tester added 14 tests in `test/unit/agyRunner.test.ts` (commit `a05c98f`). Verdict PASS. 123 unit tests.
- Core agent re-ran `npm run compile` and `npm run test:unit` (123 passed). Checked that the tester's handoff rewrite only appended sections. Updated the README status line. Opened PR #31 into `dev`, then merged it. Marked the task `done`.
- Decisions (not in CLAUDE.md):
  - The no-tools instruction is in code (`AGY_NO_TOOLS_PREFIX`). The README has no prompt, so the brief set the wording.
  - The fallback runs only on `missing-cli` or `not-logged-in`. Other `claude` failures are shown as they are.
  - The warning flag is stored only after the user clicks "Run agy". A cancel shows the warning again next time.
  - Model selection (`agy models`, latest Sonnet) is not built. `agy` uses its default model. CLAUDE.md Section 3, (2)(c), still needs this.
- Not verified: `runAgy` and the warning modal need the VS Code host and a real `agy`. Owner: run the fallback once in the Extension Development Host with `claude` logged out.
- Process notes:
  - The developer's and tester's commit trailers say Claude Sonnet 5.5, not the Haiku 5.5 line in the brief. Left as is.
  - The tester rewrote its handoff with Write because Edit was not available. The core agent checked that the earlier sections are unchanged. The tester tools list in `.claude/agents/tester.md` still needs Edit (open since run 4).
- Next: `implement-review` (developer, then tester) is the next `todo` in table order.

### Run 8 (2026-11-03)
- Task: `review-comments` (developer, then tester). Developer added `src/plan/reviewComments.ts`, `buildReviewPrompt` in `src/plan/planPrompt.ts`, the header button and messages in `src/webview/planPanel.ts`, and a shared run-and-parse helper in `src/extension.ts` (commit `f5c513b`). Tester added 22 tests in three new files, `test/unit/reviewComments.test.ts`, `reviewPrompt.test.ts`, and `planRendererReview.test.ts` (commit `7ba4696`). Verdict PASS. No existing test changed.
- Core agent re-ran `npm run compile` and `npm run test:unit` (109 passed). Updated the README (status line and Review Comments feature line) and TASKS. Opened PR #30 into `dev`. Marked the task `done`.
- Not verified: the review path needs the VS Code host and a logged-in `claude`. Owner: run Review Comments once in the Extension Development Host, and check that the returned plan replaces the view and that comments clear.
- Decisions (not in CLAUDE.md):
  - A successful review clears the comments and the saved edits, because step numbers may change. The returned plan is not saved to `.claude/plans/`.
  - The review prompt has the same no-files, no-commands rule as the generate prompt, and runs with `--permission-mode plan`.
- Process notes:
  - The developer's commit trailer says Claude Sonnet 5.5, not the Haiku 5.5 line in the brief. The tester and core commits use Haiku 5.5. Left as is.
  - Edit was not available to the tester, so it rewrote its handoff with Write. The tester tools list in `.claude/agents/tester.md` still needs Edit (open since run 4).
- Next: `agy-fallback` (developer, then tester) is the next `todo` in table order. It needs the README no-tools prompt; the README does not have one yet, so the developer may need a decision from the owner.

### Run 7 (2026-11-03)
- Task: `edit-ui` (developer, then tester). Developer added `src/plan/planEdits.ts` (`applyPlanEdits`, `planFileName`) and the editable title, summary, out-of-scope, and step fields in `src/webview/planPanel.ts` (commit `3ecb053`). Save writes the plan to `.claude/plans/<slug>.json` through `vscode.workspace.fs`, one save at a time. Tester updated the 7 assertions the markup broke and added 17 `planEdits` tests (commit `5ab8f07`). Verdict PASS, 87 unit tests.
- Core agent re-ran `npm run compile` and `npm run test:unit` (87 passed). Added the README status and feature lines (commit `240600b`). Opened PR #28 into `dev` and merged it. Marked the task `done`.
- Not verified: the file write and the save message path need the VS Code host. Not run in the Extension Development Host. Owner: run it once and check that `.claude/plans/` gets the file.
- Decision: the old file is not deleted when the title changes. CLAUDE.md requires sign-off for deleting data. Owner: say if you want cleanup.
- Process notes:
  - The developer and tester used the brief's Haiku 5.5 Co-Authored-By line. The attribution reminder in the run asked for Sonnet 5.5. The brief won, as in earlier runs.
  - Edit was not available to the tester. It rewrote its handoff with Write. The tester tools list in `.claude/agents/tester.md` still needs Edit.
  - The developer left its Development section uncommitted. The tester's commit included it.
- Next: `review-comments` (developer, then tester) is the next `todo` in table order.

### Run 6 (2026-11-03)
- Task: `comments-ui` (developer, then tester). Developer added a comment `textarea` per step, enabled scripts, and added one nonce'd inline script that restores and saves comments in `vscode.getState` / `setState` (commit `366fd3e`). Verdict: developer's change broke three existing `planRenderer` assertions, not one as the brief expected (script, `</script>` escape check, step `<li>` regex). Tester updated them and added 17 renderer tests in total, verdict PASS (commit `b2dba9d`).
- Core agent re-ran `npm run compile` and `npm run test:unit` (66 passed). Added the README status line (commit `113c317`). Opened PR #26 into `dev` and merged it (merge commit `a2f1696`). Marked the task `done`.
- Decision: comments are kept in webview state only, not on disk, and are not sent to Claude Code. This matches the brief.
- Process notes:
  - Edit was not available to the tester, so it rewrote its handoff with Write. The tester tools list in `.claude/agents/tester.md` still needs Edit.
  - Developer and tester commits use the Haiku 5.5 Co-Authored-By line from the brief. The attribution reminder in this run asked for Sonnet 5.5 on new commits; the brief won, as in earlier runs.
- Not verified: the comment UI has no UI test and was not run in the Extension Development Host. Covered by `ui-tests` later.
- Next: `edit-ui` (developer, then tester) is the next `todo` in table order.

### Run 5 (2026-11-03)
- Task: `claude-plan-generation` (developer, then tester). Developer added `src/claude/streamParser.ts`, `src/claude/claudeRunner.ts`, `src/plan/planPrompt.ts`, and the `claudeArtifact.generatePlan` command (commit `495465a`). Tester added 22 unit tests with fixture streams (commit `e76a1b9`), verdict PASS.
- Core agent re-ran `npm run test:unit` (60 passed). Added the handoff and README commit `cd75587`. Pushed `task/claude-plan-generation`, opened PR #23 into `dev`, and merged it (merge commit, 2026-11-03). Marked the task `done`.
- Core agent chose `--permission-mode plan` for the `claude` run, so the plan run cannot edit files. Not in CLAUDE.md. Owner: say if you want it documented there.
- Known issues (not fixed):
  - `looksLikeAuthProblem` is loose. Any text with "login" or "api key" is labelled not-logged-in, so an unrelated error can show the login message. Follow-up: tighten the patterns.
  - The spawn path in `runClaude` is not unit tested, and `claude` was not run here. Owner: run the generate command once in the Extension Development Host.
- Process notes:
  - The developer's commit trailer says Claude Sonnet 5.5, not the Haiku 5.5 line in the brief. Left as is.
  - The tester could not use Edit and rewrote its handoff section with Write. The tester tools list in `.claude/agents/tester.md` still needs Edit.
- Next: `comments-ui` (developer, then tester) is the next `todo` in table order.

### Run 4 (2026-11-03)
- Task: `plan-renderer`. Developer rewrote `renderPlanHtml` (commit `e8de0f0`): files as a Path/Change table with a "new" badge, "No files." for an empty list, language label, CSS-variable light and dark themes. Tester added 11 tests in `test/unit/planRenderer.test.ts` (commit `a9462c9`), verdict PASS. 38 unit tests pass.
- Core agent re-ran `npm run test:unit` (38 passed). Added the handoff commit `db4cd6f`, pushed `task/plan-renderer`, and opened PR #18 into `dev`. Merged PR #18 into `dev` (merge commit, 2026-11-03). Marked the task `done`.
- Decision: file paths are plain text in `<code>`, not links. The webview has no scripts, so links need message passing. The brief said "links to relative paths"; this is a deviation. Owner: say if you want links back in via message passing (a later task).
- Process notes:
  - The tester's commit `a9462c9` has the Co-Authored-By line for Claude Sonnet 5.5, not Haiku 5.5 as the brief required. Left as is; the core agent did not rewrite history.
  - The tester staged `handoffs/plan-renderer.md` by mistake and could not unstage it (`git reset` is not on the allow list). The core agent committed it in `db4cd6f`.
  - The tester did not have the Edit tool and wrote the handoff with Write. The tester's tools list in `.claude/agents/tester.md` may need Edit added.
- Next: `claude-plan-generation` (developer, then tester) is the next `todo` in table order.

### Run 3 (2026-11-03)
- Task: `plan-format`. Developer changed the plan type to `Plan` and `parsePlanJson` to the CLAUDE.md Section 3 shape. Tester added 27 unit tests, verdict PASS.
- Core agent re-ran `npm run compile` and `npm run test:unit` (27 passed). Pushed `task/plan-format` and opened PR #12 into `dev`.
- Process notes:
  - The developer and tester each appended their handoff section with a heredoc (`cat >> ... <<EOF`). That is not on the allow list. The effect was limited to the handoff file, but the runner should allow a file-write path or the agents should use Write/Edit.
  - The developer's handoff note says "see git log" for the commit hash, because the hash did not exist yet. Hashes: `60d8fdb` (feat), `35ec7bd` (test).
- Next: `plan-renderer`.

### Owner checks (between runs)
- `antigravity-compat-check`: PASS. The owner installed the `.vsix` in Antigravity and ran the sample plan command. The webview rendered.
- Earlier failure: Antigravity refused `engines.vscode ^1.144.0` with "not compatible with the IDE '1.107.0'". Fixed by PR #6.

### Run 2
- Task: `scaffold-minimal-extension`. Developer added the scaffold; tester added unit tests and verdict PASS. Merged as PR #4.
- Denied during the run: `.vscode/launch.json` write, `npm view`. Both were resolved later.

### Run 1
- Verified: `dev` is on GitHub and `gh` is logged in.
- Stalled: the agent couldn't write files in headless mode. Fixed by PR #3 (`--permission-mode acceptEdits`).

## Open questions
- Owner: remove `PAUSE` when ready for the runner to work.
- Owner: install the launchd job yourself (see the commands in the chat). The classifier blocked the agent from installing it.
- Owner: npm reported 6 audit vulnerabilities. Not addressed.
- Owner: CLAUDE.md Section 8 seems to be missing. Restore it if that wasn't intentional.
- Owner: confirm the latest stable VS Code version before the first publish.

## Blockers
- `ui-tests` is blocked: `npm install` is not on the shell allow list, so Playwright cannot be added to the lock file. See run 12.
- `integration-tests` is blocked for the same reason: `@vscode/test-cli` and `@vscode/test-electron` need `npm install`, and `npx vscode-test` is not on the allow list. See run 13.
