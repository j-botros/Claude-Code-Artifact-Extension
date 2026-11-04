# Claude Code Artifact Extension

**Status: early idea.** A minimal scaffold exists. The `Claude Artifact: Open Sample Plan` command opens a webview with a hard-coded sample plan. The `Claude Artifact: Generate Plan from Claude Code` command asks your Claude Code (headless `claude` CLI) for a plan and renders it. The artifact view is a document: the title, overview, code, each file, each step, and each verification item can take a comment (a blue **+** appears in the right margin on hover, and opens a comment box). Comments show as bubbles in the right margin, collapse to a marker, and can be edited or deleted. The top-right **Review • N** button opens a Submit comment popover with an optional message. Comments are kept in the panel's state, so they survive a reload while the panel stays open, but they are not saved to disk. File paths in the Files table open the file in the editor (existing files only). The plan title, summary, out-of-scope note, and step text are editable; each save writes the plan to `.claude/plans/<title>.json` in your workspace. The **Review Comments** button sends the plan and your comments to Claude Code and shows the returned plan. If `claude` is missing or not logged in, the plan is requested through the `agy` fallback (with a one-time security warning). The **Implement the Design** button shows each proposed file's changes as a hunk review with ✓ and ✗ lenses. An **▶ Apply accepted** lens writes only the accepted hunks to your workspace files, after a confirmation the first time in each session. This README describes what the project will do and the decisions made so far.

An IDE extension for Google Antigravity and VS Code that lets Claude Code create interactive **artifacts** inside the editor. The first artifact type is an implementation plan: a readable design document for proposed changes that you can review, comment on, and act on.

## What it does

- Renders a Claude Code plan as an interactive document in the editor, styled after the Antigravity Implementation Plan view: dark theme by default, with a light variant. Margin comments on any block. In the Files table, each existing file's path is a link that opens the file in the editor. New files are not linked.
- Layout: a sticky top bar (title, Review, Implement the Design, ⋯ menu) stays visible while you scroll. Text that starts with `NOTE:`, `TIP:`, `IMPORTANT:`, `WARNING:`, or `CAUTION:` shows as a coloured callout. Code blocks show a short language label (`ts`, `js`, …) and a copy button, and `ts`/`js` code uses IDE-style colours. Available now.
- **Claude Artifact: Generate Plan from Claude Code:** asks for a request, runs `claude` headless in your workspace (in plan mode, so it does not edit files), and renders the plan it returns.
- Lets you edit the plan's title, summary, out-of-scope note, and step text (click the text), and add comments to any block. Edits are saved to `.claude/plans/` in your workspace.
- Adds these controls at the top right of the artifact:
  - **Review • N** (N = number of comments): opens a Submit comment popover with an optional message and the list of comments. Submit sends the plan, your comments, and the message to Claude Code (headless, in plan mode) and shows the revised plan. Nothing is written to disk. Available now.
  - **⋯ menu:** **Copy** puts the plan on the clipboard as Markdown. **Copy Path** copies the relative path of the saved plan file (`.claude/plans/<title>.json`) once the plan has been saved by an edit. **Export Artifact** writes the plan as `.claude/plans/<title>.md` in your workspace, overwriting an existing file. Available now.
  - **Implement the Design:** shows the plan's optional proposed files inline, in a read-only document named after each file. Added lines are green and removed lines are red, with a ✓ and ✗ lens above each change. The real file is never changed by this view. Accepting or rejecting only records your choice. The **▶ Apply accepted** lens writes only the accepted hunks, in place, through VS Code's edit API, after a confirmation the first time in each session. Rejected and undecided hunks are left alone. A file is skipped if it changed since the review or has unsaved edits. Available now.

## How it works

- **Everything runs on your machine.** Artifacts are local files rendered by the extension. Nothing is uploaded to a server, and the project does not host any content.
- **Claude Code creates the artifacts.** The extension runs the `claude` command-line tool in headless mode and reads its JSON output.
- **Your login is used.** The extension does not sign you in and does not read your credentials. It uses whichever account you're logged in to in Claude Code.
- **Fallback:** If `claude` is not installed or you're not logged in, the extension uses the `agy` command-line tool, if it's installed. If neither is available, artifact creation is unavailable.

## Requirements

- Google Antigravity IDE or VS Code
- Claude Code installed and logged in (`claude auth login`), or `agy` installed as a fallback
- Node.js and npm, for building from source

## Security: the `agy` fallback is not sandboxed

**Read this before using the `agy` fallback.**

When the fallback runs, `agy` uses **your own `agy` permission settings**. On some setups these settings allow `agy` to run shell commands without asking. The extension asks `agy` not to use tools, and it checks the result. Those checks are not a security boundary. If `agy` ignores the instruction, it can run commands on your machine.

To review or change these settings, look in `~/.gemini/config/config.json` (under `userSettings`, including `permissionPreset` and `autoExecutionPolicy`). The extension does not change these settings.

The primary `claude` path runs under your Claude Code permission settings. Those settings have not yet been reviewed for this extension.

## Development

The project is written in TypeScript, with plain HTML, CSS, and JavaScript for the artifact view. There is no UI framework.

Available commands:

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run compile` | Build the extension |
| `npm run test:unit` | Unit tests (plan parsing, plan HTML rendering) |
| `npm run test:ui` | Headless Chromium (Playwright) tests of the artifact view: rendering, themes, comments, edits. Needs `npx playwright install chromium` once. |
| `npm run test:integration` | Tests inside a VS Code window (downloads VS Code 1.107.0 on first run). Covers activation, the sample-plan command and webview, the diff review lenses, and the plan flows (generate, `agy` fallback, Review Comments) against stub `claude` and `agy` executables, and Apply accepted in a temporary workspace (only accepted hunks written, confirmation, session end). |
| `npm run package` | Create a `.vsix` file for local install (writes `claude-code-artifact-<version>.vsix` in the repo root) |
| `npm test` | Run unit, UI, then integration tests |

Planned commands (not yet available):

| Command | Purpose |
|---|---|
| `npm run watch` | Rebuild on change |

Plans are exchanged as JSON. Claude Code's output may include a Markdown code fence, which the extension strips before parsing.

## Installing and publishing

- Local install: build a `.vsix` with `npm run package`, then use "Install from VSIX" in the editor.
- Publisher: `j-botros`
- Planned distribution: [Open VSX](https://open-vsx.org), the open extension registry used by VS Code forks. Publishing is done only with the owner's approval.

## Project documentation

- `CLAUDE.md`: the project brief and rules for the Claude Code agent that works on this repository.
- `STATUS.md` and `TASKS.md`: current progress and the task queue. The agent creates these on its first run.

## License

MIT. See [LICENSE](LICENSE).
