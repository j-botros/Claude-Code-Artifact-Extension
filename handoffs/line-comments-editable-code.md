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
Commit: `aaebfbd` on `task/line-comments-editable-code`.

**Files changed (src/ only).**
- `src/plan/codeLines.ts` (new): `splitCodeLines`, `codeLineCount`, `codeLineId`, `codeLineLabel`, `codeLineIndex`, `splitTokensByLine`, `dropOutOfRangeLineComments`.
- `src/plan/reviewComments.ts`: `blockIdsForPlan` adds `code:<i>` right after `code`; regex accepts `code:<i>`; `blockLabel("code:2")` is `Code line 3` (plain `code` stays `Code`).
- `src/plan/planEdits.ts`: optional `code`. Absent keeps the current code. Not a string gives "code must be a string". Blank gives "code must not be empty". Stored with `trimEnd()` (so trailing blank lines go too); inner text exact; `language` kept.
- `src/webview/planPanel.ts`: rendering, script, CSS, host messages (below). `codeTokens.ts` unchanged.

**Ids and labels.** Line id `code:<i>`, 0-based. Label `Code line <i+1>`, used for `data-label`, the aria label, the Review popover and the prompt. A trailing newline adds no line; empty code is one empty line.

**Split and raw code.** `splitCodeLines` is the one split, used by `blockIdsForPlan` and the renderer. Tokens are cut per line by `splitTokensByLine`, so a block comment keeps its colour on each line. `renderCodeLines` (exported) renders one `.block.code-line` per line (own margin and plus) inside `div.editable.code-lines[data-edit="code"]`, which is nested in the outer `code` block (its whole-block comment button and the copy button stay). The raw code is in `data-raw` on that div, and the script keeps it in `rawCode`; the edit uses `rawCode`, never the DOM text.

**Editing.** Click (or Enter on the wrapper) opens a 12-row monospace textarea. Enter inserts a newline; Ctrl/Cmd+Enter or blur commits; Escape cancels. Blank is rejected with "This field cannot be empty." Clicks inside a `.margin` do not start an edit. `readEdits()` now includes `code`; `savePlan`, `reviewComments` and the kebab actions send it. Reload restores `code` from `getState().edits`.

**Re-render after an edit or reload.** The webview posts `renderCode {code}`; the host replies `codeRendered {code, lines}` where `lines` is `codeLineSegments(...)` data (kind plus parts with a mention flag). The webview builds the line blocks by cloning a template line and using `textContent` only, so the existing "only one innerHTML (the comment icon)" unit guard still holds. The reply is ignored if `code` no longer equals `rawCode`. Until it arrives the old lines show.

**Out-of-range line comments.** On a code commit the webview drops `code:<i>` with `i >= new line count` from `getState().comments` (its own small JS copy of the count) and sets the status to "Dropped N line comment(s) that no longer match a line." That text is also appended to the "Saved to ..." message when the save result arrives. The host also runs `dropOutOfRangeLineComments` in `review()` before `parseReviewComments`, as a safety net for a message that raced the edit (it does not report). Other invalid ids still fail.

**Deviations.**
- `renderHighlighted` was removed (replaced by per-line rendering). Existing tests did not import it.
- Outer-block hover/focus CSS and `wireBlock` now use `:scope > .margin` so a nested line's button is not matched by the outer block.
- The code `pre` is now one `<pre>` per line (class `.code-line pre`), inside a bordered `.code-lines` div. The wrapped phone layout puts each line's plus in an absolutely positioned margin.

**Unit tests.** `npm run compile` is clean. `npm run test:unit`: 294 pass, 5 fail, all from the intended change (leave for the tester):
- `planRenderer.test.ts`: block order list now includes `code:0..`; "only title, summary, outOfScope and steps editable" and "no step blocks for zero steps" now also see the `code` edit key.
- `reviewComments.test.ts`: both `blockIdsForPlan` lists now include `code:<i>`.

**Not verified.** `npm run test:ui` and `npm test` were not run (shell permission was denied for test:ui). The webview script, the phone layout and the light theme were not checked in a browser, and the Playwright tests for line comments and code editing are not written. Existing UI tests that query `pre` or `.block` counts may need updating.

### Development (round 2)

Commit: 4be6d40 (only `src/webview/planPanel.ts`).

