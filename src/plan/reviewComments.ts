import { codeLineId, codeLineLabel, splitCodeLines } from "./codeLines";
import { lineLabel, parseLineId, textLineIds } from "./lineComments";
import { Plan } from "./plan";

/**
 * The result of checking review comments from the webview. Keys are line ids: `title`,
 * `overview` (the summary), `scope` (out of scope), `code`, `code:<i>` (one code line),
 * `file:<i>`, `step:<i>`, `verification:<i>`, or `question:<i>`. A text block with several
 * lines (see `splitTextLines`) has one id per line: the first is the block id, later ones add
 * `#<n>`, such as `step:2#1`.
 */
export type ReviewCommentsResult =
  | { ok: true; comments: Record<string, string> }
  | { ok: false; error: string };

/** The line ids that exist for a plan, in document order. One block can have several. */
export function blockIdsForPlan(plan: Plan): string[] {
  const ids = [
    ...textLineIds("title", plan.title),
    ...textLineIds("overview", plan.overview.summary),
    ...textLineIds("scope", plan.overview.outOfScope ?? ""),
    "code",
  ];
  splitCodeLines(plan.proposedChanges.code).forEach((_l, i) => ids.push(codeLineId(i)));
  plan.files.forEach((_f, i) => ids.push(`file:${i}`));
  plan.implementationSteps.forEach((s, i) => ids.push(...textLineIds(`step:${i}`, s)));
  plan.verification.forEach((v, i) => ids.push(...textLineIds(`verification:${i}`, v)));
  (plan.openQuestions ?? []).forEach((q, i) => ids.push(...textLineIds(`question:${i}`, q)));
  return ids;
}

/**
 * Drops `question:<i>` comments (and their `#<n>` line comments) whose index is not below
 * `count`, and reports how many were dropped so the caller can say so. Other keys pass
 * through unchanged. Never throws.
 */
export function dropOutOfRangeQuestionComments(
  comments: Record<string, unknown>,
  count: number
): { comments: Record<string, unknown>; dropped: number } {
  const kept: Record<string, unknown> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(comments)) {
    const m = /^question:(0|[1-9][0-9]*)(#(0|[1-9][0-9]*))?$/.exec(key);
    if (m !== null && Number(m[1]) >= count) {
      dropped++;
    } else {
      kept[key] = value;
    }
  }
  return { comments: kept, dropped };
}

/**
 * Drops `#<n>` line comments whose line no longer exists in the plan (the block is there but
 * has fewer lines now), and reports how many were dropped. Keys without `#` and keys that do
 * not name a block are left for `parseReviewComments` to judge. Never throws.
 */
export function dropOutOfRangeTextLineComments(
  comments: Record<string, unknown>,
  plan: Plan
): { comments: Record<string, unknown>; dropped: number } {
  const valid = new Set(blockIdsForPlan(plan));
  const kept: Record<string, unknown> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(comments)) {
    const isTextLine = /^(title|overview|scope|(step|verification|question):(0|[1-9][0-9]*))#(0|[1-9][0-9]*)$/.test(key);
    if (isTextLine && !valid.has(key)) {
      dropped++;
    } else {
      kept[key] = value;
    }
  }
  return { comments: kept, dropped };
}

/**
 * Validates untrusted review comments: an object whose keys are line ids that exist
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
    if (!/^(title|overview|scope|code|(code|file|step|verification|question):(0|[1-9][0-9]*))(#(0|[1-9][0-9]*))?$/.test(key)) {
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

/**
 * Returns the human label for a line id in the review prompt, such as `Step 2`, `Step 2,
 * line 3` (a step with several lines), or `File src/x.ts`. Code lines are `Code line <n>`.
 */
export function blockLabel(id: string, plan: Plan): string {
  const parsed = parseLineId(id);
  const blockId = parsed === null ? id : parsed.blockId;
  const line = parsed === null ? 0 : parsed.index;
  const [kind, rest] = blockId.split(":");
  const index = Number(rest);
  const count = blockIdsForPlan(plan).filter((other) => parseLineId(other)?.blockId === blockId).length;
  switch (kind) {
    case "title":
      return lineLabel("Title", line, count);
    case "overview":
      return lineLabel("Overview", line, count);
    case "scope":
      return lineLabel("Out of scope", line, count);
    case "code":
      return rest === undefined ? "Code" : codeLineLabel(index);
    case "file":
      return `File ${plan.files[index]?.path ?? String(index + 1)}`;
    case "step":
      return lineLabel(`Step ${index + 1}`, line, count);
    case "verification":
      return lineLabel(`Verification ${index + 1}`, line, count);
    case "question":
      return lineLabel(`Open question ${index + 1}`, line, count);
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
