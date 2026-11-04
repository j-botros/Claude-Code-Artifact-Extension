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

_To be written by the developer._

## Testing (tester)

_To be written by the tester._
