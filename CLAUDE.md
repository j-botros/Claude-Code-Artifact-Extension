# CLAUDE.md

## 1. Project overview

- **Project name:** Claude Code Artifact Extension
- **One-line description:** A Google Antigravity IDE Extension that allows Claude Code to create interactive Artifacts in the IDE.
- **What it is, in a paragraph:** A Google Antigravity IDE Extension that allows Claude Code to create interactive Artifacts in the IDE. It is particularly for Implementation Plans, like in Google Antigravity IDE. It provides an aesthetically pleasing design document for suggested changes. It allows users to edit the artifact, comment on the artifact, and click a button on the top-right to either Review Comments or Implement the Design.
- **Who it's for (users / audience):** Developers who use Claude Code in Google Antigravity IDE or VS Code. Each user runs their own Claude Code; the extension connects to it as an IDE extension and renders artifacts on the user's own computer. Nothing is hosted by us.
- **Current stage (idea / prototype / in development / maintenance):** Idea
- **Repository status:** Empty

## 2. Goals and definition of done

- **Primary goal:** Create an interactive Claude Code artifact in Google Antigravity IDE to edit the artifact, comment on the artifact, and click a button on the top-right to either Review Comments or Implement the Design.
- **Secondary goals:**
    - Make artifacts aesthetically pleasing in Google Antigravity IDE.
    - Add an Antigravity plugin (the `plugin.json` / `agy plugin` system) once the VS Code extension works.
- **What "done" looks like for the first milestone:** Interactive Claude Code artifact in Google Antigravity IDE to edit the artifact.
- **Known constraints (deadlines, budget, compliance, platforms):**
    - Budget: $5/month 
    - Platforms: Google Antigravity IDE or VSCode

## 3. Stack and conventions

- **Languages / frameworks:** TypeScript in strict mode (`"strict": true`) for the extension host. The webview UI is plain HTML, CSS, and TypeScript/JavaScript with no UI framework; keep it readable and clean, use CSS custom properties for colors, and support light and dark themes.
- **Plan format:** JSON, the format Claude Code outputs for plans. The owner's recommended default. The plan has these fields, and the artifact view renders them in this order:
  - `title` (string)
  - `overview`: `summary` (two or three sentences: what changes and why) and `outOfScope` (string, or null when not needed; says what the plan deliberately does not do and why)
  - `proposedChanges`: `language` (string) and `code` (string: the signature or interface first, with its doc comment)
  - `files`: an array of `{ path, change, isNew }`. `path` is a relative path. `change` is one line. `isNew` is true for new files.
  - `implementationSteps`: an ordered array of short strings, one or two lines each. Reference existing helpers by name instead of re-describing them.
  - `verification`: an array of strings: how each change is tested, or why it isn't.
  - The plan prompt for Claude Code must ask for exactly this shape.
