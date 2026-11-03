/** One file the plan touches. */
export interface PlanFile {
  path: string;
  change: string;
  isNew: boolean;
}

/** A file the plan proposes: a relative path and the full new content. */
export interface ProposedFile {
  path: string;
  content: string;
}

/** An implementation plan in the shape defined by CLAUDE.md, Section 3. */
export interface Plan {
  title: string;
  overview: {
    summary: string;
    outOfScope: string | null;
  };
  proposedChanges: {
    language: string;
    code: string;
  };
  files: PlanFile[];
  implementationSteps: string[];
  verification: string[];
  proposedFiles?: ProposedFile[];
}

/**
 * Returns true when the path is a safe relative path inside the workspace:
 * not empty, no leading slash, no drive prefix, no backslash, no ".." segment.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.startsWith("\\")) {
    return false;
  }
  if (/^[a-zA-Z]:/.test(path) || path.includes("\\")) {
    return false;
  }
  return !path.split("/").includes("..");
}

/** Result of parsing plan JSON: either a plan or an error message. */
export type ParseResult =
  | { ok: true; plan: Plan }
  | { ok: false; error: string };

/** Hard-coded sample plan shown by the scaffold command. */
export const samplePlan: Plan = {
  title: "Sample Implementation Plan",
  overview: {
    summary: "A hard-coded plan used to check that the webview renders. It follows the plan shape from the project docs.",
    outOfScope: "Real plan generation and comments are not part of this sample.",
  },
  proposedChanges: {
    language: "typescript",
    code: "/** Returns a greeting for the given name. */\nexport function greet(name: string): string;",
  },
  files: [
    { path: "src/greet.ts", change: "Add the greet function.", isNew: true },
    { path: "src/extension.ts", change: "Call greet from the sample command.", isNew: false },
  ],
  implementationSteps: [
    "Create src/greet.ts with the greet function.",
    "Call greet from the sample command in src/extension.ts.",
    "Compile and run the sample command.",
  ],
  verification: ["Unit test greet with a normal name and an empty string."],
  // Lets the Implement the Design flow be tried by hand. Applying writes this new file under the
  // workspace root, so a throwaway workspace is safest.
  proposedFiles: [
    {
      path: "sample-artifact/greet.ts",
      content:
        'export function greet(name: string): string {\n  if (name === "") {\n    return "Hello, stranger.";\n  }\n  return `Hello, ${name}.`;\n}\n',
    },
  ],
};

/** Removes one optional Markdown code fence (```json ... ```) around the text. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```[a-zA-Z]*\s*\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

/** Returns true when the value is a non-null, non-array object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks that a value is an array of strings; returns an error message or null. */
function checkStringArray(value: unknown, path: string): string | null {
  if (!Array.isArray(value)) {
    return `${path} must be an array`;
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") {
      return `${path}[${i}] must be a string`;
    }
  }
  return null;
}

/** Validates a parsed value against the Plan shape; returns an error naming the bad field, or null. */
function validatePlan(v: unknown): string | null {
  if (!isObject(v)) {
    return "plan must be an object";
  }
  if (typeof v.title !== "string") {
    return "title must be a string";
  }
  const overview = v.overview;
  if (!isObject(overview)) {
    return "overview must be an object";
  }
  if (typeof overview.summary !== "string") {
    return "overview.summary must be a string";
  }
  if (!("outOfScope" in overview)) {
    return "overview.outOfScope is required (a string or null)";
  }
  if (overview.outOfScope !== null && typeof overview.outOfScope !== "string") {
    return "overview.outOfScope must be a string or null";
  }
  const pc = v.proposedChanges;
  if (!isObject(pc)) {
    return "proposedChanges must be an object";
  }
  if (typeof pc.language !== "string") {
    return "proposedChanges.language must be a string";
  }
  if (typeof pc.code !== "string") {
    return "proposedChanges.code must be a string";
  }
  if (!Array.isArray(v.files)) {
    return "files must be an array";
  }
  for (let i = 0; i < v.files.length; i++) {
    const f: unknown = v.files[i];
    if (!isObject(f)) {
      return `files[${i}] must be an object`;
    }
    if (typeof f.path !== "string") {
      return `files[${i}].path must be a string`;
    }
    if (typeof f.change !== "string") {
      return `files[${i}].change must be a string`;
    }
    if (typeof f.isNew !== "boolean") {
      return `files[${i}].isNew must be a boolean`;
    }
  }
  return (
    checkStringArray(v.implementationSteps, "implementationSteps") ??
    checkStringArray(v.verification, "verification") ??
    checkProposedFiles(v.proposedFiles)
  );
}

/** Validates the optional proposedFiles field; returns an error naming the bad item, or null. */
function checkProposedFiles(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    return "proposedFiles must be an array";
  }
  for (let i = 0; i < value.length; i++) {
    const f: unknown = value[i];
    if (!isObject(f)) {
      return `proposedFiles[${i}] must be an object`;
    }
    if (typeof f.path !== "string") {
      return `proposedFiles[${i}].path must be a string`;
    }
    if (!isSafeRelativePath(f.path)) {
      return `proposedFiles[${i}].path must be a safe relative path`;
    }
    if (typeof f.content !== "string") {
      return `proposedFiles[${i}].content must be a string`;
    }
  }
  return null;
}

/** Parses plan JSON text (optionally fenced) into a plan. Never throws. */
export function parsePlanJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(text));
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const error = validatePlan(data);
  if (error !== null) {
    return { ok: false, error };
  }
  const v = data as Plan;
  const plan: Plan = {
    title: v.title,
    overview: { summary: v.overview.summary, outOfScope: v.overview.outOfScope },
    proposedChanges: { language: v.proposedChanges.language, code: v.proposedChanges.code },
    files: v.files.map((f) => ({ path: f.path, change: f.change, isNew: f.isNew })),
    implementationSteps: [...v.implementationSteps],
    verification: [...v.verification],
  };
  if (v.proposedFiles !== undefined) {
    plan.proposedFiles = v.proposedFiles.map((f) => ({ path: f.path, content: f.content }));
  }
  return { ok: true, plan };
}
