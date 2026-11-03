# Handoff: link-file-paths

## Brief (core agent)

- **Goal:** In the artifact view's Files table, make each file path a link. Clicking it opens that file in the editor. The extension opens the file with `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument`, resolving the path relative to the workspace root. New files (`isNew: true`) show the "new" badge and open nothing (no link).
- **Branch:** `task/link-file-paths` (from `origin/dev`).
- **Current state to know:**
  - The task text says "the webview has no scripts today". That is out of date. `comments-ui` (run 6) already enables scripts and has one nonce'd inline script. Check the existing CSP and nonce, and extend them. Do not add a second script-src or a second nonce.
  - `renderPlanHtml` renders the Files table as plain `<code>` text (run 4 decision). Changing it to a link is in scope.
- **Scope (files you may edit):**
  - `src/webview/` (panel host and the HTML/inline script)
  - `src/plan/` only if the renderer lives there
  - `src/extension.ts` only for the message handler, if the message handler is there
  - Do not edit `test/`. The tester owns it. If an existing test breaks because of the markup change, report the test name and the reason in Development. Do not edit it.
  - Do not edit `TASKS.md`, `STATUS.md`, `README.md`, or `handoffs/`.
- **Design requirements:**
  1. The link is a clickable element with a `data-` attribute carrying the relative path. The path is escaped for HTML.
  2. Clicks post a message to the extension, for example `{ type: "openFile", path }`. The inline script handles the click. It must not navigate the webview.
  3. The extension validates the message. Reject a path that is absolute, contains `..` segments, or is not a string. Show nothing for a rejected path, and show an error message only if one already exists for failures.
  4. Resolve the path with `vscode.Uri.joinPath(workspaceFolders[0].uri, path)`. If there is no workspace folder, show an information message and do nothing.
  5. If the file does not exist, `openTextDocument` throws. Catch it and show an error message naming the path.
  6. Keep the CSP strict. Use the existing nonce. No `unsafe-inline`, no new external sources.
  7. Keep the light and dark themes working. Use the existing CSS custom properties for link color.
- **Definition of done:**
  1. Non-new files in the Files table render as links. New files show the "new" badge and no link.
  2. A message with a valid relative path opens that file in the editor.
  3. Absolute paths, `..` paths, and non-string paths are rejected and open nothing.
  4. `npm run compile` passes.
  5. `npm run test:unit` passes. Existing tests may change only if the tester updates them.
  6. The developer adds no tests. The tester writes the unit tests for the link rendering and the message handling, and the UI test for the link if it fits.
- **Stop and report** (do not work around it) if:
  - the message handling needs a file that is not in scope
  - the existing CSP cannot support the inline script without `unsafe-inline`
- **Test commands:**
  - `npm run compile`
  - `npm run test:unit`
  - `npm run test:ui` (only if the UI markup changed; the tester decides)
  - `npm test` is run by the tester at the end

## Development (developer)

**What changed** (only `src/webview/planPanel.ts`):
- `renderFiles`: non-new files render as `<a href="#" class="file-link" data-path="..."><code>path</code></a>` (path HTML-escaped). New files keep `<code>` plus the "new" badge, no link.
- `COMMENT_SCRIPT` (existing nonce'd script, no second script or nonce): click on `a.file-link` calls `preventDefault()` and posts `{ type: "openFile", path }`.
- CSS: `--link` custom property for light and dark, and `a.file-link { color: var(--link); }`. CSP unchanged.
- Message handling: `openWorkspaceFile(path)` (exported) rejects non-string, absolute, and `..` paths via the existing `isSafeRelativePath` from `src/plan/plan.ts`, silently. No workspace folder gives an information message. Otherwise `Uri.joinPath(workspaceFolders[0].uri, path)`, `openTextDocument`, `showTextDocument`. A failure shows an error message naming the path. `onDidReceiveMessage` dispatches `openFile` to it.

**Note on a concurrent edit:** while I worked, `planPanel.ts` changed on disk. Another writer added the `isSafeRelativePath` import, the `openWorkspaceFile` function, the `openFile` dispatch branch, and an `a.file-link` CSS rule, and also added a click handler at the same time as mine. This produced duplicates (a second click handler, a second CSS rule, a second `openFile` branch and my own private method, and a duplicate `isSafeRelativePath`). I removed my duplicates and kept the other version of the handler. The final file has one of each. Please check that nothing else is editing this file.

**Tests:** `npm run compile` passes. `npm run test:unit`: 192 pass, 1 fails. The failing test is `test/unit/planRenderer.test.ts` > `renderPlanHtml` > "contains exactly one nonce'd script, and no anchor, href, or inline event handler". It asserts `not.toContain("<a ")` and `not.toContain("href=")`, which the new link markup breaks by design. I did not edit it. The tester must update it (keep the one-script and no-inline-handler checks). `npm run test:ui` not run.

**Tester should check:** link markup for non-new files and none for new files; HTML escaping of the path in `data-path`; `openWorkspaceFile` rejects absolute, `..`, backslash, empty, and non-string paths; the no-folder and open-failure messages; the CSP still has one nonce and no `unsafe-inline`.

## Testing (tester)

_To be filled by the tester._
