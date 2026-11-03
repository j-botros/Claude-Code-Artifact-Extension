# TASKS

Owned by the core agent only. Statuses: `todo`, `in progress`, `done`, `blocked`.
Work runs one task at a time. Each task branches from `dev` and merges back through a PR.

| ID | Task | Owner | Status | Branch | PR |
|---|---|---|---|---|---|
| bootstrap-tracking | Create TASKS.md, STATUS.md, and handoffs/ | core | in progress | task/bootstrap-tracking | — |
| scaffold-minimal-extension | Minimal VS Code extension: one command that opens a webview showing a sample plan. Includes package.json, strict tsconfig, compile script, and a unit test harness. | developer, then tester | done | task/scaffold-minimal-extension | [#4](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/4) |
| antigravity-compat-check | Install the scaffold `.vsix` in Antigravity and confirm the webview renders. Manual step by the owner. | owner | todo | — | — |
| plan-renderer | Render a JSON plan (see CLAUDE.md, Section 3) as the artifact view: title, summary, steps. Light and dark themes. | developer, then tester | blocked | — | — |
| fix-packaging | Make `npm run package` produce a .vsix: raise engines.vscode to ^1.144.0, add repository field, exclude internal files via .vscodeignore, add .vscode/launch.json. | developer, then tester | in progress | task/fix-packaging | — |

## Blocked
- `plan-renderer`: waiting on `antigravity-compat-check`. Do not start until the owner reports that the webview renders in Antigravity.
