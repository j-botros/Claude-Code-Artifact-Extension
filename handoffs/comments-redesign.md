# Handoff: comments-redesign

## Brief (core agent)

- **Goal:** Redesign the artifact view as a document, in plain HTML, CSS, and TypeScript with no framework (CLAUDE.md Section 3). The full task text is in `TASKS.md`, row `comments-redesign`. Summary of the seven parts:
  1. Reproduce the "This plan has no proposed files." message first (see Current state). Fix its cause if it reproduces.
  2. Render the plan as a read-only document: title, overview, code, files, steps, verification. Only the fields the existing edit path already saves become editable on click (see decisions).
  3. Comments on any block: title, overview, code, each file row, each step, each verification item. A comment icon appears in the right margin next to the block on hover; clicking it starts a comment.
  4. Comments show as bubbles in the right margin. A bubble collapses to a small marker and expands on hover or focus. Each comment can be edited and deleted.
  5. Review Comments and Implement the Design keep working. The review prompt includes every comment, labelled by the block it is on.
  6. Light and dark themes (CSS custom properties), strict nonce-based CSP, and a layout that works at phone width.
  7. Unit tests for the renderer and comment logic, and Playwright tests for adding, expanding, editing, and deleting comments, and for edits surviving a reload.
- **Branch:** `task/comments-redesign-2`, from `origin/dev`. The name `task/comments-redesign` is held by a stale local branch at the queue commit `8ef3c39`. Do not touch it.
- **Current state to know** (checked by the core agent by reading the code, not by running it):
  - `samplePlan` in `src/plan/plan.ts` has had a `proposedFiles` entry since commit `9d269a4` (`sample-artifact/greet.ts`, a new file). `PlanPanel.show` gets `samplePlan`, and `implement()` passes `this.currentPlan`. So the sample path should **not** produce "This plan has no proposed files." on current `dev`. That message was probably seen before `9d269a4`. Confirm this by reading, and record it.
  - The message comes from `startImplementReview` in `src/review/hunkReview.ts`. It fires when `plan.proposedFiles` is undefined or empty.
  - **Likely real cause:** Review Comments. `reviewPlan` sends the plan to Claude with `buildReviewPrompt` (`src/plan/planPrompt.ts`). `SHAPE_RULES` says `proposedFiles` is optional and does not tell Claude to keep it. If the revised plan omits `proposedFiles`, the panel replaces the plan (`PlanPanel.review` sets `currentPlan`), and the next Implement click reports "no proposed files". Fix: the review prompt must say to keep `proposedFiles` from the input plan unless a comment asks to change it. Consider also keeping the previous `proposedFiles` in the panel when the revised plan has none. Pick the smaller, safer fix and say which you chose.
  - The integration test in part 1 is written by the tester (`test/` is tester-owned). The developer cannot write it. The tester runs it in round 1. If it fails on the sample path, that is the reproduction; if it passes, record that the sample path does not reproduce on current `dev`.
  - `parseReviewComments` (`src/plan/reviewComments.ts`) accepts only numeric step-index keys. `formatCommentsForPrompt` writes `Step <n>: <text>`. Both must change to block ids (see decisions).
  - `renderPlanHtml(plan, nonce, options)` in `src/webview/planPanel.ts` is exported and used by tests and by `PlanPanel`. `PlanPanel.lastRenderedHtml` is a test seam. Keep both names unless a change requires otherwise, and say so.
  - The webview script (`COMMENT_SCRIPT`) is one nonce'd inline script. Keep that. Do not add a second script or nonce, and do not add `unsafe-inline`.
  - Existing tests that will break from markup or type changes: `test/unit/planRenderer.test.ts`, `test/unit/planRendererReview.test.ts`, `test/unit/reviewComments.test.ts`, `test/unit/reviewPrompt.test.ts`, and `test/ui/planPanel.spec.ts`. The tester updates them. The developer reports which ones fail and why. Do not edit them.
