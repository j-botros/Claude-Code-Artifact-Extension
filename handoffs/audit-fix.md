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

_Pending._

---

## Testing (tester)

_Pending._
