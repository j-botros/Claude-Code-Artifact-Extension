/** Outcome of reading an `agy` stream: the plan text, or why there is none. */
export type AgyParseResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no-result" | "empty-response"; message: string };

/**
 * Reads the output of `agy -p ... --output-format stream-json`.
 * The stream is one JSON object per line. Blank lines and lines that are not
 * valid JSON are skipped. Only the last `result` event matters: its `response`
 * string is the plan text. A missing, non-string, or whitespace-only response
 * is reported as "empty-response" (agy still says SUCCESS in that case).
 * Pure, so it can be tested without spawning anything.
 */
export function parseAgyStream(stdout: string): AgyParseResult {
  let result: Record<string, unknown> | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof event === "object" && event !== null && (event as Record<string, unknown>).type === "result") {
      result = event as Record<string, unknown>;
    }
  }
  if (result === undefined) {
    return { ok: false, reason: "no-result", message: "agy produced no result event." };
  }
  const response = result.response;
  if (typeof response !== "string" || response.trim() === "") {
    return { ok: false, reason: "empty-response", message: "agy returned an empty response." };
  }
  return { ok: true, text: response };
}
