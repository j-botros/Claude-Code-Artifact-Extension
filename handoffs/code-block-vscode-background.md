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

_Not yet written._

## Testing (tester)

_Not yet written._