1. Line comment buttons opened the code editor. Cause: the comment buttons re-render the margin (`show()` clears the holder), so the button was detached before the click bubbled to `div.editable.code-lines`, and `closest(".margin")` failed. Fix: in `wireBlock`, the block's `.margin` now stops click propagation, so no comment control click reaches the editable handler. The existing `closest(".margin")` check stays as a harmless backup.
2. Copy button not clickable. Cause: `.code-lines` painted over `button.copy-code`. Fix: `z-index: 6` on `button.copy-code` (already `position: absolute`). Look unchanged.

Results: `npm run compile` clean. `npm run test:unit`: 20 files, 319 passed. `npm run test:ui`: 94 passed, 0 failed (includes the three listed tests).

## Testing
Verdict: **FAIL** (two src/ bugs, found by 3 failing UI tests). Test commit: see git log (`test: code line comments and editable code`).

**Commands and results.**
- `npm run compile`: clean.
- `npm run test:unit`: 20 files, 319 passed, 0 failed.
- `npm run test:ui`: 94 tests, 91 passed, 3 failed (below).
- `npm run test:integration`: 33 passing, exit 0 (VS Code 1.107.0).
- `npm test` was not run as one command, because `test:ui` fails and `npm test` stops there. The three parts were run separately.

**Tests changed.** `test/unit/planRenderer.test.ts` (block order now has `code:0`; editable keys now `title, summary, outOfScope, code, step:*`; the read-only list no longer holds `code`; zero-steps test sees `code`). `test/unit/reviewComments.test.ts` (both `blockIdsForPlan` lists have `code:<i>`). `test/ui/planPanel.spec.ts` (`pre code` replaced by `[data-edit='code']`; `addComment` and the cancel test use the block's own `:scope > .margin`, since the outer `code` block now contains the line blocks; the read-only test no longer includes the code). `test/ui/antigravityStyle.spec.ts` (code border is now on `.code-lines`, `pre` border is 0). `test/ui/layout.spec.ts` (copy-button count and box use `.code-lines`).

**Tests added.** `test/unit/codeLines.test.ts` (split incl. trailing newline and empty code; id and label; `codeLineIndex`; `splitTokensByLine`; `dropOutOfRangeLineComments`; `blockIdsForPlan`, `parseReviewComments` in and out of range; `formatCommentsForPrompt` gives `Code line N`; `applyPlanEdits` code absent, valid with trim, blank, non-string). `test/ui/codeLines.spec.ts` (one block per line; comment on one line; line comment survives reload; edit by click shows new lines and `savePlan` carries `code`; Escape cancels; blank rejected; margin plus does not start an edit; edited code survives reload; dropping lines drops out-of-range comments and reports it; no code editor opens after save, cancel or delete of a line comment).

**Failing tests (src/ bugs, not fixed).**
1. `codeLines.spec.ts` "saving, cancelling, and deleting a line comment do not open the code editor": after clicking "Add Comment" on a code line, `textarea.edit-code` exists (expected 0). Cause: the click handler on `div.editable.code-lines` skips clicks whose `event.target.closest(".margin")` matches, but Add Comment, Cancel, Delete and Edit Comment remove their own button from the page (`holder.textContent = ""` in `show()`) before the event reaches the editable div. The detached target no longer has a `.margin` ancestor, so `startEdit` opens the code editor, hiding the code and stealing focus. Fix idea: check `event.composedPath()` or test the target's `.margin` before the handler removes it (for example, a capture-phase listener, or `stopPropagation` in the comment buttons).
2. `layout.spec.ts:346` "the copy button posts copyCode and carries no code text" and `layout.spec.ts:554` "no CSP violations with callouts, copy, and edit": clicking `button.copy-code` times out. Playwright log: `<div ... class="editable code-lines" data-edit="code"> intercepts pointer events`. The `.code-lines` div (positioned, later in the DOM) now paints over the absolutely positioned Copy button, so the Copy button cannot be clicked with a mouse. Fix idea: give `button.copy-code` a `z-index` above `.code-lines`.

**Not verified.** Real VS Code or Antigravity UI (integration tests only exercise the host messages); the phone layout and light theme for the new line blocks beyond the existing UI tests; the `codeRendered` reply is simulated in the Playwright stub (plain segments), so colour-per-line rendering is covered only by the unit test of `splitTokensByLine`. The vitest version in use is 5.1.0 (the CLAUDE.md pin note says 5.0.5); not touched.