- **Decisions the core agent made** (not in CLAUDE.md; record in the handoff if you disagree):
  - **Editable fields:** only `title`, `overview.summary`, `overview.outOfScope`, and the implementation steps. These are the fields `applyPlanEdits` already accepts. `code`, `files`, and `verification` stay read-only. Extending the edit path to them is a later task.
  - **Block ids** (strings, used for comments and for the review prompt): `title`, `overview`, `code`, `file:<index>`, `step:<index>`, `verification:<index>`. The `overview` block covers both the summary and the out-of-scope text. Zero-based indexes.
  - **Comment storage:** webview state, keyed by block id. Edits keep their comments. A successful review clears comments and edits (existing behaviour), because the returned plan may change its numbering.
  - **Review payload:** `comments` becomes a map from block id to text. `parseReviewComments` validates the keys: a known block id form, with the index in range for the current plan. Unknown or out-of-range keys are rejected, as today.
  - **Prompt labels:** each comment line names its block, for example `Title: ...`, `Overview: ...`, `Code: ...`, `File src/x.ts: ...`, `Step 2: ...`, `Verification 1: ...`.
  - **Comment UI:** the icon is a real `<button>` (keyboard reachable) with an `aria-label`. Bubbles are in a right-hand margin column when the width allows. Below a set width the bubbles sit under their block. A bubble's collapsed marker and its expanded state use CSS, and a focused bubble expands too.
  - **Click-to-edit:** a click on a read-only block turns its text into a field. It saves on blur or Enter, through the existing `savePlan` message. Escape reverts.
- **Scope (files you may edit):**
  - `src/webview/` (the panel, and new files there if the split helps)
  - `src/plan/reviewComments.ts` and `src/plan/planPrompt.ts` (block ids and the prompt)
  - `src/plan/plan.ts` only for the `proposedFiles` fix, if it is needed
  - `src/extension.ts` only for review wiring
  - `src/review/hunkReview.ts` only if the reproduction shows a bug there
  - Do not edit `test/`. Do not edit `TASKS.md`, `STATUS.md`, `README.md`, or any handoff except your own Development section.
  - Keep a doc comment on every function and class (CLAUDE.md code style). TypeScript stays strict.
- **Definition of done:**
  1. Part 1 is recorded in the Development section: whether the sample path reproduces by reading, and the cause and fix for the review path.
  2. The plan renders as a document in the order title, overview, code, files, steps, verification.
  3. Only the four editable fields accept edits. Edits save through the existing path and survive a reload.
  4. Every block in the list above can take a comment. The comment icon appears on hover and starts a comment.
  5. Bubbles collapse to a marker, expand on hover or focus, and each comment can be edited and deleted.
  6. Review Comments sends all comments labelled by block. The review prompt keeps `proposedFiles`.
  7. Implement the Design still shows the hunks for the sample plan.
  8. Light and dark themes work. The CSP is still nonce-based, with `default-src 'none'`, and has no `unsafe-inline`. Phone width (about 400px) has no horizontal scroll.
  9. `npm run compile` passes. `npm run test:unit` passes, except for the test files the tester will update (name them).
- **Stop and report** (do not work around it) if:
  - the fix needs a file outside the scope above
  - the CSP cannot support the design without `unsafe-inline`
  - the sample path does reproduce, and the cause is outside `src/webview`, `src/plan`, `src/extension.ts`, and `src/review/hunkReview.ts`
- **Test commands:**
  - Developer: `npm run compile`, `npm run test:unit`.
  - Tester: `npm run test:unit`, `npm run test:ui`, `npm run test:integration` (VS Code 1.107.0 host). `npm test` at the end.
  - The tester adds the part 1 integration test: run `claudeArtifact.openSamplePlan`, then trigger Implement the Design through the panel's handler, then assert the hunk review opened. "Through the panel's handler" means posting the `implementDesign` message the same way the webview does, or through a test seam the developer adds in `src/`. Do not call `startImplementReview` directly.

## Development (developer)

**Commit:** `bf713fc` on `task/comments-redesign-2`.

**Part 1, reproduction (by reading, not running).**
- Sample path: does not reproduce. `samplePlan` has a `proposedFiles` entry, `PlanPanel.show` gets `samplePlan`, and `implement()` passes `currentPlan`. `applyPlanEdits` also copies `proposedFiles`, so saving an edit does not drop it. The message was probably seen before `9d269a4`. The tester's integration test is the real check.
- Review path cause: `buildReviewPrompt` sent the plan, but `SHAPE_RULES` calls `proposedFiles` optional and nothing said to keep it. A revised plan without it replaced `currentPlan` in `PlanPanel.review`, so the next Implement click hit the "no proposed files" branch of `startImplementReview`.
- Fix (both, each a few lines): (1) `buildReviewPrompt` now says to keep `proposedFiles` unchanged unless a comment asks to change it. (2) `PlanPanel.review` copies the sent plan's `proposedFiles` onto the revised plan when the revised plan has none. I added (2) because a prompt is advisory. If you want only the smaller fix, drop (2).

