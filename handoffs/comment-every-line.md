# Handoff: comment-every-line

## Brief (core agent)

**Goal.** Every single line of the rendered artifact is commentable, not only code lines. A "line" is each line of text in:
- the title,
- the overview summary,
- the out-of-scope note,
- each code line,
- each file row (the Files table),
- each implementation step,
- each verification item,
- each open question,
- and each line of wrapped text inside those blocks (a long paragraph that wraps onto several visual lines gets one comment target per visual line).

Hovering a line shows the comment icon in the right margin. Clicking it starts a comment on that line. Each comment keeps a reference to its line and shows as a bubble in the margin. Review Comments includes every line comment, labelled by its line. Keep the edit-on-click behaviour and the existing single-line code comments (`code:<i>` line comments from `line-comments-editable-code`).

**Branch.** `task/comment-every-line`. Commit all work there. Do not push to `main` or `dev`.

**Current behaviour to start from.** Read these before designing:
- `src/webview/planPanel.ts`: the margin comment buttons, the comment bubbles, the comment storage (today one comment per block id, such as `title`, `overview`, `code`, `file:<i>`, `step:<i>`, `verification:<i>`, `question:<i>`), and the nonce'd script that posts comments to the host.
- `src/plan/codeLines.ts`: the existing per-code-line blocks (`code:<i>`) and their labels.
- `src/plan/reviewComments.ts` and `src/plan/planPrompt.ts`: how comments are formatted into the Review Comments prompt. Each comment must be labelled by its line.
- `src/plan/planEdits.ts`: the edit path, which must keep working.
- `src/plan/fileMentions.ts` and `src/plan/planMarkdown.ts`: check whether they depend on the comment keys.

**Scope (files the developer may edit).**
- `src/**`: the new line-splitting logic goes in a new pure module under `src/plan/` (for example `src/plan/lineComments.ts`). Edit `src/webview/planPanel.ts`, `src/plan/reviewComments.ts`, `src/plan/planPrompt.ts`, and `src/extension.ts` only where needed.
- `handoffs/comment-every-line.md`: the "Development" section only.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, or `package.json`. If you need a file outside this scope, stop and report it in the Development section.

**Requirements.**
1. Add a pure function that splits a block's text into lines. For wrapped text, it must match what the browser shows, so either measure in the webview at runtime and report line boxes, or split on a documented rule (for example one line per sentence or per fixed width) and say which in the Development section. State the choice and its limits clearly. Do not add a dependency.
2. Each line gets a stable id that is derived from its block id and its index, and is recorded in the Development section with the format used. Existing ids must keep working, including `code:<i>`, so saved edits and existing comments are not lost in tests.
3. Comments are stored per line id, so one block can have several comments. Update the rule that today limits a block to one comment, and update the "+" button hiding rule that depends on it. Record that change.
4. Each comment bubble sits in the right margin next to its line and keeps the existing collapse, expand, edit, and delete behaviour.
5. Review Comments (`buildReviewPrompt`) includes every line comment, labelled by its line in a readable form (for example "Step 3, line 2"). The existing review tests must still match the intent.
6. Comments survive a reload while the panel stays open, as today (webview state). Do not write comments to disk.
7. Keep the strict nonce CSP, the light and dark themes, and the phone-width layout. Keep the edit-on-click behaviour for title, overview, steps, and code.
8. TypeScript strict mode. Comment every function and class. No UI framework. Escape everything as before.
9. Unit-test the line-splitting and the comment-to-line mapping. The tester writes the tests; you do not.

**Definition of done.**
- Requirements 1 to 8 are applied.
- `npm run compile` passes. Run it and record the result.
- `npm run test:unit` is run by you and the result is recorded. If an old assertion breaks because of this change, list it in the Development section. Do not edit `test/`.

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- Unit: the line-splitting function (wrapped text, empty lines, a single line, a line with markup-like text), the stable line ids, the comment-to-line mapping, and the Review Comments prompt including every line comment labelled by its line.
- UI (Playwright, headless Chromium): a comment on a wrapped text line in the overview, a comment on a file row, and a comment on a step. Each comment shows as a bubble in the margin. The comments survive a reload (the same path as the existing reload tests). The existing code-line comment and the edit-on-click tests still pass.
- Integration: only if an existing integration test depends on the one-comment-per-block rule.

