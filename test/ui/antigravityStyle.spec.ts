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

/** Writes the rendered sample plan to test-results/ and returns its file:// URL. */
function writePlanFile(name: string): string {
  const dir = path.join(root, "test-results", "html");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, renderPlanHtml(samplePlan, "testnonce123"));
  return pathToFileURL(file).href;
}

/** Installs a minimal acquireVsCodeApi stub and opens the sample plan. */
async function openPlan(page: Page, name: string): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any;
    w.acquireVsCodeApi = () => ({
      getState: () => {
        const raw = sessionStorage.getItem("vscodeState");
        return raw ? JSON.parse(raw) : undefined;
      },
      setState: (v: unknown) => sessionStorage.setItem("vscodeState", JSON.stringify(v)),
      postMessage: () => undefined,
    });
  });
  await page.goto(writePlanFile(name));
}

/** Returns one computed style property of the first element matching the selector. */
async function css(page: Page, selector: string, prop: string): Promise<string> {
  return page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

/** Adds a comment on the overview block through the "+" button (the title has no "+"). */
async function addTitleComment(page: Page): Promise<void> {
  const b = page.locator(".block[data-block='overview']");
  await b.hover();
  await b.locator("button.add-comment").click();
  await b.locator("textarea.comment-field").fill("note");
  await b.getByRole("button", { name: "Add Comment", exact: true }).click();
  await expect(b.locator(".bubble")).toHaveCount(1);
}

test.describe("Antigravity style (dark default)", () => {
  test.use({ colorScheme: "dark" });

  // Page background, heading, body text, and type scale.
  test("page, heading, body colours and type", async ({ page }) => {
    await openPlan(page, "ag-base");
    expect(await css(page, "body", "background-color")).toBe("rgb(31, 31, 31)");
    expect(await css(page, "h1", "color")).toBe("rgb(204, 204, 204)");
    expect(await css(page, "body", "color")).toBe("rgb(213, 213, 213)");
    expect(await css(page, "body", "font-size")).toBe("14px");
    expect(await css(page, "body", "line-height")).toBe("21px");
    // The bar title is 0.9 x the section heading (h2) size: 0.9 x 19.6 = 17.64px.
    const h2 = parseFloat(await css(page, "h2", "font-size"));
    expect(parseFloat(await css(page, "header.top h1", "font-size"))).toBeCloseTo(0.9 * h2, 1);
    expect(await css(page, "h2", "font-size")).toBe("19.6px"); // 1.4 x 14px
    expect(await css(page, "h3", "font-size")).toBe("16.1px"); // 1.15 x 14px
    expect(await css(page, "body", "font-family")).toContain("SF Pro Text"); // Chromium rewrites BlinkMacSystemFont to its system-ui alias
    expect(await css(page, "pre code", "font-size")).toBe("13px");
    expect(await css(page, "pre code", "font-family")).toContain("Menlo");
  });

  // Secondary button, popover/card, code block, and border colours.
  test("secondary button, popover, card, border colours", async ({ page }) => {
    await openPlan(page, "ag-surfaces");
    // Review is always blue and Implement is green; neither uses the secondary background.
    expect(await css(page, "button.review", "background-color")).toBe("rgb(51, 118, 206)");
    expect(await css(page, "button.implement", "background-color")).toBe("rgb(63, 163, 77)");
    expect(await css(page, "pre", "background-color")).toBe("rgba(0, 0, 0, 0)"); // code block has no gray background now
    // The border now wraps the whole code block (one pre per line has none).
    expect(await css(page, ".code-lines", "border-top-color")).toBe("rgb(41, 41, 41)");
    expect(await css(page, "pre", "border-top-width")).toBe("0px");
    expect(await css(page, ".block.card > .body", "background-color")).toBe("rgb(35, 35, 35)");
    expect(await css(page, ".block.card > .body", "border-top-color")).toBe("rgb(41, 41, 41)");
    await page.locator("button.review").click();
    expect(await css(page, ".review-pop", "background-color")).toBe("rgb(35, 35, 35)");
    expect(await css(page, ".review-pop", "border-top-color")).toBe("rgb(41, 41, 41)");
    await page.keyboard.press("Escape");
    await page.locator("button.kebab").click();
    expect(await css(page, ".menu", "background-color")).toBe("rgb(35, 35, 35)");
  });

  // The accent blue on "+", Review (with comments), Add Comment, and Submit.
  test("accent blue on plus, Review with comments, Add Comment, Submit", async ({ page }) => {
    const accent = "rgb(51, 118, 206)";
    await openPlan(page, "ag-accent");
    const b = page.locator(".block[data-block='overview']");
    await b.hover();
    expect(await css(page, ".block[data-block='overview'] button.add-comment", "background-color")).toBe(accent);
    await b.locator("button.add-comment").click();
    const addBtn = b.getByRole("button", { name: "Add Comment", exact: true });
    expect(await addBtn.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(accent);
    await b.locator("textarea.comment-field").fill("note");
    await addBtn.click();
    await expect(b.locator(".bubble")).toHaveCount(1);
    await expect(page.locator("button.review")).toHaveClass(/has-comments/);
    expect(await css(page, "button.review", "background-color")).toBe(accent);
    await page.locator("button.review").click();
    expect(await css(page, "button.submit-review", "background-color")).toBe(accent);
  });

  // Inline code, code tokens, and callouts: the renderer emits none, so elements are injected.
  test("inline code, code tokens, and callouts (injected elements)", async ({ page }) => {
    await openPlan(page, "ag-tokens");
    await page.evaluate(() => {
      const p = document.createElement("p");
      p.id = "inj-inline";
      p.innerHTML = "text <code id='inj-code'>inline</code>";
      document.body.appendChild(p);
      const pre = document.querySelector("pre code") as HTMLElement;
      pre.insertAdjacentHTML(
        "beforeend",
        "<span id='tc' class='tok-comment'>c</span><span id='tk' class='tok-keyword'>k</span><span id='ts' class='tok-string'>s</span>"
      );
      document.body.insertAdjacentHTML(
        "beforeend",
        "<div id='ci' class='callout info'>i</div><div id='cm' class='callout important'>m</div>"
      );
    });
    expect(await css(page, "#inj-code", "color")).toBe("rgb(226, 201, 142)");
    expect(await css(page, "#tc", "color")).toBe("rgb(134, 147, 162)");
    expect(await css(page, "#tk", "color")).toBe("rgb(138, 224, 246)");
    expect(await css(page, "#ts", "color")).toBe("rgb(187, 236, 86)");
    expect(await css(page, "#ci", "border-left-color")).toBe("rgb(53, 102, 206)");
    expect(await css(page, "#cm", "border-left-color")).toBe("rgb(130, 89, 221)");
  });
});

test.describe("Antigravity style (other)", () => {
  // The light variant renders with a white page and readable dark text.
  test("light variant renders", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openPlan(page, "ag-light");
    expect(await css(page, "body", "background-color")).toBe("rgb(255, 255, 255)");
    expect(await css(page, "h1", "color")).toBe("rgb(31, 31, 31)");
    expect(await css(page, "body", "color")).toBe("rgb(43, 43, 43)");
    expect(await css(page, "button.review", "background-color")).toBe("rgb(42, 100, 184)");
    expect(await css(page, "button.implement", "background-color")).toBe("rgb(43, 125, 55)");
    expect(await css(page, "button.implement", "color")).toBe("rgb(255, 255, 255)");
    expect(await css(page, "pre", "background-color")).toBe("rgba(0, 0, 0, 0)");
    await addTitleComment(page);
    expect(await css(page, "button.review", "background-color")).toBe("rgb(42, 100, 184)");
  });

  // Phone width: 16px content side padding and no sideways scroll.
  test("phone width has 16px side padding and no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openPlan(page, "ag-phone");
    expect(await css(page, ".content", "padding-left")).toBe("16px");
    expect(await css(page, ".content", "padding-right")).toBe("16px");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // Desktop width: the content has 9vw side padding (144px at 1600px), the doc is full width, no scroll.
  test("desktop width gives 9vw content padding and no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openPlan(page, "ag-desktop");
    expect(await css(page, ".content", "padding-left")).toBe("144px");
    expect(await css(page, ".content", "padding-right")).toBe("144px");
    const box = await page.locator(".doc").boundingBox();
    expect(box!.width).toBeCloseTo(1600, 0);
    expect(box!.x).toBeCloseTo(0, 0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // No CSP violation or page error while the page loads and a comment is added, in both themes.
  test("no CSP violations in the console", async ({ browser }) => {
    for (const scheme of ["dark", "light"] as const) {
      const page = await browser.newPage();
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" || /content security policy|refused to|violat/i.test(m.text())) {
          problems.push(m.text());
        }
      });
      await page.emulateMedia({ colorScheme: scheme });
      await openPlan(page, `ag-csp-${scheme}`);
      await addTitleComment(page);
      await page.locator("button.review").click();
      await page.keyboard.press("Escape");
      expect(problems, scheme).toEqual([]);
      await page.close();
    }
  });
});
