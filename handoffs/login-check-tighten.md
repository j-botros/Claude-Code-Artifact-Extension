# Handoff: login-check-tighten

## Brief (core agent)

### Goal
Tighten `looksLikeAuthProblem` in `src/claude/claudeRunner.ts`. It currently matches broad phrases anywhere in stderr or in an error result's text: `log(ged) in`, `authenticat`, `unauthori[sz]ed`, `/login`, `auth login`, and `api key`. So an unrelated error such as "Failed to parse the login page component" or "catalog in" can show the "not logged in" message. Match only the real not-logged-in messages from the `claude` CLI.

### Branch
`task/login-check-tighten` (from `origin/dev`). Commit only to this branch.

### Current state (read before you start)
- `src/claude/claudeRunner.ts`: `looksLikeAuthProblem(text)` is the regex on line 19. `classifyRun` calls it on the error result's message and on stderr. `NOT_LOGGED_IN_MESSAGE` is the message shown.
- Earlier runs (`claude-plan-generation`, run 5) recorded that this function is loose: "Failed to parse the login page component" is labelled not-logged-in.
- The `claude` CLI could not be run in this environment (not on the allow list). So the exact not-logged-in wording could not be confirmed here. Check `test/unit/fixtures/` (Read only) for any saved sample stream that shows the real text. Use only the text you can see there, or the wording below.

### Requirements
1. Replace the regex with a narrow match. Start from these phrases only, all case-insensitive:
   - `not logged in`
   - `please run /login` (the CLI's own hint)
   - `invalid api key`
   Do not match `authenticat`, `unauthori`, bare `login`, bare `log in`, `api key` alone, `auth login`, or `/login` alone.
   If a saved fixture in `test/unit/fixtures/` shows a different real not-logged-in line, add its exact phrase and say so in Development.
2. Keep the function exported with the same signature `looksLikeAuthProblem(text: string): boolean`. Keep the existing `classifyRun`, `tail`, and `runClaude` behaviour otherwise unchanged.
3. Write a doc comment on the function that lists the phrases it matches and why the rest are excluded.
4. Do not change `NOT_LOGGED_IN_MESSAGE`, the spawn arguments, or any other file.

### Definition of done
1. `npm run compile` exits 0 under strict mode.
2. The new regex matches each phrase in requirement 1 (checked by reading or by a short `node` check if the allow list permits; if not, say so).
3. Existing unit tests that assert the old loose matches will fail. Do not edit `test/`. List each failing test name and the reason in Development. The tester updates them.
4. Commit on `task/login-check-tighten`.

### Stop and report (do not work around it) if
- a fixture or test needs a file outside `src/claude/claudeRunner.ts`
- the real CLI wording cannot be determined from the repo, and you are not sure which phrase to use

### Scope: files you may edit
- `src/claude/claudeRunner.ts` only.
- `handoffs/login-check-tighten.md`: only your own "Development" section.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `scripts/`, or any other handoff. Do not add dependencies.

### Test commands
- `npm run compile`
- `npm run test:unit` (expect failures only in tests that assert the old loose matches; report them)

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm install`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands (for example `claude`, `node -v`, `npm -v`, `ls`). Use Read, Glob, Grep, Write, and Edit for file work.
- Do not run `git fetch`, `git push`, `git checkout main`, or `git checkout dev`. The core agent pushes.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file with the Edit or Write tool. Include what changed, the commit hash, the test output summary, the phrases used, whether each was confirmed against a saved fixture or only from the wording above, and the names of any tests that now fail. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file with the Edit or Write tool. Commit test files under `test/` only.

## Development (developer)

Commit: 84fc1cf on `task/login-check-tighten` (only `src/claude/claudeRunner.ts`; the handoff edit is uncommitted).

What changed: `looksLikeAuthProblem` is now `/not logged in|please run \/login|invalid api key/i`, with a doc comment listing the phrases and why the rest are excluded. Signature, `classifyRun`, `tail`, `runClaude`, and `NOT_LOGGED_IN_MESSAGE` are unchanged.

Phrases and confirmation:
- `invalid api key`: confirmed by fixture `test/unit/fixtures/claude-error.jsonl` ("Invalid API key. Please run /login").
- `please run /login`: confirmed by the same fixture line.
- `not logged in`: from the brief wording only, not in any fixture.
- No other not-logged-in wording was found in fixtures.

Tests: `npm run compile` exits 0. `npm run test:unit`: 211 passed, 3 failed (all in `test/unit/streamParser.test.ts`), which assert the old loose matching:
- `classifyRun > maps auth wording in stderr to not-logged-in`: uses "Error: please log in first", which no longer matches.
- `looksLikeAuthProblem > detects real auth wording`: includes "401 Unauthorized", "authentication failed", "claude auth login", now excluded.
- `looksLikeAuthProblem > flags unrelated text that merely mentions login or API key (known looseness)`: asserts the old false positives; should now assert false.

I did not run a separate node check of the regex; the first fixture-based phrases and "Not logged in" are covered by the existing test's first three strings, which are not the cause of the failure.

## Testing (tester)

Changes (only `test/unit/streamParser.test.ts`):
- `classifyRun > maps auth wording in stderr` now uses "Invalid API key. Please run /login".
- `detects real auth wording` split into one positive test per phrase (not logged in, please run /login, invalid api key), case-insensitive. "not logged in" is from the brief wording only; the other two are in `claude-error.jsonl`.
- Old loose wording (401 Unauthorized, authentication failed, claude auth login, please log in first, run /login) moved to a negative test.
- The "known looseness" test now asserts false. New false-positive test: "catalog in the registry", "The user will log in later".

Commands run:
- `npm run compile`: exit 0.
- `npm run test:unit`: 14 files, 218 passed, 0 failed.
- `npm test`: unit 218 passed; UI (Playwright) 4 passed; integration (VS Code) 21 passing; 0 failures.

Verdict: PASS
