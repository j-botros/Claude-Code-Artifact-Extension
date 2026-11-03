/** Outcome of reading a `claude` stream: the result text, or a typed failure. */
export type StreamResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no-result" | "error-result" | "empty-result"; message: string };

/** Parses one line as a JSON object; returns undefined for blank or invalid lines. */
function parseLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Not JSON: skip the line.
  }
  return undefined;
}

/**
 * Reads the raw stdout of `claude -p --output-format stream-json --verbose`
 * and returns the final `result` event's text, or a typed failure.
 * Blank and non-JSON lines are skipped. Other event types are ignored.
 */
export function parseClaudeStream(stdout: string): StreamResult {
  let resultEvent: Record<string, unknown> | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    const event = parseLine(line);
    if (event !== undefined && event.type === "result") {
      resultEvent = event; // keep the last one
    }
  }
  if (resultEvent === undefined) {
    return { ok: false, reason: "no-result", message: "Claude Code returned no result." };
  }
  const text = typeof resultEvent.result === "string" ? resultEvent.result : "";
  if (resultEvent.is_error === true || resultEvent.subtype !== "success") {
    return {
      ok: false,
      reason: "error-result",
      message: text !== "" ? text : "Claude Code reported an error.",
    };
  }
  if (text.trim() === "") {
    return { ok: false, reason: "empty-result", message: "Claude Code returned an empty result." };
  }
  return { ok: true, text };
}
