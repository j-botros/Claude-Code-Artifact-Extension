# Handoff: highlight-file-mentions

## Brief (core agent)

**Goal.** In the artifact view, remove the light gray highlight from every line in code blocks and every row in the Files table. Instead, any mention of a file path in the artifact gets a dark gray background that is very close to the page background, almost indistinguishable, in both themes. Keep the file link behaviour from `link-file-paths`.

**Branch.** `task/highlight-file-mentions`. Commit all work there. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/webview/planPanel.ts`: the CSS, and the renderer or script changes needed to mark file mentions.
- `src/plan/` for one new pure module if it helps (for example `src/plan/fileMentions.ts`) that finds file-path mentions in plain text. No VS Code imports in that module.
- `handoffs/highlight-file-mentions.md`: the "Development" section only.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, or `package.json`. If you need a file outside this scope, stop and report it.

**Requirements.**
1. **Find the existing highlight first.** The core agent could not find a gray highlight on code lines or Files table rows in the CSS of `src/webview/planPanel.ts`. Look for the rule that produces it: a background on `pre code` lines, `tr` or `td` in the Files table, or a hover or focus style such as the dashed `.editable:hover` outline. Remove that highlight from code lines and Files table rows. In the Development section, say which rule you found and changed, or say that none produces it.
2. **File mentions get a background.** Any file-path mention in the artifact gets a dark gray background. This covers the Files table path, the overview, steps, verification items, and any file path that appears in the text of the code comments or the code block. Choose the rule yourself and record it. Suggested rule: a path matches when it equals a `files[].path` in the plan, or when it is a relative path token with a file extension (for example `src/plan/plan.ts`). Pure detection goes in the new module with unit tests through the tester.
3. **Files table path cell.** The owner asked for both "no highlight on every Files table row" and "any mention, including the Files table". Resolve this as follows: the row has no highlight. Only the path text inside the path cell gets the mention background. Record this choice.
4. **Colours.** Add a CSS custom property for the mention background on `:root`, with a dark-theme value and a light-theme value in the existing light-theme block. Each value is very close to the page background (`--bg`) in its theme. Pick the values, check the contrast gap is small, and record the chosen hex values in the Development section. The owner has not confirmed them.
5. **File link behaviour unchanged.** The Files table path stays an `a.file-link` with `data-path`, and the click message is unchanged. Do not change the CSP, the nonce script, or the save path.
6. **No new framework or dependency.** Every new function and class gets a doc comment. TypeScript strict mode.
7. **Escape everything.** Any file-path wrapping uses the existing `escapeHtml`. Do not build HTML from unescaped text.

**Constraints.**
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: one command per call. No `&&`, `;`, or `|`. Use only allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- Requirements 1 to 7 are applied.
- `npm run compile` passes.
- `npm run test:unit` passes after the tester's changes. Before the tester runs, list any old assertions the change breaks in the Development section, but do not edit `test/`.

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- Unit: the file-mention detection module on plain text. Cover a path in a sentence, a path at the start or end of a line, a path with a trailing period or comma, a non-path word with a dot (for example `e.g.`), and a plan with a `files` entry.
- UI (Playwright, headless Chromium): code lines and Files table rows have no highlight background. A file mention, including the path cell in the Files table, has the mention background colour. Check both themes.
- Integration: only if a seam is needed. Do not add a test that needs a real VS Code window.

## Development (developer)

**Existing highlight found.** No per-line or per-row rule exists. The gray came from two whole-block backgrounds in `src/webview/planPanel.ts`: `.block.card > .body { background: var(--card) ... }` (the Files rows used the `card` class, so each row had a gray card) and `pre { background: var(--code-bg) ... }` (the code block). Changes: Files rows now use a new `file-block` class (no background or border, same padding via `.block.file-block > .body`), and `pre` is now `background: transparent` (its border stays). Steps and verification keep their `card` look, since the brief only names code and Files rows.

**Mention rule (new module `src/plan/fileMentions.ts`, `splitFileMentions(text, knownPaths)`).** A mention is (a) any string equal to a plan `files[].path`, or (b) a relative path token (optional `./` or `../`, optional directories, a name) ending in a common extension from an allow list (ts, tsx, js, jsx, mjs, cjs, json, md, css, html, yml, yaml, toml, txt, sh, py, go, rs, java, c, h, cpp, sql, xml, svg, png, vsix, lock, env, vue, and a few more). The extension allow list keeps `e.g.` and `1.5` out. A left boundary (not preceded by a word char, dot, slash, `@`, or `-`) and a right boundary (not followed by a word char, `-`, or `.word`) keep trailing `.` or `,` out of the mention. Joining all segments returns the input. Known false positives: `Node.js`-style words are not matched (js needs a name before it, so `Node.js` IS matched; accepted).

**Where applied.** Overview summary and out of scope, step text, verification items (including callout bodies), the Files `change` text, and the code block (per token, so syntax colours stay). Wrapped in `<span class="file-mention">`, built through `escapeHtml`. The title is not wrapped.

**Files table.** The row has no highlight. The path cell's `<code>` gets `class="file-mention"` (inside the `a.file-link` for existing files; plain `<code class="file-mention">` for new files). `a.file-link`, `data-path`, the openFile message, CSP, nonce script, and save path are unchanged.

**Colours.** New `--mention-bg` custom property. Dark: `#282828` (page `--bg` is `#1f1f1f`; the owner has not confirmed). Light: `#f3f3f3` (page `--bg` is `#ffffff`). Rule: `.file-mention { background: var(--mention-bg); border-radius: 3px; padding: 0 0.15em; }`.

