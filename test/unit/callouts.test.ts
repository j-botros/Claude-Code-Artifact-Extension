import { describe, it, expect } from "vitest";
import { CALLOUT_MARKERS, codeLabel, splitCallout } from "../../src/plan/callouts";

describe("splitCallout", () => {
  // Each of the five markers is detected, with its CSS kind, prefix, and body.
  it.each(CALLOUT_MARKERS)("detects %s:", (marker) => {
    const c = splitCallout(`${marker}: do the thing`);
    expect(c).not.toBeNull();
    expect(c!.marker).toBe(marker);
    expect(c!.kind).toBe(marker.toLowerCase());
    expect(c!.prefix).toBe(`${marker}: `);
    expect(c!.body).toBe("do the thing");
  });

  it("lists exactly the five documented markers", () => {
    expect([...CALLOUT_MARKERS]).toEqual(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);
  });

  it("joins prefix and body back to the original text", () => {
    for (const text of ["NOTE:   spaced", "TIP:tight", "WARNING:\tTabbed", "CAUTION: a: b"]) {
      const c = splitCallout(text)!;
      expect(c.prefix + c.body).toBe(text);
    }
  });

  it("is case-sensitive", () => {
    for (const text of ["note: x", "Note: x", "tip: x", "Warning: x", "caution: x"]) {
      expect(splitCallout(text), text).toBeNull();
    }
  });

  it("ignores a marker that is not at the very start", () => {
    for (const text of ["See NOTE: x", " NOTE: x", "\nNOTE: x", "x TIP: y"]) {
      expect(splitCallout(text), text).toBeNull();
    }
  });

  it("needs the colon right after the marker", () => {
    for (const text of ["NOTE x", "NOTE - x", "NOTE : x", "NOTES: x", "NOTE", ""]) {
      expect(splitCallout(text), text).toBeNull();
    }
  });

  it("treats a marker with no body as a callout with an empty body", () => {
    for (const text of ["NOTE:", "NOTE: ", "TIP:   "]) {
      const c = splitCallout(text);
      expect(c, text).not.toBeNull();
      expect(c!.body).toBe("");
    }
  });
});

describe("codeLabel", () => {
  it("maps typescript to ts and javascript to js", () => {
    expect(codeLabel("typescript")).toBe("ts");
    expect(codeLabel("javascript")).toBe("js");
  });

  it("maps the other documented languages", () => {
    const map: Record<string, string> = {
      typescriptreact: "tsx",
      javascriptreact: "jsx",
      python: "py",
      ruby: "rb",
      rust: "rs",
      golang: "go",
      bash: "sh",
      shell: "sh",
      shellscript: "sh",
      zsh: "sh",
      markdown: "md",
      yaml: "yml",
      csharp: "cs",
      "c#": "cs",
      "c++": "cpp",
      kotlin: "kt",
      powershell: "ps1",
    };
    for (const [lang, label] of Object.entries(map)) {
      expect(codeLabel(lang), lang).toBe(label);
    }
  });

  it("ignores case and surrounding spaces", () => {
    expect(codeLabel("TypeScript")).toBe("ts");
    expect(codeLabel("  JavaScript ")).toBe("js");
  });

  it("keeps unknown labels, lowercased", () => {
    expect(codeLabel("json")).toBe("json");
    expect(codeLabel("Haskell")).toBe("haskell");
    expect(codeLabel("")).toBe("");
  });

  it("does not treat Object prototype names as known labels", () => {
    expect(codeLabel("constructor")).toBe("constructor");
    expect(codeLabel("toString")).toBe("tostring");
  });
});
