# Handoff: line-comments-editable-code

## Brief (core agent)

**Goal.** Make every line of the rendered plan commentable, and make the code block editable. Comments on a single code line keep their line reference and show as margin bubbles, as block comments do today. The edited code is saved through the existing edit path (`applyPlanEdits` and `savePlan`). Review Comments includes each line comment, labelled with its line.

**Branch.** `task/line-comments-editable-code` (from `origin/dev`). Commit on this branch only. Never push to `main` or `dev`.

**Scope: files the developer may edit.**
- `src/plan/reviewComments.ts` (block ids, labels, validation)
- `src/plan/planEdits.ts` (accept an optional `code` edit)
- `src/plan/codeLines.ts` (new, pure helpers: split code into lines, line ids and labels)
- `src/webview/planPanel.ts` (rendering, click-to-edit for code, line comments, script, `review()` and `save()` if needed)
- `src/plan/planPrompt.ts` only if the review prompt text needs a change (labels come from `formatCommentsForPrompt`, so probably not)
- `src/plan/codeTokens.ts` only if the tokeniser must expose token boundaries for line splitting

Do not edit `test/`, `README.md`, `TASKS.md`, `STATUS.md`, or `handoffs/` except the Development section below.

**Design decisions (core agent's choices).**
1. **Line block ids.** Each code line is `code:<i>`, with `i` 0-based, matching `step:<i>`. Its label is `Code line <i+1>`. The existing `code` id stays for the whole code block, so the block-level comment button still works. `title`, `overview`, `file:<i>`, `step:<i>`, and `verification:<i>` are already one line each, so they need no change.
2. **Validation.** `parseReviewComments` accepts `code:<i>` only when `i` is in range for the current plan. The regex and the `blockIdsForPlan` list must both include the line ids. `blockLabel` must return `Code line <i+1>`.
3. **Line splitting.** Code is split on `\n`. A trailing newline does not make an extra line. Use one shared pure function for the split, used by both the renderer and `blockIdsForPlan`, so the ids cannot drift.
4. **Rendering.** Each line is a `.block` with `data-block="code:<i>"`, with its own margin column and "+" button, nested inside the code block. Tokens that span lines (for example a block comment) must still get their colour on every line. Keep the file-mention highlight and the copy button. The code block keeps its whole-block comment button.
5. **Editing the code.** The code is editable on click, as other text is. Edit the raw code, not the DOM text. The safe option is to keep the raw code in an escaped attribute or a hidden element, so the edit does not depend on how the highlighted spans are split. Editing opens a multi-line textarea (like steps). An empty code block is rejected ("This field cannot be empty.").
6. **Code save.** `applyPlanEdits` accepts an optional `code` (string). When `code` is absent, keep the current code, so existing callers and tests still pass. When present, it must be a string with at least one non-blank character. Store it with trailing whitespace on the last line trimmed, but keep the inner text exact. Keep `language`. The webview sends `code` in `savePlan`, `reviewComments`, and the kebab actions, and restores it from `vscode.getState().edits` on reload.
7. **Line comments after a code edit.** If the edit changes the line count, drop `code:<i>` comments whose `i` is now out of range, so the review does not fail on them. Keep the rest. Say how many were dropped in the status message. Do not drop comments silently.
8. **Review.** Review Comments sends the edited code in its payload, so `parseReviewComments` checks line ids against the edited plan. The prompt labels each line comment `Code line N`, through `formatCommentsForPrompt`.
9. **Unchanged.** Plan JSON shape, `proposedFiles`, Implement the Design, the strict nonce CSP (no inline handlers, no new external resources), the light and dark themes, the Antigravity look (sizes, colours, and CSS custom properties from `:root`), and the phone layout.

**Definition of done.**
- Hovering any line of the code block shows a "+" in the right margin. Clicking it starts a comment on that line. It shows as a bubble with Edit and Delete, as block comments do.
- The code block is editable on click. The edited code saves to `.claude/plans/<slug>.json`, and survives a reload.
- Review Comments includes each line comment labelled `Code line N`, and fails nothing on a valid line.
- Every new function and class has a doc comment (CLAUDE.md Section 3). Strict TypeScript compiles.
- Unit tests (tester) cover the line split and the id and label mapping, the `code` save and its rejection cases, and the out-of-range line comment drop.
- Playwright tests (tester) cover a comment on one code line, editing the code, and that the edit survives a reload.
- `npm run compile`, `npm run test:unit`, `npm run test:ui`, and `npm test` pass.

**Test commands.** `npm run compile`, `npm run test:unit`, `npm run test:ui`, `npm test`.

**Attribution.** Commit messages end with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Not in scope.** `openQuestions` (a later task). No change to the plan format in CLAUDE.md.

## Development
(developer writes here)

## Testing
(tester writes here)
