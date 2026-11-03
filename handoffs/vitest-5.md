# Handoff: vitest-5

## Brief (core agent)

- **Goal:** Upgrade `vitest` from 3.2.7 to 5.1.0. The owner approved this major upgrade in TASKS.md. It clears the `tinypool` critical and the `@vitest/mocker` moderate reported by `npm audit`.
- **Branch:** `task/vitest-5` (from `origin/dev`).
- **Scope (files you may edit):**
  - `package.json`: change only the `vitest` devDependency. Use an exact pin, `5.1.0`, with no caret.
  - `package-lock.json`: updated by npm only.
  - `vitest.config.ts`: change only if the upgrade requires it.
  - Do not edit `test/`, `src/`, `TASKS.md`, `STATUS.md`, or `README.md`.
- **Definition of done:**
  1. `vitest` in `package.json` is exactly `5.1.0` (no `^` or `~`), and `package-lock.json` matches it.
  2. `npm run compile` passes.
  3. `npm run test:unit` passes with the same number of tests as before the upgrade (193 at the last run).
  4. `npm test` passes (unit, UI, and integration).
  5. `npm audit` is run and its count is written into the Development section. Expected: the `tinypool` critical and the `@vitest/mocker` moderate are gone.
  6. Any config change is listed with its reason. If no config change is needed, say so.
- **Release age:** The pin must be at least two weeks old. `npm view` is not on the allow list, so check the publish date if you can. If you cannot verify it, say so in Development. Do not change the version to get around this.
- **Stop and report** (do not work around it) if:
  - `npm install` cannot resolve `vitest@5.1.0`.
  - the upgrade needs changes to `test/` files. The tester owns those.
  - the Node version used by the tests is too old for vitest 5. Report it; do not change the Node setup.
- **Test commands:**
  - `npm run compile`
  - `npm run test:unit`
  - `npm test`
  - `npm audit`
  - Install with `npm install --save-dev --save-exact vitest@5.1.0` (npm install is on the runner allow list). Do not run `npm ci` after changing `package.json`, because it fails on a stale lock file.

## Development (developer)

**What changed**
- `package.json`: `vitest` changed from `3.2.7` to the exact pin `5.1.0` (no caret), via `npm install --save-dev --save-exact vitest@5.1.0`.
- `package-lock.json`: updated by npm (7 packages added, 24 removed, 11 changed).
- `vitest.config.ts`: no change needed.

**Results**
- `npm run compile`: pass.
- `npm run test:unit`: pass, 13 files, 193 tests (same as before). Vitest reports v5.1.0.
- `npm test`: pass (unit 193, UI 4 Playwright tests, integration 4 tests).
- `npm audit`: before 12 vulnerabilities (1 low, 8 moderate, 1 high, 2 critical); after 9 (1 low, 7 moderate, 1 high, 0 critical). The `tinypool` critical and the `@vitest/mocker` moderate are gone. The remaining ones are `diff`, `glob`, `minimatch`, and `serialize-javascript` through `mocha`, `@vscode/test-cli`, `@vscode/vsce`, and `c8`; none has a fix available.

**Release age:** Not verified. `npm view` is not on the allow list, so I could not check the publish date of vitest 5.1.0. I did not change the version.

**Notes**
- Vitest now prints a non-fatal Vite warning: `vitest.config.ts` uses ESM syntax in a file loaded as CommonJS (`configLoader: 'native'` will become the default in a future Vite major). Tests still pass. Fixing it needs a `.mjs` config or `"type": "module"`, which is outside this task, so I left it. Suppress it with `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` if wanted.

**Tester should check**
- `package.json` has `"vitest": "5.1.0"` with no `^` or `~`, and the lock file matches.
- Unit count is 193, and `npm test` passes in full.
- `npm audit` no longer lists `tinypool` or `@vitest/mocker`.
- The config warning is the only new output.

## Testing (tester)

_Pending._
