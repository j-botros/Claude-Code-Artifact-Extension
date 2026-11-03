import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({}));

import { parsePlanJson, samplePlan } from "../../src/plan/plan";
import { escapeHtml, renderPlanHtml } from "../../src/webview/planPanel";

const validJson = JSON.stringify({
  title: "T",
  summary: "S",
  steps: [{ id: "1", title: "a", detail: "b" }],
});

describe("parsePlanJson", () => {
  it("parses valid JSON", () => {
    const r = parsePlanJson(validJson);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.title).toBe("T");
      expect(r.plan.steps).toHaveLength(1);
    }
  });

  it("parses JSON wrapped in a ```json fence", () => {
    const r = parsePlanJson("```json\n" + validJson + "\n```");
    expect(r.ok).toBe(true);
  });

  it("parses JSON wrapped in a plain ``` fence", () => {
    const r = parsePlanJson("```\n" + validJson + "\n```");
    expect(r.ok).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parsePlanJson("  \n" + validJson + "\n  ").ok).toBe(true);
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

  it("returns ok:false for an empty string", () => {
    expect(parsePlanJson("").ok).toBe(false);
  });

  it("returns ok:false for the wrong shape", () => {
    expect(parsePlanJson('{"title":"x"}').ok).toBe(false);
    expect(parsePlanJson("[]").ok).toBe(false);
    expect(parsePlanJson("null").ok).toBe(false);
    expect(
      parsePlanJson('{"title":"t","summary":"s","steps":[{"id":1,"title":"a","detail":"b"}]}').ok
    ).toBe(false);
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
  it("has a title, summary and 3 well-formed steps", () => {
    expect(samplePlan.title).not.toBe("");
    expect(samplePlan.summary).not.toBe("");
    expect(samplePlan.steps).toHaveLength(3);
    for (const s of samplePlan.steps) {
      expect(typeof s.id).toBe("string");
      expect(s.title).not.toBe("");
      expect(s.detail).not.toBe("");
    }
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
  it("includes a nonce CSP and escapes plan text", () => {
    const html = renderPlanHtml(
      { title: "<script>x</script>", summary: "s", steps: [{ id: "1", title: "<b>", detail: "d" }] },
      "NONCE123"
    );
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-NONCE123'");
    expect(html).toContain("style-src 'nonce-NONCE123'");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;");
  });
});
