# Handoff: match-antigravity-style

## Brief (core agent)

**Goal.** Match the artifact view's look to the owner's Antigravity screenshots (2026-11-03). Use the values below exactly, as CSS custom properties on `:root`, with the dark-mode values as the default. Light theme stays as the secondary variant. Keep the document layout and the existing behaviour from `comments-match-antigravity` and `comments-redesign`.

**Branch.** `task/match-antigravity-style`. Commit all work there. Do not push to `main` or `dev`.

**Scope (files the developer may edit).**
- `src/webview/` (the panel host, renderer, inline script, and CSS)
- `handoffs/match-antigravity-style.md`: the "Development" section only

Do not edit `src/plan/` unless a colour or style value must be passed from TypeScript (say so in Development if you do). Do not edit `test/`, `TASKS.md`, `STATUS.md`, or `README.md`. If you need a file outside this scope, stop and report it.

**Colours (use these values exactly).**

Dark theme (default, on `:root`):
- Page background: `#1f1f1f`
- Heading text: `#cccccc`
- Body text: `#d5d5d5`
- Secondary button background: `#343434`
- Popover, card, and code-block background: `#232323`
- Border and divider: `#292929`
- Accent blue, for the "+" button, the Review button when comments exist, Add Comment, and Submit: `#3376ce`
- Info callout: `#3566ce`
- Important callout: `#8259dd`
- Inline code text: `#e2c98e`
- Code comments: `#8693a2`
- Code keywords: `#8ae0f6`
- Code strings: `#bbec56`

Light theme: keep it as a secondary variant. Pick light values that keep contrast, and list them in Development. The dark values above are the source of truth.

**Type.**
- Font: system UI stack `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`.
- Body: 14px, line-height 1.5.
- Title: about 1.5 times the body size. Section headings: about 1.2 times the body size.
- Code: `ui-monospace, "SF Mono", Menlo, monospace` at 13px.
- The owner's screenshot scale is not known, so these sizes are estimates. Say so in Development.

**Layout.**
- Content column about 800px wide, centred.
- 16px side padding on phones (narrow widths).
- Comment icons and bubbles sit in a right margin about 40px wide. Keep the margin layout from `comments-redesign`.

**Constraints.**
- Keep the strict nonce-based CSP. No inline style attributes, no inline scripts.
- Keep the existing behaviour: edits, comments, Review Comments, Implement the Design, and the kebab menu all keep working.
- CSS custom properties for every colour. Add a doc comment to every function and class.
- TypeScript strict mode. Plain HTML, CSS, and TypeScript, no UI framework.
- Never read or write files outside this repository. Never read the Claude or agy credentials.
- Shell: run one command per call. No `&&`, `;`, or `|`. Use only the allowed commands (git status, git diff, git log, git add, git commit, npm ci, npm install, npm audit, npm run, npm test, npx vitest, npx playwright).
- Commit trailer: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

**Definition of done.**
- The colour, type, and layout values above are applied as CSS custom properties on `:root` (dark default) with a light variant.
- Development records: the values were sampled from screenshots; font sizes are estimates because the screenshot scale is not known; the light values chosen.
- `npm run compile` passes. `npm run test:unit` passes (with any old-markup assertions that break from the change updated by the tester).

**Test commands for the tester.** `npm run test:unit`, `npm run test:ui`, `npm run test:integration`. `npm test` runs all three.

**What the tester should check.**
- Playwright (headless Chromium): the computed colours of the page background, heading, body text, secondary button, popover, border, and the blue accent on the "+", Review button (with comments), Add Comment, and Submit. Check the info and important callouts, inline code, and the code comment, keyword, and string colours at the sampled points by computed style (`getComputedStyle`) on the elements. A pixel sample from a screenshot is an optional extra.
- Light theme variant still renders.
- Narrow width (phone): 16px side padding, no horizontal scroll.
- Console has no CSP violations.
- Unit: any test that asserts old CSS values changes to the new ones.

## Development (developer)

**What changed.** Only `src/webview/planPanel.ts` (CSS block and one script line).
- `:root` now holds the dark values from the brief as the default, plus new custom properties: `--heading`, `--btn-secondary`, `--popover`, `--code-bg`, `--accent-fg`, `--info`, `--important`, `--inline-code`, `--code-comment`, `--code-keyword`, `--code-string`, `--font-body`, `--font-code`, `--font-size`, `--content-width` (800px), `--margin-width` (40px), `--side-padding` (24px; 16px at max-width 899px). Old names (`--bg`, `--fg`, `--card`, `--border`, `--accent`, ...) are kept.
- The old `prefers-color-scheme: dark` block is gone. Light is now `@media (prefers-color-scheme: light)`.
- Body 14px / line-height 1.5; h1 1.5em; h2 1.2em; h3 1em. Code 13px in the mono stack.
- Review button: secondary background by default; the script toggles a `has-comments` class (accent blue) when comments exist. Implement the Design uses the secondary background. "+" button, Add Comment, Save, and Submit use the accent. Popover and bubble use the popover colour and border.
- Inline `code` uses `--inline-code`; `pre code` uses body text. Classes `.tok-comment`, `.tok-keyword`, `.tok-string` and `.callout.info` / `.callout.important` are styled, but no current markup emits them (no syntax highlighter or callout content exists in the plan renderer). Tester: test them by injecting elements in the page, or tell the core agent if markup is wanted.

