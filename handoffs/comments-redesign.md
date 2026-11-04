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

_To be filled in by the developer._

## Testing (tester)

_To be filled in by the tester._
