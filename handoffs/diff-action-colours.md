# Handoff: diff-action-colours

## Brief (core agent)

**Goal.** In the Implement the Design review, colour the Accept and Reject controls: "✓" in blue and "✗" in red (owner changed Accept from green to blue on 2026-11-05). CodeLens title text cannot take a colour in the public API, so keep the clickable CodeLens lenses (`✓ Accept`, `✗ Reject`) and add a coloured decoration beside them on the same hunk: a `before` attachment whose `color` is a theme colour.

**Colour rules (fixed).**
- Accept marker: glyph `✓`, theme colour `charts.blue`.
- Reject marker: glyph `✗`, theme colour `charts.red`.
- Both are `ThemeColor` values, so they read in light and dark themes. Do not hard-code hex values.
- The markers sit on the hunk's first line, the same line the CodeLens lenses are attached to (`view.hunks[hunk.index].firstLine` in `src/review/hunkReview.ts`).
- Both markers must be visible at the same time on that line. If two `before` attachments on one line cannot both render, the developer picks another valid layout that keeps both glyphs coloured (for example, one decoration type per marker with a `margin` offset), and records what was chosen.

**Branch.** `task/diff-action-colours` (from `origin/dev`). Commit on this branch only. Never push to `main` or `dev`.

**Scope: files the developer may edit.**
- `src/review/hunkReview.ts` (decoration types and `refreshDecorations`).
- A new pure module in `src/plan/` if the colour and glyph rules are put there (for example `src/plan/decisionMarkers.ts`). Export the glyphs and theme colour ids from it, so unit tests can check them without VS Code.

Do not edit `test/`, `README.md`, `TASKS.md`, `STATUS.md`, `CLAUDE.md`, or `handoffs/` except the Development section below.

**Behaviour that must not change.**
- Accept and Reject lens titles and commands (`claudeArtifact.acceptHunk`, `claudeArtifact.rejectHunk`) and their arguments.
- The green and red line backgrounds and the overview ruler colours from `minimap-hunk-markers`.
- Decisions, the Apply path, its confirmation, and `implement-apply` behaviour.
- Disposal: any new decoration type must be disposed in the existing `dispose` handler in `registerHunkReview`.
- Strict TypeScript (`"strict": true`), and a doc comment on every new function and class.

**Developer task.**
1. Add the marker rules as a small pure module, or as constants in `hunkReview.ts`. Name the theme colour ids `charts.blue` and `charts.red`.
2. In `decorationTypes()` (or a sibling helper), create the decoration type(s) for the markers. In `refreshDecorations()`, apply the marker decorations to the first line of every hunk that has a change in each visible inline editor of the session, and clear them when there is no session, as the existing code does for the line decorations.
3. Record in Development: the chosen layout, the theme colour ids, and whether both glyphs render on one line in a real VS Code window (probably not checked; say so).

**Tester task.**
- Unit tests in `test/unit/` for the pure marker rules: the accept glyph is `✓` with colour `charts.blue`, the reject glyph is `✗` with colour `charts.red`, and the two colours are different ids.
- Integration test in `test/integration/`, following the pattern of `test/integration/overviewRuler.test.ts` (it wraps `vscode.window.createTextEditorDecorationType` and records the options). Check that the marker decoration types carry a `before` attachment with the right glyph and a `ThemeColor` with id `charts.blue` or `charts.red`. Run the review on a temporary workspace under `out-test/` (CLAUDE.md Section 7 bans writes outside the repo), using the existing review test patterns (`test/integration/applyFlows.test.ts` or `test/integration/inlineReview.test.ts`, whichever exists).
- Confirm that the Accept and Reject CodeLens titles are unchanged.

**Definition of done.**
- Accept markers are blue `✓` and Reject markers are red `✗`, both as `ThemeColor` theme colours, applied on each hunk's first line.
- Unit and integration tests cover the colour rules, as above.
- `npm run compile`, `npm run test:unit`, `npm run test:ui`, and `npm test` pass.
- Owner check in Antigravity is still needed (not done here): record that as not verified.

**Test commands.** `npm run compile`, `npm run test:unit`, `npm run test:ui`, `npm test`.

**Attribution.** Commit messages end with `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Not in scope.** CodeLens title colours (not possible in the public API), the minimap, CLAUDE.md, the README (the core agent updates it), and any change to Apply behaviour.

## Development

**Files changed.**
- `src/plan/decisionMarkers.ts` (new, pure): exports `ACCEPT_MARKER` (`✓`, `charts.blue`) and `REJECT_MARKER` (`✗`, `charts.red`), each `{ glyph, colorId }`.
- `src/review/hunkReview.ts`: new `markerTypes()` creates two decoration types; `refreshDecorations()` applies them; the `dispose` handler disposes both.

**Layout chosen.** One decoration type per marker, each with a `before` attachment (`contentText` = glyph, `color` = `new vscode.ThemeColor(colorId)`, `margin: "0 0.4em 0 0"`). Both types are set on the same zero-width range at the first line of each hunk (`viewFor(...).hunks[i].firstLine`, clamped to the document). Two separate types are used because one type holds only one `before` attachment. They are cleared (empty arrays) when there is no session or the editor is not an inline review document. Line backgrounds, overview ruler colours, lens titles and commands, and Apply are untouched.

**Theme colour ids.** `charts.blue` (accept), `charts.red` (reject). No hex values.

**Not confirmed.** I did not check in a real VS Code window or Antigravity that both glyphs render side by side on one line; they should, since each is a separate decoration, but that is untested. Compile passes (`npm run compile`). I did not run the tests; the tester owns test/. Owner check in Antigravity: not verified.

## Testing

**Verdict: PASS.**

**Commands run.**
- `npm run compile`: OK, no errors.
- `npm run test:unit`: 25 files, 385 tests passed (includes 4 new).
- `npm run test:ui`: 130 passed.
- `npm run test:integration` (run inside `npm test`): 42 passed (1 new).
- `npm test`: passed on the final run (unit 385, ui 130, integration 42). One earlier `npm test` run had 1 failure in `Plan folder watcher: a new plan file opens the artifact...` (`no webview tab "Watcher new file plan"`). It is a timing flake in an existing, unrelated test (`test/integration/planWatcher.test.js`); the next full run passed. Worth watching, not caused by this task.

**Tests added.**
- `test/unit/decisionMarkers.test.ts` (4 tests): accept is `✓` with `charts.blue`; reject is `✗` with `charts.red`; glyphs and colour ids differ; colour ids are theme ids, not hex.
- `test/integration/decisionMarkers.test.ts` (1 test), temporary workspace `out-test/marker-workspace` (removed afterwards): starts a review with two hunks; checks via a `createTextEditorDecorationType` spy that the marker types have a `before` attachment with `✓` and `✗`, whose `color` is a `ThemeColor` with id `charts.blue` and `charts.red`, and that they are two separate decoration types; checks that both marker types are applied to the inline editor when a decision triggers a refresh; checks lens titles `✓ Accept` and `✗ Reject` (two hunks each, same command ids) and, after accepting, `✓ Accepted` with `✗ Reject` still present.

**Could not confirm.**
- The editor and decoration type objects are frozen in the extension host, so `setDecorations` calls and their ranges cannot be intercepted. "Applied" is shown by counting reads of the type's `key` through a Proxy (which `setDecorations` reads). The marker ranges (hunk first line) are therefore not asserted; line placement relies on the code in `refreshDecorations()`.
- Real rendering (both glyphs side by side on one line, colours in light and dark themes) in VS Code or Antigravity: not checked. Owner check in Antigravity still needed.
- No src/ bug found.
