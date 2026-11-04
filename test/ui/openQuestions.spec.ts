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

/** Opens the given plan with a stub that records posted messages and answers savePlan. */
async function openPlan(page: Page, name: string, plan: unknown): Promise<void> {
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
  const dir = path.join(root, "test-results", "html");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, renderPlanHtml(plan, "testnonce123"));
  await page.goto(pathToFileURL(file).href);
}

const withQuestions = { ...samplePlan, openQuestions: ["Which database should we use?", "Keep the v1 API?"] };

test.describe("open questions section", () => {
  test("is absent when the field is missing", async ({ page }) => {
    await openPlan(page, "oq-missing", samplePlan);
    await expect(page.getByRole("heading", { name: "Open Questions" })).toHaveCount(0);
    await expect(page.locator(".block[data-block^='question:']")).toHaveCount(0);
  });

  test("is absent when the array is empty", async ({ page }) => {
    await openPlan(page, "oq-empty", { ...samplePlan, openQuestions: [] });
    await expect(page.getByRole("heading", { name: "Open Questions" })).toHaveCount(0);
    await expect(page.locator(".block[data-block^='question:']")).toHaveCount(0);
  });

  test("is shown last, after Verification, with one block per question", async ({ page }) => {
    await openPlan(page, "oq-present", withQuestions);
    const headings = await page.locator("h2").allTextContents();
    expect(headings[headings.length - 1]).toBe("Open Questions");
    expect(headings.indexOf("Open Questions")).toBeGreaterThan(headings.indexOf("Verification"));
    await expect(page.locator(".block[data-block^='question:']")).toHaveCount(2);
    await expect(page.locator("[data-edit='question:0']")).toHaveText("Which database should we use?");
    await expect(page.locator("[data-edit='question:1']")).toHaveText("Keep the v1 API?");
    // The last block in the document is the last question.
    const lastId = await page.locator(".content .block[data-block]").last().getAttribute("data-block");
    expect(lastId).toBe("question:1");
  });

  test("questions are commentable with the label Open question N", async ({ page }) => {
    await openPlan(page, "oq-comment", withQuestions);
    const blockEl = page.locator(".block[data-block='question:1']");
    const b = blockEl.locator(":scope > .margin");
    await blockEl.hover();
    await b.locator("button.add-comment").click();
    await b.locator("textarea.comment-field").fill("Yes, keep it.");
    await b.getByRole("button", { name: "Add Comment", exact: true }).click();
    await expect(b.locator(".bubble")).toHaveCount(1);
    await expect(page.locator(".review-label")).toContainText("1");
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem("vscodeState") || "{}"));
    expect(state.comments).toEqual({ "question:1": "Yes, keep it." });
    await expect(blockEl.locator("button.add-comment")).toHaveAttribute("aria-label", "Add inline comment on Open question 2");
  });

  test("click-to-edit saves through savePlan with questions, and Escape reverts", async ({ page }) => {
    await openPlan(page, "oq-edit", withQuestions);
    await page.locator("[data-edit='question:0']").click();
    await page.locator(".edit-field").fill("Which datastore?");
    await page.locator(".edit-field").press("Enter");
    await expect(page.locator("[data-edit='question:0']")).toHaveText("Which datastore?");
    await expect(page.locator("p.status")).toHaveText("Saved");
    const saves = (await page.evaluate(() => (window as any).__posted)).filter((m: any) => m.type === "savePlan");
    expect(saves).toHaveLength(1);
    expect(saves[0].questions).toEqual(["Which datastore?", "Keep the v1 API?"]);

    await page.locator("[data-edit='question:1']").click();
    await page.locator(".edit-field").fill("discard me");
    await page.locator(".edit-field").press("Escape");
    await expect(page.locator("[data-edit='question:1']")).toHaveText("Keep the v1 API?");
  });

  test("a blank question is rejected and not saved", async ({ page }) => {
    await openPlan(page, "oq-blank", withQuestions);
    await page.locator("[data-edit='question:0']").click();
    await page.locator(".edit-field").fill("   ");
    await page.locator(".edit-field").press("Enter");
    await expect(page.locator("p.status")).toContainText("This field cannot be empty.");
    const saves = (await page.evaluate(() => (window as any).__posted)).filter((m: any) => m.type === "savePlan");
    expect(saves).toHaveLength(0);
  });
});
