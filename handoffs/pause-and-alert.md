# Handoff: pause-and-alert

## Brief (written by the core agent)

### Goal
When the scheduled runner finds no `todo` task for `developer` or `tester` on `origin/dev`, it should stop the queue visibly: create a `PAUSE` file in the repo root, send a macOS notification with `osascript`, and log the reason. Today it exits silently (exit 0, no log line about the reason beyond one line). After this change, the next runner ticks stop at the existing `PAUSE` check until the owner removes the file.

### Branch
`task/pause-and-alert` (branched from `origin/dev`). Commit only to this branch.

### Current state
- `scripts/agent-run.sh` (the only file you may edit). Relevant parts:
  - The `PAUSE` check runs before the lock and before the dirty-tree check. Keep that order.
  - After `git checkout -q --detach origin/dev`, the queue check is:
    `git show origin/dev:TASKS.md | grep -E '\| todo \|' | grep -q -E 'developer|tester'`
    and on failure it logs and does `exit 0`.
  - `NEXT_TASK` reads the first matching row with the same grep, `cut -d'|' -f2`.
  - A `notify` helper (Discord, optional) already exists. Keep it.
- `README.md` has no scheduler content, so the core agent does not need a README change for this task.

### Decisions already made by the core agent
1. **Match on the Owner and Status columns only.** Some task descriptions contain the words "developer, then tester", and an `owner` row can mention them. A whole-line grep can therefore match the wrong row. In TASKS.md, `| ID | Task | Owner | Status | Branch | PR |` splits on `|` into fields: field 2 is ID, field 3 is Task, field 4 is Owner, field 5 is Status. A row is runnable when field 4 contains `developer` or `tester` and field 5 is exactly `todo` (after trimming spaces). Use a fixed-string or simple match. Do not use the whole line. Use the same rule for the empty-queue check and for `NEXT_TASK`. Trim spaces around each field.
2. **Testable queue check.** Put the queue check in one shell function that takes a file path, for example `runnable_task_id FILE`, which prints the ID of the first runnable row and returns 0, or returns 1 when there is none. Use it in the main path with the output of `git show origin/dev:TASKS.md` written to a temp file inside `logs/`. Add this mode at the top of the script, before any `cd`, lock, or git work:
   `scripts/agent-run.sh --check-queue FILE`
   It prints the first runnable ID, or nothing, and exits 0 when a task is runnable and 1 when none is. It has NO side effects: no PAUSE, no notification, no lock, no git. The tests use this mode. The first argument must be `--check-queue` to select the mode, because the chain position is a number and must keep working as `$1`.
3. **Empty queue action.** When there is no runnable row:
   - Log one line: `No runnable developer or tester task on origin/dev (no row with Owner developer or tester and Status todo). Created PAUSE. Remove PAUSE after adding a task.`
   - Create the `PAUSE` file in the repo root with `date` and a one-line reason inside. The file is gitignored already (`.gitignore` has `PAUSE`), so the tree stays clean.
   - Run `osascript -e 'display notification "No runnable task on origin/dev. Runner paused." with title "Claude Code Artifact Extension"'`. Use only this fixed text. Do not put any content from TASKS.md into the AppleScript. If `osascript` is missing, log that and continue.
   - Call `notify` with the same short message (the Discord helper is a no-op when unset).
   - Then `exit 0`. The run does not start the agent. Exit 0 is intentional so launchd does not count it as a failure.
   - If creating `PAUSE` fails, log it and still exit 0.
4. **Do not change the rest of the flow.** The run only starts when a runnable task exists. The lock, dirty-tree check, chain, and `notify` calls for runs stay as they are.
5. **The Owner check is in the script, not in CLAUDE.md.** Do not edit CLAUDE.md.

### Required changes (all in `scripts/agent-run.sh`)
1. Add the `--check-queue FILE` mode (decision 2), before `cd` and before any other side effect.
2. Add `runnable_task_id FILE` (decision 1). Give it a comment that explains the column rule.
3. In the main path, replace the two grep-based checks (the empty-queue check and the `NEXT_TASK` line) with calls to `runnable_task_id`. Read `origin/dev:TASKS.md` once into a temp file in `logs/`, and remove the temp file on exit.
4. Replace the silent `exit 0` for an empty queue with decision 3.
5. Keep the script's header comment accurate. Add one line about the PAUSE behaviour and the `--check-queue` mode.
6. Keep `set -u` working: every variable must be set before use.

### Scope: files you may edit
- `scripts/agent-run.sh`
- `handoffs/pause-and-alert.md`: only your own "Development" section

Do not edit `src/`, `test/`, `TASKS.md`, `STATUS.md`, `README.md`, `CLAUDE.md`, `.claude/`, `package.json`, or any handoff section other than your own. Do not add dependencies. Do not create `PAUSE` in the repo while you work. Do not run the main path of the script, because it runs `git checkout` and starts the agent.