**Notes.**
- Dark values were sampled from the owner's screenshots. Font sizes are estimates because the screenshot scale is not known.
- Light values I chose (not sampled): bg `#ffffff`, heading `#1f1f1f`, body `#2b2b2b`, muted `#5f6368`, secondary button `#ececec`, popover/card `#f7f7f7`, code bg `#f3f3f3`, border `#dcdcdc`, accent `#2a64b8`, info `#2a55b8`, important `#6b44c4`, inline code `#8a5a00`, code comment `#5d6b7a`, keyword `#0b6d8c`, string `#3d7a0a`, link `#1f5fbf`.
- Non-brief values I chose for dark: muted `#9a9a9a`, link `#6aa5ec`, badge green kept.
- Deviation: the margin is a `var(--margin-width)` column, 40px (was 2.5rem). No `src/plan/` changes.

**Results.** `npm run compile` passes. `npm run test:unit`: 245 pass, 1 fails: `test/unit/planRenderer.test.ts` "supports the dark color scheme" expects the string `prefers-color-scheme: dark`, which no longer exists because dark is the default. The tester should update it (for example, expect `--bg: #1f1f1f` and `prefers-color-scheme: light`). I did not edit `test/`.

Nothing was checked in a browser yet.

Commit: see `git log` on `task/match-antigravity-style` (latest commit, "style: match Antigravity colours and type").

## Testing (tester)

**Verdict: PASS.**

Commands (each run on its own):
- `npm run compile`: passes.
- `npm run test:unit`: 246 passed, 0 failed (15 files).
- `npm run test:ui`: 43 passed, 0 failed (headless Chromium).
- `npm run test:integration`: 28 passed, 0 failed (VS Code 1.107.0).

Test changes (test/ only):
- `test/unit/planRenderer.test.ts`: "supports the dark color scheme" replaced by a test that asserts the dark default `:root` variables (all brief colours, 800px content width, 40px margin), `prefers-color-scheme: light` present, `prefers-color-scheme: dark` absent, and the 16px phone side padding.
- `test/ui/planPanel.spec.ts`: three old-CSS assertions updated: plus button accent (light `rgb(42, 100, 184)`; Playwright defaults to light), dark `--bg` `#1f1f1f`, bubble marker colours (light `rgb(42, 100, 184)`, dark `rgb(51, 118, 206)`), and popover/menu background now equals the `--popover` colour (it no longer equals the page background).
- New `test/ui/antigravityStyle.spec.ts` (8 tests).

Checked in headless Chromium only (via `getComputedStyle`; no real VS Code webview, no screenshot pixel sampling):
- Dark default: body background rgb(31,31,31), h1 #cccccc, body text #d5d5d5, 14px / line-height 21px, h1 21px, code 13px in the mono stack; Review and Implement buttons #343434; pre, card, Review popover, kebab menu #232323; borders #292929.
- Accent #3376ce on the "+" button, the Review button once a comment exists (`has-comments`), Add Comment, and Submit.
- Light variant: white page, #1f1f1f heading, #2b2b2b body, #ececec Review, #f3f3f3 code block, accent #2a64b8 on Review with a comment.
- Phone width 390px: 16px left and right body padding, no horizontal scroll. Desktop 1600px: 24px padding, title block no wider than 840px, no horizontal scroll.
- No console errors, page errors, or CSP violations in dark and light while loading, adding a comment, and opening the Review popover.

Injected elements (the renderer emits none of these, as the developer noted): inline `code` #e2c98e, `.tok-comment` #8693a2, `.tok-keyword` #8ae0f6, `.tok-string` #bbec56, `.callout.info` border #3566ce, `.callout.important` border #8259dd. Only the CSS rules are verified, not that any real content uses them.

Notes:
- Chromium rewrites `BlinkMacSystemFont` in the computed `font-family` to `"system-ui"`, so the font test checks for `SF Pro Text` instead.
- Not verified: the 800px content column width as a CSS value (only that the title block is at most 840px at 1600px viewport); the real Antigravity or VS Code webview look.
