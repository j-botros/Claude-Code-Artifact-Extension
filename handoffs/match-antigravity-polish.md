# Handoff: match-antigravity-polish

## Brief (core agent)

**Goal.** Polish the artifact view to match the owner's latest feedback (2026-11-03). Keep the look and behaviour from `match-antigravity-layout`, `match-antigravity-sizes`, and `comments-match-antigravity`, except where this brief changes a size or colour.

**Branch.** `task/match-antigravity-polish`. Commit all work there. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/webview/` (panel host, renderer, inline script, CSS)
- `src/plan/` (for the tokeniser, which is a pure helper, and the longer sample in `src/plan/plan.ts`)
- `handoffs/match-antigravity-polish.md`: the "Development" section only.

Do not edit `test/`, `TASKS.md`, `STATUS.md`, `README.md`, or `CLAUDE.md`. If you need a file outside this scope, stop and report it.

**Requirements.**

1. **Top bar title.** One step smaller than the section headings: 0.9 times the section heading size. The section headings stay as set in `match-antigravity-layout`.
2. **Top bar buttons (Review, Implement the Design).** Height 26 CSS px, horizontal padding 10 CSS px, font size 12 CSS px. Keep the order (title, Review, Implement, kebab) and the colours (Review blue `#3376ce`, Implement green `#3fa34d`).
3. **Margin "+" button.** 20 CSS px square, with a 10 CSS px plus icon. Centre the glyph exactly: use flexbox with `align-items: center` and `justify-content: center`, set `line-height: 1` on the glyph. A Playwright test compares the glyph box with the button box.
4. **Code block syntax colours.** Use IDE-style colours. Measured from the screenshots: comments `#8693a2`, keywords `#8ae0f6`, strings `#bbec56`. Chosen by the core agent (not measured): types and classes `#4ec9b0`, functions `#dcdcaa`, control keywords such as `return` and `if` `#c586c0`, numbers `#b5cea8`, properties `#9cdcfe`, operators and punctuation `#d4d4d4`. Each colour is a CSS custom property on `:root` (dark default, light variant). Tokenise TypeScript with a small hand-written tokeniser: no library, no framework. Put the tokeniser in `src/plan/` as a pure function with a doc comment. Unit-test it on a fixed sample (the tester writes that test). Use the file-type label (`ts`, `js`, etc.) from `match-antigravity-layout`.
5. **Longer sample plan.** In `src/plan/plan.ts`, make the sample longer so scrolling can be tested:
   - at least 12 implementation steps
   - at least 8 files
   - at least 6 verification items
   - one code block of about 40 lines
   - all five callout markers (`NOTE:`, `TIP:`, `IMPORTANT:`, `WARNING:`, `CAUTION:`) in the overview or steps
   - a second proposed file in `proposedFiles`
   Keep the `proposedFiles` field so Implement the Design still works. Update any test that depends on the sample's exact length (tester does this in `test/`; list them in Development).
6. **Keep** the strict nonce-based CSP, no inline style attributes, no inline scripts, the light theme, the sticky top bar, the callouts, the comments, the edits, Review Comments, Implement the Design, the kebab menu, file links, and the margin comment bubbles.

