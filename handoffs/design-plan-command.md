# Handoff: design-plan-command

## Brief (core agent)

- **Goal:** Add a project slash command, `.claude/commands/design-plan.md`, so `/design-plan <request>` shows in the Claude Code chat in Antigravity. The command tells Claude to design the change and write one plan JSON file to `.claude/plans/<slug>.json`, in the exact CLAUDE.md Section 3 shape. The optional fields are `proposedFiles` and `openQuestions`, and they are omitted when not needed.
- **Branch:** `task/design-plan-command` (from `origin/dev`). Already created.
- **Scope (files you may edit):**
  - `.claude/commands/design-plan.md`: new file. Create the `.claude/commands/` folder by creating this file.
  - Nothing else. Do not edit `src/`, `test/`, `README.md`, `TASKS.md`, `STATUS.md`, or `CLAUDE.md`.
- **Definition of done:**
  1. The command file names the folder `.claude/plans/`.
  2. The slug rule is in the file: the slug comes from the plan title, lowercase, with hyphens.
  3. The file lists every required plan field: `title`, `overview` (`summary`, `outOfScope`), `proposedChanges` (`language`, `code`), `files` (`path`, `change`, `isNew`), `implementationSteps`, `verification`.
  4. The file lists the optional fields `proposedFiles` (`path`, `content`) and `openQuestions`, and says to omit them when not needed.
  5. The file says the callout markers (`NOTE:`, `TIP:`, `IMPORTANT:`, `WARNING:`, `CAUTION:`) go at the very start of a text block.
  6. The file tells Claude not to answer in chat with the plan, and not to edit source files. It may write only the one plan file.
  7. `npm run compile` passes. This is only a check that nothing else broke; the command file is not compiled.
  8. Commit on the branch, then add the Development section below.
- **Reference wording:** `src/plan/planPrompt.ts` already holds the plan-shape wording for the extension's own Claude call. You may read it for the field list. Do not edit it.
- **Tests:** The tester writes a unit test that reads the command file and checks items 1 to 4 above. You do not write tests. `test/` belongs to the tester.
- **Test commands:**
  - `npm run compile`
  - `npm run test:unit` (run it too; the unit suite must stay green)
- **Owner check not run here:** Whether Antigravity shows `/design-plan` in the chat. Record in the Development section that this was not tested in this run.
- **Stop and report** (do not work around it) if:
  - the command needs a file outside your scope.
  - the plan shape in `src/plan/planPrompt.ts` disagrees with CLAUDE.md Section 3. Report the difference; do not pick one.

## Development (developer)

- **Changed:** added `.claude/commands/design-plan.md`, the `/design-plan <request>` slash command. It uses `$ARGUMENTS` for the request, tells Claude to write one file to `.claude/plans/<slug>.json` (slug from the title, lowercase, hyphens), and not to answer with the plan in chat or edit source files. It lists all required fields, the optional `proposedFiles` and `openQuestions` (omit when not needed), and the callout markers at the very start of a text block. The field list matches `src/plan/planPrompt.ts` and CLAUDE.md Section 3 (no disagreement found).
- **Tests passed:** `npm run compile` OK; `npm run test:unit` 22 files, 368 tests passed.
- **Not tested:** Antigravity showing `/design-plan` in the chat was not tested in this run.
- **Left:** nothing in scope.
- **Tester should check:** the file names `.claude/plans/`, the slug rule, every required field, the optional fields with the omit rule, the callout markers, and the no-chat / no-source-edit rule.

## Testing (tester)

_(to be written by the tester)_