- **Implement the Design (decided):** Claude Code never writes files. The plan may include an optional `proposedFiles` array of `{ path, content }`, where `content` is the full new file. The extension computes a diff per file and shows each hunk as green or red with a ✓ (accept) and ✗ (reject) CodeLens. Only accepted hunks are written, in place in the current workspace, through VS Code's edit API, after a confirmation before the first write. This is an explicit user action from the button, never automatic. It does not use Antigravity's built-in accept and reject, which no public extension API exposes.
- **Key dependencies or external services:**
  - Extension API (primary target): the VS Code extension API. Google's Antigravity docs do not document extension development, so the VS Code API is the reference. Whether Antigravity runs VS Code extensions the same way is unconfirmed (inferred).
  - Antigravity plugin system (secondary goal): `plugin.json`, `agy plugin validate --strict`, and the Antigravity Marketplace. Separate from the VS Code API. Not started until the VS Code extension works.
  - Webview APIs (confirmed for VS Code): `window.createWebviewPanel`, `WebviewPanelOptions.retainContextWhenHidden` (high memory cost), `enableScripts`, `localResourceRoots`, `webview.asWebviewUri`, `webview.cspSource` for a strict Content-Security-Policy, `webview.postMessage` / `webview.onDidReceiveMessage`, and `getState` / `setState` for panel state.
  - Manifest (confirmed for VS Code): `package.json` with `main`, `engines.vscode`, `contributes.commands`, `contributes.keybindings` (`key`, `mac`, `when`), `contributes.menus` (`commandPalette`, `view/title`), and `activationEvents` (e.g., `onCommand:<id>`, `onWebviewPanel`). Commands contributed in `contributes.commands` do not need a matching `onCommand` entry.
  - Packaging: `@vscode/vsce` (`vsce package` creates a `.vsix`). Local install is `code --install-extension <file>.vsix` or "Install from VSIX..." in the Extensions view (confirmed for VS Code). Whether Antigravity accepts the same `.vsix` is unconfirmed (inferred). A secondary report says Antigravity defaults to the Open VSX gallery, not the Visual Studio Marketplace (unverified).
  - Publisher: `j-botros`. This goes in the `publisher` field of `package.json`, and the extension ID is `j-botros.<extension-name>`.
  - Open VSX publishing is in scope (decided). Confirmed commands: `npx ovsx create-namespace j-botros -p <token>` (once), then `npx ovsx publish <file>.vsix -p <token>`. Each publish needs owner sign-off. The Open VSX token must never be committed to the repo; keep it in an environment variable (e.g., `OVSX_PAT`).
  - Tests: `@vscode/test-cli` and `@vscode/test-electron` for integration tests (confirmed for VS Code). Vitest for unit tests (inferred, recommended). Playwright for headless webview UI tests (inferred, recommended, run against the built webview HTML in headless Chromium).
  - Artifact creation (decided): Claude Code creates the artifacts. Preferred: the extension drives the user's own Claude Code directly, using the `claude` CLI in headless mode (`claude -p --output-format stream-json`). Fallback: use `agy` when the `claude` CLI is missing or the user is not logged in (see Unresolved for the decided details). If neither is installed or logged in, artifact creation is unavailable and the extension says so.
- **How to install, build, run, and test:**
  - Install: `npm install`
  - Build: `npm run compile` (runs `tsc -p ./` in strict mode and copies the webview assets to `out/`)
  - Run: `npm run watch`, then start an Extension Development Host from `.vscode/launch.json` with `"type": "extensionHost"` (confirmed for VS Code).
  - Test commands:
    - `npm run test:unit`: Vitest (inferred), pure logic only (plan parsing, comment handling). Needs no VS Code.
    - `npm run test:ui`: Playwright (inferred), headless Chromium on the built webview HTML. Needs no VS Code.
    - `npm run test:integration`: `vscode-test` from `@vscode/test-cli`, which downloads VS Code and runs the tests in an Extension Development Host (confirmed for VS Code).
    - `npm test`: runs `test:unit`, `test:ui`, then `test:integration`.
    - `npm run package`: `vsce package` to produce a `.vsix`.
