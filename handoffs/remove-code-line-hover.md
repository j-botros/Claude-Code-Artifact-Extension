# Handoff: remove-code-line-hover

## Brief (core agent)

**Goal.** Remove the per-line highlight from code blocks. The rule `.code-line:hover > .body { background: var(--mention-bg); border-radius: 3px; }` in `src/webview/planPanel.ts` (around line 859) was added by `line-comments-editable-code` (commit `aaebfbd`). It highlights each line of code on hover. Remove it so no code line has a background, on hover or otherwise. Keep the dark gray background on file mentions only, which comes from `highlight-file-mentions` (`.file-mention`).

**Branch.** `task/remove-code-line-hover`. Commit all work there. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/webview/planPanel.ts`: remove the hover rule. Do not change any other rule unless it is needed to keep code lines background-free.
- `handoffs/remove-code-line-hover.md`: the "Development" section only.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, or `package.json`. If you need a file outside this scope, stop and report it.

**Requirements.**
1. Find every rule that gives a code line (`.code-line`, its `.body`, or `pre code` lines) a background, including hover and focus states. Remove them. Record each rule you found and removed, with its line number, in the Development section. Note that the hover rule came from commit `aaebfbd`.
2. Keep `.file-mention { background: var(--mention-bg) ... }` and the `--mention-bg` custom properties exactly as they are.
3. Keep `pre` transparent (set by `highlight-file-mentions`). Do not change the click-to-edit or comment behaviour.
4. No new dependency. TypeScript strict mode. Escape everything as before.

**Constraints.**
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: one command per call. No `&&`, `;`, or `|`. Use only allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- Requirements 1 to 4 are applied.
- `npm run compile` passes.
- `npm run test:unit` is run by you and the result is recorded. If an old assertion breaks because of this change, list it in the Development section. Do not edit `test/`.

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- UI (Playwright, headless Chromium): add a test that hovers a `.code-line` and checks its computed `background-color` is transparent (`rgba(0, 0, 0, 0)`), and that a code line with no hover is also transparent. Check the test in both themes if the existing spec helpers make that simple.
- UI: a file mention (for example the Files table path `code` or a mention in the overview) keeps `var(--mention-bg)` as its computed background (`#282828` dark, `#f3f3f3` light).
- Unit and integration: no change needed unless an existing test asserts the hover rule. Update such a test only if it asserts the removed rule.

## Development (developer)

**What changed.** Removed one rule from `src/webview/planPanel.ts` (line 859 before the edit): `.code-line:hover > .body { background: var(--mention-bg); border-radius: 3px; }`. It was added by `line-comments-editable-code` (commit `aaebfbd`).

**Rules searched.** Every `.code-line` rule (lines 856-859 and the narrow-screen block at 887-891), plus `.code-lines` (854-855) and `.code-line pre` (858). Only line 859 set a background. No focus-state background existed. `.code-line pre` has `border: 0` and no background, so `pre` stays transparent. `.file-mention` (line 851) and `--mention-bg` (lines 699 and 747) are unchanged.

**Results.**
- `npm run compile`: passed.
- `npm run test:unit`: 21 files, 341 tests, all passed. No old assertion broke.

**Left for the tester.** Playwright check that a hovered and an unhovered `.code-line` are both transparent, and that `.file-mention` keeps `--mention-bg`.

## Testing (tester)

**Added.** `test/ui/codeLineHover.spec.ts` (4 tests, dark and light). It checks that every `.code-line` and its `.body` are `rgba(0, 0, 0, 0)` at rest and while hovered (first and last line, with another line hovered), and that `.file-path code.file-mention` keeps `rgb(40, 40, 40)` (#282828 dark) or `rgb(243, 243, 243)` (#f3f3f3 light), also while hovered. No existing test asserted the removed rule.

**Commands and results.**
- `npm run compile`: passed.
- `npm run test:unit`: 21 files, 341 tests passed, 0 failed.
- `npm run test:ui`: 104 passed, 0 failed (includes the 4 new tests).
- `npm run test:integration`: 33 passing, 0 failing.

**Verdict: PASS.**