**Constraints.**
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: one command per call. No `&&`, `;`, or `|`. Use only allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

## Development (developer)

### What changed

- `src/plan/lineComments.ts` (new, pure): `splitTextLines`, `commentableBody`, `lineId`, `parseLineId`, `textLineIds`, `lineLabel`.
- `src/plan/reviewComments.ts`: `blockIdsForPlan` now returns one id per line (title, summary, out of scope, steps, verification items, open questions); `parseReviewComments` accepts the new ids (regex allows an optional `#<n>` suffix, plus the new `scope` block); `blockLabel` labels lines; new `dropOutOfRangeTextLineComments`; `dropOutOfRangeQuestionComments` also drops `question:<i>#<n>`.
- `src/webview/planPanel.ts`: text is rendered as one `<span class="tline" data-line="...">` per line; each block's margin holds one `.slot` (button plus bubble holder) per line, instead of one button per block; script, CSS and host `review()` updated (see below). The title is now a commentable block (`title-block`) in the sticky bar. `planPrompt.ts` and `extension.ts` needed no change (they call `formatCommentsForPrompt`).

### Line-splitting rule (a rule, not runtime measurement)

Wrapped text is NOT measured in the browser. `splitTextLines(text)` splits on a fixed rule so ids do not change when the panel is resized: a new line starts after a newline, and after a sentence end (`.`, `!`, `?`, optionally followed by `"`, `'`, `)`, `]`) that is followed by whitespace. Trailing whitespace stays on the line before it, so the pieces join back to the exact text. A whitespace-only piece joins its neighbour. Empty text gives `[""]`; `textLineIds` gives no lines for blank text (so an empty Out of scope has no target).
Limits: one long sentence that wraps onto several visual rows is ONE target (no per-row target); two short sentences on one row are two targets, so their margin slots are pushed down by at least 22 px to avoid overlap (a later slot can sit a little below its line); abbreviations like "e.g. x" split. Callout markers (`NOTE:` ...) are not part of the text, so lines are those of the body. Code lines keep one target per code line (`code:<i>`, no further wrapping split). A file row is one target.
The same function runs in the webview: its source is copied into the script with `splitTextLines.toString()` (so it must stay self-contained and the compiled `out/` must be used, as the UI tests do), so host and webview cannot drift.

### Line id format

`<blockId>` for line 0 (so every old id still works: `title`, `overview`, `step:2`, `verification:0`, `question:1`, `file:3`, `code`, `code:5`), and `<blockId>#<n>` (n = 1, 2, ...) for later lines, e.g. `step:2#1`. Block ids: `title`, `overview` (summary), `scope` (NEW: the out-of-scope text, previously part of `overview`), `code`, `code:<i>`, `file:<i>`, `step:<i>`, `verification:<i>`, `question:<i>`. The `overview` DOM block still holds both summary and out of scope; its margin has slots for the summary lines (`overview`, `overview#1`, ...) then the out-of-scope lines (`scope`, `scope#1`, ...).

### Comment keying and the "+" button rule

Comments are stored in webview state per line id (`state.comments[lineId]`), so one block can hold several comments. The old "one comment per block" rule is now "one comment per line": the "+" button is hidden for a slot only while that slot has a comment or is being edited (`show()` in `wireSlot`). The button shows on hover: for text blocks, `.slot.hot` (set by a `mousemove` handler to the line level with the pointer, or the nearest line when the pointer is on empty space in the block) or `.slot:hover`/focus-within; for single-target blocks (file rows, code lines, the `code` block) the old rule `.block:hover > .margin > .slot.single > button` still applies. Slots are absolutely positioned in the margin by `layoutSlots` (rect of the line span minus the margin top; re-run on resize through a ResizeObserver and after edits). On phone width all blocks now use the code-line style: margin is an absolute 26 px strip at the right of the block (before, the margin sat below the block).
After a click-to-edit commit, the field is re-split (`relineEl`), the block's slots are rebuilt (`rebuildSlots`), comments of lines that no longer exist are dropped, and the status line says "Dropped N line comment(s) that no longer match a line." (same wording as code). Comments on lines that still exist stay (keyed by id, so they may now sit on different text if the edit inserted a sentence earlier). The host `review()` also drops out-of-range `#<n>` text-line comments before validation, as a safety net. After a reload, saved edits are re-split and slots rebuilt before wiring. Mention highlighting inside an edited field is lost, as before.

