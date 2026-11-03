# Handoff: plan-format

## Brief (written by the core agent)

### Goal
Change the plan type and `parsePlanJson` so they match the plan shape in CLAUDE.md, Section 3 exactly. Update the sample plan to the new shape. Keep the webview compiling and showing the new fields as escaped text. The full renderer is a later task (`plan-renderer`), so do not design the layout here.

### Branch
`task/plan-format` (branched from `origin/dev`). Commit only to this branch.

### Required plan shape (CLAUDE.md, Section 3)
Fields, in this order:
- `title`: string
- `overview`: object
  - `summary`: string (two or three sentences)
  - `outOfScope`: string, or `null` when not needed
- `proposedChanges`: object
  - `language`: string
  - `code`: string
- `files`: array of `{ path: string, change: string, isNew: boolean }`. An empty array is allowed.
- `implementationSteps`: array of strings
- `verification`: array of strings

Do NOT add `proposedFiles` in this task. It belongs to `implement-review`.
Extra unknown fields are ignored, not rejected.

### Scope: files you may edit
- `src/plan/plan.ts`: the plan type, `samplePlan`, and `parsePlanJson`.
- `src/webview/planPanel.ts`: only what is needed to compile against the new type and to render the new fields as escaped text. Keep the existing nonce CSP, `enableScripts: false`, and the escaping. Plan text is never raw HTML.
- `src/extension.ts`: only if the type rename requires it.
- `handoffs/plan-format.md`: only your own "Development" section.

Do not edit `test/` (tester only), `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or `handoffs/` except your own section. Do not add dependencies.

### Requirements
1. Rename the type `SamplePlan` to `Plan` and export it. Update imports in `src/` to match. Keep it free of `vscode` imports.
2. `parsePlanJson(text: string): ParseResult` keeps its current contract:
   - It strips one optional Markdown code fence, then `JSON.parse`s.
   - It returns `{ ok: true, plan }` or `{ ok: false, error }`. It never throws.
   - It validates every field in the shape above. The error names the bad field path, for example `overview.summary must be a string` or `files[0].isNew must be a boolean`.
   - `outOfScope` may be a string or `null`. Any other type is an error. A missing `outOfScope` key is an error.
   - Every element of `implementationSteps` and `verification` must be a string.
3. `samplePlan: Plan` must use the new shape, with 3 implementation steps and at least 1 verification entry. It must pass `parsePlanJson` when serialized with `JSON.stringify`.
4. `renderPlanHtml(plan: Plan, nonce: string)` keeps its signature. It renders at least: title, `overview.summary`, `overview.outOfScope` when not null, `implementationSteps` as a list, and `verification` as a list. Every value is escaped with `escapeHtml`. Keep the nonce CSP meta tag.
5. Every function and class needs a doc comment (CLAUDE.md, Section 3). TypeScript strict mode.

### Definition of done
- `npm run compile` exits 0 with no errors under `strict`.
- `npm run test:unit` exits 0. The tester's tests pass.
- `samplePlan` round-trips through `parsePlanJson`.
- Nothing outside the scope above is changed.
- Work is committed on `task/plan-format`.

### Test commands the tester must run
- `npm install` (only if `node_modules` is missing)
- `npm run compile`
- `npm run test:unit`

`npm run test:ui` and `npm run test:integration` do not exist yet. Report them as not applicable, not as failures.

### Test coverage the tester must add (test/unit/plan.test.ts, updated)
- Valid full plan parses, and every field is returned with the expected value.
- Valid plan with `outOfScope: null` parses. Valid plan with `files: []` parses.
- Missing top-level field (each of the six) returns `ok: false` with an error naming that field.
- Missing `overview.summary`, missing `proposedChanges.code`, and missing `files[].isNew` each return `ok: false`.
- Wrong types: `isNew` as a string, `implementationSteps` with a number, `outOfScope` as a number, `verification` not an array. Each returns `ok: false`.
- A ```json fence and a plain ``` fence each parse.
- Invalid JSON, an empty string, `[]`, and `null` return `ok: false` without throwing.
- Round-trip of `samplePlan`.
- `renderPlanHtml` escapes `<script>` in the title, summary, a step, and the code-free fields; includes `default-src 'none'` and the nonce.
- `escapeHtml` tests stay as they are.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm install`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands (for example `node -v`, `npm -v`, `ls`). Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the commit hash, the test output summary, and what the tester should check.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` only.

## Development

What changed:
- `src/plan/plan.ts`: `SamplePlan` and `PlanStep` replaced by exported `Plan` (and `PlanFile`) matching CLAUDE.md Section 3. `samplePlan` uses the new shape (3 steps, 1 verification). `parsePlanJson` validates every field through `validatePlan`, with errors naming the field path (e.g. `files[0].isNew must be a boolean`). `outOfScope` must be present and be a string or null. Unknown fields are dropped.
- `src/webview/planPanel.ts`: imports `Plan`; `renderPlanHtml` renders title, summary, out-of-scope (when not null), proposed code, files, steps, and verification, all through `escapeHtml`. CSP, nonce, and `enableScripts: false` unchanged.
- `src/extension.ts`: no change needed.

Compile: `npm run compile` exits 0, no errors.

Tests not run (the tester owns test/). `test/unit/plan.test.ts` still uses the old shape (`summary`, `steps`) and will fail until the tester updates it.

Tester should check: the coverage list in the brief; that `samplePlan` round-trips; that `renderPlanHtml` escapes `<script>` in every field, including file path and change.

Commit: see git log on `task/plan-format`.
