# Handoff: comments-match-antigravity

## Brief (core agent)

**Goal.** Match the artifact view to the Antigravity Implementation Plan pattern (owner screenshots, 2026-11-03). Keep the document look that `comments-redesign` built (run 24, PR #60).

**Branch.** `task/comments-match-antigravity`. Commit all work there. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/webview/` (the panel host, renderer, inline script, and CSS)
- `src/plan/` (pure logic: comment model, Markdown export, comment count, review prompt)
- `src/extension.ts` only if a message handler or command is needed for Copy, Copy Path, or Export
- `handoffs/comments-match-antigravity.md`: the "Development" section only

Do not edit `test/`, `TASKS.md`, `STATUS.md`, or `README.md`. If you need a file outside this scope, stop and report it.

**What to build (from TASKS.md, `comments-match-antigravity`).**
1. Hovering a block shows a small blue "+" in the right margin, with the tooltip "Add inline comment". Clicking it opens a popover with a text box, Cancel, and "Add Comment".
2. A block with comments shows a small comment icon in the right margin. Each comment is a card with its text, "Delete", and "Edit Comment". Edit and delete both work.
3. The top-right button reads "Review • N" with a chevron and a comment icon, where N is the number of comments. Clicking it opens a "Submit comment" popover with an optional message box, a Submit button, and a collapsible list of the comments. Submit sends the comments and the optional message through the existing Review Comments path (`buildReviewPrompt` and the `review` message). Include the optional message in the prompt.
4. A kebab menu at the top right offers:
   - Copy: the plan as Markdown.
   - Copy Path: the plan file path under `.claude/plans/` if the plan was saved, otherwise a message that it is not saved yet. Record your choice in Development.
   - Export Artifact: save the plan as a `.md` file in the workspace. Record the target path you chose (for example `.claude/plans/<slug>.md`).
5. Keep "Implement the Design". Keep the document look, light and dark themes, and the strict nonce-based CSP. Keep the `comments-redesign` behaviour: edits save through the existing edit path, and comments are keyed by block id.

**Definition of done.**
- Items 1 to 5 above are implemented.
- Unit tests (written by the tester) can import the pure functions. Put the Markdown export and the comment count in `src/plan/` so they can be unit-tested.
- Playwright tests (written by the tester) cover the "+" popover, the Review popover, Copy, and Export.
- The Development section records, for each item, whether it was checked in headless Chromium only. Say so plainly.
- `npm run compile` passes and `npm run test:unit` passes.

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**Constraints.**
- TypeScript strict mode. Add a doc comment to every function and class.
- Plain HTML, CSS, and TypeScript, no UI framework. CSS custom properties for colors.
- Never call the Artifact tool's `publish` action. Never read or write files outside this repository, and never read the Claude or agy credentials.
- Shell: run one command per call. No `&&`, `;`, or `|`. Use only the allowed commands (git status, git diff, git log, git add, git commit, npm ci, npm install, npm audit, npm run, npm test, npx vitest, npx playwright).
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Round.** 1 of 3.

## Development (developer)

_Pending._

## Testing (tester)

_Pending._
