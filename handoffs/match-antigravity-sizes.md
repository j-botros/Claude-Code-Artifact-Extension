# Handoff: match-antigravity-sizes

## Brief (core agent)

**Goal.** Match the sizes of the artifact view to the owner's side-by-side Antigravity screenshots (2026-11-03). The screenshots are 2000 px wide and are assumed to be 2x, so 1 CSS px = 2 screenshot px. Keep the look and behaviour from `match-antigravity-layout` and `comments-match-antigravity`, except where this brief changes a size.

**Branch.** `task/match-antigravity-sizes`. Commit all work there. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/webview/` (panel host, renderer, inline script, CSS)
- `src/plan/` only if a pure helper is needed for a size. Say so in Development if you add one.
- `handoffs/match-antigravity-sizes.md`: the "Development" section only.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, or `CLAUDE.md`. If you need a file outside this scope, stop and report it.

**Requirements (use these values; they were measured from the owner's screenshots).**

1. **Content side margins.** The content starts at about 9% of the window width from the left edge (185 of 2000 px) and ends at about 87% (1735 of 2000 px). Use `padding-inline: 9vw` on the content, with a minimum of 16px on phones. The current margins are too wide. Replace the 77% column width from `match-antigravity-layout` with this padding, and keep the content centred. Record in Development which CSS now sets the column width.
2. **Top bar title.** The title sits about 14 CSS px (28 of 2000 px) from the left edge. Use `padding-inline: 1.4vw` for the top bar. Keep the bar sticky (`position: sticky; top: 0`).
3. **Buttons (Review, Implement the Design).** Height 30 CSS px (60 px in the screenshot). Horizontal padding 12 CSS px. Font size 13 CSS px. Border radius 4 CSS px. The current buttons are too large.
4. **Top bar order, left to right.** Title, then Review, then Implement the Design, then the kebab menu. The kebab sits to the right of Implement the Design. (This changes the order from `match-antigravity-layout`, which put the kebab first.)
5. **Margin "+" button.** 24 CSS px square (about 47 px in the screenshot), with a 12 CSS px plus icon.
6. **Keep** the sticky top bar, the blue Review button (`#3376ce`, always blue), the green Implement the Design button (`#3fa34d`), and the callouts from `match-antigravity-layout`. Keep the strict nonce CSP, no inline style attributes, no inline scripts, and the light theme. Keep existing behaviour: edits, comments, Review Comments, Implement the Design, the kebab menu, file links, and the margin comment bubbles.

**Measured versus estimated (for the Development section).**
- Measured from the screenshots, in CSS px (screenshot px / 2): the content margins (9% and 87%), the title offset (14 px), the buttons (30 px high, 12 px horizontal padding, 13 px font, 4 px radius), the "+" button (24 px square, 12 px icon).
- Assumed: the 2x scale. Say so in Development. If the scale is different, the px values are wrong by the same factor.
- Record the measured values in Development, and label each as measured or assumed.

**Constraints.**
- Keep the strict nonce-based CSP. No inline style attributes, no inline scripts.
- CSS custom properties for every colour. No new colours in this task.
- Add a doc comment to every function and class you add.
- TypeScript strict mode. Plain HTML, CSS, and TypeScript, no UI framework.
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: run one command per call. No `&&`, `;`, or `|`. Use only the allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- Items 1 to 6 are applied. Development records the measured values.
- `npm run compile` passes.
- `npm run test:unit` passes, with any old-markup or old-size assertions that break updated by the tester.

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- Unit: any size or CSS-value assertions that change (content padding, top bar padding, button height, "+" size, kebab-to-Implement order).
- Playwright (headless Chromium), at a 2000 px wide viewport where practical:
  - The content's left edge is at about 9% of the window width and its right edge at about 87%.
  - The top bar title is about 14 px from the left edge.
  - The Review and Implement buttons are 30 px high, with 12 px horizontal padding, 13 px font, and 4 px radius.
  - Order in the top bar is title, Review, Implement, kebab.
  - The "+" button is 24 px square and its icon is 12 px.
  - The sticky bar still stays at the top after scrolling.
  - Review is `#3376ce`, Implement is `#3fa34d`, and callouts still render.
  - No CSP violations in the console.
- Integration: the sample plan still opens and Implement the Design still shows hunks (regression only).

