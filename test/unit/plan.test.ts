import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({}));

import { parsePlanJson, samplePlan } from "../../src/plan/plan";
import type { Plan } from "../../src/plan/plan";
import { escapeHtml, renderPlanHtml } from "../../src/webview/planPanel";

/** Builds a fresh valid plan object for each test. */
function makePlan(): Plan {
  return {
    title: "T",
    overview: { summary: "S", outOfScope: "O" },
    proposedChanges: { language: "typescript", code: "export function f(): void;" },
    files: [
      { path: "src/a.ts", change: "Add a.", isNew: true },
      { path: "src/b.ts", change: "Edit b.", isNew: false },
    ],
    implementationSteps: ["one", "two"],
    verification: ["check one"],
  };
}

/** Serializes a plan after letting a mutator change it as a loose object. */
function json(mutate?: (p: Record<string, any>) => void): string {
  const p = makePlan() as unknown as Record<string, any>;
  if (mutate) {
    mutate(p);
  }
  return JSON.stringify(p);
}

/** Parses text and asserts failure, returning the error message. */
function errorOf(text: string): string {
  const r = parsePlanJson(text);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
}

describe("parsePlanJson", () => {
  it("parses a valid full plan and returns every field", () => {
    const r = parsePlanJson(json());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.title).toBe("T");
      expect(r.plan.overview.summary).toBe("S");
      expect(r.plan.overview.outOfScope).toBe("O");
      expect(r.plan.proposedChanges.language).toBe("typescript");
      expect(r.plan.proposedChanges.code).toBe("export function f(): void;");
      expect(r.plan.files).toEqual([
        { path: "src/a.ts", change: "Add a.", isNew: true },
        { path: "src/b.ts", change: "Edit b.", isNew: false },
      ]);
      expect(r.plan.implementationSteps).toEqual(["one", "two"]);
      expect(r.plan.verification).toEqual(["check one"]);
    }
  });

  it("parses outOfScope null", () => {
    const r = parsePlanJson(json((p) => { p.overview.outOfScope = null; }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.overview.outOfScope).toBeNull();
    }
  });

  it("parses an empty files array", () => {
    const r = parsePlanJson(json((p) => { p.files = []; }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.files).toEqual([]);
    }
  });

  it("ignores unknown extra fields", () => {
    const r = parsePlanJson(json((p) => { p.extra = 1; }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("extra" in r.plan).toBe(false);
    }
  });

  for (const field of ["title", "overview", "proposedChanges", "files", "implementationSteps", "verification"]) {
    it(`rejects a missing top-level ${field}`, () => {
      const err = errorOf(json((p) => { delete p[field]; }));
      expect(err).toContain(field);
    });
  }

  it("rejects a missing overview.summary", () => {
    expect(errorOf(json((p) => { delete p.overview.summary; }))).toContain("overview.summary");
  });

  it("rejects a missing overview.outOfScope key", () => {
    expect(errorOf(json((p) => { delete p.overview.outOfScope; }))).toContain("overview.outOfScope");
  });

  it("rejects a missing proposedChanges.code", () => {
    expect(errorOf(json((p) => { delete p.proposedChanges.code; }))).toContain("proposedChanges.code");
  });

  it("rejects a missing files[].isNew", () => {
    expect(errorOf(json((p) => { delete p.files[0].isNew; }))).toContain("files[0].isNew");
  });

  it("rejects isNew as a string", () => {
    expect(errorOf(json((p) => { p.files[1].isNew = "true"; }))).toContain("files[1].isNew");
  });

  it("rejects implementationSteps containing a number", () => {
    expect(errorOf(json((p) => { p.implementationSteps = ["a", 2]; }))).toContain("implementationSteps[1]");
  });

  it("rejects outOfScope as a number", () => {
    expect(errorOf(json((p) => { p.overview.outOfScope = 5; }))).toContain("overview.outOfScope");
  });

  it("rejects verification that is not an array", () => {
    expect(errorOf(json((p) => { p.verification = "x"; }))).toContain("verification");
  });

  it("parses JSON wrapped in a ```json fence", () => {
    expect(parsePlanJson("```json\n" + json() + "\n```").ok).toBe(true);
  });

  it("parses JSON wrapped in a plain ``` fence", () => {
    expect(parsePlanJson("```\n" + json() + "\n```").ok).toBe(true);
  });

  it("returns ok:false for invalid JSON without throwing", () => {
    let r: ReturnType<typeof parsePlanJson> | undefined;
    expect(() => {
      r = parsePlanJson("{not json");
    }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) {
      expect(r.error).toMatch(/Invalid JSON/);
    }
  });

  it("returns ok:false for an empty string, [] and null", () => {
    expect(parsePlanJson("").ok).toBe(false);
    expect(parsePlanJson("[]").ok).toBe(false);
    expect(parsePlanJson("null").ok).toBe(false);
  });

  it("round-trips the sample plan", () => {
    const r = parsePlanJson(JSON.stringify(samplePlan));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan).toEqual(samplePlan);
    }
  });
});

describe("samplePlan", () => {
  it("has 3 implementation steps and at least 1 verification entry", () => {
    expect(samplePlan.title).not.toBe("");
    expect(samplePlan.implementationSteps).toHaveLength(3);
    expect(samplePlan.verification.length).toBeGreaterThanOrEqual(1);
  });
});

describe("escapeHtml", () => {
  it("escapes special characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"
    );
  });
});

describe("renderPlanHtml", () => {
  it("includes a nonce CSP and escapes plan text in every field", () => {
    const evil = "<script>x</script>";
    const plan: Plan = {
      title: evil,
      overview: { summary: evil, outOfScope: evil },
      proposedChanges: { language: evil, code: evil },
      files: [{ path: evil, change: evil, isNew: true }],
      implementationSteps: [evil],
      verification: [evil],
    };
    const html = renderPlanHtml(plan, "NONCE123");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-NONCE123'");
    expect(html).toContain("style-src 'nonce-NONCE123'");
    expect(html).not.toContain(evil);
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  it("omits out-of-scope text when outOfScope is null", () => {
    const plan = makePlan();
    plan.overview.outOfScope = null;
    plan.overview.summary = "SUMMARYTEXT";
    const html = renderPlanHtml(plan, "N");
    expect(html).toContain("SUMMARYTEXT");
    expect(html).not.toContain("null");
  });
});
