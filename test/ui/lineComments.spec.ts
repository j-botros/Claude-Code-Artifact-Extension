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

/** A plan whose overview and steps hold several sentences, so they have several comment lines. */
const plan = {
  title: "Line comment plan",
  overview: {
    summary:
      "The first sentence explains what changes in a fairly long and wordy way so that it wraps over several visual rows in a narrow panel. The second sentence says why. A third one.",
    outOfScope: "Nothing else. Not even this.",
  },
  proposedChanges: { language: "typescript", code: "export function f(): void;\nexport const x = 1;" },
  files: [
    { path: "src/a.ts", change: "Add a.", isNew: true },
    { path: "src/b.ts", change: "Edit b.", isNew: false },
  ],
  implementationSteps: ["Do one. Then do two. Then three.", "Single step"],
  verification: ["Check A. Check B."],
};

/** Writes the rendered plan to a file under test-results/ and returns its file:// URL. */
function writePlanFile(name: string): string {
  const dir = path.join(root, "test-results", "html");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, renderPlanHtml(plan, "testnonce123"));
  return pathToFileURL(file).href;
}

/** Installs an acquireVsCodeApi stub backed by sessionStorage, recording posted messages. */
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

/** Opens the test plan with the stub installed. */
async function openPlan(page: Page, name: string): Promise<void> {
  await installVsCodeStub(page);
  await page.goto(writePlanFile(name));
}

/** Adds a comment on a line through its margin slot, and waits for the bubble. */
async function commentOnLine(page: Page, lineId: string, text: string): Promise<void> {
  const slot = page.locator(`.slot[data-line="${lineId}"]`);
  await page.locator(`.tline[data-line="${lineId}"]`).first().hover({ timeout: 5000 });
  await slot.locator("button.add-comment").click({ timeout: 5000 });
  await slot.locator("textarea.comment-field").fill(text, { timeout: 5000 });
  await slot.getByRole("button", { name: "Add Comment", exact: true }).click({ timeout: 5000 });
  await expect(slot.locator(".bubble")).toHaveCount(1, { timeout: 5000 });
}

/** Reads the saved comments from the webview state. */
async function savedComments(page: Page): Promise<Record<string, string>> {
  const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vscodeState") || "{}"));
  return state.comments ?? {};
}

