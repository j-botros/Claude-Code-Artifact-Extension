import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ModuleAny = require("module") as any;

/** Loads a compiled module while answering `require("vscode")` with an empty stub. */
function loadWithVscodeStub(file: string): any {
  const original = ModuleAny._load;
  ModuleAny._load = function (request: string, ...rest: unknown[]): unknown {
    if (request === "vscode") {
      return {};
    }
    return original.call(this, request, ...rest);
  };
  try {
    return require(file);
  } finally {
    ModuleAny._load = original;
  }
}

const root = path.resolve(__dirname, "..", "..");
const { renderPlanHtml } = loadWithVscodeStub(path.join(root, "out", "webview", "planPanel.js"));
const { samplePlan } = loadWithVscodeStub(path.join(root, "out", "plan", "plan.js"));

const NONCE = "testnonce123";
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const DARK_MENTION = "rgb(40, 40, 40)"; // #282828
const LIGHT_MENTION = "rgb(243, 243, 243)"; // #f3f3f3

/**
 * Fixture that imitates the VS Code webview base stylesheet. Source: the owner's note
 * in TASKS.md about the VS Code 1.107.0 webview base stylesheet (not re-read from the
 * VS Code install, which is outside the repo). `--vscode-textPreformat-background` is
 * defined to a visible red so an unfixed `code` background shows up in the test.
 */
const VSCODE_BASE_FIXTURE = `
:root { --vscode-textPreformat-background: #ff0000; }
code { background-color: var(--vscode-textPreformat-background); padding: 1px 3px; border-radius: 4px; }
pre code { padding: 0; }
`;

/** Opens the plan HTML with the VS Code base fixture placed before the artifact CSS. */
async function openWithBase(page: Page, name: string, plan: unknown, stripFix = false): Promise<void> {
  await page.addInitScript(() => {
    (window as any).acquireVsCodeApi = () => ({
      getState: () => undefined,
      setState: () => undefined,
      postMessage: () => undefined,
    });
  });
  let html: string = renderPlanHtml(plan, NONCE);
  if (stripFix) {
    // Mutation check: remove the fix rules from the rendered CSS to reproduce the pre-fix stylesheet.
    const fixed = "pre code { color: var(--fg); background: transparent; padding: 0; border-radius: 0; }";
    expect(html, "fix rule present in the rendered CSS").toContain(fixed);
    html = html.replace(fixed, "pre code { color: var(--fg); }");
  }
  const marker = `<style nonce="${NONCE}">`;
  const at = html.indexOf(marker);
  expect(at, "artifact style tag found").toBeGreaterThan(-1);
  const withBase = html.slice(0, at) + `${marker}${VSCODE_BASE_FIXTURE}</style>\n` + html.slice(at);
  const dir = path.join(root, "test-results", "html");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, withBase);
  await page.goto(pathToFileURL(file).href);
}

/** Returns the computed background color of a locator's element. */
async function bgOf(loc: ReturnType<Page["locator"]>): Promise<string> {
  return loc.evaluate((el) => getComputedStyle(el).backgroundColor);
}

for (const [scheme, mention] of [
  ["dark", DARK_MENTION],
  ["light", LIGHT_MENTION],
] as const) {
  test.describe(`code block background with VS Code base styles (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    // The fixture really paints a plain inline code red, so a transparent result is meaningful.
    test("fixture paints inline code outside code blocks", async ({ page }) => {
      await openWithBase(page, `cbb-fixture-${scheme}`, samplePlan);
      const inline = page.locator("code:not(pre code):not(.file-mention)");
      const n = await inline.count();
      if (n > 0) {
        expect(await bgOf(inline.first())).toBe("rgb(255, 0, 0)");
      } else {
        const probe = await page.evaluate(() => {
          const el = document.createElement("code");
          document.body.appendChild(el);
          return getComputedStyle(el).backgroundColor;
        });
        expect(probe).toBe("rgb(255, 0, 0)");
      }
    });

    // Guard: without the fix rule the base style paints code blocks red, so the checks below can fail.
    test("without the fix rule pre code shows the base background", async ({ page }) => {
      await openWithBase(page, `cbb-prefix-${scheme}`, samplePlan, true);
      expect(await bgOf(page.locator("pre code").first())).toBe("rgb(255, 0, 0)");
      const pad = await page.locator("pre code").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
      expect(pad).toBe("4px");
    });

    // Every code element and line inside code blocks is transparent, hovered or not.
    test("pre code and code lines are transparent", async ({ page }) => {
      await openWithBase(page, `cbb-lines-${scheme}`, samplePlan);
      const codes = page.locator("pre code");
      const cn = await codes.count();
      expect(cn).toBeGreaterThan(1);
      for (let i = 0; i < cn; i++) {
        expect(await bgOf(codes.nth(i)), `pre code #${i}`).toBe(TRANSPARENT);
      }
      const lines = page.locator(".code-line");
      const n = await lines.count();
      expect(n).toBeGreaterThan(1);
      for (let i = 0; i < n; i++) {
        expect(await bgOf(lines.nth(i)), `line #${i}`).toBe(TRANSPARENT);
        expect(await bgOf(lines.nth(i).locator(".body")), `body #${i}`).toBe(TRANSPARENT);
      }
      for (const i of [0, n - 1]) {
        await lines.nth(i).hover();
        expect(await bgOf(lines.nth(i)), `hovered line #${i}`).toBe(TRANSPARENT);
        expect(await bgOf(lines.nth(i).locator(".body")), `hovered body #${i}`).toBe(TRANSPARENT);
        for (let j = 0; j < cn; j++) {
          expect(await bgOf(codes.nth(j)), `pre code #${j} while hovering #${i}`).toBe(TRANSPARENT);
        }
      }
    });

    // Code-block padding and radius are also reset, so no box shape remains.
    test("pre code has no padding or radius", async ({ page }) => {
      await openWithBase(page, `cbb-shape-${scheme}`, samplePlan);
      const codes = page.locator("pre code");
      const cn = await codes.count();
      for (let i = 0; i < cn; i++) {
        const s = await codes.nth(i).evaluate((el) => {
          const c = getComputedStyle(el);
          return [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft, c.borderTopLeftRadius];
        });
        expect(s, `pre code #${i}`).toEqual(["0px", "0px", "0px", "0px", "0px"]);
      }
    });

    // File mentions keep their gray background under the same base styles.
    test("file mentions keep the mention background", async ({ page }) => {
      await openWithBase(page, `cbb-mention-${scheme}`, samplePlan);
      const files = page.locator(".file-path code.file-mention");
      expect(await files.count()).toBeGreaterThan(0);
      expect(await bgOf(files.first())).toBe(mention);
      await files.first().hover();
      expect(await bgOf(files.first())).toBe(mention);
      const all = page.locator(".file-mention");
      const n = await all.count();
      for (let i = 0; i < n; i++) {
        expect(await bgOf(all.nth(i)), `mention #${i}`).toBe(mention);
      }
    });
  });
}
