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

## Testing
