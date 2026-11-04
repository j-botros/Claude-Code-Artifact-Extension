import { test, expect, Locator, Page } from "@playwright/test";
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

/** Returns a locator for a block by its id, such as "step:1". */
function block(page: Page, id: string) {
  return page.locator(`.block[data-block="${id}"]`);
}

/**
 * Moves the mouse onto a block's bubble marker, which expands the bubble. A raw hover on
 * the marker fails once the expanded bubble covers it, so this moves the pointer directly.
 */
async function reveal(b: Locator): Promise<void> {
  const box = await b.locator(".bubble .marker").boundingBox();
  expect(box, "marker box").not.toBeNull();
  await b.page().mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

/** Adds a comment on a block through the margin button, and returns once the bubble is shown. */
async function addComment(page: Page, id: string, text: string): Promise<void> {
  const b = block(page, id);
  await b.hover();
  await b.locator("button.add-comment").click();
  await b.locator("textarea.comment-field").fill(text);
  await b.getByRole("button", { name: "Save" }).click();
  await expect(b.locator(".bubble")).toHaveCount(1);
}

test.describe("plan webview", () => {
  // Checks every plan block renders, in the order CLAUDE.md Section 3 requires.
  test("renders all blocks in order", async ({ page }) => {
    await openPlan(page, "render");
    await expect(page.locator("h1")).toHaveText(samplePlan.title);
    await expect(page.locator("[data-edit='summary']")).toHaveText(samplePlan.overview.summary);
    await expect(page.locator("[data-edit='outOfScope']")).toHaveText(samplePlan.overview.outOfScope);
    await expect(page.locator("pre code")).toContainText("export function greet");
    await expect(page.locator(".block[data-block^='file:']")).toHaveCount(2);
    await expect(page.locator(".block[data-block='file:0'] .badge")).toHaveText("new");
    await expect(page.locator(".block[data-block='file:1'] .badge")).toHaveCount(0);
    await expect(page.locator(".block[data-block^='step:']")).toHaveCount(3);
    await expect(page.locator("[data-edit='step:0']")).toHaveText(samplePlan.implementationSteps[0]);
    await expect(page.locator(".block[data-block^='verification:']")).toHaveCount(1);
    await expect(page.locator(".verification-item").first()).toHaveText(samplePlan.verification[0]);

    // Vertical order: title, overview, code, files, steps, verification.
    const ids = ["title", "overview", "code", "file:0", "file:1", "step:0", "step:1", "step:2", "verification:0"];
    const tops: number[] = [];
    for (const id of ids) {
      const box = await block(page, id).boundingBox();
      expect(box, id).not.toBeNull();
      tops.push(box!.y);
    }
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i], `${ids[i]} below ${ids[i - 1]}`).toBeGreaterThan(tops[i - 1]);
    }
  });

  // The page runs its nonce'd script, so the CSP allows it, and the CSP has no unsafe-inline.
  test("script runs under a strict CSP without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openPlan(page, "csp");
    const csp = await page.locator("meta[http-equiv='Content-Security-Policy']").getAttribute("content");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("unsafe-inline");
    // The script ran: it wired the comment button, which then opens an editor.
    await block(page, "title").hover();
    await block(page, "title").locator("button.add-comment").click();
    await expect(page.locator("textarea.comment-field")).toBeVisible();
    expect(errors).toEqual([]);
  });

  // The margin comment button is hidden until the block is hovered.
  test("the comment button appears on hover", async ({ page }) => {
    await openPlan(page, "hover-button");
    const btn = block(page, "step:1").locator("button.add-comment");
    await page.mouse.move(0, 0);
    await expect(btn).toHaveCSS("opacity", "0");
    await block(page, "step:1").hover();
    await expect(btn).toHaveCSS("opacity", "1");
  });

  // Adds a comment through the margin button and checks it appears as a collapsed bubble.
  test("adds a comment through the margin button", async ({ page }) => {
    await openPlan(page, "add-comment");
    await addComment(page, "step:1", "Please also cover the error path.");
    const b = block(page, "step:1");
    await expect(b.locator(".bubble .marker")).toBeVisible();
    await expect(b.locator("button.add-comment")).toBeHidden();
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vscodeState") || "{}"));
    expect(state.comments).toEqual({ "step:1": "Please also cover the error path." });
    // Other blocks have no bubble.
    await expect(page.locator(".bubble")).toHaveCount(1);
  });

  // Comments work on every kind of block: title, overview, code, file, step, verification.
  test("every block can take a comment", async ({ page }) => {
    await openPlan(page, "all-blocks");
    for (const id of ["title", "overview", "code", "file:0", "file:1", "step:0", "step:2", "verification:0"]) {
      await addComment(page, id, `note on ${id}`);
    }
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vscodeState") || "{}"));
    expect(Object.keys(state.comments).sort()).toEqual(
      ["code", "file:0", "file:1", "overview", "step:0", "step:2", "title", "verification:0"]
    );
  });

  // A bubble is a small marker that expands on hover and on focus.
  test("a bubble expands on hover and on focus", async ({ page }) => {
    await openPlan(page, "expand");
    await addComment(page, "step:0", "Expand me");
    const bubble = block(page, "step:0").locator(".bubble");
    const full = bubble.locator(".full");
    await page.mouse.move(0, 0);
    await expect(full).toBeHidden();

    await reveal(block(page, "step:0"));
    await expect(full).toBeVisible();
    await expect(full.locator(".text")).toHaveText("Expand me");

    await page.mouse.move(0, 0);
    await expect(full).toBeHidden();

    await bubble.focus();
    await expect(full).toBeVisible();
  });

  // Edits a comment through the bubble's Edit button.
  test("edits a comment", async ({ page }) => {
    await openPlan(page, "edit-comment");
    await addComment(page, "file:0", "First wording");
    const b = block(page, "file:0");
    await reveal(b);
    await b.getByRole("button", { name: "Edit" }).click();
    const field = b.locator("textarea.comment-field");
    await expect(field).toHaveValue("First wording");
    await field.fill("Second wording");
    await b.getByRole("button", { name: "Save" }).click();
    await reveal(b);
    await expect(b.locator(".bubble .text")).toHaveText("Second wording");
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vscodeState") || "{}"));
    expect(state.comments).toEqual({ "file:0": "Second wording" });
  });

  // Cancelling an edit keeps the old comment.
  test("cancelling an edit keeps the comment", async ({ page }) => {
    await openPlan(page, "cancel-comment");
    await addComment(page, "code", "Keep me");
    const b = block(page, "code");
    await reveal(b);
    await b.getByRole("button", { name: "Edit" }).click();
    await b.locator("textarea.comment-field").fill("Throw away");
    await b.getByRole("button", { name: "Cancel" }).click();
    await reveal(b);
    await expect(b.locator(".bubble .text")).toHaveText("Keep me");
  });

  // Deletes a comment: the bubble goes, the margin button returns, and the state is cleared.
  test("deletes a comment", async ({ page }) => {
    await openPlan(page, "delete-comment");
    await addComment(page, "verification:0", "Remove me");
    const b = block(page, "verification:0");
    await reveal(b);
    await b.getByRole("button", { name: "Delete" }).click();
    await expect(b.locator(".bubble")).toHaveCount(0);
    await expect(b.locator("button.add-comment")).toBeVisible();
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vscodeState") || "{}"));
    expect(state.comments).toEqual({});
  });

  // Comments are kept in webview state and come back after a reload.
  test("comments survive a reload", async ({ page }) => {
    await openPlan(page, "comments-reload");
    await addComment(page, "step:1", "Please also cover the error path.");
    await addComment(page, "title", "Shorter title");
    await page.reload();
    await expect(page.locator(".bubble")).toHaveCount(2);
    const b = block(page, "step:1");
    await reveal(b);
    await expect(b.locator(".bubble .text")).toHaveText("Please also cover the error path.");
    await expect(block(page, "step:0").locator(".bubble")).toHaveCount(0);
  });

  // Edits the title, summary, out of scope, and a step by click; Enter saves; Escape reverts.
  test("click-to-edit saves through savePlan, and Escape reverts", async ({ page }) => {
    await openPlan(page, "click-edit");
    await page.locator("h1.editable").click();
    await page.locator("input.edit-field").fill("Edited Plan Title");
    await page.locator("input.edit-field").press("Enter");
    await expect(page.locator("h1.editable")).toHaveText("Edited Plan Title");
    await expect(page.locator("p.status")).toHaveText("Saved");

    await page.locator("[data-edit='step:2']").click();
    await page.locator("textarea.edit-field").fill("Edited step three.");
    await page.locator("textarea.edit-field").press("Escape");
    await expect(page.locator("[data-edit='step:2']")).toHaveText(samplePlan.implementationSteps[2]);

    const posted = await page.evaluate(() => (window as any).__posted);
    const saves = posted.filter((m: any) => m.type === "savePlan");
    expect(saves).toHaveLength(1);
    expect(saves[0].title).toBe("Edited Plan Title");
    expect(saves[0].steps[2]).toBe(samplePlan.implementationSteps[2]);
  });

  // Code, files, and verification are read-only: a click does not open a field.
  test("code, files, and verification are not editable", async ({ page }) => {
    await openPlan(page, "readonly");
    await page.locator("pre code").click();
    await page.locator(".file-change").first().click();
    await page.locator(".verification-item").first().click();
    await expect(page.locator("input.edit-field, textarea.edit-field")).toHaveCount(0);
  });

  // Edits the title, summary, out of scope, and a step, reloads, and expects the edited values.
  test("edits survive a reload", async ({ page }) => {
    await openPlan(page, "edits");
    await page.locator("h1.editable").click();
    await page.locator("input.edit-field").fill("Edited Plan Title");
    await page.locator("input.edit-field").press("Enter");
    await expect(page.locator("p.status")).toHaveText("Saved");

    await page.locator("[data-edit='summary']").click();
    await page.locator("textarea.edit-field").fill("Edited summary.");
    await page.locator("textarea.edit-field").press("Enter");
    await expect(page.locator("[data-edit='summary']")).toHaveText("Edited summary.");

    await page.locator("[data-edit='outOfScope']").click();
    await page.locator("textarea.edit-field").fill("Edited scope.");
    await page.locator("textarea.edit-field").press("Enter");
    await expect(page.locator("[data-edit='outOfScope']")).toHaveText("Edited scope.");

    await page.locator("[data-edit='step:2']").click();
    await page.locator("textarea.edit-field").fill("Edited step three.");
    await page.locator("textarea.edit-field").blur();
    await expect(page.locator("[data-edit='step:2']")).toHaveText("Edited step three.");
    await expect(page.locator("p.status")).toHaveText("Saved");

    const posted = await page.evaluate(() => (window as any).__posted);
    expect(posted.filter((m: any) => m.type === "savePlan").length).toBeGreaterThanOrEqual(4);
    await page.reload();
    await expect(page.locator("h1.editable")).toHaveText("Edited Plan Title");
    await expect(page.locator("[data-edit='summary']")).toHaveText("Edited summary.");
    await expect(page.locator("[data-edit='outOfScope']")).toHaveText("Edited scope.");
    await expect(page.locator("[data-edit='step:2']")).toHaveText("Edited step three.");
    await expect(page.locator("[data-edit='step:0']")).toHaveText(samplePlan.implementationSteps[0]);
  });

  // An edit and a comment made on the same page both come back after a reload.
  test("edits and comments both survive a reload", async ({ page }) => {
    await openPlan(page, "edit-and-comment");
    await addComment(page, "step:0", "Comment first");
    await page.locator("h1.editable").click();
    await page.locator("input.edit-field").fill("Title after comment");
    await page.locator("input.edit-field").press("Enter");
    await expect(page.locator("p.status")).toHaveText("Saved");
    await page.reload();
    await expect(page.locator("h1.editable")).toHaveText("Title after comment");
    await expect(block(page, "step:0").locator(".bubble")).toHaveCount(1);
  });

  // Review Comments posts every comment keyed by block id; Implement posts implementDesign.
  test("Review Comments and Implement post their messages", async ({ page }) => {
    await openPlan(page, "buttons");
    await addComment(page, "title", "t");
    await addComment(page, "step:2", "s");
    await page.locator("button.review").click();
    await page.locator("button.implement").click();
    const posted = await page.evaluate(() => (window as any).__posted);
    const review = posted.find((m: any) => m.type === "reviewComments");
    expect(review.comments).toEqual({ title: "t", "step:2": "s" });
    expect(review.steps).toEqual(samplePlan.implementationSteps);
    expect(posted.some((m: any) => m.type === "implementDesign")).toBe(true);
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

  // At phone width the page must not scroll sideways, with or without comments open.
  test("no horizontal scroll at 400px width", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await openPlan(page, "narrow");
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The comment button is always visible at narrow width, and bubbles sit under their block.
    await expect(block(page, "step:0").locator("button.add-comment")).toBeVisible();
    await addComment(page, "step:0", "A fairly long comment that has to wrap inside the narrow column without pushing the page wider.");
    await reveal(block(page, "step:0"));
    await expect(block(page, "step:0").locator(".bubble .full")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // An open comment editor also stays inside the page.
    await block(page, "title").locator("button.add-comment").click();
    await expect(block(page, "title").locator("textarea.comment-field")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    const box = await block(page, "title").locator("textarea.comment-field").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(400);
  });

  // At desktop width the bubbles sit in a right margin beside the content.
  test("bubbles sit in the right margin at wide width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPlan(page, "wide");
    await addComment(page, "step:0", "margin note");
    const body = await block(page, "step:0").locator(".body").boundingBox();
    const marker = await block(page, "step:0").locator(".bubble .marker").boundingBox();
    expect(marker!.x).toBeGreaterThanOrEqual(body!.x + body!.width);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // Both themes render the bubble colours from custom properties, and the page is readable.
  test("bubbles render in light and dark themes", async ({ browser }) => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await browser.newPage();
      await page.emulateMedia({ colorScheme: scheme });
      await openPlan(page, `bubble-${scheme}`);
      await addComment(page, "title", "theme note");
      const colors = await page.evaluate(() => {
        const marker = document.querySelector(".bubble .marker") as HTMLElement;
        return {
          marker: getComputedStyle(marker).backgroundColor,
          body: getComputedStyle(document.body).backgroundColor,
          text: getComputedStyle(document.body).color,
        };
      });
      expect(colors.marker, scheme).not.toBe("rgba(0, 0, 0, 0)");
      expect(colors.marker, scheme).not.toBe(colors.body);
      expect(colors.text, scheme).not.toBe(colors.body);
      await page.close();
    }
  });
});
