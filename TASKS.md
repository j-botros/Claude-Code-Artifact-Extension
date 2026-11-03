# TASKS

Owned by the core agent only. Statuses: `todo`, `in progress`, `done`, `blocked`.
Work runs one task at a time, in table order. Each task branches from `dev` and merges back through a PR.
When no `todo` task for developer or tester exists, the scheduled runner exits without calling Claude.

| ID | Task | Owner | Status | Branch | PR |
|---|---|---|---|---|---|
| bootstrap-tracking | Create TASKS.md, STATUS.md, and handoffs/ | core | done | task/bootstrap-tracking | [#1](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/1) |
| scaffold-minimal-extension | Minimal VS Code extension: one command that opens a webview showing a sample plan. Includes package.json, strict tsconfig, compile script, and a unit test harness. | developer, then tester | done | task/scaffold-minimal-extension | [#4](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/4) |
| fix-packaging | Make `npm run package` produce a .vsix: add repository field, exclude internal files via .vscodeignore, add .vscode/launch.json. | developer, then tester | done | task/fix-packaging | [#5](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/5) |
| engines-1-107 | Target VS Code 1.107 so the extension installs in Antigravity (its IDE version is 1.107.0). | developer, then tester | done | task/engines-1-107 | [#6](https://github.com/j-botros/Claude-Code-Artifact-Extension/pull/6) |
| antigravity-compat-check | Install the scaffold `.vsix` in Antigravity and confirm the webview renders. Manual step by the owner. | owner | done | — | — |
| plan-renderer | Render a JSON plan (see CLAUDE.md, Section 3) as the artifact view: title, summary, steps. Light and dark themes. | developer, then tester | todo | — | — |
| claude-plan-generation | Add a command that runs `claude -p --output-format stream-json --verbose` headless with a plan prompt, reads the final `result` event, and passes its text through `parsePlanJson` to render the plan. Handle a missing `claude` binary or a non-logged-in user with a clear message. Unit-test the stream parsing with saved sample streams. No fallback yet. | developer, then tester | todo | — | — |
| comments-ui | Add a comment box to each step in the artifact view. Comments live in webview state for now and show up in the page after reload while the panel stays open. | developer, then tester | todo | — | — |
| edit-ui | Make the plan title, summary, and step text editable in the artifact view. Save edits to a JSON file in `.claude/plans/` in the workspace, named after the plan title. | developer, then tester | todo | — | — |
| review-comments | Add the top-right "Review Comments" button. It sends the plan and its comments to Claude Code through the `claude-plan-generation` path and re-renders the returned plan. | developer, then tester | todo | — | — |
| agy-fallback | When `claude` is missing or not logged in, fall back to `agy -p --output-format stream-json --mode plan` with the no-tools prompt from the README. Never pass `--dangerously-skip-permissions`. Retry once on an empty `result.response`, then show a failure. Show the README security warning in the UI the first time the fallback runs. | developer, then tester | todo | — | — |
| ui-tests | Add `npm run test:ui`: Playwright, headless Chromium, against the built webview HTML. Cover rendering, light and dark themes, comments, and edits. | developer, then tester | todo | — | — |
| integration-tests | Add `npm run test:integration` using `@vscode/test-cli`. Cover activation, the command, and the webview opening. | developer, then tester | todo | — | — |
| implement-design | Add the top-right "Implement the Design" button. What it does is an owner decision. | owner | blocked | — | — |

## Blocked
- `implement-design`: waiting on the owner to decide what "Implement the Design" does. Options the owner must choose between: (a) Claude Code applies the plan's steps to the workspace on a new branch, (b) the button only creates TASKS.md entries from the plan, or (c) something else. The core agent must not guess this.
