# Handoff: ui-tests

## Brief (core agent)

**Goal.** Add `npm run test:ui`: Playwright with headless Chromium, run against the built webview HTML produced by `renderPlanHtml` in `src/webview/planPanel.ts`. Cover rendering, light and dark themes, comments, and edits. This needs no VS Code host.

**Branch.** `task/ui-tests-2`. The name `task/ui-tests` is held by a stale local branch from run 12 (one docs commit, no code). It is not reused or deleted here; see STATUS.md.

**Definition of done.**
- `npm run test:ui` exits 0 on a clean checkout after `npm install`, and runs the Playwright specs in `test/ui/`.
- `npm run test:unit` still passes and does not pick up any file under `test/ui/`.
- `@playwright/test` is pinned to the exact version `1.55.0` as a devDependency (released August 2025, so it is well over two weeks old). Do not use a caret range.
- Coverage (in the tester's specs):
  - rendering: title, overview, out-of-scope, file table with a "new" badge for `isNew`, code block, numbered implementation steps, verification list, in the order CLAUDE.md Section 3 requires;
  - light and dark themes: same page rendered with Playwright `colorScheme: 'light'` and `'dark'`; assert computed CSS custom property values differ and the page is not unstyled;
  - comments: type into a step comment box, reload the page with the same stubbed state, and check the text is restored;
  - edits: change the title and a step text, reload, and check the edited values are restored.
- No file under `src/` is changed. If a test needs a change in `src/`, stop and report it.

**Scope: files the developer may edit.**
- `package.json`: add the devDependency `"@playwright/test": "1.55.0"`; add the script `"test:ui": "npm run compile && playwright test"`. Do not change other scripts.
- `playwright.config.ts` (new, repo root): `testDir: "test/ui"`, Chromium project only, headless, no retries by default, `reporter: "list"`, and `outputDir` under `test-results/`.
- `vitest.config.ts` (new, repo root): keep the existing unit-test behaviour, and exclude `test/ui/**` and `test/integration/**` from the unit run. Keep `passWithNoTests`.
- `.gitignore`: add `test-results/` and `playwright-report/`.
- `tsconfig.json`: only if `tsc -p ./` picks up `playwright.config.ts` or `vitest.config.ts` and fails. Keep strict mode. Do not add `test/` to the compile.

**Scope: files the tester owns.** `test/ui/**` only. Do not touch `test/unit/`, `src/`, or the root configs.

**Test commands for the developer.**
- `npm install` (adds Playwright; `package-lock.json` is updated, which is expected)
- `npm run compile`
- `npm run test:unit`
- `npm run test:ui`: it may fail because there are no specs yet. Passing with 0 tests is acceptable here, if Playwright reports no tests found and exits 0. If it exits non-zero, add `--pass-with-no-tests` to the Playwright command in the script and report that choice.

**Test commands for the tester.**
- `npx playwright install chromium` (one-time, downloads Chromium, about 150 MB, from Playwright's CDN; this is a tooling download, not a paid service)
- `npm run compile`
- `npm run test:ui`
- `npm run test:unit` (must still pass; the count should not change because no unit test was added)

**Facts about the webview for the tester.**
- `renderPlanHtml(plan, nonce, options?)` returns a full HTML document as a string. It has a CSP meta tag: `default-src 'none'; script-src 'nonce-…'; style-src 'nonce-…'`. Its inline script is nonce'd and runs on load.
- The inline script calls `acquireVsCodeApi()` at load. A headless page does not have it, so tests must add a stub with `page.addInitScript`. The stub needs `getState()`, `setState(v)`, and `postMessage(m)`. Back `getState` and `setState` with `sessionStorage`, so a `page.reload()` keeps state the way a VS Code webview does.
- Themes come from `@media (prefers-color-scheme: dark)` in the CSS.
- Selectors used by the script: `.edit-title`, `.edit-summary`, `.edit-outofscope`, `.step-text[data-step]`, `.comment[data-step]`, `button.review`, `button.implement`, `p.status`, `.badge`.
- The tester should write the HTML to a temp file in the test, or use `page.setContent` with the same HTML. Use `setContent` only if the CSP still applies in that mode. Prefer a file under `test-results/` (gitignored), generated from `out/src/webview/planPanel.js` after compile, or from `out/webview/planPanel.js` if that is the actual output path. Check the path in `out/` before writing the spec.
- The sample plan is `samplePlan` in `src/plan/plan.ts` (`out/plan/plan.js` after compile). Use it or a small plan object in the test.

**Notes.**
- Playwright 1.55 needs Node 18 or newer. Use the Node already on the machine.
- Keep the specs readable. Give each test a one-line comment, as CLAUDE.md requires for every function.

## Development

**Commit:** dd48e15 on `task/ui-tests-2` (code commit; this handoff edit is uncommitted).

**What changed**
- `package.json`: devDependency `"@playwright/test": "1.55.0"` (exact); script `"test:ui": "npm run compile && playwright test --pass-with-no-tests"`. `package-lock.json` updated.
- `playwright.config.ts` (new): `testDir: "test/ui"`, `outputDir: "test-results/output"`, `retries: 0`, `reporter: "list"`, headless, one Chromium project (Desktop Chrome).
- `vitest.config.ts` (new): `passWithNoTests`, excludes `node_modules`, `out`, `test/ui/**`, `test/integration/**`.
- `.gitignore`: `test-results/`, `playwright-report/`.
- `tsconfig.json` unchanged (`include` is `src/**/*` only, so root configs are not compiled). No `src/` change.

**Results**
- `npm install`: ok. `npm run compile`: ok. `npm run test:unit`: 13 files, 193 tests passed.
- `npm run test:ui` without the flag: `Error: No tests found`, exit 1. So I added `--pass-with-no-tests` (as the brief allows); now it exits 0. The tester may remove the flag once specs exist.
- Chromium was not installed by me (`npx playwright install chromium` is for the tester).

**For the tester**
- Compiled renderer: `out/webview/planPanel.js` (rootDir is `src`, so no `out/src/`). Sample plan: `out/plan/plan.js`.
- `planPanel.ts` imports `vscode`, which does not exist outside VS Code. Requiring `out/webview/planPanel.js` in a Playwright spec will fail unless `vscode` is stubbed first (for example, hook `Module._load` or pre-populate `require.cache`/`Module._resolveFilename` for `"vscode"` with `{}`; the unit tests use `vi.mock("vscode", () => ({}))`).
- Layout: put specs in `test/ui/*.spec.ts` (Playwright's default match is `*.spec.ts`/`*.test.ts`; avoid `.test.ts` names so Vitest-style globs never confuse them). Playwright compiles TS itself.
- Stub approach: `page.addInitScript` defining `window.acquireVsCodeApi` with `getState`/`setState` on `sessionStorage` and `postMessage`. Write the HTML to a file under `test-results/` and `page.goto(file://...)`, so the CSP applies.
- Tests `test/ui/**` are excluded from `npm run test:unit` by `vitest.config.ts`.

## Testing

**Spec:** `test/ui/planPanel.spec.ts` (4 tests). `vscode` is stubbed with a `Module._load` shim while requiring `out/webview/planPanel.js` and `out/plan/plan.js`. HTML is written to `test-results/html/*.html` and opened by `file://` URL so the CSP applies. The `acquireVsCodeApi` stub (via `addInitScript`) uses `sessionStorage`, records posts on `window.__posted`, and answers `savePlan` with an ok `saveResult` (the renderer only persists edits to state after that reply).

**Commands run**
- `npx playwright install chromium`: ok (Chromium 140).
- `npm run compile`: ok.
- `npm run test:ui`: 4 passed, 0 failed.
  - renders all sections in order (title, summary, out of scope, code, files table with "new" badge only on the isNew row, numbered steps, verification, checked by vertical position)
  - light and dark themes differ (`--bg` #ffffff vs #1e1e1e; `--fg`, `--card`, body background differ)
  - step comments survive a reload
  - title and step edits survive a reload
- `npm run test:unit`: 13 files, 193 passed, 0 failed (no test/ui files picked up).

**src/ bugs found:** none.

**Note:** `test:ui` still carries `--pass-with-no-tests`; the core agent may now remove it.
