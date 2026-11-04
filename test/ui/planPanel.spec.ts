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

/** Returns the messages the page has posted to the extension host so far. */
async function postedMessages(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__posted);
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
  await b.getByRole("button", { name: "Add Comment", exact: true }).click();
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
    await expect(block(page, "title").locator("textarea.comment-field")).toBeVisible();
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
    await b.getByRole("button", { name: "Edit Comment", exact: true }).click();
    const field = b.locator("textarea.comment-field");
    await expect(field).toHaveValue("First wording");
    await field.fill("Second wording");
    await b.getByRole("button", { name: "Save Comment", exact: true }).click();
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
    await b.getByRole("button", { name: "Edit Comment", exact: true }).click();
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

  // Review posts every comment keyed by block id, with the message; Implement posts implementDesign.
  test("Review and Implement post their messages", async ({ page }) => {
    await openPlan(page, "buttons");
    await addComment(page, "title", "t");
    await addComment(page, "step:2", "s");
    await page.locator("button.review").click();
    await page.locator("button.submit-review").click();
    await page.locator("button.implement").click();
    const posted = await postedMessages(page);
    const review = posted.find((m: any) => m.type === "reviewComments");
    expect(review.comments).toEqual({ title: "t", "step:2": "s" });
    expect(review.steps).toEqual(samplePlan.implementationSteps);
    expect(posted.some((m: any) => m.type === "implementDesign")).toBe(true);
  });

  // The "+" button has the tooltip, shows on hover, and the popover has Cancel and Add Comment.
  test("the plus button has the Add inline comment tooltip and opens a popover", async ({ page }) => {
    await openPlan(page, "plus-popover");
    const b = block(page, "step:0");
    const plus = b.locator("button.add-comment");
    await expect(plus).toHaveAttribute("title", "Add inline comment");
    await expect(plus).toHaveText("+");
    await page.mouse.move(0, 0);
    await expect(plus).toHaveCSS("opacity", "0");
    await b.hover();
    await expect(plus).toHaveCSS("opacity", "1");
    // The plus is blue (the accent colour) and sits right of the content.
    const color = await plus.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(color).toBe("rgb(42, 100, 184)"); // Playwright's default scheme is light
    await plus.click();
    await expect(b.locator("textarea.comment-field")).toBeFocused();
    await expect(b.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await expect(b.getByRole("button", { name: "Add Comment", exact: true })).toBeVisible();
    await expect(plus).toBeHidden();
  });

  // Cancel closes the popover with no comment and brings the plus button back.
  test("Cancel on the plus popover adds nothing", async ({ page }) => {
    await openPlan(page, "plus-cancel");
    const b = block(page, "step:0");
    await b.hover();
    await b.locator("button.add-comment").click();
    await b.locator("textarea.comment-field").fill("never saved");
    await b.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(b.locator("textarea.comment-field")).toHaveCount(0);
    await expect(b.locator(".bubble")).toHaveCount(0);
    await expect(b.locator("button.add-comment")).toBeVisible();
    await expect(page.locator("button.review .review-label")).toHaveText("Review • 0");
  });

  // Escape closes the comment popover without saving.
  test("Escape in the comment box closes it without saving", async ({ page }) => {
    await openPlan(page, "plus-escape");
    const b = block(page, "step:1");
    await b.hover();
    await b.locator("button.add-comment").click();
    await b.locator("textarea.comment-field").fill("draft");
    await b.locator("textarea.comment-field").press("Escape");
    await expect(b.locator("textarea.comment-field")).toHaveCount(0);
    await expect(b.locator(".bubble")).toHaveCount(0);
  });

  // A saved comment is a card with its text, Delete, and Edit Comment, and the count tracks it.
  test("comment card shows text, Delete and Edit Comment, and the Review count updates", async ({ page }) => {
    await openPlan(page, "card-count");
    const label = page.locator("button.review .review-label");
    await expect(label).toHaveText("Review • 0");
    await addComment(page, "step:0", "card text");
    await expect(label).toHaveText("Review • 1");
    const b = block(page, "step:0");
    await reveal(b);
    await expect(b.locator(".bubble .full .text")).toHaveText("card text");
    await expect(b.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    await expect(b.getByRole("button", { name: "Edit Comment", exact: true })).toBeVisible();
    await addComment(page, "step:1", "second");
    await expect(label).toHaveText("Review • 2");
    // Edit keeps the count; Delete lowers it.
    await reveal(b);
    await b.getByRole("button", { name: "Edit Comment", exact: true }).click();
    await b.locator("textarea.comment-field").fill("card text v2");
    await b.getByRole("button", { name: "Save Comment", exact: true }).click();
    await expect(label).toHaveText("Review • 2");
    await reveal(b);
    await b.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(label).toHaveText("Review • 1");
  });

  // Saving an empty comment adds nothing and does not change the count.
  test("an empty comment is not counted", async ({ page }) => {
    await openPlan(page, "empty-comment");
    const b = block(page, "step:0");
    await b.hover();
    await b.locator("button.add-comment").click();
    await b.locator("textarea.comment-field").fill("   ");
    await b.getByRole("button", { name: "Add Comment", exact: true }).click();
    await expect(b.locator(".bubble")).toHaveCount(0);
    await expect(page.locator("button.review .review-label")).toHaveText("Review • 0");
  });

  // The Review button opens the Submit comment popover with a message box and collapsible list.
  test("Review popover has a message box, Submit, and a collapsible comment list", async ({ page }) => {
    await openPlan(page, "review-pop");
    await addComment(page, "title", "first note");
    await addComment(page, "step:2", "second note");
    const pop = page.locator(".review-pop");
    await expect(pop).toBeHidden();
    const btn = page.locator("button.review");
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(btn.locator("svg")).toHaveCount(2); // comment icon and chevron
    await btn.click();
    await expect(pop).toBeVisible();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(pop.getByRole("heading", { name: "Submit comment" })).toBeVisible();
    await expect(pop.locator("textarea.review-message")).toBeFocused();
    await expect(pop.getByRole("button", { name: "Submit", exact: true })).toBeVisible();
    await expect(pop.locator("summary")).toHaveText("Comments (2)");
    const items = pop.locator("li.comment-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("title");
    await expect(items.nth(0)).toContainText("first note");
    await expect(items.nth(1)).toContainText("second note");
    // Collapsible: clicking the summary hides the list, clicking again shows it.
    await pop.locator("summary").click();
    await expect(items.first()).toBeHidden();
    await pop.locator("summary").click();
    await expect(items.first()).toBeVisible();
    // Clicking the Review button again closes the popover.
    await btn.click();
    await expect(pop).toBeHidden();
  });

  // Submit posts reviewComments with the comments and the optional message.
  test("Submit posts reviewComments with the message", async ({ page }) => {
    await openPlan(page, "review-submit");
    await addComment(page, "title", "t");
    await page.locator("button.review").click();
    await page.locator("textarea.review-message").fill("Overall: keep it short.");
    await page.locator("button.submit-review").click();
    await expect(page.locator(".review-pop")).toBeHidden();
    await expect(page.locator("p.status")).toHaveText("Asking Claude Code to review...");
    const posted = await postedMessages(page);
    const reviews = posted.filter((m: any) => m.type === "reviewComments");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].comments).toEqual({ title: "t" });
    expect(reviews[0].message).toBe("Overall: keep it short.");
    expect(reviews[0].title).toBe(samplePlan.title);
    // The buttons stay disabled until the host answers with reviewResult.
    await expect(page.locator("button.review")).toBeDisabled();
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "reviewResult", message: "Plan updated." } }));
    });
    await expect(page.locator("button.review")).toBeEnabled();
    await expect(page.locator("p.status")).toHaveText("Plan updated.");
  });

  // Submit with an empty message still posts, with an empty message string.
  test("Submit without a message posts an empty message", async ({ page }) => {
    await openPlan(page, "review-nomsg");
    await addComment(page, "step:0", "x");
    await page.locator("button.review").click();
    await page.locator("button.submit-review").click();
    const posted = await postedMessages(page);
    const review = posted.find((m: any) => m.type === "reviewComments");
    expect(review.message).toBe("");
  });

  // With no comments, Submit posts nothing and tells the user to add one.
  test("Submit with no comments posts nothing", async ({ page }) => {
    await openPlan(page, "review-empty");
    await page.locator("button.review").click();
    await expect(page.locator("li.comment-item.empty")).toHaveText("No comments yet.");
    await page.locator("button.submit-review").click();
    await expect(page.locator("p.status")).toHaveText("Add a comment first.");
    const posted = await postedMessages(page);
    expect(posted.some((m: any) => m.type === "reviewComments")).toBe(false);
  });

  // The kebab menu offers Copy, Copy Path and Export Artifact, each posting its message.
  test("kebab menu posts copyMarkdown, copyPath and exportArtifact", async ({ page }) => {
    await openPlan(page, "kebab");
    const kebab = page.locator("button.kebab");
    const menu = page.locator(".menu");
    await expect(menu).toBeHidden();
    const actions: Array<[string, string]> = [
      ["Copy", "copyMarkdown"],
      ["Copy Path", "copyPath"],
      ["Export Artifact", "exportArtifact"],
    ];
    for (const [name, type] of actions) {
      await kebab.click();
      await expect(menu).toBeVisible();
      await expect(kebab).toHaveAttribute("aria-expanded", "true");
      await expect(menu.getByRole("menuitem")).toHaveText(["Copy", "Copy Path", "Export Artifact"]);
      await menu.getByRole("menuitem", { name, exact: true }).click();
      await expect(menu).toBeHidden();
      const posted = await postedMessages(page);
      const last = posted[posted.length - 1];
      expect(last.type).toBe(type);
      // The current edits ride along, so the host copies or exports what the user sees.
      expect(last.title).toBe(samplePlan.title);
      expect(last.steps).toEqual(samplePlan.implementationSteps);
    }
  });

  // The kebab messages carry unsaved edits, and actionResult text lands in the status line.
  test("kebab actions carry current edits and show actionResult", async ({ page }) => {
    await openPlan(page, "kebab-edits");
    await page.locator("[data-edit='step:0']").click();
    await page.locator("textarea.edit-field").fill("Changed first step.");
    await page.locator("textarea.edit-field").press("Enter");
    await page.locator("button.kebab").click();
    await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
    const posted = await postedMessages(page);
    const copy = posted.filter((m: any) => m.type === "copyMarkdown").pop();
    expect(copy.steps[0]).toBe("Changed first step.");
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "actionResult", message: "Copied the plan as Markdown." } }));
    });
    await expect(page.locator("p.status")).toHaveText("Copied the plan as Markdown.");
  });

  // Escape closes either popover.
  test("Escape closes the Review popover and the kebab menu", async ({ page }) => {
    await openPlan(page, "escape");
    await page.locator("button.review").click();
    await expect(page.locator(".review-pop")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".review-pop")).toBeHidden();
    await expect(page.locator("button.review")).toHaveAttribute("aria-expanded", "false");
    await page.locator("button.kebab").click();
    await expect(page.locator(".menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".menu")).toBeHidden();
    await expect(page.locator("button.kebab")).toHaveAttribute("aria-expanded", "false");
  });

  // A click outside closes either popover; a click inside the Review popover does not.
  test("an outside click closes the popovers, an inside click does not", async ({ page }) => {
    await openPlan(page, "outside");
    await page.locator("button.review").click();
    await page.locator(".review-pop h2").click();
    await expect(page.locator(".review-pop")).toBeVisible();
    await page.locator("h1").click({ position: { x: 2, y: 2 } });
    await expect(page.locator(".review-pop")).toBeHidden();
    await page.locator("button.kebab").click();
    await expect(page.locator(".menu")).toBeVisible();
    await page.locator("h1").click({ position: { x: 2, y: 2 } });
    await expect(page.locator(".menu")).toBeHidden();
  });

  // Opening one popover closes the other.
  test("opening the kebab menu closes the Review popover", async ({ page }) => {
    await openPlan(page, "one-at-a-time");
    await page.locator("button.review").click();
    await expect(page.locator(".review-pop")).toBeVisible();
    await page.locator("button.kebab").click();
    await expect(page.locator(".menu")).toBeVisible();
    await expect(page.locator(".review-pop")).toBeHidden();
  });

  // The popovers and the plus button use the right colours in both themes, with no CSP errors.
  test("popovers render in light and dark themes without CSP violations", async ({ browser }) => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await browser.newPage();
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(e.message));
      page.on("console", (m) => {
        if (/content security policy|refused to|violat/i.test(m.text())) {
          problems.push(m.text());
        }
      });
      await page.emulateMedia({ colorScheme: scheme });
      await openPlan(page, `popover-${scheme}`);
      await addComment(page, "title", "note");
      await page.locator("button.review").click();
      const pop = await page.locator(".review-pop").evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor };
      });
      const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      // The popover uses the --popover colour, which differs from the page background.
      const popover = scheme === "light" ? "rgb(247, 247, 247)" : "rgb(35, 35, 35)";
      expect(pop.bg, scheme).toBe(popover);
      expect(pop.bg, scheme).not.toBe(body);
      expect(pop.color, scheme).not.toBe(pop.bg);
      await page.keyboard.press("Escape");
      await page.locator("button.kebab").click();
      const menuBg = await page.locator(".menu").evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(menuBg, scheme).toBe(popover);
      await page.keyboard.press("Escape");
      const review = await page.locator("button.review").evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(review, scheme).not.toBe("rgba(0, 0, 0, 0)");
      expect(review, scheme).not.toBe(body);
      expect(problems, scheme).toEqual([]);
      await page.close();
    }
  });

  // Walking through every interaction logs no CSP violation and no page error.
  test("full interaction logs no console errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || /content security policy|refused to/i.test(m.text())) {
        problems.push(m.text());
      }
    });
    await openPlan(page, "console");
    await addComment(page, "title", "x");
    await reveal(block(page, "title"));
    await block(page, "title").getByRole("button", { name: "Edit Comment", exact: true }).click();
    await block(page, "title").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.locator("button.review").click();
    await page.locator("button.submit-review").click();
    await page.locator("button.kebab").click();
    await page.getByRole("menuitem", { name: "Export Artifact", exact: true }).click();
    expect(problems).toEqual([]);
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
    expect(dark.bg).toBe("#1f1f1f");
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
          markerColor: getComputedStyle(marker).color,
          body: getComputedStyle(document.body).backgroundColor,
          text: getComputedStyle(document.body).color,
        };
      });
      // The comment icon is drawn in the accent colour (the marker's text colour), not a background.
      expect(colors.markerColor, scheme).not.toBe(colors.body);
      expect(colors.markerColor, scheme).toBe(scheme === "light" ? "rgb(42, 100, 184)" : "rgb(51, 118, 206)");
      expect(colors.text, scheme).not.toBe(colors.body);
      await page.close();
    }
  });
});
