# Handoff: minimap-hunk-markers

## Brief (core agent)

**Goal.** Show the green (added) and red (removed) hunks of the Implement the Design review on the editor's overview ruler (the vertical scrollbar strip), using `overviewRulerColor` on the decoration types. The owner chose this approach on 2026-11-05. The VS Code public API has no colour option for the minimap itself, so this task does not touch the minimap. The README must say so (the core agent does that, not you).

**Branch.** `task/minimap-hunk-markers`. Commit all work there. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/review/hunkReview.ts`: in `decorationTypes()` (around lines 44 to 61), add `overviewRulerColor` to the added decoration and to the removed decoration. Use the theme colour ids below. You may also set `overviewRulerLane` if you need it, but keep the default unless there is a reason.
- `handoffs/minimap-hunk-markers.md`: the "Development" section only.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, or `package.json`. If you need a file outside this scope, stop and report it.

**Requirements.**
1. Added-line decoration (`addedType`): `overviewRulerColor` set to `new vscode.ThemeColor("editorOverviewRuler.addedForeground")`.
2. Removed-line decoration (`removedType`): `overviewRulerColor` set to `new vscode.ThemeColor("editorOverviewRuler.deletedForeground")`.
3. Keep the existing `backgroundColor`, `isWholeLine`, and the `setDecorations` calls unchanged. Do not change the decision logic, the apply path, or the inline review behaviour.
4. No new dependency. TypeScript strict mode. Add a doc comment on any changed function or class (CLAUDE.md, Section 3).
5. In the Development section, record the two theme colour ids, and say they are public VS Code theme colour ids used by the diff editor's overview ruler. Say that you did not check them in a running VS Code window.

**Constraints.**
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: one command per call. No `&&`, `;`, or `|`. Use only allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- Requirements 1 to 5 are applied.
- `npm run compile` passes.
- `npm run test:unit` is run by you and the result is recorded.

**Test commands for the tester.** `npm run compile`, `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- Integration (`@vscode/test-cli`, VS Code 1.107.0 host): the review opens an inline document with decorations. Check that the added and removed decoration types are created with `overviewRulerColor` set to the two theme colour ids. If the decoration types are not reachable from a test, add a small pure seam in `src/review/` only if it can be done without changing behaviour, and report it. Do not edit `src/` yourself: the developer owns it. If a seam is needed, report it as a blocker in the Testing section.
- Existing tests must still pass. Record any old assertion that breaks.
- Not possible here: seeing the scrollbar marks in a real VS Code or Antigravity window. Say so in the Testing section. The owner checks in Antigravity.

## Development (developer)

_Not yet started._

## Testing (tester)

_Not yet started._
