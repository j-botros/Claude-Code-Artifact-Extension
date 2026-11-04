import { describe, it, expect } from "vitest";
import { splitFileMentions } from "../../src/plan/fileMentions";

/** Returns only the mention texts found in the input. */
function mentions(text: string, known: string[] = []): string[] {
  return splitFileMentions(text, known)
    .filter((s) => s.mention)
    .map((s) => s.text);
}

describe("splitFileMentions", () => {
  it("finds a path inside a sentence and keeps the surrounding text", () => {
    const segs = splitFileMentions("Edit src/plan/plan.ts to add a field.");
    expect(segs).toEqual([
      { text: "Edit ", mention: false },
      { text: "src/plan/plan.ts", mention: true },
      { text: " to add a field.", mention: false },
    ]);
  });

  it("finds a path at the start and at the end of the text", () => {
    expect(splitFileMentions("package.json is changed")[0]).toEqual({ text: "package.json", mention: true });
    const end = splitFileMentions("Open src/a.ts");
    expect(end[end.length - 1]).toEqual({ text: "src/a.ts", mention: true });
  });

  it("returns a single mention for text that is only a path", () => {
    expect(splitFileMentions("src/a.ts")).toEqual([{ text: "src/a.ts", mention: true }]);
  });

  it("leaves a trailing period out of the mention", () => {
    expect(mentions("See src/a.ts.")).toEqual(["src/a.ts"]);
  });

  it("leaves a trailing comma out of the mention", () => {
    expect(mentions("Edit src/a.ts, then src/b.ts, and done")).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("does not treat e.g. or a version number as a mention", () => {
    expect(mentions("Use a helper, e.g. cleanName, in version 1.5 or i.e. later.")).toEqual([]);
  });

  it("returns no mentions for text with no path", () => {
    expect(splitFileMentions("Just words here.")).toEqual([{ text: "Just words here.", mention: false }]);
    expect(splitFileMentions("")).toEqual([]);
  });

  it("matches a known files[].path even with an unlisted extension", () => {
    expect(mentions("Touch data/blob.zzz now", [])).toEqual([]);
    expect(mentions("Touch data/blob.zzz now", ["data/blob.zzz"])).toEqual(["data/blob.zzz"]);
  });

  it("matches a known path without an extension", () => {
    expect(mentions("Edit Makefile please", ["Makefile"])).toEqual(["Makefile"]);
  });

  it("matches relative ./ and ../ paths", () => {
    expect(mentions("Read ./a.ts and ../b/c.json")).toEqual(["./a.ts", "../b/c.json"]);
  });

  it("does not match inside a URL-like or scoped token", () => {
    expect(mentions("Install @scope/pkg-name now")).toEqual([]);
  });

  it("joins all segments back to the input", () => {
    const text = "Edit src/a.ts, then (package.json); e.g. ./x/y.md. Done 1.5 <b>&\"'</b>";
    expect(splitFileMentions(text, ["x"]).map((s) => s.text).join("")).toBe(text);
  });

  it("keeps hostile characters untouched in the segment text (escaping is the caller's job)", () => {
    const text = `<img src=x onerror=alert(1)> src/a.ts "q" & more`;
    const segs = splitFileMentions(text);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.mention).map((s) => s.text)).toEqual(["src/a.ts"]);
  });

  it("treats regex metacharacters in a known path literally", () => {
    const known = "a+b(1)[x].txt";
    expect(mentions(`See ${known} here`, [known])).toEqual([known]);
    // The "+" is literal, so the known path does not match "aab..." (only the generic x.txt token does).
    expect(mentions("See aab(1)[x].zzz here", [known])).toEqual([]);
  });

  it("prefers the longest known path when two overlap", () => {
    expect(mentions("Use lib/a.ts.bak", ["lib/a.ts", "lib/a.ts.bak"])).toEqual(["lib/a.ts.bak"]);
  });
});
