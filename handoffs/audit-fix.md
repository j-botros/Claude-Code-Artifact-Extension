# Handoff: audit-fix

## Brief (core agent)

**Goal.** Fix the 9 `npm audit` findings on `dev` (1 high, 7 moderate, 1 low). Owner approved upgrading parent packages for this task (2026-11-05), and a major version of `@vscode/vsce` is allowed.

**Baseline (`npm audit`, on `task/audit-fix` at origin/dev `c12205f`):** 9 vulnerabilities (1 low, 7 moderate, 1 high). Findings and their path:
- `serialize-javascript` <=7.1.2 (high): via `mocha` (via `@vscode/test-cli` 0.0.15). "No fix available" in the current tree.
- `diff` 6.0.0 - 8.0.2 (low): via `mocha`. No fix available.
- `glob` 9.0.0 - 14.0.1 (moderate): via `@vscode/test-cli`, `mocha`, `test-exclude`, and `@vscode/vsce` 3.6.0 (`@vscode/vsce` 2.31.x and 2.32.x through 3.9.2 are affected).
- `minimatch` 7.0.0 - 11.0.0 (moderate): via `@vscode/test-cli`, `glob`, `mocha`, `test-exclude`.
- `mocha`, `test-exclude`, `c8`, `@vscode/test-cli`, `@vscode/vsce`: flagged because they depend on the above.

**Scope (files the developer may edit).** `package.json`, `package-lock.json`, and config files only if the upgrade needs it (for example `.vscode-test.mjs`, `tsconfig.test.json`). Do not edit `src/`, `test/`, or `README.md`. Do not touch `vitest` (the vitest pin is a separate task).

**Approach (developer's choice, in this order):**
1. Update the parent packages: `@vscode/test-cli` (and `@vscode/test-electron` only if needed), and `@vscode/vsce` to the newest version whose tree clears its findings. A major `@vscode/vsce` version is allowed; if you move to one, run `npm run package` and check the `.vsix` is produced.
2. Use npm `overrides` in `package.json` only where a patched version of a transitive package exists. Do not pin to a version with a known advisory.
3. Do not run `npm audit fix --force`. Edit `package.json` and run `npm install` instead.
4. Do not downgrade packages. Do not change `vitest`, `@playwright/test`, or `typescript`.

**Release-age rule.** Packages should be at least two weeks old. `npm view` is not on the allowed shell list, so you cannot check publish dates. Do not guess: list every package you change in the Development section with its version, and say the publish date was not checked.

**Definition of done.**
- `npm audit` reports 0 vulnerabilities. If any remain, list each one in the Development section with the exact advisory and why no fix exists. Do not call the task done on your own.
- `npm run compile` passes.
- `npm test` passes (unit, UI, and integration).
- `npm run package` produces the `.vsix`.
- Only `package.json`, `package-lock.json`, and any config files named above are changed in the code commit. The root `.vsix` file must not be committed. Check `.gitignore`; if it is not ignored, do not add it.
- The Development section records the before and after `npm audit` output (summary counts and the affected package list).

**Branch.** `task/audit-fix`.

**Test commands.** `npm install`, `npm audit`, `npm run compile`, `npm test`, `npm run package`.

**Attribution.** Commit message ends with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

---

## Development (developer)

**Result: the definition of done is NOT met. `npm audit` still reports 9 vulnerabilities (1 low, 7 moderate, 1 high). No package.json change was committed.**

**Before (baseline):** 9 vulnerabilities (1 low, 7 moderate, 1 high). Affected: `diff`, `mocha`, `@vscode/test-cli`, `glob`, `@vscode/vsce`, `test-exclude`, `c8`, `minimatch`, `serialize-javascript`.

**What I tried:**
1. `npm install --save-dev --save-exact @vscode/test-cli@latest`: reported "up to date". `@vscode/test-cli` 0.0.15 is already the latest, so no change. `@vscode/test-electron` was not touched.
2. `npm install --save-dev --save-exact @vscode/vsce@latest`: installed `@vscode/vsce` 4.1.0. Audit still showed 9 findings. vsce 4.1.0 moved from the `glob` finding to a `minimatch` finding (`@vscode/vsce >=3.9.2-0` depends on a vulnerable `minimatch`), so the count did not drop. I reverted `package.json` to `@vscode/vsce` 3.6.0 because the major upgrade gave no benefit.
3. No `overrides` were added. Every advisory reports "No fix available" in `npm audit`, so no patched version exists to override to.

**After:** 9 vulnerabilities (1 low, 7 moderate, 1 high), the same packages as the baseline. With vsce 4.1.0 the `@vscode/vsce` entry stays flagged (via `minimatch`) and `glob` stays flagged via test-cli, mocha and test-exclude.

**Remaining findings and why no fix exists (all "No fix available" per `npm audit`):**
- `serialize-javascript` <=7.1.2 (high): GHSA-5c6j-r48x-rmvq (RCE via RegExp.flags and Date.prototype.toISOString), GHSA-qj8w-gfj5-8c6v (CPU exhaustion DoS), GHSA-m5mm-p8h7-m29v (XSS via unescaped `</script`). Comes through `mocha`, which `@vscode/test-cli` 0.0.15 (latest) requires.
- `diff` 6.0.0 - 8.0.2 (low): GHSA-73rr-hh4g-fpgx (DoS in parsePatch and applyPatch). Through `mocha`.
- `glob` 9.0.0 - 14.0.1 (moderate): GHSA-3g3m-2fjr-6pw4 (AbortSignal cancellation bypass). Through `@vscode/test-cli`, `mocha`, `test-exclude` (via `c8`).
- `minimatch` 7.0.0 - 11.0.0 (moderate): GHSA-g3hv-75wg-m249 (DoS via globparts amplification). Through the same chain, and through `@vscode/vsce` 4.1.0.
- `mocha`, `test-exclude`, `c8`, `@vscode/test-cli`, `@vscode/vsce`: flagged only because they depend on the above.
All remaining findings are in dev dependencies (test tooling and packaging), not in the shipped extension.

**Tests (run with `@vscode/vsce` 3.6.0, package.json unchanged):** `npm test` passed. Unit 381 passed, UI 128 passed, integration 36 passing. `npm run compile` passed (it runs inside `test:ui`). I did not run `npm run package` separately, because package.json is unchanged and vsce stays at 3.6.0.

**Release age:** publish dates were not checked (`npm view` is not allowed). The only package I installed beyond the current pins was `@vscode/vsce` 4.1.0, and I reverted it.

**Lockfile:** the `npm install` round trip rewrote `package-lock.json` (hoisting changes, `undici` 7.30.1 to 7.30.2, `table` 6.9.0 to 6.10.1, `lodash.truncate` removed). This was not an intended change and I did not commit it. The shell rules do not allow `git checkout` or `git restore`, so the file is left modified and uncommitted in the working tree. The core agent can discard it with `git checkout package-lock.json`.

**Options for the core agent (not done):** wait for upstream releases of `@vscode/test-cli` (mocha) and `glob`/`minimatch`; or replace `@vscode/test-cli` with a direct `@vscode/test-electron` runner plus a patched mocha, which needs `.vscode-test.mjs` and test changes outside my scope.

---

## Testing (tester)

_Pending._
