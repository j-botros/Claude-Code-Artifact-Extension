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

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const DARK_MENTION = "rgb(40, 40, 40)"; // #282828
const LIGHT_MENTION = "rgb(243, 243, 243)"; // #f3f3f3

/** Opens the given plan HTML in the page with a minimal acquireVsCodeApi stub. */
async function openHtml(page: Page, name: string, plan: unknown): Promise<void> {
  await page.addInitScript(() => {
    (window as any).acquireVsCodeApi = () => ({
      getState: () => undefined,
      setState: () => undefined,
      postMessage: () => undefined,
    });
  });
  const dir = path.join(root, "test-results", "html");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, renderPlanHtml(plan, "testnonce123"));
  await page.goto(pathToFileURL(file).href);
}

/** Returns the computed background color of an element handle locator. */
async function bgOf(loc: ReturnType<Page["locator"]>): Promise<string> {
  return loc.evaluate((el) => getComputedStyle(el).backgroundColor);
}

for (const [scheme, mention] of [
  ["dark", DARK_MENTION],
  ["light", LIGHT_MENTION],
] as const) {
  test.describe(`code line hover (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    // No code line has a background, hovered or not.
    test("code lines stay transparent on hover and at rest", async ({ page }) => {
      await openHtml(page, `clh-lines-${scheme}`, samplePlan);
      const lines = page.locator(".code-line");
      const n = await lines.count();
      expect(n).toBeGreaterThan(1);
      for (let i = 0; i < n; i++) {
        expect(await bgOf(lines.nth(i)), `line #${i}`).toBe(TRANSPARENT);
        expect(await bgOf(lines.nth(i).locator(".body")), `body #${i}`).toBe(TRANSPARENT);
      }
      // Hover the first line, then another one; both bodies and rows stay transparent.
      for (const i of [0, n - 1]) {
        await lines.nth(i).hover();
        expect(await bgOf(lines.nth(i)), `hovered line #${i}`).toBe(TRANSPARENT);
        expect(await bgOf(lines.nth(i).locator(".body")), `hovered body #${i}`).toBe(TRANSPARENT);
      }
      // An unhovered line is still transparent while another is hovered.
      await lines.nth(0).hover();
      expect(await bgOf(lines.nth(n - 1).locator(".body"))).toBe(TRANSPARENT);
    });

    // File mentions keep their gray background, also while hovered.
    test("file mention keeps the mention background", async ({ page }) => {
      await openHtml(page, `clh-mention-${scheme}`, samplePlan);
      const m = page.locator(".file-path code.file-mention").first();
      expect(await bgOf(m)).toBe(mention);
      await m.hover();
      expect(await bgOf(m)).toBe(mention);
    });
  });
}
