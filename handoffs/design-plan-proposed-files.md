# Handoff: design-plan-proposed-files

## Brief (core agent, run 54, 2026-11-16)

**Branch:** `task/design-plan-proposed-files-4` (from current `origin/dev`). Already checked out. Do not create or switch branches.

**Why a new branch:** the work was done on `task/design-plan-proposed-files-3`, which is 25 commits behind `origin/dev`. `git merge` is not on the allow list, so it cannot be brought up to date. This task ports its small change onto a fresh branch. The reference commits on `-3` are `88e500f` (source and tests) and `b5c7de2` (command file, owner approved). Read them with `git diff origin/dev...task/design-plan-proposed-files-3 -- <path>` (`git diff` is allowed). Do not touch the `-3` branch.

**Goal:** `proposedFiles` must be present whenever `files` lists a change. Owner report (2026-11-05): a plan listed `src/plan/codeTokens.ts` under Files with no `proposedFiles`, so Implement the Design said "This plan has no proposed files."

**Rule to state (exact wording, used by the tests):** `"proposedFiles" (optional; include it for every path in "files", with the full new content of that file, because the format has no delete marker so every path counts; omit it only when "files" is empty)`.

### Developer scope (files you may edit)
1. `.claude/commands/design-plan.md`: the `"proposedFiles"` bullet (line 24) gets the rule above. Keep the rest of that line (`: an array of objects { "path": ..., "content": ... }. You still never write these files; the user reviews them in the editor.`). The owner approved this edit on 2026-11-16.
2. `src/plan/planPrompt.ts`: the `"proposedFiles"` bullet gets the same rule (keep the rest of that line).
3. New `src/plan/noProposedFiles.ts`: pure `noProposedFilesMessage(plan: Plan): string`, with a doc comment. If `plan.files` is non-empty it returns: `This plan lists changed files under Files but has no proposedFiles, so there is no code to review. Ask Claude Code to add proposedFiles with the full new content of each file in Files, then try again.` Otherwise it returns `This plan has no proposed files.`
4. `src/review/hunkReview.ts`: import it and use it where `startImplementReview` returns `"This plan has no proposed files."`. Change nothing else in that file (it has changed on `dev` since `-3` was cut: keep the `dev` version and add only these two edits).

Do not edit `test/`, README, TASKS.md, STATUS.md, or CLAUDE.md. Commit on the branch with a clear message. Write the "Development" section below.

### Tester scope
- Port `test/unit/noProposedFiles.test.ts` from `task/design-plan-proposed-files-3` (read it with `git diff`), adjusting only if `dev` requires it. It covers both messages, the rule in the plan and review prompts, and the rule in the command file.
- Run the commands below and write the "Testing" section with a PASS or FAIL verdict. Commit on the branch.

### Definition of done
- All four developer edits are in place, and `npm run compile` passes.
- `npm test` passes (unit, UI, integration), including the new tests.
- Not done in this task: the owner's Antigravity check of `/design-plan` followed by Implement the Design.

### Test commands (one per shell call, no chaining)
- `npm run compile`
- `npm run test:unit`
- `npm run test:ui`
- `npm run test:integration`
- `npm test`

## Development

## Testing
