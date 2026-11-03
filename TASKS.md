# TASKS

Owned by the core agent only. Statuses: `todo`, `in progress`, `done`, `blocked`.
Work runs one task at a time. Each task branches from `dev` and merges back through a PR.

| ID | Task | Owner | Status | Branch | PR |
|---|---|---|---|---|---|
| bootstrap-tracking | Create TASKS.md, STATUS.md, and handoffs/ | core | done | task/bootstrap-tracking | [#1](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/1) |
| scaffold-minimal-extension | Minimal VS Code extension: one command that opens a webview showing a sample plan. Includes package.json, strict tsconfig, compile script, and a unit test harness. | developer, then tester | done | task/scaffold-minimal-extension | [#4](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/4) |
| fix-packaging | Make `npm run package` produce a .vsix: add repository field, exclude internal files via .vscodeignore, add .vscode/launch.json. | developer, then tester | done | task/fix-packaging | [#5](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/5) |
| engines-1-107 | Target VS Code 1.107 so the extension installs in Antigravity (its IDE version is 1.107.0). | developer, then tester | done | task/engines-1-107 | [#6](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/6) |
| antigravity-compat-check | Install the scaffold `.vsix` in Antigravity and confirm the webview renders. Manual step by the owner. | owner | done | — | — |
| plan-renderer | Render a JSON plan (see CLAUDE.md, Section 3) as the artifact view: title, summary, steps. Light and dark themes. | developer, then tester | todo | — | — |

## Blocked
- None.
