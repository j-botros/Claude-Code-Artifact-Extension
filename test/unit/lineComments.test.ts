import { describe, it, expect } from "vitest";
import {
  splitTextLines,
  commentableBody,
  lineId,
  parseLineId,
  textLineIds,
  lineLabel,
} from "../../src/plan/lineComments";
import {
  blockIdsForPlan,
  blockLabel,
  formatCommentsForPrompt,
  parseReviewComments,
  dropOutOfRangeTextLineComments,
  dropOutOfRangeQuestionComments,
} from "../../src/plan/reviewComments";
import type { Plan } from "../../src/plan/plan";

/** Builds a plan with multi-sentence text so several blocks have several lines. */
function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    title: "Title",
    overview: { summary: "First sentence. Second sentence.", outOfScope: "Not this. Not that." },
    proposedChanges: { language: "typescript", code: "a\nb" },
    files: [{ path: "src/a.ts", change: "Edit it", isNew: false }],
    implementationSteps: ["One. Two. Three.", "Single step"],
    verification: ["Check one. Check two."],
    openQuestions: ["Why? Because."],
    ...over,
  };
}

describe("splitTextLines", () => {
  it("returns a single line for text without a sentence end", () => {
    expect(splitTextLines("Just one line")).toEqual(["Just one line"]);
  });

  it("returns one empty line for empty text", () => {
    expect(splitTextLines("")).toEqual([""]);
  });

  it("splits after sentence ends and keeps the whitespace so the pieces join back", () => {
    const text = "One. Two! Three? Four";
    const lines = splitTextLines(text);
    expect(lines).toEqual(["One. ", "Two! ", "Three? ", "Four"]);
    expect(lines.join("")).toBe(text);
  });

  it("is stable for wrapped text: a long single sentence is one line", () => {
    const long = "word ".repeat(80).trim() + ".";
    expect(splitTextLines(long)).toEqual([long]);
  });

  it("splits long wrapped text with several sentences by sentence, not by width", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta. iota kappa lambda mu nu xi omicron pi. rho.";
    const lines = splitTextLines(text);
    expect(lines).toHaveLength(3);
    expect(lines.join("")).toBe(text);
  });

  it("splits on newlines", () => {
    const lines = splitTextLines("a\nb\nc");
    expect(lines).toHaveLength(3);
    expect(lines.join("")).toBe("a\nb\nc");
  });

  it("folds blank lines and whitespace-only pieces into a neighbour", () => {
    const text = "a\n\n\nb";
    const lines = splitTextLines(text);
    expect(lines.every((l) => l.trim() !== "")).toBe(true);
    expect(lines.join("")).toBe(text);
    expect(splitTextLines("   ")).toEqual(["   "]);
    expect(splitTextLines("a.   ")).toEqual(["a.   "]);
  });

  it("does not split when a dot has no whitespace after it", () => {
    expect(splitTextLines("see src/a.ts and v1.2.3 now")).toEqual(["see src/a.ts and v1.2.3 now"]);
  });

  it("treats closing quotes and brackets after a sentence end as part of the sentence", () => {
    expect(splitTextLines('He said "go." Then left. (Really.) End')).toEqual([
      'He said "go." ',
      "Then left. ",
      "(Really.) ",
      "End",
    ]);
  });

  it("keeps markup-like text intact and never interprets it", () => {
    const text = "<b>bold</b> done. <script>alert(1)</script> next.";
    const lines = splitTextLines(text);
    expect(lines).toEqual(["<b>bold</b> done. ", "<script>alert(1)</script> next."]);
  });
});

describe("commentableBody and textLineIds", () => {
  it("drops the callout marker from the body", () => {
    expect(commentableBody("NOTE: careful. Really.")).toBe("careful. Really.");
    expect(commentableBody("note: lower")).toBe("note: lower");
  });

  it("gives ids for each line of the body", () => {
    expect(textLineIds("step:0", "One. Two. Three.")).toEqual(["step:0", "step:0#1", "step:0#2"]);
    expect(textLineIds("step:0", "WARNING: One. Two.")).toEqual(["step:0", "step:0#1"]);
  });

  it("gives no lines for blank text or a marker with no body", () => {
    expect(textLineIds("scope", "")).toEqual([]);
    expect(textLineIds("scope", "   ")).toEqual([]);
    expect(textLineIds("step:1", "NOTE:")).toEqual([]);
  });
});

describe("lineId and parseLineId", () => {
  it("keeps the plain block id for line 0 and adds #n for later lines", () => {
    expect(lineId("step:2", 0)).toBe("step:2");
    expect(lineId("step:2", 1)).toBe("step:2#1");
    expect(lineId("overview", 12)).toBe("overview#12");
  });

  it("round-trips ids", () => {
    for (const [block, i] of [["title", 0], ["step:3", 4], ["code:5", 0], ["file:1", 0]] as const) {
      expect(parseLineId(lineId(block, i))).toEqual({ blockId: block, index: i });
    }
  });

  it("parses plain ids as line 0", () => {
    expect(parseLineId("question:1")).toEqual({ blockId: "question:1", index: 0 });
    expect(parseLineId("code")).toEqual({ blockId: "code", index: 0 });
  });
});