**What changed (all in scope; no test/ edits).**
- `src/plan/reviewComments.ts`: comments are `Record<string, string>` keyed by block id (`title`, `overview`, `code`, `file:<i>`, `step:<i>`, `verification:<i>`). `parseReviewComments(input, plan)` now takes the plan (was `stepCount`) and rejects unknown forms and out-of-range indexes. New exports `blockIdsForPlan`, `blockLabel`. `formatCommentsForPrompt(comments, plan)` writes `Title:`, `Overview:`, `Code:`, `File <path>:`, `Step <n>:`, `Verification <n>:` lines in document order; newlines in a comment fold to spaces.
- `src/plan/planPrompt.ts`: `buildReviewPrompt` takes string-keyed comments, keeps `proposedFiles`, and describes the new labels.
- `src/extension.ts`: only the `reviewPlan` comments type.
- `src/webview/planPanel.ts`: new document markup and script. `renderPlanHtml(plan, nonce, options)` and `PlanPanel.lastRenderedHtml` keep their names and signatures. `ReviewHandler` comments type changed to `Record<string, string>`. Empty review message is now "Add a comment first."
- Markup: toolbar (Review Comments, Implement the Design), status line, then blocks. Each block is `div.block[data-block][data-label]` with `.body` and a `.margin` cell holding `button.add-comment` (aria-label "Comment on <label>", inline SVG) and `.bubbles`. Editable text is `.editable[data-edit]` (`title`, `summary`, `outOfScope`, `step:<i>`) with `tabindex=0`. Click or Enter swaps it for an `input.edit-field` (title) or `textarea.edit-field`; blur or Enter saves through `savePlan`, Shift+Enter is a newline, Escape reverts. Files are rows (no table); steps and verification are cards. `code`, `files`, `verification` are read-only.
- Bubbles are built by the script into `.bubbles`: `div.bubble[tabindex=0]` with a `.marker` and a `.full` (text, Edit and Delete buttons). `.full` shows on hover, focus, and focus-within. Editor is `div.bubble.editing` with `textarea.comment-field`, Save and Cancel (Escape cancels, Ctrl or Cmd+Enter saves). One comment per block. Comments live in webview state under `comments`; edits under `edits` (unchanged shape).
- Layout: two-column grid at 900px and wider (2.5rem margin column; expanded bubble 18rem, overlays the content). Below 900px bubbles sit under their block and the comment button is always visible. Also always visible on `hover: none`. Light and dark via CSS custom properties. CSP unchanged: `default-src 'none'`, one nonce for one style and one script, no `unsafe-inline`.