## Development (developer)

All changes are in `src/webview/planPanel.ts` (CSS and markup). No `src/plan/` helper added.

**Values set** (all px values assume the screenshots are 2x, so 1 CSS px = 2 screenshot px; the 2x scale is ASSUMED):
- Content side padding: `--content-pad: max(9vw, 16px)`, 16px on phones (max-width 899px). Measured (185/2000 and 1735/2000).
- Top bar padding-inline: `--bar-pad: 1.4vw`. Measured (28 screenshot px = 14 CSS px). Bar is still `position: sticky; top: 0`.
- Review and Implement buttons: height 30px, padding `0 12px`, font-size 13px, border-radius 4px. Measured.
- Kebab button: 30px square. ASSUMED (not in the brief; matched to the button height so the bar lines up).
- Margin "+" button: 24px square (unchanged), font `bold 12px/1`, so the plus glyph is 12px. Measured. The "+" is a text glyph, not an SVG, so the 12px is the font size.
- Top bar order: title, Review, Implement, kebab (markup moved; kebab menu popover stays right-aligned to its wrapper).

**What sets the column width now:** the `.content` rule (`padding-inline: var(--content-pad)`). `.doc` is full width (`width: 100%`); the old `--content-width: 77vw` and `--side-padding` variables are removed and `body` has no side padding. The header stays outside `.content` so the bar spans the full width with its own 1.4vw padding. Markup change: a new `<div class="content">` wraps everything after the header.

**Tests:** `npm run compile` passes. `npm run test:unit`: 2 expected failures in `test/unit/planRenderer.test.ts` for the tester to update:
- "orders the sticky bar as title, kebab, Review, Implement..." (order is now title, Review, Implement, kebab).
- "uses the dark Antigravity palette by default and a light variant" expects `--content-width: 77vw;` (now `--content-pad: max(9vw, 16px);`).

**Deviation:** none from the brief (the 30px kebab is the only addition).

## Testing (tester)

**Verdict: PASS.**

Commands, each run separately:
- `npm run compile`: passes, no errors.
- `npm run test:unit`: 16 files, 266 tests passed, 0 failed (the 2 expected failures were fixed by updating assertions; a third, `--side-padding: 16px;`, was also removed by the developer's change and was updated).
- `npm run test:ui`: 73 passed, 0 failed (headless Chromium, 3 workers).
- `npm run test:integration`: 29 passing, 0 failing (VS Code 1.107.0 Extension Development Host), including the sample plan opening and Implement the Design showing hunks.

**Test changes.**
- `test/unit/planRenderer.test.ts`: bar order is now title, Review, Implement, kebab; palette test expects `--content-pad: max(9vw, 16px);` and no `--side-padding`; new test for the size CSS (content padding, bar padding, 30px buttons with 12px padding and 13px font, 4px radius, 24px "+" with 12px font, `--content-width` gone, content wrapper after header).
- `test/ui/layout.spec.ts`: order test updated; narrow test also checks 16px content padding; new "Antigravity sizes at 2000px" block (content padding 180px each side, blocks span 180px to 1820px, 16px minimum at 320px, bar padding 28px and title at x=28, Review and Implement 30px high with 12px padding, 13px font, 4px radius, kebab right of Implement and 30px high, "+" 24px square with 12px font, sticky bar at y=0 after scroll, Review `#3376ce`, Implement `#3fa34d`, callouts render, no CSP violations, no inline style attributes).
- `test/ui/antigravityStyle.spec.ts`: phone and desktop width tests now check `.content` padding (16px; 144px at 1600px) and a full-width `.doc` instead of body padding and the 77% column.

**Notes and limits.**
- The brief says content ends at about 87%. With symmetric `padding-inline: 9vw` the blocks (including the 40px comment margin column) end at 91% of the window, so 87% is not asserted; only the left edge (9%) is checked tightly. The 87% in the screenshots is likely where the text ends, inside the margin column. Flagged for the core agent, not a failure.
- The 2x screenshot scale is an assumption in the brief; the tests check CSS px values only.
- All UI checks ran in headless Chromium on the rendered HTML with a stubbed `acquireVsCodeApi`, not in a real VS Code or Antigravity webview. The integration tests do not check pixel sizes.
