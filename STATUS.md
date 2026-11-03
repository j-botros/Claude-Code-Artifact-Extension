# STATUS

Owned by the core agent only. Keep the latest run first. Keep only the last few runs.

## Current state
- Stage: early idea, no extension code yet.
- Branches: `main` and `dev` both exist on GitHub at the same commit (`e227d3b`).
- Tracking files: being created on `task/bootstrap-tracking`.
- Agent setup: `.claude/agents/developer.md`, `.claude/agents/tester.md`, and `.claude/settings.json` are committed.
- Permission rules checked: push to `main` or `dev` is denied, force push is denied, `git checkout main` is denied, and pushes to `task/*` are allowed. `gh pr merge` is allowed but not yet tested.

## Run log

### Run 1
- Verified: `dev` is on GitHub, `gh` is logged in as `j-botros`.
- Started: `task/bootstrap-tracking`, which creates these two files and `handoffs/`.
- Next: open a PR into `dev`, merge it after review, then start `scaffold-minimal-extension`.

## Open questions
- Owner: confirm that Antigravity renders VS Code webviews (task `antigravity-compat-check`).
- Owner: confirm the latest stable VS Code version before the first publish. `engines.vscode` is `^1.131.0` for now.
- Owner: CLAUDE.md Section 8 seems to be missing. Restore it if that wasn't intentional.

## Blockers
- None.
