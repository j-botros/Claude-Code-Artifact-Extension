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
const { renderPlanHtml, codeLineSegments } = loadWithVscodeStub(path.join(root, "out", "webview", "planPanel.js"));
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
 * Installs an acquireVsCodeApi stub backed by sessionStorage. savePlan is answered with an ok
 * saveResult. renderCode is answered the way the host does, with a codeRendered message built
 * from the real `codeLineSegments` (passed in as JSON by line count only: plain segments).
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
        if (m && m.type === "renderCode") {
          const lines = String(m.code)
            .split("\n")
            .map((l: string) => (l === "" ? [] : [{ kind: "plain", parts: [{ text: l, mention: false }] }]));
          setTimeout(() => {
            window.dispatchEvent(new MessageEvent("message", { data: { type: "codeRendered", code: m.code, lines } }));
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

/** The number of lines in the sample plan code, by the same rule as the host. */
const sampleLines: string[] = samplePlan.proposedChanges.code.split("\n");
if (sampleLines.length > 1 && sampleLines[sampleLines.length - 1] === "") {
  sampleLines.pop();
}

test.describe("code lines", () => {
  // One block per code line, each with its own plus button.
  test("renders one commentable block per code line", async ({ page }) => {
    await openPlan(page, "code-lines-render");
    const lines = page.locator(".block[data-block^='code:']");
    await expect(lines).toHaveCount(sampleLines.length);
    await expect(lines.first()).toHaveAttribute("data-block", "code:0");
    await expect(lines.first()).toHaveAttribute("data-label", "Code line 1");
    await expect(lines.first().locator("button.add-comment")).toHaveAttribute(
      "aria-label",
      "Add inline comment on Code line 1"
    );
    // The whole-block button and the copy button are still there.
    await expect(page.locator(".block[data-block='code']")).toHaveCount(1);
    await expect(page.locator(".copy-code")).toHaveCount(1);
  });

  // Hover one line, click its plus, type, save: the bubble shows on that line only.
  test("comments on a single code line", async ({ page }) => {
    await openPlan(page, "code-line-comment");
    const line = page.locator(".block[data-block='code:1']");
    await line.hover();
    await line.locator("button.add-comment").click();
    await line.locator("textarea.comment-field").fill("Rename this argument");
    await line.getByRole("button", { name: "Add Comment", exact: true }).click();
    await expect(line.locator(".bubble")).toHaveCount(1);
    await expect(page.locator(".block[data-block='code:0'] .bubble")).toHaveCount(0);
    await expect(page.locator(".block[data-block='code'] > .margin .bubble")).toHaveCount(0);
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vscodeState") || "{}"));
    expect(state.comments).toEqual({ "code:1": "Rename this argument" });
  });

  // Saving, cancelling, or deleting a line comment removes the clicked button from the page.
  // That click must not bubble up and open the code editor.
  test("saving, cancelling, and deleting a line comment do not open the code editor", async ({ page }) => {
    await openPlan(page, "code-line-no-edit");
    const line = page.locator(".block[data-block='code:1']");
    await line.hover();
    await line.locator("button.add-comment").click();
    await line.locator("textarea.comment-field").fill("Note");
    await line.getByRole("button", { name: "Add Comment", exact: true }).click();
    await expect(line.locator(".bubble")).toHaveCount(1);
    await expect(page.locator("textarea.edit-code")).toHaveCount(0);

    const other = page.locator(".block[data-block='code:2']");
    await other.hover();
    await other.locator("button.add-comment").click();
    await other.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("textarea.edit-code")).toHaveCount(0);

    const marker = await line.locator(".bubble .marker").boundingBox();
    await page.mouse.move(marker!.x + marker!.width / 2, marker!.y + marker!.height / 2);
    await line.getByRole("button", { name: "Delete" }).click();
    await expect(line.locator(".bubble")).toHaveCount(0);
    await expect(page.locator("textarea.edit-code")).toHaveCount(0);
  });

  // A line comment comes back on the same line after a reload.
  test("a line comment survives a reload", async ({ page }) => {
    await openPlan(page, "code-line-comment-reload");
    const line = page.locator(".block[data-block='code:1']");
    await line.hover();
    await line.locator("button.add-comment").click();
    await line.locator("textarea.comment-field").fill("Keep me");
    await line.getByRole("button", { name: "Add Comment", exact: true }).click();
    await expect(line.locator(".bubble")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".block[data-block='code:1'] .bubble")).toHaveCount(1);
  });

  // Click the code, change it, commit with Ctrl+Enter: new lines show and savePlan carries the code.
  test("edits the code by click and shows the new lines", async ({ page }) => {
    await openPlan(page, "code-edit");
    await page.locator("[data-edit='code']").click();
    const field = page.locator("textarea.edit-code");
    await expect(field).toBeVisible();
    await expect(field).toHaveValue(samplePlan.proposedChanges.code);
    await field.fill("const alpha = 1;\nconst beta = 2;\nconst gamma = 3;");
    await field.press("Control+Enter");
    await expect(page.locator(".block[data-block^='code:']")).toHaveCount(3);
    await expect(page.locator(".block[data-block='code:2']")).toContainText("const gamma = 3;");
    await expect(page.locator("p.status")).toHaveText("Saved");
    const posted = await page.evaluate(() => (window as any).__posted);
    const saves = posted.filter((m: any) => m.type === "savePlan");
    expect(saves[saves.length - 1].code).toBe("const alpha = 1;\nconst beta = 2;\nconst gamma = 3;");
  });

  // Escape cancels and sends nothing.
  test("Escape cancels a code edit", async ({ page }) => {
    await openPlan(page, "code-edit-escape");
    await page.locator("[data-edit='code']").click();
    await page.locator("textarea.edit-code").fill("changed");
    await page.locator("textarea.edit-code").press("Escape");
    await expect(page.locator("textarea.edit-code")).toHaveCount(0);
    await expect(page.locator(".block[data-block^='code:']")).toHaveCount(sampleLines.length);
    const posted = await page.evaluate(() => (window as any).__posted);
    expect(posted.filter((m: any) => m.type === "savePlan")).toHaveLength(0);
  });

  // Blank code is rejected with the standard message and nothing is saved.
  test("rejects blank code", async ({ page }) => {
    await openPlan(page, "code-edit-blank");
    await page.locator("[data-edit='code']").click();
    await page.locator("textarea.edit-code").fill("   \n  ");
    await page.locator("textarea.edit-code").press("Control+Enter");
    await expect(page.locator("p.status")).toHaveText("This field cannot be empty.");
    await expect(page.locator(".block[data-block^='code:']")).toHaveCount(sampleLines.length);
    const posted = await page.evaluate(() => (window as any).__posted);
    expect(posted.filter((m: any) => m.type === "savePlan")).toHaveLength(0);
  });

  // Clicking a line's plus must not start a code edit.
  test("clicking the margin plus does not start a code edit", async ({ page }) => {
    await openPlan(page, "code-margin-click");
    const line = page.locator(".block[data-block='code:0']");
    await line.hover();
    await line.locator("button.add-comment").click();
    await expect(page.locator("textarea.edit-code")).toHaveCount(0);
    await expect(line.locator("textarea.comment-field")).toBeVisible();
  });

  // The edited code is restored from state after a reload.
  test("edited code survives a reload", async ({ page }) => {
    await openPlan(page, "code-edit-reload");
    await page.locator("[data-edit='code']").click();
    await page.locator("textarea.edit-code").fill("let one = 1;\nlet two = 2;");
    await page.locator("textarea.edit-code").press("Control+Enter");
    await expect(page.locator("p.status")).toHaveText("Saved");
    await page.reload();
    await expect(page.locator(".block[data-block^='code:']")).toHaveCount(2);
    await expect(page.locator(".block[data-block='code:1']")).toContainText("let two = 2;");
    await page.locator("[data-edit='code']").click();
    await expect(page.locator("textarea.edit-code")).toHaveValue("let one = 1;\nlet two = 2;");
  });

  // Shrinking the code drops comments on lines that no longer exist, and says so.
  test("dropping lines drops the out-of-range line comments and reports it", async ({ page }) => {
    // Seed the comment through saved state, so this test does not depend on the comment UI.
    const last = sampleLines.length - 1;
    await page.addInitScript((id) => {
      if (!sessionStorage.getItem("vscodeState")) {
        sessionStorage.setItem("vscodeState", JSON.stringify({ comments: { [id]: "On the last line" } }));
      }
    }, `code:${last}`);
    await openPlan(page, "code-edit-drop");
    const line = page.locator(`.block[data-block='code:${last}']`);
    await expect(line.locator(".bubble")).toHaveCount(1);

    await page.locator("[data-edit='code']").click();
    await page.locator("textarea.edit-code").fill("only one line");
    await page.locator("textarea.edit-code").press("Control+Enter");
    await expect(page.locator(".block[data-block^='code:']")).toHaveCount(1);
    await expect(page.locator("p.status")).toContainText("Dropped 1 line comment");
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vscodeState") || "{}"));
    expect(state.comments).toEqual({});
  });

  // Sanity check on the helper the host uses to build codeRendered.
  test("codeLineSegments gives one entry per line", () => {
    expect(codeLineSegments("a\nb\n", "text")).toHaveLength(2);
  });
});
