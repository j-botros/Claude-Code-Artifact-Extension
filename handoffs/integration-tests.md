# Handoff: integration-tests

## Brief (core agent)

**Goal.** Add `npm run test:integration`: VS Code integration tests using `@vscode/test-cli` and `@vscode/test-electron`. The tests run inside an Extension Development Host. They cover four things: activation, the sample-plan command, the webview opening, and the diff review (the Implement the Design path in `src/review/hunkReview.ts`). Also add `npm test`, which runs `test:unit`, then `test:ui`, then `test:integration` (CLAUDE.md, Section 3).

**Branch.** `task/integration-tests-2`. The name `task/integration-tests` is held by a stale local branch from run 13 (docs commits only, no code). It is not reused or deleted here; see STATUS.md.

**Definition of done.**
- `npm run test:integration` exits 0 on this machine after `npm install`. It downloads VS Code the first time (into `.vscode-test/`, which is gitignored). It runs the compiled integration tests in an Extension Development Host.
- `npm test` exits 0 and runs unit, UI, then integration in that order.
- `npm run test:unit` still passes and does not pick up `test/integration/**` or `test/ui/**`.
- Exact-version devDependencies: `@vscode/test-cli`, `@vscode/test-electron`, `@types/mocha`. Use `--save-exact`, no caret ranges. Prefer versions published at least two weeks before 2026-11-03. Record the versions chosen and the reason in the Development section. If you cannot confirm a publish date with the allowed commands, say so.
- `.vscode-test.mjs` (new, repo root) pins the VS Code version to `1.107.0`. That matches `engines.vscode` and the Antigravity build. It points at the compiled integration tests, and sets `extensionDevelopmentPath` to the repo root.
- Coverage (in the tester's specs):
  - activation: the extension `j-botros.claude-code-artifact` is active after one of its commands runs;
  - command: `claudeArtifact.openSamplePlan` is registered and runs without throwing;
  - webview: after that command, a webview tab is open in `vscode.window.tabGroups` whose label or view type matches the plan panel (check the actual `createWebviewPanel` viewType and title in `src/webview/planPanel.ts`);
  - diff review: call `startImplementReview(plan, folder)` (exported from `src/review/hunkReview.ts`) with a small plan that has one `proposedFiles` entry. Check that a diff editor opens and that the `claudeArtifact.acceptHunk` and `claudeArtifact.rejectHunk` CodeLenses are returned by `vscode.executeCodeLensProvider` for that document. Then close the review. The review writes nothing.
- No test may write to the repo or the workspace. Do NOT call `claudeArtifact.applyAccepted`: it shows a modal and writes files. Do NOT call `claudeArtifact.generatePlan`: it needs a logged-in `claude` CLI.
- No file under `src/` is changed. If a test needs a change in `src/`, stop and report it.

**Scope: files the developer may edit.**
- `package.json`:
  - devDependencies: add `@vscode/test-cli`, `@vscode/test-electron`, and `@types/mocha`, each pinned exactly (see above);
  - scripts: add `"test:integration": "npm run compile && tsc -p tsconfig.test.json && vscode-test"`;
  - scripts: add `"test": "npm run test:unit && npm run test:ui && npm run test:integration"`;
  - do not change other scripts or fields.
- `tsconfig.test.json` (new, repo root): extends `./tsconfig.json`. Include `test/integration/**/*`. Set `rootDir` to `.`, `outDir` to `out-test`, and `types` to `["mocha", "node"]`. Keep `strict: true`. Do not change `tsconfig.json`.
- `.vscode-test.mjs` (new, repo root): `files` is `out-test/integration/**/*.test.js`. `version` is `"1.107.0"`. `workspaceFolder` is `test-results/integration-workspace` (create it at run time if needed). `mocha` options: `timeout` of 60000 ms. Do not add `extensionDevelopmentPath` if the CLI picks up the root already; set it explicitly otherwise.
- `.gitignore`: add `.vscode-test/` and `out-test/`.
- `.vscodeignore`: add `out-test/**` and `.vscode-test/**`, so they are not packaged into the `.vsix`.

**Scope: files the tester owns.** `test/integration/**` only. Do not touch `test/unit/`, `test/ui/`, `src/`, or the root configs.

**Facts for the developer and tester.**
- Commands in `src/extension.ts` (`activate`): `claudeArtifact.openSamplePlan`, `claudeArtifact.generatePlan`. `src/review/hunkReview.ts` registers `claudeArtifact.acceptHunk`, `claudeArtifact.rejectHunk`, and `claudeArtifact.applyAccepted`. `startImplementReview(plan: Plan, folder: vscode.Uri)` is exported from `src/review/hunkReview.ts` (line 151).
- The extension has no `activationEvents`. VS Code 1.107 infers activation from `contributes.commands`.
- The extension ID is `j-botros.claude-code-artifact` (publisher `j-botros`, name `claude-code-artifact`).
- Compiled output: `out/` is the extension (`main` is `out/extension.js`). `out-test/` holds the compiled integration tests.
- `samplePlan` is exported from `src/plan/plan.ts`. Use it, or a small `Plan` object with one `proposedFiles` entry for the diff test.
- The unit and UI test configs already exclude `test/integration/**`. Check that `vitest.config.ts` still excludes it.

**Test commands for the developer.**
- `npm install` (adds the three devDependencies; `package-lock.json` changes, which is expected)
- `npm run compile`
- `npm run test:unit`
- `npm run test:integration`: it downloads VS Code the first time. If it fails because there are no tests yet, say so. If it fails on the download or the sandbox, report the exact error. Do not work around it.

**Test commands for the tester.**
- `npm run compile`
- `npm run test:unit` (must still pass; the count should not change)
- `npm run test:ui` (must still pass)
- `npm run test:integration`
- `npm test` once, if `test:integration` passes

**Notes.**
- Write each test with a one-line comment, as CLAUDE.md requires for every function.
- Keep the tests readable and deterministic. Do not depend on timing beyond waiting for the command to finish.
- Use `npm run` for all test commands. Do not call `npx vscode-test` directly; it is not on the shell allow list.

## Development

**What changed.** package.json (3 exact devDependencies, scripts `test:integration` and `test`), package-lock.json, tsconfig.test.json (new), .vscode-test.mjs (new), .gitignore (`out-test/`, `.vscode-test/`), .vscodeignore (`out-test/**`, `.vscode-test/**`). Nothing under src/ or test/ changed. vitest.config.ts still excludes `test/integration/**`.

**Pinned versions** (publish dates from `npm view <pkg> time`; all more than two weeks before 2026-11-03):
- `@vscode/test-cli` 0.0.15 (2026-06-22), newest available.
- `@vscode/test-electron` 3.1.0 (2026-07-24), newest available.
- `@types/mocha` 10.0.10 (2024-11-20), newest available.

**.vscode-test.mjs.** Sets `extensionDevelopmentPath` explicitly to the repo root, creates `test-results/integration-workspace` at load time, `version` 1.107.0, mocha timeout 60000.

**Results.**
- `npm run compile`: OK.
- `npm run test:unit`: 13 files, 193 tests passed.
- `npm run test:integration`: fails at `tsc -p tsconfig.test.json` with `error TS18003: No inputs were found in config file ... Specified 'include' paths were '["test/integration/**/*"]'`. Expected: no tests exist yet. The `vscode-test` step (VS Code download and launch) was therefore not reached and is untested.

**Not run.** `npm test`, `npm run test:ui`.

**For the tester.** Once test/integration has a `.test.ts` file, check that tsc builds into `out-test/integration/` (rootDir `.`, so output is `out-test/test/integration/...`; the glob `out-test/integration/**/*.test.js` in .vscode-test.mjs would then NOT match). Verify this first and report if the glob or rootDir needs changing; that is a root-config change for the core agent or developer, not the tester.

## Testing

**Verdict: FAIL.** The integration specs pass, but `npm test` fails because vitest picks up the compiled spec in `out-test/`. This needs a root-config fix (not in the tester's scope).

**Spec.** `test/integration/extension.test.ts` (mocha TDD, 4 tests): activation, `openSamplePlan` registered and runs, plan webview tab (viewType ends with `claudeArtifact.plan`, label `Sample Implementation Plan`), diff review (`startImplementReview` with a new-file `proposedFiles` entry; checks a `TabInputTextDiff` tab and the `acceptHunk` and `rejectHunk` lenses from `vscode.executeCodeLensProvider`; confirms the target file was not written). The review module is loaded from compiled `out/review/hunkReview.js`, not `src/`, so it shares the session state with the extension's lens provider (importing from `src/` would create a second module copy with an empty session).

**Commands and results.**
- `npm run compile`: OK.
- `npm run test:unit` (before `out-test/` existed): 13 files, 193 passed.
- `npm run test:ui`: 4 passed.
- `npm run test:integration`: 4 passing, 0 failing, exit 0. VS Code 1.107.0 downloaded and launched fine. (The first attempt had 1 failure because the tab list updates asynchronously; the test now waits for `tabGroups.onDidChangeTabs`.)
- `npm test`: FAIL at the `test:unit` step. Output:

```
FAIL  out-test/test/integration/extension.test.js [ out-test/test/integration/extension.test.js ]
Error: Cannot find module 'vscode'
Test Files  1 failed | 13 passed (14)
Tests  193 passed (193)
```

**Cause and fix needed.** Once `test:integration` has run, `out-test/test/integration/extension.test.js` exists. `vitest.config.ts` excludes `test/integration/**` and `out/**` but not `out-test/**`, so vitest runs the compiled spec and it cannot load `vscode`. Fix (root config, core agent or developer): add `"out-test/**"` to the `exclude` list in `vitest.config.ts`. Then re-run `npm run test:unit` and `npm test`. The same check may be needed for the Playwright config (it passed here, but confirm it ignores `out-test/`).

## Development (round 2)

- Added `"out-test/**"` to the `exclude` list in `vitest.config.ts` (commit 6457f06). Nothing else changed; `passWithNoTests` kept.
- `npm run compile`: pass.
- `npm run test:unit`: 13 files, 193 tests passed, 0 failed (with `out-test/` present).
- `npm run test:integration`: 4 passing, 0 failing.
- `npm test`: pass (unit, then ui 4 passed, then integration 4 passing).
- Tester: re-run `npm test` and confirm the unit step ignores `out-test/`.