**Known limit.** Mention spans live inside click-to-edit elements. After the user edits a field, the script sets `textContent`, so that field loses its mention highlighting until the panel is rebuilt. Same for edits restored from saved state. The saved text is unaffected.

**Results.** `npm run compile` passes. `npm run test:unit`: 3 failures in old assertions, all caused by this change (the tests are not edited):
- `test/unit/fileLinks.test.ts` "renders non-new files as links with the data-path": expects `<a ...><code>src/a.ts</code></a>`; now `<code class="file-mention">`.
- `test/unit/fileLinks.test.ts` "renders new files without a link and with the new badge": expects `<code>path</code> <span class="badge">new</span>`; now `<code class="file-mention">`.
- `test/unit/planRenderer.test.ts` "escapes every plan field...": the EVIL string is also a `files[].path`, so every occurrence of it in the summary, out of scope, and code is now wrapped in `<span class="file-mention">`. The assertions at lines 125, 127, 129, and 130 need updating by the tester.

**What the tester should check.** Unit tests for `splitFileMentions` (path in a sentence, at the start or end of a line, with trailing period or comma, `e.g.` not matched, known path with an odd extension, segments join back to the input). Update the three old tests. UI: `pre` and the Files rows have a transparent background; `.file-mention` computed background equals `--mention-bg` in both themes; the path cell in the Files table is a mention and the row is not; escaping of path text with `<`, `&`, and quotes.

## Testing (tester)

**Commands run.** `npm run compile`, `npm run test:unit`, `npm run test:ui`, `npm run test:integration`.

**Results (after my changes).**
- Unit: 19 files, 299 tests passed (15 new in `test/unit/fileMentions.test.ts`).
- UI (Playwright): 83 passed (8 new in `test/ui/fileMentions.spec.ts`: 4 tests x dark and light).
- Integration: 33 passing (no new tests, no seam needed).

**Test changes (commit bad0d48).**
- `test/unit/fileLinks.test.ts`: two expectations now use `<code class="file-mention">`.
- `test/unit/planRenderer.test.ts`: "escapes every plan field" now expects the EVIL string inside `<span class="file-mention">` (still fully escaped, checks not weakened); the Files cell expects `<code class="file-mention">ESCAPED</code>`.
- `test/ui/antigravityStyle.spec.ts`: the developer's change also broke two UI assertions that the handoff did not list. `pre` background was expected as `rgb(35,35,35)` (dark) and `rgb(243,243,243)` (light); now expected transparent, as the brief requires.
- New `test/unit/fileMentions.test.ts`: path in a sentence, at start and end, trailing period and comma, `e.g.`/`1.5`/`i.e.` not matched, known path with unlisted extension and with no extension, `./` and `../` paths, scoped package not matched, segments join back to input, hostile characters left raw in segments, regex metacharacters in a known path, longest known path wins.
- New `test/ui/fileMentions.spec.ts` (dark and light): `pre`, `pre code`, Files rows, `.body`, `.file-row`, cells have transparent background; Files path `code` (new and existing) has the mention background (`#282828` dark, `#f3f3f3` light) while the row does not; mentions in summary, code comments, steps, and verification have the same background; hostile path text (`<`, `&`, quotes) is escaped, injects no element, and `data-path` is intact.

**Known limit** (edited fields lose the highlight until rebuild): not tested. It is documented behaviour and the saved text is unaffected.

**Verdict: PASS.**
