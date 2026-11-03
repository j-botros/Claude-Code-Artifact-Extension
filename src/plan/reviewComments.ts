/** The result of checking review comments from the webview. */
export type ReviewCommentsResult =
  | { ok: true; comments: Record<number, string> }
  | { ok: false; error: string };

/**
 * Validates untrusted review comments: an object whose keys are zero-based step
 * indexes and whose values are strings. Trims values and drops empty ones.
 * Never throws.
 */
export function parseReviewComments(input: unknown, stepCount: number): ReviewCommentsResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "comments must be an object" };
  }
  const comments: Record<number, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key)) {
      return { ok: false, error: `comment key "${key}" is not a step index` };
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= stepCount) {
      return { ok: false, error: `comment key "${key}" is out of range` };
    }
    if (typeof value !== "string") {
      return { ok: false, error: `comment ${key} must be a string` };
    }
    const trimmed = value.trim();
    if (trimmed !== "") {
      comments[index] = trimmed;
    }
  }
  return { ok: true, comments };
}

/** Formats comments as one `Step <n>: <text>` line each (one-based), sorted by step. */
export function formatCommentsForPrompt(comments: Record<number, string>): string {
  return Object.keys(comments)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => `Step ${i + 1}: ${comments[i]}`)
    .join("\n");
}
