# Handoff: match-antigravity-layout

## Brief (core agent)

**Goal.** Match the artifact view's layout to the owner's side-by-side Antigravity screenshots (2026-11-03). Keep the colours, type, and document layout from `match-antigravity-style` and `comments-match-antigravity`, except where this brief changes them.

**Branch.** `task/match-antigravity-layout`. Commit all work there. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/webview/` (panel host, renderer, inline script, CSS)
- `src/plan/` only for a pure helper that detects callout markers (for example `src/plan/callouts.ts`) and the code-label map, so they can be unit-tested without VS Code. Say so in Development if you add one.
- `CLAUDE.md`, Section 3: the callout marker note (item 6 below). Nothing else in `CLAUDE.md`.
- `handoffs/match-antigravity-layout.md`: the "Development" section only.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, or `README.md`. If you need a file outside this scope, stop and report it.

**Requirements (use these values; they are the owner's).**

1. **Narrower side margins.** The content column spans about 77% of the window width, not 68%. This replaces the 800px `--content-width` from `match-antigravity-style`. Keep it centred. Record in Development that the 800px value is superseded.
2. **Sticky top bar.** A bar that stays visible while the page scrolls (`position: sticky; top: 0`). Left: the plan title. Right, in this order: the kebab menu, the Review button, the Implement the Design button. The title no longer needs to sit in the body above the sections if it would be duplicated; keep one title element, and keep the title editable through the existing edit path.
3. **Review button is always blue** `#3376ce`, whether or not it has comments. Its text reads "Review • N" as now.
4. **Implement the Design is green** `#3fa34d`. The owner did not give another value, so use this one. Its text colour must pass contrast on that green (use white or the dark page colour, and say which in Development).
5. **Heading sizes** (relative to body 14px): the title about 1.8 times body (about 25px); section headings about 1.4 times (about 20px); sub-headings about 1.15 times (about 16px). Map title to the title element, sections to `h2`, and sub-headings to `h3`. Replace the 1.5em and 1.2em values from `match-antigravity-style`.
6. **Callout blocks.** When a text block's text starts with a marker, render it as a callout: a coloured left bar, a coloured label, and body-text colour for the text. The marker is removed from the displayed text and shown as the label. Markers and colours (light and dark variants; dark is the default):
   - `NOTE:` blue `#3566ce`
   - `TIP:` green `#3fa34d`
   - `IMPORTANT:` purple `#8259dd`
   - `WARNING:` amber `#d9a441`
   - `CAUTION:` red `#d1575a`

   Use the existing text fields only. The plan JSON format must not change. Marker matching is case-sensitive and must be at the start of the text, followed by a colon. Add a note to `CLAUDE.md` Section 3 that lists the five markers. Click-to-edit and comments must still work on callout blocks, and an edit must keep the marker in the saved text.
7. **Thin horizontal rule** between sections (an `hr`-like rule using `--border`). Not above the first section and not after the last.
8. **Margin "+" button** about 24px square, not larger. Keep the accent colour and the tooltip "Add inline comment".
9. **Code block labels and copy.**
   - The label shows the short file type: `typescript` shows as `ts`, `javascript` as `js`, and so on. Use a small map in the pure helper, and show unknown labels as they are, lowercased.
   - Add a copy button at the top right of each code block. Copy the block's code. Do it through a message to the extension host (`vscode.env.clipboard.writeText` in `src/webview/planPanel.ts`), not `navigator.clipboard`, because the webview clipboard may be blocked. Keep the strict nonce CSP and no inline handlers.
10. **"Click to edit" tooltip.** Hovering an editable text block shows a small "Click to edit" label on its left. CSS only, using a pseudo-element, not an inline style or an inline script.

**Measured versus estimated (for the Development section).**
- From the owner's screenshots, as given in this brief: the 77% column; the 1.8, 1.4, and 1.15 heading ratios; the blue Review button; the NOTE and IMPORTANT colours.
- Chosen by the core agent, not sampled: the green `#3fa34d` for Implement the Design (the owner gave no value); TIP, WARNING, and CAUTION colours; the 24px "+" size; the 1.15 sub-heading ratio if it looks off in the screenshots.
- Developer: list each value you set and whether it came from this brief's "owner" items or was your choice. Light-theme values for the new colours are your choice; list them.

**Constraints.**
- Keep the strict nonce-based CSP. No inline style attributes, no inline scripts.
- Keep existing behaviour: edits, comments, Review Comments, Implement the Design, the kebab menu (Copy, Copy Path, Export Artifact), the file links, and the margin comment bubbles.
- CSS custom properties for every colour. Light theme stays as a secondary variant, with values for the new colours.
- Add a doc comment to every function and class.
- TypeScript strict mode. Plain HTML, CSS, and TypeScript, no UI framework.
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: run one command per call. No `&&`, `;`, or `|`. Use only the allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- Items 1 to 10 are applied. Development says which values were measured and which were estimated.
- `npm run compile` passes.
- `npm run test:unit` passes, with any old-markup assertions that break updated by the tester.

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- Unit: the callout marker helper (each marker, a lowercase or mid-text marker is not a callout, an empty body), the code-label map (`typescript` to `ts`, `javascript` to `js`, unknown labels kept), and any CSS-value assertions that change (Review button always blue, Implement green, title and heading sizes, 77% column).
- Playwright (headless Chromium): the sticky bar stays at the top after scrolling and holds the title, kebab, Review, and Implement in order; Review is `#3376ce` with and without comments; Implement is `#3fa34d`; a callout renders with its left bar and label colour for each marker; code labels show `ts` and `js`; the copy button exists on each code block; "+" is about 24px; the rule sits between sections; the light theme renders; no CSP violations in the console.
- Integration: the sample plan still opens and Implement the Design still shows hunks (regression only).

