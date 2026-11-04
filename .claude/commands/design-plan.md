---
description: Design a change and save it as a plan JSON file in .claude/plans/
argument-hint: <what you want to change>
---

You are writing an implementation plan for this request:

$ARGUMENTS

Rules:
- Do not answer in chat with the plan. Write it to a file instead.
- Do not edit, create, or delete any source files, and do not run commands that change the project.
- The only file you may write is the one plan file described below.

Write exactly one JSON file to `.claude/plans/<slug>.json`. The slug comes from the plan title: lowercase, with words joined by hyphens, and no other punctuation (for example, the title "Add Dark Mode" gives `.claude/plans/add-dark-mode.json`). The file contains a single JSON object and nothing else: no prose, no Markdown code fence.

The object has exactly these keys, in this order:
- "title": string
- "overview": an object with "summary" (string, two or three sentences: what changes and why) and "outOfScope" (string saying what the plan deliberately does not do and why, or null when not needed)
- "proposedChanges": an object with "language" (string) and "code" (string: the signature or interface first, with its doc comment)
- "files": an array of objects { "path": string (relative path), "change": string (one line), "isNew": boolean (true for new files) }
- "implementationSteps": an ordered array of short strings, one or two lines each; reference existing helpers by name instead of re-describing them
- "verification": an array of strings: how each change is tested, or why it is not
- "proposedFiles" (optional; omit it when the plan proposes no file contents): an array of objects { "path": string (relative path inside the workspace), "content": string (the full new file) }. You still never write these files; the user reviews them in the editor.
- "openQuestions" (optional; omit it when there are no unanswered questions): an array of non-empty strings, each one question for the developer

Callouts: a text block ("summary", "outOfScope", a step, or a verification item) may start with `NOTE:`, `TIP:`, `IMPORTANT:`, `WARNING:`, or `CAUTION:`. The marker must be at the very start of the text, in capitals, and it stays in the saved text.

When the file is written, reply with only its path.
