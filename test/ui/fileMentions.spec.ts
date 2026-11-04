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

/** Returns one computed style property of the first element matching the selector. */
async function css(page: Page, selector: string, prop: string): Promise<string> {
  return page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

for (const [scheme, mention, bg] of [
  ["dark", DARK_MENTION, "rgb(31, 31, 31)"],
  ["light", LIGHT_MENTION, "rgb(255, 255, 255)"],
] as const) {
  test.describe(`file mentions (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    // Code block lines and Files table rows carry no gray background.
    test("code block and Files rows have no highlight background", async ({ page }) => {
      await openHtml(page, `fm-nohl-${scheme}`, samplePlan);
      expect(await css(page, "pre", "background-color")).toBe(TRANSPARENT);
      expect(await css(page, "pre code", "background-color")).toBe(TRANSPARENT);
      const rows = page.locator(".block.file-block");
      expect(await rows.count()).toBe(samplePlan.files.length);
      for (const sel of [".block.file-block", ".block.file-block > .body", ".file-row", ".file-path", ".file-change"]) {
        const n = await page.locator(sel).count();
        for (let i = 0; i < n; i++) {
          const v = await page.locator(sel).nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
          expect(v, `${sel} #${i}`).toBe(TRANSPARENT);
        }
      }
      // A mention is a different colour than the page, but only slightly.
      expect(await css(page, "body", "background-color")).toBe(bg);
    });

    // The path text inside the Files table cell is a mention, for both new and existing files.
    test("Files path cell text has the mention background and the row does not", async ({ page }) => {
      await openHtml(page, `fm-cell-${scheme}`, samplePlan);
      const existing = page.locator(".file-path a.file-link code.file-mention").first();
      const added = page.locator(".file-path > code.file-mention").first();
      expect(await existing.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(mention);
      expect(await added.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(mention);
      expect(await css(page, ".block.file-block > .body", "background-color")).toBe(TRANSPARENT);
      // The existing-file link keeps its data-path.
      await expect(page.locator("a.file-link").first()).toHaveAttribute("data-path", "src/extension.ts");
    });

    // Mentions in the overview, steps, verification, and code block use the same colour.
    test("mentions in prose and code have the mention background", async ({ page }) => {
      const plan = {
        ...samplePlan,
        overview: { summary: "Change src/a.ts and package.json, e.g. later.", outOfScope: null },
        proposedChanges: { language: "typescript", code: "// edit src/a.ts here\nconst x = 1;\n" },
        implementationSteps: ["Open src/a.ts."],
        verification: ["Check docs/b.md."],
      };
      await openHtml(page, `fm-prose-${scheme}`, plan);
      const all = page.locator(".file-mention");
      const n = await all.count();
      expect(n).toBeGreaterThan(5);
      for (let i = 0; i < n; i++) {
        expect(await all.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor), `mention #${i}`).toBe(mention);
      }
      const summary = page.locator("[data-edit='summary']");
      expect(await summary.locator(".file-mention").allTextContents()).toEqual(["src/a.ts", "package.json"]);
      expect(await page.locator("pre code .file-mention").allTextContents()).toContain("src/a.ts");
      await expect(page.locator(".verification-item .file-mention")).toHaveText("docs/b.md");
      // Plain surrounding text and the code tokens are not mentions.
      expect(await summary.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(TRANSPARENT);
    });

    // A path with markup characters is escaped and still highlighted.
    test("hostile path text is escaped and highlighted without injecting elements", async ({ page }) => {
      const evil = `a<b>&"q'.ts`;
      const plan = {
        ...samplePlan,
        overview: { summary: `See ${evil} now`, outOfScope: null },
        files: [{ path: evil, change: "c", isNew: false }],
      };
      await openHtml(page, `fm-evil-${scheme}`, plan);
      expect(await page.locator("[data-edit='summary'] b").count()).toBe(0);
      expect(await page.locator("[data-edit='summary'] .file-mention").first().textContent()).toBe(evil);
      expect(await page.locator("a.file-link code.file-mention").textContent()).toBe(evil);
      await expect(page.locator("a.file-link")).toHaveAttribute("data-path", evil);
      expect(
        await page.locator("[data-edit='summary'] .file-mention").first().evaluate((el) => getComputedStyle(el).backgroundColor)
      ).toBe(mention);
    });
  });
}
