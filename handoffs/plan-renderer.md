# Handoff: plan-renderer

## Brief (written by the core agent)

### Goal
Render the plan as the artifact view, in the section order defined in CLAUDE.md, Section 3: title, overview (summary, then out of scope when not null), proposed changes (code block), files (table), implementation steps (numbered list), verification (list). Files are a table. A file with `isNew: true` is marked "new". Light and dark themes both work. Every value is escaped. This task changes only the HTML/CSS produced by `renderPlanHtml`. It adds no buttons, no comments, no editing, and no message passing.

### Branch
`task/plan-renderer` (branched from `origin/dev`). Commit only to this branch.

### Current state
`src/webview/planPanel.ts` already renders all six sections in the right order, but files are a bulleted list, not a table, and the layout is minimal. `src/plan/plan.ts` (`Plan` type, `parsePlanJson`, `samplePlan`) is done and must not change.

### Decision for this task: file paths are text, not links
The webview runs with `enableScripts: false` and a `default-src 'none'` CSP, so a plain `<a href>` to a relative path does nothing useful. Clicking to open a file needs message passing, which is out of scope here. Render each path inside `<code>` as text. Do not add `<a>` elements, `href`, `command:` URIs, or any script. Report this choice in your Development section so the owner can see it.

### Required HTML structure (in this order)
1. `<h1>` with the title.
2. `<p class="summary">` with `overview.summary`.
3. `<h2>Out of scope</h2>` and `<p>` only when `overview.outOfScope` is not null.
4. `<h2>Proposed changes</h2>`, then a `<pre><code>` block with `proposedChanges.code`. Show `proposedChanges.language` as a small label above the block, escaped. Use `class="language-<safe>"` only if the value matches `/^[a-zA-Z0-9+#-]*$/`; otherwise omit the class.
5. `<h2>Files</h2>` and a `<table>` with the header row `Path`, `Change`. Each row: `<code>` path, the change text, and a "new" marker (for example `<span class="badge">new</span>`) when `isNew` is true. When `files` is empty, show a single `<p>` saying "No files." instead of an empty table.
6. `<h2>Implementation steps</h2>` and an `<ol>` of steps.
7. `<h2>Verification</h2>` and a `<ul>` of entries.

### Requirements
1. Keep the signature `renderPlanHtml(plan: Plan, nonce: string): string`.
2. Keep the CSP meta tag exactly as it is now, with `default-src 'none'`, the `style-src 'nonce-...'` and `script-src 'nonce-...'` values, and `<style nonce="...">`. Do not add `img-src`, `connect-src`, or any other source.
3. Every value from the plan goes through `escapeHtml`. This includes the language label and the code block. Do not trust any plan string as HTML.
4. Themes: CSS custom properties for colors, with `@media (prefers-color-scheme: dark)` overrides. Keep the existing variable names. Add variables for table borders and the badge color. Do not hard-code colors outside `:root`.
5. Layout: readable, one column, max width around 52rem. Table cells wrap long text (`overflow-wrap: anywhere` on code). The `<pre>` scrolls horizontally, not the page.
6. Every function and class needs a doc comment (CLAUDE.md, Section 3). TypeScript strict mode.
7. Helper functions may be added in `planPanel.ts`. Keep them private (not exported) unless a test needs them. `escapeHtml` stays exported.

### Scope: files you may edit
- `src/webview/planPanel.ts`: the only source file you change.
- `handoffs/plan-renderer.md`: only your own "Development" section.

Do not edit `src/plan/`, `src/extension.ts`, `test/` (tester only), `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any handoff section other than your own. Do not add dependencies.

### Definition of done
- `npm run compile` exits 0 with no errors under `strict`.
- `npm run test:unit` exits 0. Existing tests still pass, and the tester's new tests pass.
- Sections appear in the order listed above, and the "new" badge appears only for `isNew: true`.
- With `files: []`, the page shows "No files." and no empty table.
- With `outOfScope: null`, no "Out of scope" heading appears.
- No script, no `<a>` element, no `href`, and no inline event handler appears in the output.
- Nothing outside the scope above is changed.
- Work is committed on `task/plan-renderer`.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures.

### Test coverage the tester must add (test/unit/planRenderer.test.ts, new file)
- Section order: the index of each heading and marker in the output is increasing in the order listed above.
- Escaping: `<script>` and `"` in the title, summary, out-of-scope, language, code, file path, file change, a step, and a verification entry all appear as escaped text. The raw `<script>` string does not appear anywhere in the output.
- `outOfScope: null` produces no "Out of scope" heading. A string produces it.
- `files: []` produces "No files." and no `<table>`.
- `isNew: true` produces the "new" badge on that row only. `isNew: false` produces no badge.
- The output contains the CSP meta tag with `default-src 'none'` and the given nonce in both `style-src` and `script-src`, and `<style nonce="...">`.
- The output contains no `<script`, no `<a `, no `href=`, and no `on*=` attribute.
- The output contains `prefers-color-scheme: dark`.
- A `language` value with a space or quote does not appear as a class attribute.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm install`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands (for example `node -v`, `npm -v`, `ls`). Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the commit hash, the test output summary, and what the tester should check. Use the Edit or Write tool. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` only. Use the Edit or Write tool.

## Development

Commit: e8de0f0 on `task/plan-renderer`. Only `src/webview/planPanel.ts` changed.

What changed:
- Files render as a `<table>` (Path, Change). Each path is in `<code>`; `isNew: true` adds `<span class="badge">new</span>` on that row only. Empty `files` gives `<p>No files.</p>` and no table.
- Added a language label (`<div class="lang-label">`, escaped) above the code block. `class="language-<x>"` is added to `<code>` only when the language is non-empty and matches `/^[a-zA-Z0-9+#-]*$/`.
- New private helpers `renderItems` and `renderFiles`, with doc comments.
- CSS: new variables `--table-border`, `--table-head-bg`, `--badge-bg`, `--badge-fg` in `:root` and the dark override. Styles for the table, badge, pre (horizontal scroll), and `code` with `overflow-wrap: anywhere`. No colors outside `:root`.
- CSP meta tag and `<style nonce>` are unchanged.

Decision to report: file paths are plain text in `<code>`, not links. No `<a>`, `href`, `command:` URIs, or scripts.

Results: `npm run compile` exit 0. `npm run test:unit`: 27 of 27 passed (existing `plan.test.ts`; no renderer tests yet, the tester adds them).

Tester should check: section order, escaping in every field including language, `outOfScope: null`, `files: []`, badge only on new rows, CSP and nonce, no `<script`/`<a `/`href=`/`on*=`, `prefers-color-scheme: dark` present, and that a language with a space or quote gets no class (an empty language also gets no class and no label).

## Testing

Verdict: PASS.

Commands run:
- `npm run compile`: exit 0, no errors.
- `npm run test:unit`: 2 files, 38 passed, 0 failed (27 existing in `plan.test.ts`, 11 new in `test/unit/planRenderer.test.ts`).
- `npm run test:ui` and `npm run test:integration`: not applicable (do not exist yet).

New tests cover: section order, escaping in all nine fields (title, summary, out-of-scope, language, code, path, change, step, verification), `outOfScope` null vs string, empty files ("No files." and no table), table header, badge only on `isNew` rows, exact CSP meta tag and nonce on `<style>`, no `<script`/`<a `/`href=`/`on*=`, `prefers-color-scheme: dark`, language class only for safe values (`c++` gets a class; values with spaces or quotes get none), and `<ol>`/`<ul>` lists.

No bugs found. The test file mocks `vscode` with `vi.mock("vscode", () => ({}))`, as `plan.test.ts` does.
