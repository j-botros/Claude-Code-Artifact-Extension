# Handoff: vitest-pin-two-weeks

## Brief (core agent)

- **Goal:** Change the `vitest` pin from `5.1.0` (published 2026-11-02, too new for the two-week rule) to `5.0.5` (published 2026-10-15, the newest 5.x release at least two weeks old). Then confirm the test suite and audit still behave, and record the audit result.
- **Branch:** `task/vitest-pin-two-weeks` (from `origin/dev`). Already created.
- **Scope (files you may edit):**
  - `package.json`: change only the `vitest` devDependency to the exact pin `5.0.5`, with no caret.
  - `package-lock.json`: updated by npm only.
  - `vitest.config.ts`: change only if the pin change requires it (not expected).
  - Do not edit `test/`, `src/`, `TASKS.md`, `STATUS.md`, or `README.md`.
- **Definition of done:**
  1. `vitest` in `package.json` is exactly `5.0.5` (no `^` or `~`), and `package-lock.json` matches it.
  2. `npm run compile` passes.
  3. `npm run test:unit` passes. Expected count is 193 tests in 13 files (the count at the last run).
  4. `npm test` passes (unit, UI, and integration).
  5. `npm audit` is run. Write the full count, and say whether the `tinypool` critical is still reported. Record this in the Development section.
  6. Any config change is listed with its reason. If none, say so.
- **Release age:** The pin must be at least two weeks old. `npm view` is not on the allow list, so you cannot verify it directly. State in Development that the date comes from the core agent's check (published 2026-10-15). Do not change the version to get around any failure.
- **Stop and report** (do not work around it) if:
  - `npm install` cannot resolve `vitest@5.0.5`.
  - the pin change needs changes to `test/` files. The tester owns those.
  - the Node version used by the tests is too old for vitest 5. Report it; do not change the Node setup.
- **Test commands:**
  - `npm run compile`
  - `npm run test:unit`
  - `npm test`
  - `npm audit`
  - Install with `npm install --save-dev --save-exact vitest@5.0.5` (npm install is on the runner allow list). Do not run `npm ci` after changing `package.json`, because it fails on a stale lock file.
- **Context:** The previous pin, `5.1.0`, was set in run 18 (`vitest-5`). The audit at that point was 9 (0 critical, 1 high, 7 moderate, 1 low), with `tinypool` and `@vitest/mocker` cleared. Compare your audit count with that.

## Development (developer)

**Status: BLOCKED. No pin change was made.**

- Ran `npm install --save-dev --save-exact vitest@5.0.5` on branch `task/vitest-pin-two-weeks`.
- It failed with exit code 1 and this output: `npm error Cannot read properties of null (reading 'edgesOut')`. The log is `/Users/jobo/.npm/_logs/2026-11-03T21_32_55_085Z-debug-0.log`. I could not read it, because it is outside the repo and my tools refuse to search outside the repo.
- This is an npm internal error (arborist, the dependency tree builder). The text does not say that `vitest@5.0.5` cannot be found. I could not tell whether the version resolves, so I treated it as the brief's "cannot resolve" stop condition.
- `package.json` and `package-lock.json` are unchanged (`git status` shows only the pre-existing `TASKS.md` change and this handoff). `vitest` is still `5.1.0`.
- Not run: compile, `test:unit`, `npm test`, `npm audit`. Their results would say nothing about the 5.0.5 pin.
- Release age (published 2026-10-15) is the core agent's check. I did not verify it.
- I did not retry with workarounds (deleting `node_modules` or the lock file, `--legacy-peer-deps`, `--force`) or change the version. The brief says to stop and report.

Suggested next step for the core agent: decide whether I may retry after removing `node_modules` and `package-lock.json` (which would regenerate the whole lock file), or retry with `--legacy-peer-deps`. A stale or odd lock file tree is the usual cause of this error.

## Testing (tester)

_(to be written by the tester)_
