import { describe, it, expect } from "vitest";
import { parseAgyStream } from "../../src/agy/agyStreamParser";
import { classifyAgyRun, AGY_NO_TOOLS_PREFIX } from "../../src/agy/agyRunner";

const PLAN = '{"title":"T"}';

/** Joins event objects into a stream-json string, one per line. */
function stream(...events: unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

const init = { type: "init", session_id: "s1" };
const step = { type: "step_update", step_type: "agent_response", state: "DONE" };

describe("parseAgyStream", () => {
  it("returns the response from a success stream", () => {
    const r = parseAgyStream(stream(init, step, { type: "result", status: "SUCCESS", response: PLAN }));
    expect(r).toEqual({ ok: true, text: PLAN });
  });

  it("reports empty-response for an empty response", () => {
    const r = parseAgyStream(stream(init, { type: "result", status: "SUCCESS", response: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("empty-response");
    }
  });

  it("reports empty-response for a whitespace-only response", () => {
    const r = parseAgyStream(stream(init, { type: "result", status: "SUCCESS", response: " \n\t " }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("empty-response");
    }
  });

  it("reports empty-response when response is missing or not a string", () => {
    const missing = parseAgyStream(stream({ type: "result", status: "SUCCESS" }));
    const num = parseAgyStream(stream({ type: "result", response: 5 }));
    expect(missing.ok === false && missing.reason).toBe("empty-response");
    expect(num.ok === false && num.reason).toBe("empty-response");
  });

  it("reports no-result when there is no result event", () => {
    const r = parseAgyStream(stream(init, step));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("no-result");
    }
  });

  it("reports no-result for empty output", () => {
    const r = parseAgyStream("");
    expect(r.ok === false && r.reason).toBe("no-result");
  });

  it("skips blank lines and non-JSON lines", () => {
    const text = "\n" + JSON.stringify(init) + "\nnot json at all\n\n" + JSON.stringify({ type: "result", response: PLAN }) + "\n\n";
    expect(parseAgyStream(text)).toEqual({ ok: true, text: PLAN });
  });

  it("returns ok when denied_actions is present and the response is non-empty", () => {
    const r = parseAgyStream(
      stream(init, { type: "result", status: "SUCCESS", response: PLAN, denied_actions: [{ tool: "npx" }] })
    );
    expect(r).toEqual({ ok: true, text: PLAN });
  });

  it("uses the last result event", () => {
    const r = parseAgyStream(stream({ type: "result", response: "" }, { type: "result", response: PLAN }));
    expect(r).toEqual({ ok: true, text: PLAN });
  });
});

describe("classifyAgyRun", () => {
  it("returns ok on success", () => {
    const r = classifyAgyRun(0, stream(init, { type: "result", response: PLAN }), "");
    expect(r).toEqual({ ok: true, text: PLAN });
  });

  it("returns empty-response kind for an empty response", () => {
    const r = classifyAgyRun(0, stream(init, { type: "result", status: "SUCCESS", response: "" }), "");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("empty-response");
      expect(r.message).toContain("empty response");
    }
  });

  it("returns failed with the exit code when there is no result", () => {
    const r = classifyAgyRun(3, stream(init), "boom");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("failed");
      expect(r.message).toContain("3");
      expect(r.message).toContain("boom");
    }
  });

  it("returns failed without an exit code when code is null", () => {
    const r = classifyAgyRun(null, "", "");
    expect(r.ok === false && r.kind).toBe("failed");
  });
});

describe("AGY_NO_TOOLS_PREFIX", () => {
  it("is non-empty and forbids tools", () => {
    expect(AGY_NO_TOOLS_PREFIX.length).toBeGreaterThan(0);
    expect(AGY_NO_TOOLS_PREFIX).toContain("Do not use any tools");
  });
});