## Development (developer)

**Files changed.** `src/webview/planPanel.ts`; new `src/plan/callouts.ts` (pure helper: `splitCallout`, `CALLOUT_MARKERS`, `codeLabel`); `CLAUDE.md` Section 3 (one bullet listing the five markers); this section.

**Changes by requirement.**
1. Column: `--content-width: 77vw` on `.doc` (`width: var(--content-width); max-width: 100%`), centred. At max-width 899px it is `100%` so phones keep the 16px padding. The 800px value from `match-antigravity-style` is superseded.
2. Sticky bar: `header.top` is `position: sticky; top: 0` with the page background and a bottom border. Left: the editable `h1` title (one title element; the old title block in the body is gone). Right, in order: kebab, Review, Implement. Title edit still uses the existing `data-edit="title"` path.
3. Review button: always `--review` (`#3376ce`), white text. The script still toggles `has-comments`, which no longer changes the colour.
4. Implement: `--implement` `#3fa34d`. Text colour: the dark page colour `#1f1f1f` (`--implement-fg`), because white on `#3fa34d` is about 3.2:1 while `#1f1f1f` is about 5.1:1.
5. Sizes: `h1` 1.8em, `h2` 1.4em, `h3` 1.15em (and the title edit field 1.8em). Note the Review popover's "Submit comment" `h2` is also 1.4em, and it is now the first `h2` in the DOM.
6. Callouts: `splitCallout` (case-sensitive, at the very start, colon required, `\s*` after the colon is part of the prefix). Applied to `summary`, `outOfScope`, steps (editable) and verification items (read-only). Markup: `.callout.<kind>` with `.callout-label` and the body. For editable text, the element holds only the body and keeps the removed prefix in `data-marker`; the script re-adds it in `readEdits` and strips it when restoring saved state, so the saved text keeps the marker. Marker-only text ("NOTE:") is a callout with an empty body. The marker kind cannot be changed by editing.
7. `hr.section-rule` (1px `--border`) before Proposed changes, Files, Implementation steps, Verification. None above Overview or after Verification.
8. "+" is 24px by 24px (font 16px).
9. Code: label from `codeLabel` (typescript to ts, javascript to js, python py, ruby rb, rust rs, golang go, bash/shell/shellscript/zsh sh, markdown md, yaml yml, csharp/c# cs, c++ cpp, kotlin kt, powershell ps1, typescriptreact tsx, javascriptreact jsx; unknown kept lowercased). Label is shown top-left inside the code block, a "Copy" button top-right (`button.copy-code`). Click posts `{type:"copyCode"}`; the host (`PlanPanel.copyCode`) writes the plan's `proposedChanges.code` with `vscode.env.clipboard.writeText` and replies through the status line ("Copied the code."). The host copies its own stored code, not text sent by the webview.
10. "Click to edit": `.editable::after` pseudo-element on hover, to the left, CSS only. I removed the native `title="Click to edit"` attribute so there is no double tooltip. Hidden at max-width 899px (no room at the left on phones).

**Measured, estimated, chosen.**
- Owner (from brief): 77% column, 1.8 / 1.4 / 1.15 ratios, Review `#3376ce`, NOTE `#3566ce`, IMPORTANT `#8259dd`.
- Core agent's choice, used as given: Implement `#3fa34d`, TIP `#3fa34d`, WARNING `#d9a441`, CAUTION `#d1575a`, 24px "+".
- My choice: light-theme values: review `#2a64b8`, implement `#2b7d37` with white text (about 5.1:1), note `#2a55b8`, tip `#2b7d37`, important `#6b44c4`, warning `#8a6200`, caution `#b3363a`. Dark `--implement-fg` `#1f1f1f`; `--review-fg` white. Also mine: the sticky bar's border, the hr margins, the tooltip styling, the `vw` unit for 77%, the code-block layout (label and Copy inside the block, 2rem top padding).

**Deviations and decisions for the owner or tester.**
- The title is no longer a commentable block (no "+" on the title), because it now lives in the sticky bar. The comment id `title` is no longer emitted.
- `.callout.info` CSS is kept from the style task alongside `.callout.note`.
- `--content-width` is `77vw`, not a percentage of the body, so it ignores body padding.
- Not checked in a browser.

**Results.** `npm run compile` passes. `npm run test:unit`: 4 failures, all in `test/unit/planRenderer.test.ts`, all old-markup assertions the tester should update: (a) block order expects a `title` block; (b) "gives every block a comment button" expects `aria-label="Add inline comment on title"`; (c) "escapes every plan field" expects `<h1 ... title="Click to edit">` (the title attribute is gone); (d) the palette test expects the 800px content width (now `77vw`). No other unit failures.

## Testing (tester)

_(to be filled by the tester)_
