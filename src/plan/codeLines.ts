import { CodeToken } from "./codeTokens";

/**
 * Splits code into lines on "\n". One trailing newline does not add an extra empty line.
 * Empty code gives one empty line. This is the single source of truth for line ids, used
 * by the renderer and by `blockIdsForPlan`, so the two cannot drift.
 */
export function splitCodeLines(code: string): string[] {
  const lines = code.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** The number of lines `splitCodeLines` finds in the code. */
export function codeLineCount(code: string): number {
  return splitCodeLines(code).length;
}

/** The block id of a code line: `code:<i>` with `i` 0-based. */
export function codeLineId(index: number): string {
  return `code:${index}`;
}

/** The human label of a code line, such as `Code line 3` for index 2. */
export function codeLineLabel(index: number): string {
  return `Code line ${index + 1}`;
}

/** Returns the 0-based line index when the id is a `code:<i>` line id, otherwise null. */
export function codeLineIndex(id: string): number | null {
  const m = /^code:(0|[1-9][0-9]*)$/.exec(id);
  return m === null ? null : Number(m[1]);
}

/**
 * Splits tokens into one token list per line, matching `splitCodeLines` on the joined text.
 * A token that spans lines (such as a block comment) is cut so each line keeps its kind.
 */
export function splitTokensByLine(tokens: readonly CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    token.text.split("\n").forEach((part, k) => {
      if (k > 0) {
        lines.push([]);
      }
      if (part !== "") {
        lines[lines.length - 1].push({ kind: token.kind, text: part });
      }
    });
  }
  if (lines.length > 1 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }
  return lines;
}

/**
 * Removes `code:<i>` comments whose line no longer exists (`i` >= `lineCount`) and reports
 * how many were removed. All other keys are kept. Does not mutate the input.
 */
export function dropOutOfRangeLineComments(
  comments: Record<string, unknown>,
  lineCount: number
): { comments: Record<string, unknown>; dropped: number } {
  const kept: Record<string, unknown> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(comments)) {
    const index = codeLineIndex(key);
    if (index !== null && index >= lineCount) {
      dropped++;
    } else {
      kept[key] = value;
    }
  }
  return { comments: kept, dropped };
}