test.describe("every line is commentable", () => {
  // Each text line has its own tline span and its own margin slot.
  test("text blocks render one line target and one slot per sentence", async ({ page }) => {
    await openPlan(page, "lc-structure");
    for (const id of ["title", "overview", "overview#1", "overview#2", "scope", "scope#1", "step:0", "step:0#1", "step:0#2", "step:1", "verification:0", "verification:0#1"]) {
      await expect(page.locator(`.tline[data-line="${id}"]`), `line ${id}`).toHaveCount(1);
      await expect(page.locator(`.slot[data-line="${id}"]`), `slot ${id}`).toHaveCount(1);
    }
    await expect(page.locator(`.slot[data-line="step:1#1"]`)).toHaveCount(0);
  });

  // A comment on the second sentence of the overview shows as a bubble in the margin and is keyed per line.
  test("comment on a wrapped overview line shows a bubble in the margin", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await openPlan(page, "lc-overview");
    await commentOnLine(page, "overview#1", "Why this?");
    const bubble = page.locator('.slot[data-line="overview#1"] .bubble');
    await expect(bubble.locator(".marker")).toBeVisible();
    // The bubble sits to the right of the text body, in the margin.
    const body = await page.locator('.block[data-block="overview"] > .body').boundingBox();
    const marker = await bubble.locator(".marker").boundingBox();
    expect(marker!.x).toBeGreaterThanOrEqual(body!.x + body!.width - 1);
    expect(await savedComments(page)).toEqual({ "overview#1": "Why this?" });
    // Other lines of the same block can take their own comment.
    await commentOnLine(page, "overview", "And this");
    expect(Object.keys(await savedComments(page)).sort()).toEqual(["overview", "overview#1"]);
    await expect(page.locator('.block[data-block="overview"] .bubble')).toHaveCount(2);
  });

  // A file row is one line target.
  test("comment on a file row shows a bubble", async ({ page }) => {
    await openPlan(page, "lc-file");
    const b = page.locator('.block[data-block="file:1"]');
    await b.hover();
    await b.locator("button.add-comment").click();
    await b.locator("textarea.comment-field").fill("Why edit b?");
    await b.getByRole("button", { name: "Add Comment", exact: true }).click();
    await expect(b.locator(".bubble .marker")).toBeVisible();
    expect(await savedComments(page)).toEqual({ "file:1": "Why edit b?" });
  });

  // A comment on a single-line step is keyed by the plain step id.
  test("comment on a step shows a bubble and is keyed by the step id", async ({ page }) => {
    await openPlan(page, "lc-step");
    await commentOnLine(page, "step:1", "about step 2");
    await expect(page.locator('.block[data-block="step:1"] .bubble')).toHaveCount(1);
    expect(await savedComments(page)).toEqual({ "step:1": "about step 2" });
  });

  // A later line of a short multi-sentence step must be clickable. FAILS today: see the handoff.
  test("a later line of a short multi-sentence step can be commented", async ({ page }) => {
    await openPlan(page, "lc-step-lines");
    await commentOnLine(page, "step:0#1", "second line of step 1");
    await expect(page.locator('.block[data-block="step:0"] .bubble')).toHaveCount(1);
    expect(await savedComments(page)).toEqual({ "step:0#1": "second line of step 1" });
  });

  // The title is commentable.
  test("comment on the title shows a bubble", async ({ page }) => {
    await openPlan(page, "lc-title");
    await commentOnLine(page, "title", "rename?");
    expect(await savedComments(page)).toEqual({ title: "rename?" });
  });

  // Line comments come back after a reload, with their bubbles.
  test("line comments survive a reload", async ({ page }) => {
    await openPlan(page, "lc-reload");
    await commentOnLine(page, "overview#1", "overview two");
    await commentOnLine(page, "verification:0#1", "verification two");
    await commentOnLine(page, "step:1", "step two");
    await page.reload();
    await expect(page.locator(".bubble")).toHaveCount(3);
    await expect(page.locator('.slot[data-line="overview#1"] .bubble')).toHaveCount(1);
    await expect(page.locator('.slot[data-line="verification:0#1"] .bubble')).toHaveCount(1);
    await expect(page.locator('.slot[data-line="step:1"] .bubble')).toHaveCount(1);
    expect(await savedComments(page)).toEqual({
      "overview#1": "overview two",
      "verification:0#1": "verification two",
      "step:1": "step two",
    });
  });

  // The editor for the last out-of-scope line must stay clickable. FAILS today: see the handoff.
  test("the comment editor on the last out-of-scope line is not covered by the next block", async ({ page }) => {
    await openPlan(page, "lc-scope-editor");
    await commentOnLine(page, "scope#1", "scope two");
    expect(await savedComments(page)).toEqual({ "scope#1": "scope two" });
  });

  // Review posts every line comment keyed by its line id.
  test("Review Comments posts every line comment", async ({ page }) => {
    await openPlan(page, "lc-review");
    await commentOnLine(page, "overview#1", "a");
    await commentOnLine(page, "overview#2", "b");
    await commentOnLine(page, "verification:0#1", "c");
    await page.locator("button.review").click();
    await page.locator("button.submit-review").click();
    const posted: any[] = await page.evaluate(() => (window as any).__posted);
    const review = posted.find((m) => m.type === "reviewComments");
    expect(review).toBeTruthy();
    expect(review.comments).toEqual({ "overview#1": "a", "overview#2": "b", "verification:0#1": "c" });
  });

  // Editing the summary so it has fewer lines drops the comment on the removed line and says so.
  test("editing the summary to fewer lines drops the comment on the removed line", async ({ page }) => {
    await openPlan(page, "lc-edit-drop");
    await commentOnLine(page, "overview#2", "third line note");
    await commentOnLine(page, "overview", "first line note");
    await page.locator('[data-edit="summary"]').click();
    const field = page.locator(".edit-field").first();
    await field.fill("Only one sentence now");
    await field.press("Enter");
    await expect(page.locator("p.status")).toContainText("Dropped 1 line comment");
    expect(await savedComments(page)).toEqual({ overview: "first line note" });
  });

  // At phone width the page does not scroll sideways and line slots stay inside the viewport.
  test("phone width keeps line slots inside the page", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await openPlan(page, "lc-phone");
    await commentOnLine(page, "overview#1", "narrow");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
