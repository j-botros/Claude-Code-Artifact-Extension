# Handoff: code-block-vscode-background

## Brief (core agent)

**Goal.** Remove the light gray box behind each line of code. Cause (from TASKS.md, owner's note): VS Code's webview base stylesheet sets `code { background-color: var(--vscode-textPreformat-background); padding: 1px 3px; border-radius: 4px }` and resets only the padding for `pre code`, so each code line gets a background box. The artifact CSS in `src/webview/planPanel.ts` sets the colour of `code` but not its background.

**Branch.** `task/code-block-vscode-background`. Commit all work there. Do not push to `main` or `dev`.

**Important: do not read the VS Code install.** The task text names `out/vs/workbench/contrib/webview/browser/pre/index.html` inside the VS Code app. That file is outside this repository, and CLAUDE.md Section 7 forbids reading files outside it. Do not open it, and do not search the VS Code install. Use only the three rules quoted above as the fixture. In the Development section, record the cause as "taken from the owner's note in TASKS.md, not re-read from the VS Code 1.107.0 install (outside the repo)". Do not claim it was verified in the stylesheet.

**Scope (files the developer may edit).**
- `src/webview/planPanel.ts`: the artifact CSS only.
- `handoffs/code-block-vscode-background.md`: the "Development" section only.

**Scope (files the tester may edit).**
- `test/ui/` (the UI test page and its spec files) and any `test/` helper the UI tests need.
- `handoffs/code-block-vscode-background.md`: the "Testing" section only.

Do not edit `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, or `package.json`. If you need a file outside your scope, stop and report it.

**Requirements (developer).**
1. Find every CSS rule in `src/webview/planPanel.ts` that gives `code`, `pre code`, `.code-line`, or `.code-line .body` a background, padding, or radius inside code blocks. Set `code` and `pre code` inside code blocks to `background: transparent`, `padding: 0`, and `border-radius: 0`. Record each rule you changed, with its line number, in the Development section.
2. Keep the `.file-mention` rule and `--mention-bg` (dark `#282828`, light `#f3f3f3`) exactly as they are. Inline file mentions keep their dark gray background. Only code blocks change.
3. Keep `pre` transparent, the click-to-edit and comment behaviour, and the strict nonce CSP. No new dependency. TypeScript strict mode. Comment every function and class, as CLAUDE.md requires.
4. Make the fix in `planPanel.ts` only. Do not add a test here.

**Requirements (tester).**
1. Add the three base rules as a fixture to the UI test page, with a comment giving the source (the owner's note in TASKS.md, VS Code 1.107.0 webview base stylesheet). Copy them as written: the `code` rule and the `pre code` padding reset. Also define `--vscode-textPreformat-background` to a visible colour (for example `#ff0000`) in the fixture. Without a defined value, the `background-color` would compute to `transparent` even without the fix, and the test would pass for the wrong reason.
2. Add Playwright tests (dark and light themes) that check the computed `background-color` of every `pre code` and every `.code-line` inside code blocks is `rgba(0, 0, 0, 0)`. Include a hovered line.
3. Add a check that a file mention (`.file-mention` in the Files table or the overview) keeps `--mention-bg` as its background (`rgb(40, 40, 40)` dark, `rgb(243, 243, 243)` light).
4. Check that the new tests would fail without the developer's fix. Say how you checked (for example, the fixture's red background shows on `code` before the fix). Record it in the Testing section.

**Constraints.**
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: one command per call. No `&&`, `;`, or `|`. Use only allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- Requirements 1 to 4 for the developer are applied.
- `npm run compile` passes.
- `npm run test:unit` passes, and the result is recorded.
- The tester's new UI tests pass with the fix and fail without it (as described in the Testing section).

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

## Development (developer)

**Cause.** Taken from the owner's note in TASKS.md, not re-read from the VS Code 1.107.0 install (outside the repo). It was not verified in the stylesheet.

**Changes in `src/webview/planPanel.ts` (artifact CSS).**
- Line 1074, `pre code`: added `background: transparent; padding: 0; border-radius: 0;` (keeps `color: var(--fg)`). This overrides the base `code` rule inside code blocks.
- Line 1075 (new), `.code-line, .code-line > .body`: `background: transparent; border-radius: 0;`. No padding reset on purpose: `.block > .body` has `padding-right: 26px` in the narrow media query (line ~1128) to leave room for the comment button, and a reset would remove it.
- The bare `code` rule (line 1073) is unchanged, so inline `code` keeps its colour. `.file-mention`, `--mention-bg`, and `pre` (transparent) are unchanged.
- No existing rule gave `.code-line` or `.code-line .body` a background, padding, or radius, except `.code-line pre` (padding 0, already set).

**Results.** `npm run compile` passes. `npm run test:unit` passes: 22 files, 368 tests. No old assertion broke.

**Tester should check.** With the red `--vscode-textPreformat-background` fixture, every `pre code` and `.code-line` (including hovered) computes `rgba(0, 0, 0, 0)` in dark and light. `.file-mention` keeps `rgb(40, 40, 40)` dark and `rgb(243, 243, 243)` light. Inline `code` outside blocks still gets the fixture background from the base rule, which is expected (only code blocks change).

## Testing (tester)

**Added.** `test/ui/codeBlockBackground.spec.ts` (new, 5 tests x dark and light = 10 tests). The fixture is a `<style nonce>` inserted before the artifact CSS. It holds the three base rules (`code { background-color: var(--vscode-textPreformat-background); padding: 1px 3px; border-radius: 4px }`, `pre code { padding: 0 }`, `:root { --vscode-textPreformat-background: #ff0000 }`). Its comment gives the source as the owner's note in TASKS.md (VS Code 1.107.0 webview base stylesheet), not re-read from the install.
- fixture paints inline code outside code blocks red (so a transparent result is meaningful).
- pre code and every `.code-line` and `.code-line .body` compute `rgba(0, 0, 0, 0)`, at rest and while hovering the first and last line.
- pre code computes padding `0px` and radius `0px`.
- `.file-mention` (Files table and prose) keeps `rgb(40, 40, 40)` dark and `rgb(243, 243, 243)` light, also on hover.
- guard test: with the fix rule removed from the rendered CSS, `pre code` computes `rgb(255, 0, 0)` and radius `4px`.

**Results.**
- `npm run compile`: pass (run inside each test command), exit 0.
- `npm run test:unit`: 22 files, 368 tests passed, exit 0.
- `npm run test:ui`: 127 passed, 0 failed (117 existing plus 10 new; an earlier run before I added the guard test had 125 passed).
- `npm run test:integration`: 33 passing, exit code 0.

**Fail-without-fix check.** I did not revert `src/` (out of scope, and git was not available to me for `git show`). The guard test removes the line-1074 fix (`background: transparent; padding: 0; border-radius: 0`) from the rendered HTML string and asserts that the red fixture then shows on `pre code` (`rgb(255, 0, 0)`, radius 4px). That passes, so the main tests would fail without the fix, since they assert `rgba(0, 0, 0, 0)` / `0px` on the same elements. Not verified: the `.code-line` rule (line 1075) has no failing counterpart, because the fixture only targets `code`, so `.code-line` is transparent with or without it. That rule is belt and braces.

Verdict: PASS
