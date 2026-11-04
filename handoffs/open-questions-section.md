# Handoff: open-questions-section

## Brief (core agent)

**Goal.** Add an optional `openQuestions` field to the plan format: an array of strings, each a question from the AI to the developer that the plan does not answer. When the field is present and non-empty, the artifact view shows an `Open Questions` section at the end of the plan. Each question is a commentable and editable line.

**Branch.** `task/open-questions-section` (from `origin/dev`). Commit on this branch only. Never push to `main` or `dev`.

**Scope: files the developer may edit.**
- `src/plan/plan.ts` (the `Plan` type and `parsePlanJson`: optional `openQuestions`, string array, default omitted)
- `src/plan/planPrompt.ts` (ask for `openQuestions` as an optional field in the plan prompt; keep `proposedFiles` wording unchanged)
- `src/plan/planEdits.ts` (accept an optional `openQuestions` edit, same rules as `steps`: strings, no blank entries, so a save can change them)
- `src/plan/reviewComments.ts` (block ids `question:<i>`, labels, validation of ids against the plan)
- `src/webview/planPanel.ts` (render the section last, editable and commentable question lines, `savePlan` and `reviewComments` carry the questions in their edits)
- New pure helpers in `src/plan/` only if needed

Do not edit `test/`, `README.md`, `TASKS.md`, `STATUS.md`, `CLAUDE.md`, or `handoffs/` except the Development section below.

**Design decisions (core agent's choices).**
1. **Field shape.** `openQuestions?: string[]`. Absent or empty means no section. A non-array, or an array with a non-string or blank item, is a parse error (the same rule as `implementationSteps`). An empty array `[]` is valid and renders no section.
2. **Block ids.** Each question is `question:<i>`, 0-based, matching `step:<i>`. Label `Open question <i+1>`.
3. **Position.** The section heading is `Open Questions`, shown after Verification (last in the document). It appears only when `openQuestions` is present and non-empty.
4. **Editing.** Each question is click-to-edit, the same as a step (single-line text, Enter or blur saves, Escape cancels, blank rejected with "This field cannot be empty."). Save goes through `applyPlanEdits` and `savePlan`, as steps do.
5. **Comments.** Each question has its own margin "+" and bubble, like a step. `parseReviewComments` accepts `question:<i>` only when `i` is in range for the current plan. The Review Comments prompt labels these comments `Open question N`, through `formatCommentsForPrompt`.
6. **Out-of-range comments.** If a save removes questions, drop `question:<i>` comments whose `i` is now out of range, the same way `step:<i>` is handled today. Say how many were dropped in the status message. Do not drop silently.
7. **Unchanged.** Plan JSON shape for the existing fields, `proposedFiles`, Implement the Design, the strict nonce CSP (no inline handlers), light and dark themes, the Antigravity look and CSS custom properties, the phone layout, and existing callouts.

**Definition of done.**
- A plan without `openQuestions` renders exactly as before, with no section.
- A plan with a non-empty `openQuestions` renders an `Open Questions` section last, with one numbered, commentable, editable line per question.
- Edits to questions save to `.claude/plans/<slug>.json` and survive a reload. Review Comments includes question comments labelled `Open question N`.
- Every new function and class has a doc comment (CLAUDE.md Section 3). Strict TypeScript compiles.
- Unit tests (tester) cover parsing with the field, without it, and with an empty array; invalid items; the id and label; the `applyPlanEdits` questions edit; and the out-of-range drop.
- Playwright tests (tester) cover: the section is absent when the field is missing, and it is shown last when present.
- `npm run compile`, `npm run test:unit`, `npm run test:ui`, and `npm test` pass.

**Test commands.** `npm run compile`, `npm run test:unit`, `npm run test:ui`, `npm test`.

**Attribution.** Commit messages end with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Not in scope.** Changing `CLAUDE.md` (the core agent does that), the README, and any change to existing plan fields.

## Development

**Commit:** 062a7a2 on `task/open-questions-section`.

**Files changed:** `src/plan/plan.ts`, `src/plan/planPrompt.ts`, `src/plan/planEdits.ts`, `src/plan/reviewComments.ts`, `src/webview/planPanel.ts`.

**What changed.**
- `Plan.openQuestions?: string[]`. `parsePlanJson` rejects a non-array, a non-string item, or a blank item (`openQuestions[i] must not be blank`). Absent stays absent; `[]` is kept as `[]` and renders no section.
- Prompt: `SHAPE_RULES` adds an optional `openQuestions` bullet after `proposedFiles` (that wording is unchanged). The review prompt keeps `openQuestions` unless a comment answers it, and says comments on questions start with `Open question <n>`. The original "Title, Overview, Code, File <path>, Step <n>, or Verification <n>" phrase is untouched so the existing test still matches.
- `applyPlanEdits`: optional `questions` array. Rules as for `steps`: must be an array, length equal to the current question count (0 when none), strings, trimmed, blank rejected (`questions[i] must not be empty`). When `questions` is omitted the current questions are kept. Current `openQuestions` is carried into the result (copied) only when the plan had the field.
- Ids and labels: block id `question:<i>` (0-based), label `Open question <i+1>` (in `blockLabel` and in the webview `data-label`). `blockIdsForPlan` lists them after the verification ids, and `parseReviewComments` accepts `question:<i>` only when in range.
- Webview: `Open Questions` h2 with a section rule, rendered after Verification, only when non-empty. Each question is a numbered card like a step (click-to-edit via `data-edit="question:<i>"`, Enter or blur saves, Escape cancels, blank gives "This field cannot be empty."), with its own margin plus and bubble. Callout markers work in questions. `savePlan`, `reviewComments` and the kebab actions send `questions`. Saved webview state restores edited questions.
- Out-of-range rule: new pure helper `dropOutOfRangeQuestionComments(comments, count)` in `reviewComments.ts`. The host `review()` applies it against the edited plan before `parseReviewComments`; if any are dropped, the count is appended to the review status message ("Dropped N question comment(s) that no longer match a question."). Because `applyPlanEdits` fixes the question count, a save cannot remove questions; this rule is the safety net for stale comment keys.

**Test results.** `npm run compile` clean. `npm run test:unit`: 20 files, 319 tests pass (after keeping the original review-prompt label phrase). Not run: `test:ui`, `npm test`.

**Not changed:** `planMarkdown.ts` (Copy and Export as Markdown do not include open questions, as it was outside the listed scope). The core agent may want to add it.

**Tester should check.**
- Parse: with the field, without it, `[]`, non-array, non-string item, blank item.
- `applyPlanEdits`: questions edit applied and trimmed, wrong length, blank, non-string, omitted keeps current, plan without the field stays without it.
- `blockIdsForPlan`, `blockLabel` (`Open question 1`), `parseReviewComments` accept and out-of-range reject, `formatCommentsForPrompt` order (questions after verification), `dropOutOfRangeQuestionComments`.
- Playwright: no `Open Questions` heading when the field is missing or `[]`; heading present and last (after Verification) when present; `[data-block="question:0"]` exists with margin plus; click-to-edit saves via `savePlan` including `questions`; blank rejected.
- Light and dark themes and phone layout (the cards reuse the step styles).

## Testing
