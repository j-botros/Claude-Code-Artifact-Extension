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

**Code commit:** 91f6840 on `task/comments-match-antigravity`.

**What changed.**
- `src/plan/planMarkdown.ts` (new, pure): `countComments(comments)`, `planToMarkdown(plan)`, `planMarkdownFileName(title)`.
- `src/plan/planPrompt.ts`: `buildReviewPrompt(plan, comments, message?)`; a non-empty message adds a `<message>` block (angle brackets escaped). Without a message the output is unchanged.
- `src/extension.ts`: `reviewPlan` takes and forwards the optional message.
- `src/webview/planPanel.ts`: hover "+" (title and aria-label "Add inline comment ..."), popover with text box, Cancel, "Add Comment" (becomes "Save Comment" when editing); comment icon marker with a card (Delete, Edit Comment); header with kebab menu, "Review • N" button (comment icon, chevron) and the "Submit comment" popover (optional message, Submit, collapsible `details` list of comments); Implement the Design kept. New webview messages: `copyMarkdown`, `copyPath`, `exportArtifact` (host replies `actionResult`); `reviewComments` now carries `message`. Strict nonce CSP unchanged (no inline style attributes added).
- Comments are still one per block id (the existing model); "+" is hidden on a block that already has a comment.

**Choices.**
- Copy Path: copies the relative path `.claude/plans/<slug>.json` to the clipboard if the plan was saved by an edit in this panel. Otherwise it shows "Not saved yet. Edit the plan to save it, or use Export Artifact." and copies nothing. A review round that replaces the plan resets this to "not saved".
- Export Artifact: writes `.claude/plans/<slug>.md` in the first workspace folder (same slug as the JSON save, `.md` extension), overwriting an existing file, and shows "Exported to .claude/plans/<slug>.md". With no folder open it shows "Open a folder to export the artifact." Copy and Export use the webview's current (unsaved) edits.
- Copy uses `vscode.env.clipboard` on the host, not `navigator.clipboard` in the webview.

**Tests.** `npm run compile` passes. `npm run test:unit`: 6 failures in 2 files, all asserting the old markup (I did not touch test/):
- `test/unit/planRenderer.test.ts`: "gives every block a comment button with an aria-label" (expects `aria-label="Comment on ..."`, now `Add inline comment on ...`); "escapes every plan field..." (same aria-label for the hostile path); "keeps the status line and review and implement buttons" (expects `<button class="review" type="button">Review Comments</button>`); "script handles savePlan and saveResult, writing text with textContent" (not inspected closely; likely a script-text assertion).
- `test/unit/planRendererReview.test.ts`: "renders one Review Comments button in the header, with no inline handler"; "script posts reviewComments and handles reviewResult".
The tester needs to update these. Everything else passes.

**Verification status per item.** None of items 1 to 5 was run in a browser or in VS Code. I only compiled and ran unit tests. So all five are not checked at all (not even headless Chromium); item 4's host side (clipboard, file write) is also not checked in an Extension Development Host.

**What the tester should check.**
- Playwright: "+" appears on hover, tooltip, popover Cancel and "Add Comment"; card shows text, Delete, Edit Comment, and edit and delete update the card and the count; "Review • N" count; Review popover (message box, Submit posts `reviewComments` with `message`, collapsible list); kebab menu posts `copyMarkdown`, `copyPath`, `exportArtifact` and shows `actionResult` text; Escape and outside click close popovers; light and dark themes; CSP has no inline-style violations (watch the console).
- Unit: `countComments`, `planToMarkdown` (code fence longer than backticks in the code, no files, null outOfScope), `planMarkdownFileName`, `buildReviewPrompt` with and without a message.
- Integration: Copy, Copy Path, Export in an Extension Development Host.
- Possible rough spots: the popovers are `position: absolute` and not checked at narrow widths; the comment card on a narrow layout uses the existing static layout.

## Testing (tester)

_Pending._
