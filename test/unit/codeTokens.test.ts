import { describe, it, expect } from "vitest";
import { tokenizeCode, highlightsLanguage } from "../../src/plan/codeTokens";
import type { TokenKind } from "../../src/plan/codeTokens";

/** Fixed sample touching every token kind. */
const SAMPLE = [
  "// greet",
  "export function greet(name: string): number {",
  "  const s = \"hi\" + name;",
  "  if (s) { return 42; }",
  "  return Math.max(s.length, 1);",
  "}",
  "class Foo {}",
].join("\n");

/** Returns the kind of the first token with the given text. */
function kindOf(text: string): TokenKind | undefined {
  return tokenizeCode(SAMPLE).find((t) => t.text === text)?.kind;
}

describe("tokenizeCode", () => {
  it("round-trips: token texts join back to the input", () => {
    expect(tokenizeCode(SAMPLE).map((t) => t.text).join("")).toBe(SAMPLE);
  });

  it("classifies each token kind", () => {
    expect(kindOf("// greet")).toBe("comment");
    expect(kindOf("export")).toBe("keyword");
    expect(kindOf("const")).toBe("keyword");
    expect(kindOf("class")).toBe("keyword");
    expect(kindOf("\"hi\"")).toBe("string");
    expect(kindOf("42")).toBe("number");
    expect(kindOf("if")).toBe("control");
    expect(kindOf("return")).toBe("control");
    expect(kindOf("greet")).toBe("function");
    expect(kindOf("max")).toBe("function");
    expect(kindOf("string")).toBe("type");
    expect(kindOf("number")).toBe("type");
    expect(kindOf("Math")).toBe("type");
    expect(kindOf("Foo")).toBe("type");
    expect(kindOf("length")).toBe("property");
    expect(kindOf("{")).toBe("operator");
    expect(kindOf("+")).toBe("operator");
    expect(kindOf("name")).toBe("plain");
  });

  it("handles block comments, template strings, escapes, and unterminated input", () => {
    expect(tokenizeCode("/* a\nb */x")[0]).toEqual({ kind: "comment", text: "/* a\nb */" });
    expect(tokenizeCode("`a\nb`")[0].kind).toBe("string");
    expect(tokenizeCode("'a\\'b'")[0]).toEqual({ kind: "string", text: "'a\\'b'" });
    const open = "\"abc";
    expect(tokenizeCode(open).map((t) => t.text).join("")).toBe(open);
    expect(tokenizeCode("")).toEqual([]);
  });
});

describe("highlightsLanguage", () => {
  it("is true for ts, tsx, js, jsx only", () => {
    for (const l of ["ts", "tsx", "js", "jsx"]) {
      expect(highlightsLanguage(l)).toBe(true);
    }
    for (const l of ["py", "json", "", "TS"]) {
      expect(highlightsLanguage(l)).toBe(false);
    }
  });
});
