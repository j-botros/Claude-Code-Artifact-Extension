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

/** Writes the rendered plan to a file under test-results/ and returns its file:// URL. */
function writePlanFile(name: string): string {
  const dir = path.join(root, "test-results", "html");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, renderPlanHtml(samplePlan, "testnonce123"));
  return pathToFileURL(file).href;
}

/**
 * Installs an acquireVsCodeApi stub backed by sessionStorage. Posted messages are
 * recorded on window.__posted, and savePlan is answered with an ok saveResult.
 */
async function installVsCodeStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any;
    w.__posted = [];
    w.acquireVsCodeApi = () => ({
      getState: () => {
        const raw = sessionStorage.getItem("vscodeState");
        return raw ? JSON.parse(raw) : undefined;
      },
      setState: (v: unknown) => {
        sessionStorage.setItem("vscodeState", JSON.stringify(v));
      },
      postMessage: (m: any) => {
        w.__posted.push(m);
        if (m && m.type === "savePlan") {
          setTimeout(() => {
            window.dispatchEvent(new MessageEvent("message", { data: { type: "saveResult", ok: true, message: "Saved" } }));
          }, 0);
        }
      },
    });
  });
}

/** Opens the sample plan page with the stub installed. */
async function openPlan(page: Page, name: string): Promise<void> {
  await installVsCodeStub(page);
  await page.goto(writePlanFile(name));
}

test.describe("plan webview", () => {
  // Checks every plan section renders, in the order CLAUDE.md Section 3 requires.
  test("renders all sections in order", async ({ page }) => {
    await openPlan(page, "render");
    await expect(page.locator("input.edit-title")).toHaveValue(samplePlan.title);
    await expect(page.locator("textarea.edit-summary")).toHaveValue(samplePlan.overview.summary);
    await expect(page.locator("textarea.edit-outofscope")).toHaveValue(samplePlan.overview.outOfScope);
    await expect(page.locator("pre code")).toContainText("export function greet");
    await expect(page.locator("table tbody tr")).toHaveCount(2);
    await expect(page.locator("table tbody tr").nth(0).locator(".badge")).toHaveText("new");
    await expect(page.locator("table tbody tr").nth(1).locator(".badge")).toHaveCount(0);
    await expect(page.locator("ol > li")).toHaveCount(3);
    await expect(page.locator("textarea.step-text").first()).toHaveValue(samplePlan.implementationSteps[0]);
    await expect(page.locator("ul > li")).toHaveCount(1);
    await expect(page.locator("ul > li").first()).toHaveText(samplePlan.verification[0]);

    // Vertical order: title, summary, out of scope, code, files, steps, verification.
    const selectors = [
      "input.edit-title",
      "textarea.edit-summary",
      "textarea.edit-outofscope",
      "pre",
      "table",
      "ol",
      "ul",
    ];
    const tops: number[] = [];
    for (const s of selectors) {
      const box = await page.locator(s).first().boundingBox();
      expect(box, s).not.toBeNull();
      tops.push(box!.y);
    }
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i], `${selectors[i]} below ${selectors[i - 1]}`).toBeGreaterThan(tops[i - 1]);
    }
  });

  // Renders the page in the given color scheme and returns its CSS variables and body colors.
  async function themeValues(page: Page, scheme: "light" | "dark", name: string) {
    await page.emulateMedia({ colorScheme: scheme });
    await openPlan(page, name);
    return page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        bg: cs.getPropertyValue("--bg").trim(),
        fg: cs.getPropertyValue("--fg").trim(),
        card: cs.getPropertyValue("--card").trim(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });
  }

  // Checks light and dark themes give different custom properties and the page is styled.
  test("light and dark themes differ", async ({ browser }) => {
    const lightPage = await browser.newPage();
    const light = await themeValues(lightPage, "light", "light");
    const darkPage = await browser.newPage();
    const dark = await themeValues(darkPage, "dark", "dark");
    expect(light.bg).toBe("#ffffff");
    expect(dark.bg).toBe("#1e1e1e");
    expect(light.bg).not.toBe(dark.bg);
    expect(light.fg).not.toBe(dark.fg);
    expect(light.card).not.toBe(dark.card);
    expect(light.bodyBg).not.toBe(dark.bodyBg);
    expect(light.bodyBg).not.toBe("rgba(0, 0, 0, 0)");
    await lightPage.close();
    await darkPage.close();
  });

  // Types a step comment, reloads with the same sessionStorage, and expects it restored.
  test("step comments survive a reload", async ({ page }) => {
    await openPlan(page, "comments");
    const box = page.locator("textarea.comment[data-step='1']");
    await box.fill("Please also cover the error path.");
    await page.reload();
    await expect(page.locator("textarea.comment[data-step='1']")).toHaveValue("Please also cover the error path.");
    await expect(page.locator("textarea.comment[data-step='0']")).toHaveValue("");
  });

  // Edits the title and a step, reloads, and expects the edited values restored.
  test("title and step edits survive a reload", async ({ page }) => {
    await openPlan(page, "edits");
    await page.locator("input.edit-title").fill("Edited Plan Title");
    await page.locator("input.edit-title").press("Enter");
    await expect(page.locator("p.status")).toHaveText("Saved");
    await page.locator("textarea.step-text[data-step='2']").fill("Edited step three.");
    await page.locator("textarea.step-text[data-step='2']").blur();
    await expect(page.locator("p.status")).toHaveText("Saved");
    const posted = await page.evaluate(() => (window as any).__posted);
    expect(posted.filter((m: any) => m.type === "savePlan").length).toBeGreaterThanOrEqual(2);
    await page.reload();
    await expect(page.locator("input.edit-title")).toHaveValue("Edited Plan Title");
    await expect(page.locator("textarea.step-text[data-step='2']")).toHaveValue("Edited step three.");
    await expect(page.locator("textarea.step-text[data-step='0']")).toHaveValue(samplePlan.implementationSteps[0]);
  });
});
