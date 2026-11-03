# Handoff: scaffold-minimal-extension

## Brief (written by the core agent)

### Goal
Create a minimal VS Code extension (TypeScript, strict mode). It has one command that opens a webview showing a hard-coded sample plan. This is the base that later tasks (`plan-renderer`, and the owner's `antigravity-compat-check`) build on.

### Branch
`task/scaffold-minimal-extension` (branched from `origin/dev`). Commit only to this branch.

### Scope: files you may create or edit
- `package.json`
- `package-lock.json` (created by `npm install`)
- `tsconfig.json`
- `.gitignore` (add `node_modules/` and `out/` only if they are missing; keep existing lines)
- `.vscodeignore`
- `.vscode/launch.json` (one "Run Extension" config, `"type": "extensionHost"`)
- `src/**` (all source)
- `vitest.config.ts` (only if needed for the unit harness)

Do not edit `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `handoffs/` (except your own "Development" section), `test/`, `.claude/`, `scripts/`, or `logs/`.

### Requirements
1. `package.json`:
   - `"name": "claude-code-artifact"`, `"publisher": "j-botros"`, `"license": "MIT"`, `"version": "0.0.1"`.
   - `"main": "./out/extension.js"`.
   - `"engines": { "vscode": "^1.131.0" }`.
   - `contributes.commands`: one command, id `claudeArtifact.openSamplePlan`, title `Claude Artifact: Open Sample Plan`.
   - Do not add `activationEvents` unless needed; a contributed command activates the extension.
   - Dev dependencies: `typescript`, `@types/vscode` (matching `engines.vscode`), `@types/node`, `vitest`. Pin each to a version released at least two weeks before 2026-11-02 (CLAUDE.md, Section 3, item 7). Record the chosen versions in your Development section.
   - `@vscode/vsce` as a dev dependency, plus a `package` script (`vsce package`). Verify with `npm run package` only if it runs without network downloads; otherwise say so.
2. `tsconfig.json`: `"strict": true`, `outDir` `out`, `rootDir` `src`, module suitable for a VS Code extension (CommonJS, target ES2022).
3. Scripts in `package.json`:
   - `compile`: `tsc -p ./`. The webview HTML is inline TypeScript in this task, so no asset copying is needed. Note this in your Development section, because CLAUDE.md says compile copies webview assets once `plan-renderer` adds separate HTML/CSS files.
   - `test:unit`: `vitest run --passWithNoTests`. The tester adds tests later, so this must exit 0 with no test files.
   - `package`: as above.
   - Do NOT add `test:ui` or `test:integration` in this task. Those are not part of this scope.
4. `src/extension.ts`: `activate` registers the command `claudeArtifact.openSamplePlan`. The command opens a webview panel (`vscode.window.createWebviewPanel`) that shows the sample plan.
5. `src/webview/` : a panel host class and inline HTML. The HTML must:
   - Use a strict Content-Security-Policy with a nonce (`default-src 'none'`, `style-src` with the nonce, `script-src` with the nonce). Scripts are not needed in this task, so leave `enableScripts` false.
   - Use CSS custom properties for colors, with light and dark variants via `prefers-color-scheme` or VS Code theme classes. This is a basic start; the full theme work belongs to `plan-renderer`.
   - Show the plan's title and steps as escaped text (never inject plan text as raw HTML).
6. `src/plan/`: a pure module with
   - a `SamplePlan` type (`title`, `summary`, `steps: { id, title, detail }[]`), with JSON-serializable fields only,
   - a `samplePlan` constant with 3 steps,
   - `parsePlanJson(text: string)`: strips one optional Markdown code fence (```json ... ```), then `JSON.parse`s, and returns a discriminated result `{ ok: true, plan } | { ok: false, error }` (no throws). This is the only logic the unit tests will check. Keep it free of `vscode` imports so unit tests can load it without VS Code.
7. Code style (CLAUDE.md, Section 3): every function and class has a comment. TypeScript strict mode. No UI framework.

### Definition of done
- `npm install` succeeds.
- `npm run compile` exits 0 with no TypeScript errors under `strict`.
- `npm run test:unit` exits 0 (with no tests yet, because of `--passWithNoTests`).
- `.vscode/launch.json` and the command are present and documented in your Development section.
- Nothing outside the scope above is changed.
- Work is committed on `task/scaffold-minimal-extension`.

### Test commands the tester must run
- `npm install`
- `npm run compile`
- `npm run test:unit`

`test:ui` and `test:integration` are out of scope for this task. The tester should report them as not applicable, not as failures.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm install`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands (for example `node -v`, `npm -v`, `ls`). Use the Read, Glob, Grep, Write, and Edit tools for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the dependency versions chosen, the commit hash, test output summary, and what the tester should check.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` only.

## Development

**Code commit:** `9bda88c` on `task/scaffold-minimal-extension`.

### What changed
- `package.json`, `package-lock.json`, `tsconfig.json` (strict, CommonJS, ES2022, rootDir `src`, outDir `out`), `.vscodeignore`, `.gitignore` (added `node_modules/` and `out/`).
- `src/extension.ts`: `activate` registers command `claudeArtifact.openSamplePlan` ("Claude Artifact: Open Sample Plan"), which opens the webview.
- `src/webview/planPanel.ts`: `PlanPanel` host, `renderPlanHtml`, `escapeHtml`. Nonce CSP (`default-src 'none'`, nonce style-src and script-src), `enableScripts: false`, CSS custom properties with light/dark via `prefers-color-scheme`. Plan text is always escaped.
- `src/plan/plan.ts`: `SamplePlan`, `samplePlan` (3 steps), `parsePlanJson` (strips one optional code fence, returns `{ok:true,plan}|{ok:false,error}`, never throws, validates the shape). No `vscode` import.
- `compile` does not copy assets: the webview HTML is inline TypeScript in this task. Once `plan-renderer` adds separate HTML/CSS files, compile must copy them to `out/`.

### Dependency versions (exact pins)
- typescript 5.9.3, vitest 3.2.4, @vscode/vsce 3.6.0, @types/node 22.15.21, @types/vscode 1.144.0.
- Chosen from memory (registry lookup was not an allowed command); only @types/vscode failed to resolve. `@types/vscode@1.131.0` and `1.130.0` do not exist; I took `latest`, which is 1.144.0.
- OPEN ITEM: `@types/vscode` (1.144.0) is newer than `engines.vscode` (^1.131.0). `vsce package` rejects this, so `npm run package` will likely fail until the owner either raises `engines.vscode` to ^1.144.0 or picks an older `@types/vscode` that exists. `npm run package` was not run.
- Release dates (two-week rule) were not verified for any pin.

### NOT created: `.vscode/launch.json`
The write was denied by the permission system, so `.vscode/launch.json` was NOT created, per the core agent's decision. The Extension Development Host launch config is an open item for the owner.

### Test results
- `npm install`: succeeded after the @types/vscode change (6 audit vulnerabilities reported, not addressed).
- `npm run compile`: exit 0, no TypeScript errors.
- `npm run test:unit`: exit 0, "No test files found" (expected, `--passWithNoTests`).

### What the tester should check
- The three commands above. `test:ui` and `test:integration` are not applicable.
- Unit-test `parsePlanJson`: plain JSON, fenced JSON (```json), invalid JSON, wrong shape, empty string.
- Unit-test `escapeHtml` / `renderPlanHtml` (in `src/webview/planPanel.ts`, which imports `vscode`, so it cannot be loaded by Vitest without a mock; consider that when testing).
