# Claude Code Artifact Extension

**Status: early idea.** No extension code exists yet. This README describes what the project will do and the decisions made so far.

An IDE extension for Google Antigravity and VS Code that lets Claude Code create interactive **artifacts** inside the editor. The first artifact type is an implementation plan: a readable design document for proposed changes that you can review, comment on, and act on.

## What it does

- Renders a Claude Code plan as an interactive page in the editor.
- Lets you edit the artifact and add comments.
- Adds two buttons at the top right of the artifact:
  - **Review Comments:** sends your comments back to Claude Code.
  - **Implement the Design:** asks Claude Code to carry out the plan.

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

Planned commands (not yet available):

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run compile` | Build the extension |
| `npm run watch` | Rebuild on change |
| `npm run test:unit` | Unit tests (plan parsing, comment handling) |
| `npm run test:ui` | Headless UI tests of the artifact view |
| `npm run test:integration` | Tests inside a VS Code window |
| `npm test` | Run all of the above |
| `npm run package` | Create a `.vsix` file for local install |

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
