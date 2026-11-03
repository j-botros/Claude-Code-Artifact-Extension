# Handoff: e2e-plan-flows

## Brief (core agent)

- **Goal:** Integration tests in `@vscode/test-cli` for three flows: the generate-plan command, the `agy` fallback, and Review Comments. The tests use stub `claude` and `agy` executables placed first on PATH during the test. They assert the rendered plan and the messages for the missing and not-logged-in cases.
- **Branch:** `task/e2e-plan-flows` (from `origin/dev`). Already created.
- **Current state to know:**
  - `src/extension.ts`: `generatePlan` (command `claudeArtifact.generatePlan`) asks with `vscode.window.showInputBox`, then calls `runPlanPrompt`. `runPlanPrompt` calls `runClaude` (spawns `claude`), and on `missing-cli` or `not-logged-in` it calls `runAgyFallback`. That shows a modal `showWarningMessage` once (remembered in `globalState` key `agyWarningAccepted`), then `runAgyWithRetry` (spawns `agy`). Errors go to `showErrorMessage`. Success calls `PlanPanel.show(plan, ...)`.
  - `reviewPlan(plan, comments)` in `src/extension.ts` is NOT exported. It is the path that Review Comments uses.
  - `src/webview/planPanel.ts` `PlanPanel` has no way for a test to read the HTML it set. The webview tab label is `plan.title`.
  - Stream formats: `src/claude/streamParser.ts` reads the last `type: "result"` event; it needs `subtype: "success"`, `is_error` not true, and a non-empty string `result`. `src/agy/agyStreamParser.ts` reads the last `type: "result"` event's `response` string; empty or whitespace is `empty-response`.
  - Auth detection: `looksLikeAuthProblem` in `src/claude/claudeRunner.ts` matches "not logged in" on stderr. The `claude` stub can exit 1 and print `Not logged in · Please run /login` to stderr.
  - Spawn uses the inherited `process.env`, so setting `process.env.PATH` in the test host changes what `spawn("claude")` and `spawn("agy")` find.
  - `.vscode-test.mjs` runs `out-test/test/integration/**/*.test.js` in VS Code 1.107.0. `out/` and `out-test/` are gitignored.
  - The existing `test/integration/extension.test.ts` loads `src` modules from `out/` with `require(path.resolve(__dirname, "../../../out/..."))`. Use the same pattern, so the test shares module state with the extension.
- **Scope (files you may edit):**
  - Developer: `src/extension.ts` and `src/webview/planPanel.ts`, and only these two. Add test seams only. Do not change behaviour.
  - Tester: `test/integration/` only (new files, and `test/integration/extension.test.ts` may be extended). Do not edit `src/`, `TASKS.md`, `STATUS.md`, `README.md`, or `handoffs/` (except the Testing section).
  - Do not edit `package.json` or `.vscode-test.mjs`.
- **Developer requirements (src):**
  1. Add `export` to `reviewPlan` in `src/extension.ts`. Change nothing else in its body.
  2. Add `export` to `runPlanPrompt` in `src/extension.ts`, so a test can check the same messages without the input box. Change nothing else.
  3. In `src/webview/planPanel.ts`, add a test seam: a static property `PlanPanel.lastRenderedHtml: string | undefined`. Set it in the constructor right after `this.panel.webview.html = ...`, and again in `review()` where the HTML is re-rendered. Document it as "read by integration tests; the extension does not use it". Do not change the HTML.
  4. Run `npm run compile` and `npm run test:unit`. Both must pass. Do not add tests (the tester writes them).
