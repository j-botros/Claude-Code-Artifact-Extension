import { ParseResult, Plan } from "./plan";

/** The fields of a plan the user can edit in the artifact view. */
export interface PlanEdits {
  title: string;
  summary: string;
  outOfScope: string | null;
  steps: string[];
}

/** Builds a safe file name (ending in .json) from a plan title. */
export function planFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return `${slug === "" ? "plan" : slug}.json`;
}

/** Returns true when the value is a non-null, non-array object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates untrusted edits and merges them into a copy of the current plan.
 * Never throws and never mutates `current`.
 */
export function applyPlanEdits(current: Plan, input: unknown): ParseResult {
  if (!isObject(input)) {
    return { ok: false, error: "edits must be an object" };
  }
  if (typeof input.title !== "string") {
    return { ok: false, error: "title must be a string" };
  }
  const title = input.title.trim();
  if (title === "") {
    return { ok: false, error: "title must not be empty" };
  }
  if (typeof input.summary !== "string") {
    return { ok: false, error: "summary must be a string" };
  }
  const summary = input.summary.trim();
  if (summary === "") {
    return { ok: false, error: "summary must not be empty" };
  }
  let outOfScope: string | null;
  if (input.outOfScope === null) {
    outOfScope = null;
  } else if (typeof input.outOfScope === "string") {
    const trimmed = input.outOfScope.trim();
    outOfScope = trimmed === "" ? null : trimmed;
  } else {
    return { ok: false, error: "outOfScope must be a string or null" };
  }
  if (!Array.isArray(input.steps)) {
    return { ok: false, error: "steps must be an array" };
  }
  if (input.steps.length !== current.implementationSteps.length) {
    return {
      ok: false,
      error: `steps must have ${current.implementationSteps.length} items`,
    };
  }
  const steps: string[] = [];
  for (let i = 0; i < input.steps.length; i++) {
    const step: unknown = input.steps[i];
    if (typeof step !== "string") {
      return { ok: false, error: `steps[${i}] must be a string` };
    }
    const trimmed = step.trim();
    if (trimmed === "") {
      return { ok: false, error: `steps[${i}] must not be empty` };
    }
    steps.push(trimmed);
  }
  const plan: Plan = {
    title,
    overview: { summary, outOfScope },
    proposedChanges: {
      language: current.proposedChanges.language,
      code: current.proposedChanges.code,
    },
    files: current.files.map((f) => ({ path: f.path, change: f.change, isNew: f.isNew })),
    implementationSteps: steps,
    verification: [...current.verification],
  };
  if (current.proposedFiles !== undefined) {
    plan.proposedFiles = current.proposedFiles.map((f) => ({ path: f.path, content: f.content }));
  }
  return { ok: true, plan };
}
