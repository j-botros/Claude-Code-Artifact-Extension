# Handoff: audit-fix (branch `task/audit-fix-2`)

Earlier attempt: `handoffs/audit-fix.md` (runs 44 to 49) on `task/audit-fix`. That branch's only extra commit is lockfile churn (`56c2648`), so this run starts fresh from `origin/dev`. The TASKS.md row allows this. Do not touch `task/audit-fix`.

## Brief (core agent)

**Goal.** Clear the 9 `npm audit` findings on `dev` (1 high, 7 moderate, 1 low). The owner approved (2026-11-16) replacing `@vscode/test-cli` (and the `mocha` it pulls in) with a direct `@vscode/test-electron` runner and a small test runner of our own. A major `@vscode/vsce` version is also allowed (owner, 2026-11-05).

**Baseline (from run 49, `npm audit` on dev).** Run `npm audit` first and record its exact output in the Development section, because it may have changed.
- `serialize-javascript` <=7.1.2 (high), `diff` 6.0.0 to 8.0.2 (low): via `mocha`, via `@vscode/test-cli`.
- `glob` 9.0.0 to 14.0.1 (moderate): via `@vscode/test-cli`, `mocha`, `test-exclude` (via `c8`), and `@vscode/vsce` 3.6.0.
- `minimatch` 7.0.0 to 11.0.0 (moderate): via the same chain. `@vscode/vsce` 4.1.0 is flagged through `minimatch` instead of `glob`.
- `mocha`, `test-exclude`, `c8`, `@vscode/test-cli`, `@vscode/vsce`: flagged only as dependents.

**What the integration specs use today (do not change the specs).** The specs in `test/integration/*.test.ts` use mocha's TDD interface as globals: `suite`, `test`, `suiteSetup`, `suiteTeardown`, `setup`, `teardown`, async functions that return promises, and `this.timeout(ms)` inside a `test` callback (`planWatcher.test.ts`, called with a `function`, not an arrow). They compile with `tsconfig.test.json` (`types: ["mocha", "node"]`) to `out-test/test/integration/**/*.test.js`. `.vscode-test.mjs` sets VS Code `1.107.0`, `extensionDevelopmentPath` = repo root, the workspace folder `test-results/integration-workspace` (created before launch), and a 60000 ms timeout.

**Approach.**
1. Remove `@vscode/test-cli` from `devDependencies`. Keep `@vscode/test-electron` (update it only if its own tree has a finding).
2. Add a launcher, for example `test/runner/runIntegration.ts` (or `.mjs`), that calls `runTests` from `@vscode/test-electron` with `version: "1.107.0"`, `extensionDevelopmentPath` = repo root, `extensionTestsPath` = the compiled in-host entry, and `launchArgs` = `[workspaceFolder, "--disable-extensions"]` or equivalent to what `vscode-test` does today. It must create the workspace folder first, as `.vscode-test.mjs` does. Exit non-zero on failure.
3. Add an in-host entry, for example `test/runner/index.ts`, that exports `run(): Promise<void>`. It defines the TDD globals above (`suite`, `test`, `suiteSetup`, `suiteTeardown`, `setup`, `teardown`), with `this.timeout(ms)` support and a default timeout of 60000 ms per test and hook. It loads every `out-test/test/integration/**/*.test.js` in sorted order (use `fs.readdirSync` recursion; do not add `glob`), runs the suites in order, prints one line per test (pass or fail, with the error), and a summary line `N passing, M failing`. It rejects if any test or hook fails. Nested `suite` calls are not used today; supporting them is optional.
4. Keep the global types working. Either keep `@types/mocha` (types only, no runtime, not an audit finding) or add a small `.d.ts` that declares the globals. Prefer keeping `@types/mocha` if `npm audit` stays clean with it.
5. Update `tsconfig.test.json` to also compile `test/runner/**/*`, and change the `test:integration` script to `npm run compile && tsc -p tsconfig.test.json && node out-test/test/runner/runIntegration.js` (or the equivalent for your file names). `npm run test:integration` must stay the command.
6. Delete `.vscode-test.mjs` if nothing uses it any more, and remove its line from `.vscodeignore` only if the file is gone. `test/**` and `out-test/**` are already excluded from the `.vsix`.
7. For the remaining `glob`/`minimatch` findings through `@vscode/vsce`: try `@vscode/vsce` at its latest version, and try npm `overrides` in `package.json` to a patched `glob`/`minimatch` version if one exists (check with `npm audit` after `npm install`). Keep an override only if `npm run package` still produces a `.vsix` with the same file list. Do not run `npm audit fix --force`. Do not downgrade packages. Do not change `vitest`, `@playwright/test`, or `typescript`.

**Scope (files the developer may edit).** `package.json`, `package-lock.json`, `tsconfig.test.json`, `.vscode-test.mjs` (may delete), `.vscodeignore`, and new files under `test/runner/` (owner-approved exception to the `test/` ownership rule for the runner only). Do not edit `src/`, the specs in `test/integration/`, `test/unit/`, `test/ui/`, or `README.md`.

**Release-age rule.** Packages should be at least two weeks old. `npm view` is not allowed, so list every package you add or change in the Development section with its version and say the publish date was not checked.

**Definition of done.**
- `npm audit` reports 0 vulnerabilities. If any remain, list each with its advisory ID, its path, and why no fix exists. Do not call the task done in that case; say so plainly.
- `npm run compile` passes.
- `npm run test:integration` runs every existing spec in VS Code 1.107.0 and passes. The run 54 count was 48 integration tests; report the new count and explain any difference.
- A deliberately failing check makes `npm run test:integration` exit non-zero. Show this once (for example a temporary `test` that throws, run, then removed before commit) and record the result. Do not commit the failing test.
- `npm test` passes (unit, UI, integration).
- `npm run package` produces the `.vsix`. Record the file count. The `.vsix` must not be committed.
- The Development section records the before and after `npm audit` output, every package change, and how the runner maps each mocha global.

**Branch.** `task/audit-fix-2`. Commit there. Do not push, do not merge, do not touch other branches.

**Shell rules.** One command per call; no `&&`, `;`, or `|`. Allowed: git status, git diff, git log, git add, git commit, npm ci, npm install, npm audit, npm run, npm test, npx vitest, npx playwright. Use the Edit and Write tools for files.

**Test commands.** `npm install`, `npm audit`, `npm run compile`, `npm run test:integration`, `npm test`, `npm run package`.

**Attribution.** Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Development (developer)

_Pending._

---

## Testing (tester)

_Pending._