**Tests.** `npm run compile` passes. `npm run test:unit`: 23 failures in 5 files, all from markup or type changes; I did not edit them:
- `test/unit/planRenderer.test.ts` (10): section order, escaping check, out-of-scope textarea, table header and file rows, new badge, `ol`/`ul` lists, step comment textareas, `step-text` textareas, edit-field aria-labels, zero-steps case. All assert the old textarea and table markup.
- `test/unit/reviewComments.test.ts` (9): old numeric keys, `stepCount` argument, `Step <n>` formatting.
- `test/unit/reviewPrompt.test.ts` (2): `Record<number,string>` comments and the `<comments>` content; the closing-tag escape test also uses numeric keys.
- `test/unit/planRendererReview.test.ts` (1): review button is now in `header.top` with a different layout than the old regex expects.
- `test/unit/plan.test.ts` (1): "renders an empty out-of-scope textarea when outOfScope is null" (this file was not in the brief's list; it asserts `textarea.edit-outofscope`).
- Passing: everything else in `test/unit`. `test/ui/planPanel.spec.ts` was not run by me; it will need updating too.

**Not done / left.** Nothing from the seven parts is skipped on the src side. Playwright tests and the integration test are the tester's. I did not run the UI in a browser, so layout and the phone-width no-scroll check are unverified.

**Tester should check.**
- Integration: sample plan, post `implementDesign`, hunk review opens. Also a review whose revised plan omits `proposedFiles` still lets Implement open the hunk review (the panel fallback).
- Playwright: hover shows the comment button; click opens the editor; Save makes a marker; hover or focus expands it; Edit and Delete work; comments survive reload (state); edits to title, summary, out of scope, and a step save and survive reload; Escape reverts; no horizontal scroll at 400px; light and dark both render; CSP has no `unsafe-inline`.
- Possible rough edges: `:has()` is used in one narrow-width rule (fine in current Chromium and VS Code); the expanded bubble overlays content at wide widths.

## Testing (tester)

**Verdict: PASS.** Round 1. No src/ bugs found.

**Commands, in order, all on `task/comments-redesign-2`:**
- `npm run compile`: clean.
- `npm run test:unit`: 14 files, 227 passed, 0 failed.
- `npm run test:ui`: 19 passed, 0 failed (headless Chromium).
- `npm run test:integration` (VS Code 1.107.0): 23 passed, 0 failed.
- `npm test`: unit 227/0, ui 19/0, integration 23/0. All clean.

**Part 1 reproduction (integration, `test/integration/implementFlow.test.ts`).**
- No src/ test seam exists for posting webview messages, so the test replaces `vscode.window.createWebviewPanel` with a fake panel that captures the `onDidReceiveMessage` listener the real `PlanPanel` registers. It then posts `{ type: "implementDesign" }` exactly as the webview script does. `startImplementReview` is never called directly.
- Sample path: does NOT reproduce. `claudeArtifact.openSamplePlan`, then `implementDesign`, gives `implementResult` with `ok: true` (message is not "This plan has no proposed files."), and a diff tab for `sample-artifact/greet.ts` opens. This matches the developer's reading.
- Review path: a stub `claude` returns a revised plan with no `proposedFiles`. The test posts `reviewComments` (comment on `title`), waits for the panel to re-render, then posts `implementDesign`. Result is `ok: true` and the diff tab opens. This passes because of the panel fallback (fix 2). The test does not isolate fix 1 (the prompt wording), which is covered by a unit test on the prompt text only. I did not run the test with the fallback removed.

**Test changes.**
- New: `test/integration/implementFlow.test.ts` (2 tests).
- `test/integration/planFlows.test.ts`: three `reviewPlan` calls now use string block-id keys. One edited to `"step:0"`; the other two still pass `{ 0: "note" }` (the numeric key is only formatted into a prompt, never validated there).
- `test/unit/planRenderer.test.ts`: rewritten for the new markup. Kept: section order (now by block id), escaping of every field, one nonce script, no inline handlers, CSP with nonce, dark scheme, language class, script has no plan text, no innerHTML, script at end of body, zero-steps case. Added: only title/summary/outOfScope/steps editable, every block has a comment button with aria-label, `unsafe-inline` absent, hostile path in attributes.
- `test/unit/reviewComments.test.ts`: rewritten for block ids. New tests for `blockIdsForPlan`, `blockLabel`, `parseReviewComments` (unknown and out-of-range keys, trim, drop empties), `formatCommentsForPrompt` (document order, labels, newline folding).
- `test/unit/reviewPrompt.test.ts`: string keys, plus tests that the prompt keeps `proposedFiles` and labels comments by block.
- `test/unit/planRendererReview.test.ts`: one assertion removed on purpose: that `header.top` contains `class="edit-title"`. The title is no longer in the header; it is now the `title` block. The review button, implement button, and no-inline-handler checks are kept.
- `test/unit/plan.test.ts`: out-of-scope null case now checks for an empty `data-edit="outOfScope"` element instead of an empty textarea.
- `test/ui/planPanel.spec.ts`: rewritten, 19 tests. Covers render order, CSP and no script errors, comment button on hover, add, every block, expand on hover and focus, edit, cancel, delete, comments survive reload, click-to-edit with Enter and Escape, read-only blocks, edits survive reload, edits plus comments survive reload, the review and implement messages (comments keyed by block id), light and dark themes, no horizontal scroll at 400px (including with an open bubble and editor), margin placement at 1280px. The old "step comments" textarea test is gone because step comment textareas no longer exist.

**Notes for the core agent.**
- Playwright can not hover the bubble marker once the expanded bubble covers it (the `.full` overlay sits over the marker at wide width). Real hovering stays within the bubble so this is not a user bug; the spec moves the mouse directly instead.
- Layout checks ran in headless Chromium only, not in an Antigravity or VS Code webview.