- **Code style and conventions:** Commenting on every function and class; TypeScript strict mode.
- **Important paths / directory layout:** (proposed, not yet created) `src/extension.ts` (activation and commands), `src/webview/` (panel host and HTML/CSS/TS UI), `src/plan/` (pure plan parsing and comment logic), `test/unit/`, `test/ui/`, `test/integration/`, `.vscode-test.mjs`, `package.json`, `tsconfig.json`.
- **Unresolved:** (1) Whether Antigravity supports the VS Code extension API and webviews the same way. Resolve this first by running a minimal VS Code-style extension in Antigravity. Decided: the VS Code API is the primary target; Antigravity plugins are a secondary goal. (2) Decided: Claude Code creates the artifacts, preferably by the extension driving the `claude` CLI headless (`claude -p --output-format stream-json`), with `agy` as a fallback. Verified from one test run (`claude -p "<prompt>" --output-format stream-json --verbose`, saved in the scratchpad as `stream-test.jsonl`): the stream is one JSON object per line. Event types are `system`/`init` (session ID, model, version), `system`/`thinking_tokens` (progress), `assistant` (blocks of type `thinking` or `text`), `rate_limit_event` (ignore), and a final `result`/`success`. The plan is a JSON string in `result.result`, which the extension must `JSON.parse`. Strip any Markdown code fence before parsing, and handle a parse failure gracefully, because the model may add one. Only the `result` event is needed to build an artifact; the rest drive progress display. Authentication (investigated): the extension does not authenticate itself. It runs the `claude` CLI as the same OS user, and the CLI uses that user's existing login (on this machine, a claude.ai subscription, stored in the macOS keychain under "Claude Code-credentials"). The extension must never read, copy, or log those credentials. If the CLI reports it is not logged in, the extension should show "Run `claude auth login` in a terminal" rather than attempt login itself. For machines without a login, `claude auth login --console` uses API billing instead, and `--bare` with `apiKeyHelper` is available for scripted setups (not tested here). Fallback decisions: (a) Use `agy` only when `claude` is not installed or `claude auth status` reports not logged in. If `agy` is also missing, artifact creation is unavailable. (b) `agy` must never run with `--dangerously-skip-permissions`. Test finding: `--mode plan` alone did NOT stop tool use. In a headless run, `agy` still ran `ls -la`, read a plugin file, and tried `npx`; the `npx` call was auto-denied. Plan mode is therefore not a sufficient safety control on its own (see Unresolved). (c) Model: the latest Sonnet model reported by `agy models`, resolved at runtime so it doesn't need manual updates. If no Sonnet model can be resolved, fall back to a model chosen in extension settings. Test run (`agy -p "<prompt>" --output-format stream-json --mode plan --print-timeout 5m`, saved as `agy-test.jsonl` in the scratchpad) findings: (1) events are `init`, `step_update` (with `step_type` of `user_input`, `agent_response`, or `tool`, and a `state` of `ACTIVE`, `DONE`, or `ERROR`), and a final `result` event. This differs from the `claude` stream. (2) The plan text is in `result.response`, and in this run it was empty, because the run ended after a denied tool call. The run still reported `status: SUCCESS`, so the extension must check for an empty response and treat it as a failure. (3) `result.denied_actions` lists denied tool calls. (4) Headless runs auto-deny any tool that needs permission, and the stderr says to add `permissions.allow` rules or use `--dangerously-skip-permissions`. (5) `agy` loaded a user plugin (`modern-web-guidance`) from `~/.gemini`, so headless runs can pick up the user's plugins. Second test with `--sandbox` added (saved as `agy-sandbox.jsonl`): still not sufficient. `agy` ran `ls -la` successfully, attempted `cat` on files, was denied, and returned an empty response with `status: SUCCESS`. So neither `--mode plan` nor `--sandbox` prevents tool calls in headless mode. Still open: (a) Decided (option 3): no hard tool block. The `agy` fallback is not a security boundary, and the extension relies on the no-tools prompt plus the empty-response check. Findings: `agy`'s settings are in `~/.gemini/config/config.json` under `userSettings` (with `permissionPreset`, `autoExecutionPolicy`, and `globalPermissionGrants.allow`) and in `~/.gemini/antigravity-cli/settings.json` (`trustedWorkspaces`). On the owner's machine, `permissionPreset` is `AGENT_PERMISSION_PRESET_TURBO` and `autoExecutionPolicy` is `CASCADE_COMMANDS_AUTO_EXECUTION_EAGER`, which is the likely reason shell commands ran. The extension must not depend on the user's preset, and it must not edit the user's global config without approval. Deny-rule syntax was not investigated, (b) whether the prompt-level instruction reliably prevents tool calls. With the prompt "Do not use any tools..." (`agy-notools.jsonl` and `rel-1` to `rel-5`), six runs in total made no tool calls, and all six returned a plan that parses with 6 steps. The prompt instruction is still not a security control, and six runs don't prove it holds for every prompt or model version. (c) Decided: on an empty `agy` response, retry once, then report a failure. (d) Decided: the extension's README must state that the `agy` fallback runs under the user's own `agy` permission settings and is not sandboxed, so the user can review those settings. The README does not exist yet; include this statement when it is created. (3) The exact plan JSON schema. (4) Whether Antigravity installs from `.vsix` and which gallery it uses. (5) Decided: publisher is `j-botros`, and Open VSX publishing is in scope. Each publish still needs owner sign-off. (6) `engines.vscode` is set to `^1.131.0` as a tentative choice. VS Code 1.131 is an official stable release (July 29, 2026). Reports of a newer release (1.137) were not verified. Confirm the latest stable on code.visualstudio.com/updates before the first publish, and confirm that Antigravity's bundled VS Code version is at least this version. (7) Playwright and Vitest versions (pin on first install, at least two weeks old).

## 4. Scope of autonomy

Tasks the core agent may run **unattended**:
- Research
- Updating docs
- Creating branches, opening PRs, and merging feature branches into `dev`
- Running tests
- Creating and updating `STATUS.md` and `TASKS.md`

Tasks that **require my sign-off first**:
- Merging `dev` into `main`
- Spending money
- Deleting branches, force-pushing, or deleting data
- Anything that publishes or hosts content outside the user's machine

