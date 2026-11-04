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

_To be filled by the developer._

## Testing (tester)

_To be filled by the tester._
