import { splitCallout } from "./callouts";

/**
 * Splits a block's text into commentable lines by a fixed rule, not by measuring the browser.
 * A new line starts after a newline, and after a sentence end (`.`, `!` or `?`, optionally
 * followed by closing quotes or brackets) that is followed by whitespace. The whitespace stays
 * at the end of the line it follows, so joining the lines gives back the exact text. A
 * whitespace-only piece joins its neighbour, so there is never an empty target. Empty text
 * gives one empty line.
 *
 * Limits: a single long sentence that wraps onto several visual lines is ONE target, and a
 * short line break inside a sentence is not a boundary. The rule is the same at every window
 * width, which keeps line ids and their comments stable when the panel is resized.
 *
 * This function is also copied into the webview script with `Function.prototype.toString`, so
 * it must stay self-contained: no imports, no helpers, no TypeScript-only runtime features.
 */
export function splitTextLines(text: string): string[] {
  const re = /(?:[.!?]["')\]]*\s+|\n\s*)/g;
  const raw: string[] = [];
  let start = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const end = m.index + m[0].length;
    if (end < text.length) {
      raw.push(text.slice(start, end));
      start = end;
    }
    m = re.exec(text);
  }
  raw.push(text.slice(start));
  const lines: string[] = [];
  let carry = "";
  for (const piece of raw) {
    if (piece.trim() === "") {
      carry += piece;
    } else {
      lines.push(carry + piece);
      carry = "";
    }
  }
  if (carry !== "") {
    if (lines.length > 0) {
      lines[lines.length - 1] += carry;
    } else {
      lines.push(carry);
    }
  }
  return lines.length > 0 ? lines : [""];
}

/**
 * The commentable text of a plan text field: the body after a callout marker, or the whole
 * text when there is no marker. The marker is a label, so it is not a comment target.
 */
export function commentableBody(text: string): string {
  const callout = splitCallout(text);
  return callout === null ? text : callout.body;
}

/**
 * The id of line `index` (0-based) of a block. Line 0 keeps the plain block id, so old ids such
 * as `step:2` still work; later lines add `#<index>`, for example `step:2#1`.
 */
export function lineId(blockId: string, index: number): string {
  return index === 0 ? blockId : `${blockId}#${index}`;
}

/** Splits a line id into its block id and 0-based line index, or null when it is not a line id. */
export function parseLineId(id: string): { blockId: string; index: number } | null {
  const m = /^(.+?)(?:#(0|[1-9][0-9]*))?$/.exec(id);
  if (m === null) {
    return null;
  }
  return { blockId: m[1], index: m[2] === undefined ? 0 : Number(m[2]) };
}

/**
 * The line ids of a text field. The text is empty after the callout marker is removed: no
 * lines, because there is nothing to comment on (an empty Out of scope note, for example).
 */
export function textLineIds(blockId: string, text: string): string[] {
  const body = commentableBody(text);
  if (body.trim() === "") {
    return [];
  }
  return splitTextLines(body).map((_line, i) => lineId(blockId, i));
}

/**
 * The readable label of a line: the block label alone when the block has one line, otherwise
 * `<block label>, line <n>` with `n` 1-based, for example `Step 3, line 2`.
 */
export function lineLabel(blockLabel: string, index: number, count: number): string {
  return count > 1 ? `${blockLabel}, line ${index + 1}` : blockLabel;
}