Tasks that the core agent may **never perform**:
- Never read or write files outside this repository.
- Never send messages outside this repo or spend money without explicit approval.
- Never call the Artifact tool's `publish` action. Artifacts in this project are local files rendered by the extension, not hosted pages.

## 5. Operating model

- **Where it runs:** On the user's own computer. The extension connects to the user's Claude Code as an IDE extension, and artifacts are created and displayed locally. There is no server or hosting component.
- **Git workflow:**
    - Branch from `dev`, one branch per task (e.g., `task/<short-name>`)
    - Open PRs into `dev`
    - Core agent merges PRs into `dev` once tests pass
    - `dev` into `main` is done by me only
    - Never push directly to `main` or `dev`
- **Who reviews output, and how:**
    - Core agent reviews output by verifying with tests, and writes a summary in each PR for me to check
- **How I want to be notified (summaries, failures, blockers):**
    - Summaries, failures, and blockers

## 6. Core agent role

You are the core agent and you own this project end to end. Your job is to:

1. Read this file, `STATUS.md`, and `TASKS.md` at the start of every run. If `STATUS.md` or `TASKS.md` don't exist, create them first:
   - `TASKS.md`: a queue of tasks, each with a status (`todo`, `in progress`, `done`, `blocked`), a branch name, and a link to its PR.
   - `STATUS.md`: a running log of the last few runs, the current state of the project, open questions, and blockers.
2. Turn goals into tasks in `TASKS.md`, and pick the next one.
3. Delegate execution to subagents in `.claude/agents/`, and send each one a complete brief.
4. Review subagent output against the brief and the definition of done before accepting it.
5. Make routine decisions yourself. Escalate anything listed under "requires my sign-off".
6. Before stopping, update `STATUS.md` (what changed, what's next, open questions) and `TASKS.md`.
7. Maintain `README.md`. Whenever a change affects what the project does, how to install or build it, its requirements, its commands, or its status, update the README in the same PR. Keep these required items in it:
   - The `agy` fallback security warning (the fallback runs under the user's own `agy` permission settings and is not sandboxed).
   - The license statement (MIT, linking to `LICENSE`).
   - The status line, which must stay accurate (currently "early idea").
   Remove planned commands from the README's table once they exist, and mark them as available.

## 6a. Orchestration

Work runs one task at a time (decided). The core agent is the only coordinator; subagents do not start other subagents.

Subagents:
- `developer` (`.claude/agents/developer.md`): implements one task on its branch and commits there.
- `tester` (`.claude/agents/tester.md`): writes and runs tests on the same branch and commits them there.

Loop for each task in `TASKS.md`:
1. Create the branch `task/<id>` from `dev`. Set the task to `in progress`.
2. Write the brief to `handoffs/<id>.md`: goal, scope (files the developer may edit), definition of done, branch name, and the test commands to run.
3. Run the `developer` subagent with the brief. Read its report and the "Development" section of its handoff.
4. Run the `tester` subagent on the same branch. Read its verdict and the "Testing" section of the handoff.
5. On FAIL, send the failing output back to the `developer`, then re-test. A task gets at most 3 developer-tester rounds. If it still fails after round 3, set it to `blocked` in `TASKS.md` and record why in `STATUS.md`.
6. On PASS, open a PR from `task/<id>` into `dev` with a summary, and set the task to `done` once the PR is open.

Conflicts:
- If the developer and tester commits conflict on the task branch, the core agent resolves the conflict. Subagents do not resolve merge conflicts, and they stop and report one if they meet it.
- The core agent may only resolve conflicts on its own task branch. Merging a PR into `dev` follows Section 5 (the core agent merges once tests pass). Merging `dev` into `main` is never done by the agent.

File ownership (one writer per file):
- `TASKS.md` and `STATUS.md`: core agent only.
- `README.md`: core agent only.
- `handoffs/<id>.md`: the core agent writes the brief, the developer writes "Development", and the tester writes "Testing".
- `src/`: developer only. `test/`: tester only.

## 7. Hard rules

- Work on a branch per task, branched from `dev`.
- Never push to `main` or `dev` directly. Changes reach `dev` only through PRs.
- Never read or write files outside this repository.
- Never send messages outside this repo or spend money without explicit approval.
- If `PAUSE` exists in the repo root, stop immediately and make no changes.
- If you're blocked or unsure, write the question to `STATUS.md` and move on to other work.