- **Tester requirements (test/integration):**
  1. Stub executables are written at test time into `out-test/stub-bin/<case>/` under the repository root, using the path `path.resolve(__dirname, "../../..", "out-test", "stub-bin", ...)`. Do not use the OS temp directory, because the rules say nothing outside the repository may be written. Use `fs.chmodSync(file, 0o755)` on each stub.
  2. A stub is a `#!/bin/sh` script. It must call `/bin/cat` by its absolute path, because `PATH` is replaced. Put the stream output in a fixture file in the same directory and have the stub `/bin/cat` it. Use `exit <code>` for the exit status. For `claude`, the stream output is one JSON line `{"type":"result","subtype":"success","is_error":false,"result":"<plan JSON>"}`. For `agy`, the output is one JSON line `{"type":"result","response":"<plan JSON>"}`.
  3. Set `process.env.PATH` per test to exactly the stub directory the case needs. Missing-CLI cases use an empty directory (or one holding only the other tool's stub). Restore the original `PATH` in `teardown`.
  4. Stub the UI. Replace `vscode.window.showInputBox`, `showWarningMessage`, and `showErrorMessage` with functions that record calls, and restore them in `teardown`. The warning stub returns `"Run agy"` to accept, or `undefined` to cancel.
  5. Plan JSON: build it with `JSON.stringify` on a valid `Plan` object (see the `Plan` type in `src/plan/plan.ts`). Give it a unique title per case, so the tab label proves which plan was rendered.
  6. Remember the one-time warning flag. Once accepted, the modal is not shown again in that host. Order the tests so a cancel case runs before the accept case, or check that the modal is not shown when the flag is set. Do not reach into `globalState` directly.
- **Cases to cover (minimum):**
  1. Generate plan, claude succeeds: input box returns a request, the `claude` stub returns a valid plan. Assert that a webview tab with the plan title is open, and that `PlanPanel.lastRenderedHtml` contains the plan's title and step text in section order.
  2. Generate plan, claude missing and agy missing: assert `showErrorMessage` was called with the text of `AGY_MISSING_MESSAGE` (exported from `src/agy/agyRunner.ts`). Warning modal accepted, so it was shown.
  3. Generate plan, claude missing, warning cancelled: assert `showErrorMessage` with "The agy fallback was cancelled." and that agy was never run (use a stub that writes a marker file, and assert the file is absent).
  4. Generate plan, claude not logged in, agy succeeds: assert the plan is rendered (tab title) and the modal was shown once.
  5. Generate plan, claude not logged in, agy returns an empty response twice: assert `showErrorMessage` with `AGY_EMPTY_MESSAGE`. Use a stub that counts runs (marker file) and assert it ran twice.
  6. Generate plan, claude not logged in, agy missing: the warning is accepted, and `showErrorMessage` gets `AGY_MISSING_MESSAGE`. The fallback replaces the not-logged-in text, so `NOT_LOGGED_IN_MESSAGE` is not shown in this case.
  7. Review Comments via `reviewPlan(plan, {0: "note"})`: with claude succeeding, the returned `{ ok: true, plan }` has the revised title. With claude not logged in and agy missing, the returned message is `AGY_MISSING_MESSAGE`.
  8. Missing claude and missing agy for Review Comments: the returned message is `AGY_MISSING_MESSAGE`. `MISSING_CLI_MESSAGE` is never returned by `reviewPlan` in this flow, because a missing `claude` always goes to the agy fallback. Say so in Testing.
- **Definition of done:**
  1. Developer: the two `export`s and the `lastRenderedHtml` seam are in place. `npm run compile` passes. No behaviour change.
  2. Tester: the integration tests above pass in the VS Code 1.107.0 host through `npm run test:integration`. The existing 4 integration tests still pass.
  3. `npm test` passes (unit, UI, integration).
  4. No file outside `src/webview/planPanel.ts`, `src/extension.ts`, and `test/integration/` is changed. Stub scripts exist only under `out-test/`.
- **Stop and report** (do not work around it) if:
  - a test needs a change to `package.json`, `.vscode-test.mjs`, or `src/` beyond the two seams
  - `process.env.PATH` changes do not reach `spawn` in the extension host (report what you saw)
  - a `showWarningMessage` or `showInputBox` stub cannot be installed (report the error)
- **Test commands:**
  - Developer: `npm run compile`, `npm run test:unit`
  - Tester: `npm run compile`, `npm run test:unit`, `npm run test:integration`, then `npm test`
- **Notes for the README (core agent will write it, not you):** the stub-based tests cover control flow only. They do not prove the real `claude` or `agy` CLI works.

## Development (developer)

**What changed (no behaviour change):**
- `src/extension.ts`: added `export` to `runPlanPrompt` (line 39) and `reviewPlan` (line 60).
- `src/webview/planPanel.ts`: added `static lastRenderedHtml: string | undefined` on `PlanPanel` (documented as read by integration tests only), set in the constructor right after `this.panel.webview.html = ...` and in `review()` right after the re-render.

**Results:**
- `npm run compile`: passed (tsc, no output).
- `npm run test:unit`: 14 files passed, 214 tests passed.

**Unsure:** nothing. The `review()` assignment reads back `this.panel.webview.html` (the same string just set).

**Tester should check:** `PlanPanel.lastRenderedHtml` is the latest panel's HTML, so read it right after the panel opens or after a review re-render.

## Testing (tester)

(to be filled by the tester)
