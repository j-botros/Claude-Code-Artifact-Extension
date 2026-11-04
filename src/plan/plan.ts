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

/** The sample plan's code block: about 40 lines, so the syntax colours and scrolling can be tried. */
const SAMPLE_CODE = [
  "/** Options that control how a greeting is built. */",
  "export interface GreetOptions {",
  '  /** The greeting word, for example "Hello". */',
  "  greeting?: string;",
  "  /** Text used when the name is empty. */",
  "  fallbackName?: string;",
  "  /** The most characters a name may have before it is cut. */",
  "  maxLength?: number;",
  "}",
  "",
  "/** Returns a greeting for the given name. */",
  "export function greet(name: string, options: GreetOptions = {}): string;",
  "",
  'const DEFAULT_GREETING = "Hello";',
  "const DEFAULT_MAX_LENGTH = 40;",
  "",
  "/** Cuts a name to the allowed length and trims spaces around it. */",
  "export function cleanName(name: string, maxLength: number): string {",
  "  const trimmed = name.trim();",
  "  if (trimmed.length <= maxLength) {",
  "    return trimmed;",
  "  }",
  "  // Keep room for the ellipsis so the result never exceeds maxLength.",
  '  return trimmed.slice(0, maxLength - 1) + "...";',
  "}",
  "",
  "/** Builds the greeting text from the options, using defaults for missing values. */",
  "export function greet(name: string, options: GreetOptions = {}): string {",
  "  const greeting = options.greeting ?? DEFAULT_GREETING;",
  "  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;",
  "  const cleaned = cleanName(name, maxLength);",
  '  if (cleaned === "") {',
  '    return greeting + ", " + (options.fallbackName ?? "stranger") + ".";',
  "  }",
  "  return `${greeting}, ${cleaned}.`;",
  "}",
  "",
  "/** Greets every name in a list and returns the lines in order. */",
  "export function greetAll(names: string[], options?: GreetOptions): string[] {",
  "  return names.map((n) => greet(n, options));",
  "}",
].join("\n");

/**
 * Hard-coded sample plan shown by the scaffold command. It is long on purpose, so scrolling
 * and all five callout kinds can be tried by hand.
 */
export const samplePlan: Plan = {
  title: "Sample Implementation Plan",
  overview: {
    summary:
      "NOTE: A hard-coded plan used to check that the webview renders. It follows the plan shape from the project docs, and it is long enough to scroll.",
    outOfScope:
      "CAUTION: Real plan generation is not part of this sample, and nothing is written until you choose Implement the Design.",
  },
  proposedChanges: {
    language: "typescript",
    code: SAMPLE_CODE,
  },
  files: [
    { path: "src/greet.ts", change: "Add the greet function and its options.", isNew: true },
    { path: "src/names.ts", change: "Add cleanName and greetAll helpers.", isNew: true },
    { path: "src/extension.ts", change: "Call greet from the sample command.", isNew: false },
    { path: "src/config.ts", change: "Read the default greeting from settings.", isNew: false },
    { path: "package.json", change: "Add the greeting setting under contributes.configuration.", isNew: false },
    { path: "test/unit/greet.test.ts", change: "Test greet with normal, empty, and long names.", isNew: true },
    { path: "test/unit/names.test.ts", change: "Test cleanName and greetAll.", isNew: true },
    { path: "docs/greeting.md", change: "Describe the greeting options.", isNew: true },
  ],
  implementationSteps: [
    "Create src/greet.ts with the GreetOptions interface and the greet function.",
    "Create src/names.ts with cleanName and greetAll.",
    "IMPORTANT: Keep greet pure, with no editor calls, so unit tests need no VS Code.",
    "Call greet from the sample command in src/extension.ts.",
    "Read the default greeting in src/config.ts and pass it to greet.",
    "Add the greeting setting to package.json under contributes.configuration.",
    "TIP: Name the setting with the extension prefix so it groups in the Settings view.",
    "Write unit tests in test/unit/greet.test.ts for a normal name, an empty string, and a long name.",
    "Write unit tests in test/unit/names.test.ts for cleanName and greetAll.",
    "WARNING: Do not trim inside greetAll; cleanName already does it, and trimming twice hides bugs.",
    "Document the options in docs/greeting.md.",
    "Compile and run the sample command.",
  ],
  verification: [
    "Unit test greet with a normal name and an empty string.",
    "Unit test greet with a name longer than maxLength.",
    "Unit test greetAll keeps the order of the names.",
    "Unit test cleanName trims spaces and adds the ellipsis only when it cuts.",
    "Run npm run compile and confirm there are no type errors.",
    "Run the sample command by hand and check the greeting in the output.",
  ],
  // Lets the Implement the Design flow be tried by hand. Applying writes these new files under the
  // workspace root, so a throwaway workspace is safest.
  proposedFiles: [
    {
      path: "sample-artifact/greet.ts",
      content:
        'export function greet(name: string): string {\n  if (name === "") {\n    return "Hello, stranger.";\n  }\n  return `Hello, ${name}.`;\n}\n',
    },
    {
      path: "sample-artifact/names.ts",
      content:
        'export function cleanName(name: string, maxLength: number): string {\n  const trimmed = name.trim();\n  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength - 1) + "...";\n}\n\nexport function greetAll(names: string[]): string[] {\n  return names.map((n) => "Hello, " + cleanName(n, 40) + ".");\n}\n',
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
