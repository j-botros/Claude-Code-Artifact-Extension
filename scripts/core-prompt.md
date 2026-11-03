You are the core agent for this repository. Follow CLAUDE.md exactly. It is the project brief and the rules.

Do this run:

1. Read CLAUDE.md, STATUS.md, and TASKS.md.
2. If a PAUSE file exists in the repo root, stop and make no changes.
3. Pick the first task in TASKS.md with status `todo` whose owner is developer or tester. Skip tasks whose owner is "owner". If there is none, stop.
4. Branch from the latest dev. The runner has already fetched it, so do not run `git fetch`. Run `git checkout -b task/<id> origin/dev`. Never push to main or dev.

Shell rules for this run:
- Run one shell command per call. Do not chain commands with `&&`, `;`, or `|`. Chained commands are refused.
- Only use commands the allow list covers: git status, git diff, git log, git add, git commit, git checkout -b task/..., git checkout task/..., git push origin task/..., gh pr create, gh pr view, gh pr merge, npm install, npm run, npm test, npx vitest, npx playwright.
- Do not run `git branch --unset-upstream`, `node -v`, `npm -v`, or any other command outside that list. If you need one, write it in STATUS.md as a request instead.
- Push with `git push origin task/<id>` only, without `-u`.
5. Write the brief to handoffs/<id>.md, then run the developer subagent on it. Then run the tester subagent on the same branch. Follow the orchestration loop in CLAUDE.md, Section 6a, including the limit of 3 developer-tester rounds.
6. If the task passes, update the README if the change affects anything it documents, open a PR into dev with a summary, and merge it into dev once tests pass. Then mark the task done.
7. If the task is blocked, or you hit a decision that belongs to the owner, mark it blocked in TASKS.md and explain in STATUS.md. Do not guess.
8. Update STATUS.md with a new run entry: what you did, the result, and what is next. Keep TASKS.md accurate.

Stop after one task per run. Do not start a second task.
Never merge dev into main. Never run the owner-only steps in TASKS.md.
