import { codeLineId, codeLineLabel, splitCodeLines } from "./codeLines";
import { Plan } from "./plan";

/**
 * The result of checking review comments from the webview. Keys are block ids:
 * `title`, `overview`, `code`, `code:<i>` (one code line), `file:<i>`, `step:<i>`, or `verification:<i>`.
 */
export type ReviewCommentsResult =
  | { ok: true; comments: Record<string, string> }
  | { ok: false; error: string };

/** The block ids that exist for a plan, in document order. */
export function blockIdsForPlan(plan: Plan): string[] {
  const ids = ["title", "overview", "code"];
  splitCodeLines(plan.proposedChanges.code).forEach((_l, i) => ids.push(codeLineId(i)));
  plan.files.forEach((_f, i) => ids.push(`file:${i}`));
  plan.implementationSteps.forEach((_s, i) => ids.push(`step:${i}`));
  plan.verification.forEach((_v, i) => ids.push(`verification:${i}`));
  return ids;
}

/**
 * Validates untrusted review comments: an object whose keys are block ids that exist
 * in `plan` (indexes in range) and whose values are strings. Trims values and drops
 * empty ones. Never throws.
 */
export function parseReviewComments(input: unknown, plan: Plan): ReviewCommentsResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "comments must be an object" };
  }
  const valid = new Set(blockIdsForPlan(plan));
  const comments: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^(title|overview|code|(code|file|step|verification):(0|[1-9][0-9]*))$/.test(key)) {
      return { ok: false, error: `comment key "${key}" is not a block id` };
    }
    if (!valid.has(key)) {
      return { ok: false, error: `comment key "${key}" is out of range` };
    }
    if (typeof value !== "string") {
      return { ok: false, error: `comment ${key} must be a string` };
    }
    const trimmed = value.trim();
    if (trimmed !== "") {
      comments[key] = trimmed;
    }
  }
  return { ok: true, comments };
}

/** Returns the human label for a block id in the review prompt, such as `Step 2` or `File src/x.ts`. */
export function blockLabel(id: string, plan: Plan): string {
  const [kind, rest] = id.split(":");
  const index = Number(rest);
  switch (kind) {
    case "title":
      return "Title";
    case "overview":
      return "Overview";
    case "code":
      return rest === undefined ? "Code" : codeLineLabel(index);
    case "file":
      return `File ${plan.files[index]?.path ?? String(index + 1)}`;
    case "step":
      return `Step ${index + 1}`;
    case "verification":
      return `Verification ${index + 1}`;
    default:
      return id;
  }
}

/**
 * Formats comments as one `<Label>: <text>` line each, in document order.
 * Unknown ids are skipped. Newlines in a comment are folded to spaces.
 */
export function formatCommentsForPrompt(comments: Record<string, string>, plan: Plan): string {
  return blockIdsForPlan(plan)
    .filter((id) => typeof comments[id] === "string")
    .map((id) => `${blockLabel(id, plan)}: ${comments[id].replace(/\s*\n\s*/g, " ")}`)
    .join("\n");
}