describe("lineLabel", () => {
  it("uses the block label for one line and adds the line number for several", () => {
    expect(lineLabel("Step 3", 0, 1)).toBe("Step 3");
    expect(lineLabel("Step 3", 1, 2)).toBe("Step 3, line 2");
    expect(lineLabel("Step 3", 0, 2)).toBe("Step 3, line 1");
  });
});

describe("blockIdsForPlan with lines", () => {
  it("lists one id per line in document order", () => {
    expect(blockIdsForPlan(makePlan())).toEqual([
      "title",
      "overview",
      "overview#1",
      "scope",
      "scope#1",
      "code",
      "code:0",
      "code:1",
      "file:0",
      "step:0",
      "step:0#1",
      "step:0#2",
      "step:1",
      "verification:0",
      "verification:0#1",
      "question:0",
      "question:0#1",
    ]);
  });

  it("has no scope id when out of scope is null", () => {
    const ids = blockIdsForPlan(makePlan({ overview: { summary: "S", outOfScope: null } }));
    expect(ids.some((id) => id.startsWith("scope"))).toBe(false);
  });
});

describe("parseReviewComments with line ids", () => {
  it("accepts line ids that exist, including scope and title", () => {
    const r = parseReviewComments(
      { "step:0#1": " hi ", scope: "x", "overview#1": "y", title: "t", "code:1": "c" },
      makePlan()
    );
    expect(r).toEqual({
      ok: true,
      comments: { "step:0#1": "hi", scope: "x", "overview#1": "y", title: "t", "code:1": "c" },
    });
  });

  it("rejects out-of-range or malformed line ids", () => {
    const plan = makePlan();
    expect(parseReviewComments({ "step:0#9": "x" }, plan).ok).toBe(false);
    expect(parseReviewComments({ "step:0#01": "x" }, plan).ok).toBe(false);
    expect(parseReviewComments({ "step:0#": "x" }, plan).ok).toBe(false);
    expect(parseReviewComments({ "step:1#1": "x" }, plan).ok).toBe(false);
    expect(parseReviewComments({ "file:0#1": "x" }, plan).ok).toBe(false);
  });

  it("rejects a scope comment when out of scope is empty", () => {
    const plan = makePlan({ overview: { summary: "S", outOfScope: null } });
    expect(parseReviewComments({ scope: "x" }, plan).ok).toBe(false);
  });
});

describe("dropOutOfRangeTextLineComments", () => {
  it("drops #n comments whose line no longer exists and keeps the rest", () => {
    const plan = makePlan();
    const r = dropOutOfRangeTextLineComments(
      { "step:1#1": "gone", "step:0#2": "kept", "step:1": "kept too", "bogus#1": "left" },
      plan
    );
    expect(r.dropped).toBe(1);
    expect(Object.keys(r.comments).sort()).toEqual(["bogus#1", "step:0#2", "step:1"]);
  });
});

describe("dropOutOfRangeQuestionComments with line ids", () => {
  it("drops question line comments past the count", () => {
    const r = dropOutOfRangeQuestionComments({ "question:0": "a", "question:2#1": "b", "step:9": "c" }, 1);
    expect(r.dropped).toBe(1);
    expect(Object.keys(r.comments).sort()).toEqual(["question:0", "step:9"]);
  });
});

describe("blockLabel and formatCommentsForPrompt with lines", () => {
  it("labels single-line blocks with the block label and multi-line blocks with the line", () => {
    const plan = makePlan();
    expect(blockLabel("title", plan)).toBe("Title");
    expect(blockLabel("overview", plan)).toBe("Overview, line 1");
    expect(blockLabel("overview#1", plan)).toBe("Overview, line 2");
    expect(blockLabel("scope#1", plan)).toBe("Out of scope, line 2");
    expect(blockLabel("step:0#1", plan)).toBe("Step 1, line 2");
    expect(blockLabel("step:1", plan)).toBe("Step 2");
    expect(blockLabel("verification:0#1", plan)).toBe("Verification 1, line 2");
    expect(blockLabel("question:0#1", plan)).toBe("Open question 1, line 2");
    expect(blockLabel("file:0", plan)).toBe("File src/a.ts");
    expect(blockLabel("code:1", plan)).toBe("Code line 2");
  });

  it("includes every line comment, several per block, in document order", () => {
    const plan = makePlan();
    const text = formatCommentsForPrompt(
      {
        "question:0": "q",
        "step:0#2": "third line",
        "step:0": "first line",
        title: "t",
        "file:0": "f",
        "overview#1": "multi\nline",
      },
      plan
    );
    expect(text.split("\n")).toEqual([
      "Title: t",
      "Overview, line 2: multi line",
      "File src/a.ts: f",
      "Step 1, line 1: first line",
      "Step 1, line 3: third line",
      "Open question 1, line 1: q",
    ]);
  });

  it("skips ids that are not in the plan", () => {
    expect(formatCommentsForPrompt({ "step:7": "x", "step:1": "ok" }, makePlan())).toBe("Step 2: ok");
  });
});