**Values to record in Development.** Record which values are measured (the owner's screenshots, 2x assumed) and which were chosen by the core agent. The owner has not yet confirmed any of the new values in this task.

**Constraints.**
- Keep the strict nonce-based CSP. No inline style attributes, no inline scripts.
- CSS custom properties for every colour. No colour outside the list above.
- Add a doc comment to every function and class you add.
- TypeScript strict mode. Plain HTML, CSS, and TypeScript, no UI framework.
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: run one command per call. No `&&`, `;`, or `|`. Use only the allowed commands.
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- Items 1 to 6 are applied. Development records the chosen and measured values.
- `npm run compile` passes.
- `npm run test:unit` passes after any old-size, old-sample, or old-length assertions are updated by the tester.

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- Unit: the tokeniser on a fixed sample (token kinds and colour mapping); the sample plan's counts (12+ steps, 8+ files, 6+ verification items, a code block of about 40 lines, all five callout markers, a second proposed file); any old size assertion that changed.
- Playwright (headless Chromium):
  - Title font size is 0.9 times the section heading font size.
  - Review and Implement are 26 px high, 10 px horizontal padding, 12 px font.
  - The "+" button is 20 px square, its glyph is centred (compare glyph box centre with button box centre within 1 px), and the glyph is 10 px.
  - Token colours in a code block match the palette for comment, keyword, string, and one of the chosen colours.
  - The page scrolls (document height greater than the viewport) and the sticky bar stays at the top after scrolling.
  - No CSP violations in the console.
- Integration: the sample plan still opens and Implement the Design still shows hunks (regression only).

## Development (developer)

**What changed**
- `src/webview/planPanel.ts`: top bar title `font-size: 1.26em` (0.9 x the 1.4em `h2`, so 17.64 px against 19.6 px; the edit field for the title matches). Review and Implement buttons: height 26px, padding `0 10px`, font-size 12px. Margin "+" button: 20x20, flex-centred, now holds `<span class="plus-glyph">` (10x10 box, `line-height: 1`, flex-centred) around a 10x10 SVG plus, so the glyph is centred exactly. Code is now highlighted: spans `tok-<kind>` with six new colour custom properties (dark and light). The kebab button stays 30px (not in the brief).
- `src/plan/codeTokens.ts` (new, pure): `tokenizeCode(code)` returns `{kind, text}[]` whose texts join back to the input; `highlightsLanguage(label)` is true for `ts`, `tsx`, `js`, `jsx` (other languages stay uncoloured). Kinds: plain, comment, keyword, control, string, number, type, function, property, operator. Rules: a word before `(` is a function; a word after `.` is a property; a capitalised word or built-in type name is a type.
- `src/plan/plan.ts`: longer `samplePlan`: 12 steps, 8 files, 6 verification items, a 41-line code block (`typescript`), all five markers (NOTE in summary, CAUTION in outOfScope, IMPORTANT/TIP/WARNING in steps), and two `proposedFiles` (`sample-artifact/greet.ts`, `sample-artifact/names.ts`).

**Values**
- Measured from the owner's screenshots (2x assumed): comment `#8693a2`, keyword `#8ae0f6`, string `#bbec56`.
- Chosen by the core agent (brief): type `#4ec9b0`, function `#dcdcaa`, control `#c586c0`, number `#b5cea8`, property `#9cdcfe`, operator `#d4d4d4`.
- Chosen by me (not measured, not in the brief): light-theme variants of the six new colours: type `#267f6d`, function `#795e26`, control `#af00db`, number `#098658`, property `#0070c1`, operator `#3b3b3b`.
- From the brief, not measured: title 0.9x, buttons 26/10/12, plus 20/10. None confirmed by the owner yet.

**Tests run.** `npm run compile` passes. `npm run test:unit`: 2 failures, both old-value assertions (below); the rest pass. I did not run `test:ui` or `test:integration`.

**Existing tests expected to break (tester to update)**
- `test/unit/plan.test.ts` "has 3 implementation steps ...": `toHaveLength(3)` now 12.
- `test/unit/planRenderer.test.ts` "sets the Antigravity sizes ...": button 30px/12px/13px regex, and the 24px plus button regex at line 187 (`width: 24px; height: 24px; ... font: bold 12px/1`) now 20px and `bold 10px/1`.
- Likely in `test/ui/layout.spec.ts` (line ~207, ~469-472: plus button size and `font-size` 12px) and `test/ui/antigravityStyle.spec.ts` (button heights, the "+" text content, h1 size in the bar). Also any test that expects the plus button text to be `+`, the title size in the bar, or the sample's exact length or text (summary now starts with `NOTE:`; outOfScope with `CAUTION:`).
- Code text is now wrapped in spans, so `textContent` is unchanged but `innerHTML` and raw-HTML matches on `<code>` content can differ.

**Deviation.** None from the brief. Note the plus glyph is an SVG, not a text "+".

**Tester should check.** Tokeniser unit test on a fixed sample; sample counts; the Playwright items in the brief (glyph box centre vs button box centre within 1px; token colours; scroll with the sticky bar; no CSP violations).

## Testing (tester)

**Verdict: PASS.** No src/ bug found; all failures were old-value assertions.

**Commands and results**
- `npm run compile`: pass.
- `npm run test:unit`: 17 files, 272 passed, 0 failed.
- `npm run test:ui`: 75 passed, 0 failed (Playwright, headless Chromium).
- `npm run test:integration`: 29 passed, 0 failed (VS Code 1.107.0).

**Test changes (all under test/)**
- New `test/unit/codeTokens.test.ts`: fixed sample; round trip, every token kind, block comments, template strings, escapes, unterminated input, `highlightsLanguage`.
- `test/unit/plan.test.ts`: sample counts (12+ steps, 8+ files, 6+ verification, 35-45 line code), all five markers, 2+ proposed files.
- `test/unit/planRenderer.test.ts`: button 26px/10px/12px, plus 20px and `bold 10px/1`, bar title `1.26em`.
- `test/ui/antigravityStyle.spec.ts`: bar title is 0.9 x the h2 size (replaces the old h1 25.2px assertion).
- `test/ui/layout.spec.ts`: buttons 26/10/12; plus 20px square, 10px glyph, glyph and SVG centred within 1px; token colours (comment, keyword, string, type, function, control); sample page scrolls and sticky bar stays at top. CSP tests already cover no violations and still pass.
- `test/ui/planPanel.spec.ts`: sample counts instead of 2/3/1; leading callout marker stripped when comparing displayed text (the view shows it as a label); plus button is now an SVG, not "+" text; the read-only test clicks `pre` instead of `pre code` (the inline `<code>` now spans 41 lines, so its centre can fall outside any line and Playwright never gets a hit).
- `test/integration/implementFlow.test.ts`: `waitForDiff` matches with `includes`, and the sample test accepts any `sample-artifact/` diff tab. With two proposed files, diffs open as preview tabs and the later one (`names.ts`) replaces the earlier (`greet.ts`), so only one tab is open. Observation for the core agent: if the owner wants both file diffs open at once, the diff review would need to open them as non-preview tabs; this is not a bug against the brief.

**Not verified:** colours and sizes are the brief's values, not confirmed by the owner. `light` theme token colours were not asserted.