### Review Comments label format

`blockLabel`/`formatCommentsForPrompt`: one `<Label>: <text>` line per comment, in document order. Label is the block label when the block has one line, else `<Block label>, line <n>` (n from 1): `Title`, `Overview` / `Overview, line 2`, `Out of scope` / `Out of scope, line 2`, `Step 3, line 2`, `Verification 1, line 2`, `Open question 2, line 1`, `File <path>`, `Code line <n>`. Webview aria labels and the Review popover list use lower-case labels of the same shape (`step 3, line 2`, `overview, line 1`).

### Results

- `npm run compile`: passes.
- `npm run test:unit`: 6 failures, all in `test/unit/planRenderer.test.ts`, all old assertions about the old markup (I did not edit test/):
  1. "renders blocks in the order title, overview, ..." expects the title NOT to be a block; it now is (`title` first).
  2. "gives every block a comment button with an aria-label" expects buttons == blocks; there are now buttons == slots (overview has one per line plus out of scope).
  3. "escapes every plan field ..." expects the exact `<h1 class="editable" data-edit="title" data-label="title" tabindex="0">` string; the h1 now also has `data-lines` / `data-lines-label` and its text is inside a `tline` span.
  4. "renders a callout for a marker ..." and 5. "always renders an empty-capable Out of scope field ..." and 6. "renders steps as numbered editable cards and verification ..." expect the old inner markup of editable text (no `data-lines` attributes, no `tline` spans).
  The earlier review-script assertions (`innerHTML` appears once) still pass: the "+" glyph for new slots is built with DOM calls, not innerHTML.
- `npm run test:ui` (run once for information; the tester owns test/): the old tests that fail do so because of the design change, not crashes: (a) several tests click `.block[data-block="overview"] button.add-comment` and hit a strict-mode violation (overview now has 3 slots: use `.slot[data-line="overview"] button`); (b) `layout.spec.ts` "holds title, Review, Implement, kebab in order" explicitly asserts the title has no "+" button and no `[data-block='title']`, which contradicts this brief (the title is a commentable line); (c) a few antigravityStyle tests (accent plus colour, light variant, CSP console) hit the same overview selector. Code-line, open-question, edit-on-click, edit reload, file mention and hover tests pass. `edits survive a reload` failed once in a 5-worker run and passed alone and in later runs; looks like a timing flake in the test, but worth a look.

### Left for the tester

- Unit: `splitTextLines` (single line, several sentences, newlines, blank lines, whitespace, `NOTE:` body, markup-like text such as `<b>`, text with no whitespace after a dot, empty text), `lineId`/`parseLineId` round trip, `textLineIds`, `blockIdsForPlan` with multi-line steps, `parseReviewComments` accepting `step:0#1`, `scope`, and rejecting `step:0#9` and `step:0#01`, `dropOutOfRangeTextLineComments`, `blockLabel` ("Step 3, line 2"), `formatCommentsForPrompt` with several comments on one block, and update the six old assertions above.
- UI: a comment on the second sentence of the overview summary (`.slot[data-line="overview#1"]`), a file row, and a step; bubbles in the margin; reload keeps them; editing a step so it has fewer lines drops the comment on the removed line with the status note; phone width (slot strip at the right, no horizontal scroll). Margin slot positions are set by JS (`style.top`), so check them in headless Chromium, not in jsdom.
- Integration: none of the files I touched has an integration test that depends on one comment per block that I could see (not run).

### Round 2 (fix for UI test failures)

Cause: margin slots are absolutely positioned and `layoutSlots` can push a later slot (22 px minimum step) below its own block, and the comment editor opens downward. Those parts then lay under the next block's margin and the next block's Copy button (`z-index: 6`), which won hit-testing.
Fix (CSS only, `src/webview/planPanel.ts`): `.slot` now has `z-index: 7` (above the Copy button at 6 and the bubble popover at 5 inside it), and `.block:has(.bubble.editing)` gets `position: relative; z-index: 8` so an open editor sits above neighbouring blocks' slots.
Results: `npm run compile` passes; `npm run test:unit` 368 passed (22 files); `npm run test:ui` 115 passed, 0 failed. The test expectations were right; no test edits.

## Testing (tester)

_To be filled by the tester._
