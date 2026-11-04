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

/** A plan with one callout of each kind in the steps, plus a plain step and a lowercase marker. */
const calloutPlan = {
  ...samplePlan,
  overview: { summary: "NOTE: Summary note body.", outOfScope: null },
  implementationSteps: [
    "NOTE: Note body",
    "TIP: Tip body",
    "IMPORTANT: Important body",
    "WARNING: Warning body",
    "CAUTION: Caution body",
    "NOTE:",
    "note: lowercase stays plain",
    "Plain step",
  ],
  verification: ["WARNING: Read-only warning", "Plain check"],
};

/** Writes a rendered plan under test-results/ and returns its file:// URL. */
function writePlanFile(name: string, plan: unknown): string {
  const dir = path.join(root, "test-results", "html");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, renderPlanHtml(plan, "testnonce123"));
  return pathToFileURL(file).href;
}

/** Installs a vscode stub that records posted messages on window.__posted, then opens the plan. */
async function openPlan(page: Page, name: string, plan: unknown = samplePlan): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any;
    w.__posted = [];
    w.acquireVsCodeApi = () => ({
      getState: () => {
        const raw = sessionStorage.getItem("vscodeState");
        return raw ? JSON.parse(raw) : undefined;
      },
      setState: (v: unknown) => sessionStorage.setItem("vscodeState", JSON.stringify(v)),
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
  await page.goto(writePlanFile(name, plan));
}

/** Returns one computed style property of the first element matching the selector. */
async function css(page: Page, selector: string, prop: string): Promise<string> {
  return page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

/** Adds a comment on a block through the "+" button. */
async function addComment(page: Page, id: string): Promise<void> {
  const b = page.locator(`.block[data-block='${id}']`);
  await b.hover();
  await b.locator("button.add-comment").click();
  await b.locator("textarea.comment-field").fill("note");
  await b.getByRole("button", { name: "Add Comment", exact: true }).click();
  await expect(b.locator(".bubble")).toHaveCount(1);
}

/** Dark and light colours for each callout kind, as computed rgb strings. */
const CALLOUT_COLORS = {
  dark: {
    note: "rgb(53, 102, 206)",
    tip: "rgb(63, 163, 77)",
    important: "rgb(130, 89, 221)",
    warning: "rgb(217, 164, 65)",
    caution: "rgb(209, 87, 90)",
  },
  light: {
    note: "rgb(42, 85, 184)",
    tip: "rgb(43, 125, 55)",
    important: "rgb(107, 68, 196)",
    warning: "rgb(138, 98, 0)",
    caution: "rgb(179, 54, 58)",
  },
};

test.describe("sticky bar", () => {
  test.use({ colorScheme: "dark", viewport: { width: 1200, height: 400 } });

  // The bar stays at the top of the window after the page is scrolled to the bottom.
  test("stays at the top after scrolling", async ({ page }) => {
    await openPlan(page, "lay-sticky", calloutPlan);
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(scrollable, "page must be taller than the window").toBeGreaterThan(200);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const box = await page.locator("header.top").boundingBox();
    expect(box!.y).toBeCloseTo(0, 0);
    expect(await css(page, "header.top", "position")).toBe("sticky");
    await expect(page.locator("header.top h1")).toBeInViewport();
    await expect(page.locator("button.review")).toBeInViewport();
    await expect(page.locator("button.implement")).toBeInViewport();
  });

  // The bar holds the title, Review, Implement, and kebab, left to right in that order.
  test("holds title, Review, Implement, kebab in order", async ({ page }) => {
    await openPlan(page, "lay-order");
    const xs: number[] = [];
    for (const sel of ["header.top h1", "button.review", "button.implement", "button.kebab"]) {
      const box = await page.locator(sel).boundingBox();
      expect(box, sel).not.toBeNull();
      xs.push(box!.x);
    }
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(new Set(xs).size).toBe(4);
    await expect(page.locator("header.top h1")).toHaveText(samplePlan.title);
    // The title is the only h1 and has no margin "+" button.
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("header.top button.add-comment")).toHaveCount(0);
    await expect(page.locator(".block[data-block='title']")).toHaveCount(0);
  });

  // The title stays editable through the sticky bar and saves through savePlan.
  test("the title in the bar is still click-to-edit", async ({ page }) => {
    await openPlan(page, "lay-title-edit");
    await page.locator("header.top h1.editable").click();
    await page.locator("input.edit-field").fill("Renamed");
    await page.locator("input.edit-field").press("Enter");
    await expect(page.locator("header.top h1")).toHaveText("Renamed");
    const posted = await page.evaluate(() => (window as any).__posted);
    expect(posted.filter((m: any) => m.type === "savePlan").pop().title).toBe("Renamed");
  });

  // The Review popover's "Submit comment" heading is the first h2 in the DOM (reported deviation).
  test("the Review popover heading is the first h2", async ({ page }) => {
    await openPlan(page, "lay-first-h2");
    expect(await page.locator("h2").first().textContent()).toBe("Submit comment");
  });
});

test.describe("buttons and sizes (dark)", () => {
  test.use({ colorScheme: "dark" });

  // Review is always #3376ce, with and without comments, and its label counts them.
  test("Review is blue with and without comments", async ({ page }) => {
    await openPlan(page, "lay-review");
    expect(await css(page, "button.review", "background-color")).toBe("rgb(51, 118, 206)");
    expect(await css(page, "button.review", "color")).toBe("rgb(255, 255, 255)");
    await expect(page.locator("button.review .review-label")).toHaveText("Review • 0");
    await addComment(page, "step:0");
    await expect(page.locator("button.review")).toHaveClass(/has-comments/);
    await expect(page.locator("button.review .review-label")).toHaveText("Review • 1");
    expect(await css(page, "button.review", "background-color")).toBe("rgb(51, 118, 206)");
  });

  // Implement is #3fa34d with dark text (#1f1f1f), which passes contrast.
  test("Implement is green with dark text", async ({ page }) => {
    await openPlan(page, "lay-implement");
    expect(await css(page, "button.implement", "background-color")).toBe("rgb(63, 163, 77)");
    expect(await css(page, "button.implement", "color")).toBe("rgb(31, 31, 31)");
    const ratio = await page.locator("button.implement").evaluate((el) => {
      const lum = (rgb: string): number => {
        const [r, g, b] = (rgb.match(/\d+/g) as string[]).map((n) => {
          const c = Number(n) / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const cs = getComputedStyle(el);
      const a = lum(cs.color);
      const b = lum(cs.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  // The "+" button is 20px square.
  test("the plus button is 20px square", async ({ page }) => {
    await openPlan(page, "lay-plus");
    const b = page.locator(".block[data-block='step:0']");
    await b.hover();
    const box = await b.locator("button.add-comment").boundingBox();
    expect(box!.width).toBeCloseTo(20, 0);
    expect(box!.height).toBeCloseTo(20, 0);
    await expect(b.locator("button.add-comment")).toHaveAttribute("title", "Add inline comment");
  });

  // A thin rule sits between sections, not above the first or after the last.
  test("section rules sit between sections only", async ({ page }) => {
    await openPlan(page, "lay-rule");
    const rules = page.locator("hr.section-rule");
    await expect(rules).toHaveCount(4);
    expect(await css(page, "hr.section-rule", "border-top-color")).toBe("rgb(41, 41, 41)");
    expect(await css(page, "hr.section-rule", "border-top-width")).toBe("1px");
    const hrTops = await rules.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top + window.scrollY));
    const top = async (sel: string): Promise<number> =>
      page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
    const overview = await top("h2:text('Overview')");
    const proposed = await top("h2:text('Proposed changes')");
    const files = await top("h2:text('Files')");
    const steps = await top("h2:text('Implementation steps')");
    const verification = await top("h2:text('Verification')");
    expect(hrTops[0]).toBeGreaterThan(overview);
    expect(hrTops[0]).toBeLessThan(proposed);
    expect(hrTops[1]).toBeGreaterThan(proposed);
    expect(hrTops[1]).toBeLessThan(files);
    expect(hrTops[2]).toBeGreaterThan(files);
    expect(hrTops[2]).toBeLessThan(steps);
    expect(hrTops[3]).toBeGreaterThan(steps);
    expect(hrTops[3]).toBeLessThan(verification);
    // Nothing after the last section: the last element of the document is not a rule.
    expect(await page.evaluate(() => document.querySelector(".doc")!.lastElementChild!.tagName)).not.toBe("HR");
  });
});

test.describe("callouts", () => {
  for (const scheme of ["dark", "light"] as const) {
    // Each marker renders a left bar and label in its own colour, with the marker removed from the body.
    test(`each marker renders with its colours (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openPlan(page, `lay-callout-${scheme}`, calloutPlan);
      const kinds = ["note", "tip", "important", "warning", "caution"] as const;
      for (const kind of kinds) {
        const c = page.locator(`.step-row .callout.${kind}`).first();
        await expect(c).toHaveCount(1);
        const color = CALLOUT_COLORS[scheme][kind];
        expect(await c.evaluate((el) => getComputedStyle(el).borderLeftColor), kind).toBe(color);
        expect(await c.evaluate((el) => getComputedStyle(el.querySelector(".callout-label")!).color), kind).toBe(color);
        await expect(c.locator(".callout-label")).toHaveText(kind.toUpperCase());
        const body = c.locator(".editable");
        await expect(body).toHaveText(`${kind[0].toUpperCase()}${kind.slice(1)} body`);
        // Body text uses the normal text colour, not the callout colour.
        const bodyColor = await body.evaluate((el) => getComputedStyle(el).color);
        const pageColor = await page.evaluate(() => getComputedStyle(document.body).color);
        expect(bodyColor, kind).toBe(pageColor);
      }
    });
  }

  // A marker with no body is a callout with an empty body, a lowercase marker is plain text.
  test("marker-only text is an empty callout, lowercase is plain", async ({ page }) => {
    await openPlan(page, "lay-callout-edge", calloutPlan);
    const empty = page.locator(".block[data-block='step:5'] .callout.note");
    await expect(empty).toHaveCount(1);
    await expect(empty.locator(".callout-label")).toHaveText("NOTE");
    await expect(empty.locator(".editable")).toHaveText("");
    await expect(page.locator(".block[data-block='step:6'] .callout")).toHaveCount(0);
    await expect(page.locator("[data-edit='step:6']")).toHaveText("note: lowercase stays plain");
    await expect(page.locator(".block[data-block='step:7'] .callout")).toHaveCount(0);
  });

  // Summary callout and read-only verification callouts render too.
  test("overview and verification callouts render", async ({ page }) => {
    await openPlan(page, "lay-callout-other", calloutPlan);
    await expect(page.locator(".block[data-block='overview'] .callout.note .callout-label")).toHaveText("NOTE");
    await expect(page.locator("[data-edit='summary']")).toHaveText("Summary note body.");
    await expect(page.locator(".block[data-block='verification:0'] .callout.warning .verification-item")).toHaveText("Read-only warning");
    await expect(page.locator(".block[data-block='verification:1'] .callout")).toHaveCount(0);
  });

  // Editing a callout keeps the marker in the saved text, and the marker is not shown in the field.
  test("editing a callout block keeps the marker in the saved text", async ({ page }) => {
    await openPlan(page, "lay-callout-edit", calloutPlan);
    await page.locator("[data-edit='step:1']").click();
    await expect(page.locator("textarea.edit-field")).toHaveValue("Tip body");
    await page.locator("textarea.edit-field").fill("Edited tip");
    await page.locator("textarea.edit-field").press("Enter");
    await expect(page.locator("[data-edit='step:1']")).toHaveText("Edited tip");
    await expect(page.locator("p.status")).toHaveText("Saved");
    const posted = await page.evaluate(() => (window as any).__posted);
    const save = posted.filter((m: any) => m.type === "savePlan").pop();
    expect(save.steps[1]).toBe("TIP: Edited tip");
    expect(save.steps[0]).toBe("NOTE: Note body");
    expect(save.steps[5]).toBe("NOTE:");
    expect(save.summary).toBe("NOTE: Summary note body.");
    // Still a TIP callout after the edit, and the edit survives a reload with the marker intact.
    await expect(page.locator(".block[data-block='step:1'] .callout.tip")).toHaveCount(1);
    await page.reload();
    await expect(page.locator("[data-edit='step:1']")).toHaveText("Edited tip");
    await expect(page.locator(".block[data-block='step:1'] .callout.tip .callout-label")).toHaveText("TIP");
  });

  // Comments still work on a callout block.
  test("a callout block takes a comment", async ({ page }) => {
    await openPlan(page, "lay-callout-comment", calloutPlan);
    await addComment(page, "step:3");
    await expect(page.locator("button.review .review-label")).toHaveText("Review • 1");
  });
});

test.describe("code block", () => {
  test.use({ colorScheme: "dark" });

  // The label shows the short file type, and the plan's code block has one copy button.
  test("label shows ts and there is one copy button", async ({ page }) => {
    await openPlan(page, "lay-code-ts");
    await expect(page.locator(".code-wrap .lang-label")).toHaveText("ts");
    await expect(page.locator("button.copy-code")).toHaveCount(await page.locator(".code-lines").count());
    await expect(page.locator("button.copy-code")).toHaveCount(1);
    await expect(page.locator("button.copy-code")).toBeVisible();
    // The label is on the left and the button on the right of the same block.
    const label = await page.locator(".lang-label").boundingBox();
    const copy = await page.locator("button.copy-code").boundingBox();
    const pre = await page.locator(".code-lines").boundingBox();
    expect(label!.x).toBeLessThan(copy!.x);
    expect(copy!.x + copy!.width).toBeLessThanOrEqual(pre!.x + pre!.width);
    expect(copy!.y).toBeGreaterThanOrEqual(pre!.y);
    expect(copy!.y + copy!.height).toBeLessThanOrEqual(pre!.y + 40);
  });

  // javascript shows js and unknown labels are kept lowercased.
  test("javascript shows js and unknown labels are kept", async ({ page }) => {
    const base = { ...samplePlan };
    await openPlan(page, "lay-code-js", { ...base, proposedChanges: { language: "javascript", code: "let a;" } });
    await expect(page.locator(".lang-label")).toHaveText("js");
    await openPlan(page, "lay-code-unknown", { ...base, proposedChanges: { language: "Haskell", code: "x = 1" } });
    await expect(page.locator(".lang-label")).toHaveText("haskell");
  });

  // Copy posts a bare copyCode message and nothing from the page's text, and shows no inline handler.
  test("the copy button posts copyCode and carries no code text", async ({ page }) => {
    await openPlan(page, "lay-copy");
    await page.locator("button.copy-code").click();
    const posted = await page.evaluate(() => (window as any).__posted);
    const copies = posted.filter((m: any) => m.type === "copyCode");
    expect(copies).toEqual([{ type: "copyCode" }]);
    expect(await page.locator("button.copy-code").getAttribute("onclick")).toBeNull();
    // The host answers through actionResult, which lands in the status line.
    await page.evaluate(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "actionResult", message: "Copied the code." } }));
    });
    await expect(page.locator("p.status")).toHaveText("Copied the code.");
  });
});

test.describe("click to edit tooltip and widths", () => {
  test.use({ colorScheme: "dark" });

  // Hovering an editable block shows a CSS-only "Click to edit" label, with no native title.
  test("hover shows a CSS Click to edit label on the left", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await openPlan(page, "lay-tooltip");
    const el = page.locator("[data-edit='step:0']");
    await expect(el).not.toHaveAttribute("title", /.*/);
    await page.mouse.move(0, 0);
    const before = await el.evaluate((e) => getComputedStyle(e, "::after").opacity);
    await el.hover();
    const after = await el.evaluate((e) => {
      const cs = getComputedStyle(e, "::after");
      return { content: cs.content, display: cs.display, opacity: cs.opacity, right: cs.right };
    });
    expect(before).toBe("0");
    expect(after.content).toContain("Click to edit");
    expect(after.display).not.toBe("none");
    expect(after.opacity).toBe("1");
    // The label sits to the left of the element (positioned at right: 100% of it).
    expect(after.right).not.toBe("auto");
  });

  // Below 900px the tooltip is hidden and the column is the full width of the content area.
  test("below 900px the tooltip is hidden and the column is 100% wide", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    await openPlan(page, "lay-narrow");
    const el = page.locator("[data-edit='step:0']");
    await el.hover();
    expect(await el.evaluate((e) => getComputedStyle(e, "::after").display)).toBe("none");
    const doc = await page.locator(".doc").boundingBox();
    const padding = parseFloat(await css(page, "body", "padding-left"));
    expect(doc!.width).toBeCloseTo(800 - 2 * padding, 0);
    // The content area keeps its 16px phone padding.
    expect(await css(page, ".content", "padding-left")).toBe("16px");
  });
});

test.describe("Antigravity sizes at 2000px", () => {
  test.use({ colorScheme: "dark", viewport: { width: 2000, height: 900 } });

  // The content's text column spans about 9% to 87% of the window width.
  test("content starts at 9% and the blocks end at 91% (symmetric 9vw padding)", async ({ page }) => {
    await openPlan(page, "sz-edges");
    expect(await css(page, ".content", "padding-left")).toBe("180px");
    expect(await css(page, ".content", "padding-right")).toBe("180px");
    const box = await page.locator(".content").boundingBox();
    expect(box!.x).toBeCloseTo(0, 0);
    expect(box!.width).toBeCloseTo(2000, 0);
    // The commentable blocks start at the left padding edge and end at 91% (right padding 9%).
    const first = await page.locator(".block").first().boundingBox();
    expect(first!.x).toBeCloseTo(180, 0);
    expect(first!.x + first!.width).toBeCloseTo(1820, 0);
    // Reference: the screenshots show 185/2000 (9.25%) on the left and 1735/2000 (86.75%) text end.
    expect(first!.x / 2000).toBeGreaterThan(0.08);
    expect(first!.x / 2000).toBeLessThan(0.1);
  });

  // The phone minimum: padding never drops below 16px.
  test("content padding is at least 16px on a narrow window", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await openPlan(page, "sz-min");
    expect(await css(page, ".content", "padding-left")).toBe("16px");
  });

  // The top bar has 1.4vw side padding, so the title sits about 28px from the left at 2000px.
  test("top bar padding is 1.4vw and the title is offset by it", async ({ page }) => {
    await openPlan(page, "sz-bar");
    expect(await css(page, "header.top", "padding-left")).toBe("28px");
    expect(await css(page, "header.top", "padding-right")).toBe("28px");
    const h1 = await page.locator("header.top h1").boundingBox();
    expect(h1!.x).toBeCloseTo(28, 0);
    const bar = await page.locator("header.top").boundingBox();
    expect(bar!.width).toBeCloseTo(2000, 0);
  });

  // Review and Implement are 26px high with 10px padding, 12px font, and a 4px radius.
  for (const sel of ["button.review", "button.implement"]) {
    test(`${sel} is 26px high, 10px padding, 12px font, 4px radius`, async ({ page }) => {
      await openPlan(page, `sz-${sel.split(".")[1]}`);
      const box = await page.locator(sel).boundingBox();
      expect(box!.height).toBeCloseTo(26, 0);
      expect(await css(page, sel, "padding-left")).toBe("10px");
      expect(await css(page, sel, "padding-right")).toBe("10px");
      expect(await css(page, sel, "font-size")).toBe("12px");
      expect(await css(page, sel, "border-radius")).toBe("4px");
    });
  }

  // The kebab sits to the right of Implement the Design, and the bar order is title, Review, Implement, kebab.
  test("kebab is to the right of Implement and matches the button height", async ({ page }) => {
    await openPlan(page, "sz-kebab");
    const impl = await page.locator("button.implement").boundingBox();
    const kebab = await page.locator("button.kebab").boundingBox();
    expect(kebab!.x).toBeGreaterThanOrEqual(impl!.x + impl!.width);
    expect(kebab!.height).toBeCloseTo(30, 0);
    const review = await page.locator("button.review").boundingBox();
    expect(impl!.x).toBeGreaterThanOrEqual(review!.x + review!.width);
    // All three buttons share a vertical centre line (they line up in the bar).
    expect(kebab!.y + kebab!.height / 2).toBeCloseTo(impl!.y + impl!.height / 2, 0);
  });

  // The "+" button is 20px square, its glyph is 10px, and the glyph is centred within 1px.
  test("the plus button is 20px square with a centred 10px glyph", async ({ page }) => {
    await openPlan(page, "sz-plus");
    const b = page.locator(".block[data-block='step:0']");
    await b.hover();
    const box = await b.locator("button.add-comment").boundingBox();
    expect(box!.width).toBeCloseTo(20, 0);
    expect(box!.height).toBeCloseTo(20, 0);
    expect(await css(page, "button.add-comment", "font-size")).toBe("10px");
    const glyph = await b.locator("button.add-comment .plus-glyph").boundingBox();
    expect(glyph!.width).toBeCloseTo(10, 0);
    expect(glyph!.height).toBeCloseTo(10, 0);
    expect(Math.abs(glyph!.x + glyph!.width / 2 - (box!.x + box!.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(glyph!.y + glyph!.height / 2 - (box!.y + box!.height / 2))).toBeLessThanOrEqual(1);
    const svg = await b.locator("button.add-comment svg").boundingBox();
    expect(svg!.width).toBeCloseTo(10, 0);
    expect(Math.abs(svg!.x + svg!.width / 2 - (box!.x + box!.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(svg!.y + svg!.height / 2 - (box!.y + box!.height / 2))).toBeLessThanOrEqual(1);
  });

  // Code in a ts block is coloured with the token palette (dark theme).
  test("token colours in a code block match the palette", async ({ page }) => {
    await openPlan(page, "sz-tokens");
    const colour = (cls: string): Promise<string> => css(page, `pre code .tok-${cls}`, "color");
    expect(await colour("comment")).toBe("rgb(134, 147, 162)"); // #8693a2
    expect(await colour("keyword")).toBe("rgb(138, 224, 246)"); // #8ae0f6
    expect(await colour("string")).toBe("rgb(187, 236, 86)"); // #bbec56
    expect(await colour("type")).toBe("rgb(78, 201, 176)"); // #4ec9b0
    expect(await colour("function")).toBe("rgb(220, 220, 170)"); // #dcdcaa
    expect(await colour("control")).toBe("rgb(197, 134, 192)"); // #c586c0
  });

  // The longer sample makes the page scroll, and the sticky bar stays at the top.
  test("the sample page scrolls and the sticky bar stays at the top", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await openPlan(page, "sz-scroll");
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(700);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    expect((await page.locator("header.top").boundingBox())!.y).toBeCloseTo(0, 0);
    await expect(page.locator("button.review")).toBeInViewport();
  });

  // The bar stays at the top after scrolling, at the new width.
  test("sticky bar stays at the top after scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 2000, height: 400 });
    await openPlan(page, "sz-sticky", calloutPlan);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const box = await page.locator("header.top").boundingBox();
    expect(box!.y).toBeCloseTo(0, 0);
    await expect(page.locator("button.review")).toBeInViewport();
    await expect(page.locator("button.kebab")).toBeInViewport();
  });

  // Colours, callouts and the CSP are unchanged by the size work.
  test("colours, callouts and CSP are kept", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || /content security policy|refused to|violat/i.test(m.text())) {
        problems.push(m.text());
      }
    });
    await openPlan(page, "sz-colours", calloutPlan);
    expect(await css(page, "button.review", "background-color")).toBe("rgb(51, 118, 206)");
    expect(await css(page, "button.implement", "background-color")).toBe("rgb(63, 163, 77)");
    await expect(page.locator(".callout")).not.toHaveCount(0);
    await expect(page.locator(".step-row .callout.warning .callout-label").first()).toHaveText("WARNING");
    expect(await page.locator("[style]").count()).toBe(0);
    expect(problems).toEqual([]);
  });
});

test.describe("light theme", () => {
  test.use({ colorScheme: "light" });

  // The light theme renders the new colours and a readable sticky bar.
  test("renders the new colours and a white sticky bar", async ({ page }) => {
    await openPlan(page, "lay-light", calloutPlan);
    expect(await css(page, "header.top", "background-color")).toBe("rgb(255, 255, 255)");
    expect(await css(page, "button.review", "background-color")).toBe("rgb(42, 100, 184)");
    expect(await css(page, "button.implement", "background-color")).toBe("rgb(43, 125, 55)");
    expect(await css(page, "button.implement", "color")).toBe("rgb(255, 255, 255)");
    expect(await css(page, "hr.section-rule", "border-top-color")).toBe("rgb(220, 220, 220)");
  });
});

test.describe("console", () => {
  // No CSP violation or page error while using the new layout features, in both themes.
  test("no CSP violations with callouts, copy, and edit", async ({ browser }) => {
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
      await openPlan(page, `lay-csp-${scheme}`, calloutPlan);
      await page.locator("button.copy-code").click();
      await page.locator("[data-edit='step:2']").click();
      await page.locator("textarea.edit-field").fill("Changed");
      await page.locator("textarea.edit-field").press("Enter");
      await addComment(page, "step:3");
      await page.locator("button.review").click();
      await page.keyboard.press("Escape");
      await page.locator("button.kebab").click();
      await page.keyboard.press("Escape");
      expect(problems, scheme).toEqual([]);
      const csp = await page.locator("meta[http-equiv='Content-Security-Policy']").getAttribute("content");
      expect(csp).not.toContain("unsafe-inline");
      expect(await page.locator("[style]").count(), "no inline style attributes").toBe(0);
      await page.close();
    }
  });
});