### Definition of done
- `bash -n scripts/agent-run.sh` passes. (The developer cannot run `bash` directly, so check syntax by reading. Report this as "checked by reading" if you cannot run it.)
- `scripts/agent-run.sh --check-queue <file>` prints the ID and exits 0 for a file with a runnable row, and exits 1 with no output for a file without one.
- A row with Owner `owner` whose description contains "developer" does NOT count.
- The main path has no remaining whole-line grep for `developer|tester`.
- Work is committed on `task/pause-and-alert`: your source change and your Development section in one commit.

### Test commands the tester must run
- `npm run test:unit` (the tester adds a Vitest test that spawns `bash scripts/agent-run.sh --check-queue <fixture>`; see below).
- `npm run compile` (should be unaffected; run it anyway).

`npm run test:ui` and `npm run test:integration` do not exist (blocked tasks). Report them as not applicable, not as failures.

### Test coverage the tester must add (test/unit/)
- Add `test/unit/agentRunQueue.test.ts`. It uses Vitest and `child_process.spawnSync("bash", ["scripts/agent-run.sh", "--check-queue", fixturePath])`, with the cwd set to the repo root.
- Create two fixture TASKS.md files under `test/unit/fixtures/`, using the same table header as the real file:
  - `no-todo-TASKS.md`: no row with Status `todo` and Owner developer or tester. Include a `blocked` developer row and a done owner row whose description mentions "developer, then tester".
  - `one-todo-TASKS.md`: one `todo` row with Owner `developer, then tester`, plus other rows.
- Cases: the no-todo fixture exits 1 with empty stdout; the one-todo fixture exits 0 and prints that row's ID.
- Add one more fixture or inline case: a row with Owner `owner`, Status `todo`, and a description that contains "developer". It must NOT count (exit 1).
- Check that `--check-queue` does not create a `PAUSE` file in the repo root (assert `fs.existsSync("PAUSE")` is false after the run, and do not delete any existing PAUSE file you did not create). If a `PAUSE` file already exists when the test starts, skip that assertion and say so.
- Do not run the main path of the script in tests. The main path touches git and starts the agent.
- Say in your Testing section that the osascript and PAUSE-creation branch are not unit tested and were checked by reading.

### Shell rules (apply to developer and tester)
- One shell command per call. Do not chain with `&&`, `;`, or `|`.
- Allowed: `git status`, `git diff`, `git log`, `git add`, `git commit`, `npm ci`, `npm run`, `npm test`, `npx vitest`, `npx playwright`.
- Do not run other commands (this includes `bash`, `node -v`, `npm -v`, `git fetch`, `git push`, `git checkout`). Use Read, Glob, Grep, Write, and Edit for file work.
- Commit messages end with this line: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`

### Handoff rules
- Developer: append a "## Development" section to this file. Include what changed, the commit hash, the test output summary, the expected failing assertion (if any), and what the tester should check. Use Edit. Do not use `cat >>`, `echo >>`, or heredocs.
- Tester: append a "## Testing" section to this file. Include the commands run, pass and fail counts, and the output of any failing test. Commit test files under `test/` and your Testing section only. Do not stage anything else. Use Edit if it is available. If Edit is not available, use Write and keep every other section unchanged.

## Development

### What changed (`scripts/agent-run.sh` only)
- Added `runnable_task_id FILE` at the top of the script. It splits each row on `|` and treats a row as runnable when field 4 (Owner) contains `developer` or `tester` and field 5 (Status), trimmed, is exactly `todo`. It prints the trimmed ID of the first such row and returns 0, or prints nothing and returns 1.
- Added the `--check-queue FILE` mode before `cd`, the lock, and any git work. It has no side effects and exits with the function's status.
- The main path now writes `git show origin/dev:TASKS.md` to `logs/queue-<stamp>.md` (removed on exit through the EXIT trap, and before the chain `exec`). Both whole-line greps are gone; `NEXT_TASK` comes from `runnable_task_id`.
- Empty queue: logs the specified line, writes `PAUSE` (date plus reason; logs and continues if that fails), runs the fixed-text `osascript` notification (logs if `osascript` is missing or fails), calls `notify`, and exits 0.
- Updated the header comment. The PAUSE check order, lock, dirty-tree check, and chain are unchanged.

### Tests
Not run. I may not run `bash` or the main path. `npm run test:unit` was not run because no test touches this file yet. `bash -n` was not run; syntax was checked by reading.

### What the tester should check
- `--check-queue` on a file with a runnable row prints the ID and exits 0; with none, prints nothing and exits 1.
- A row with Owner `owner` and Status `todo` whose description mentions "developer" does not count.
- `--check-queue` creates no `PAUSE` file.
- A missing file argument exits 1 (falls back to `/nonexistent`).
- Commit hash: see the commit that contains this section (`git log -1`).
