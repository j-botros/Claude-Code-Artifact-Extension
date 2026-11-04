import { DiffHunk } from "./diffHunks";

/** A run of whole lines in the inline document: zero-based first line and a line count. */
export interface LineSpan {
  start: number;
  count: number;
}

/** Where one hunk sits in the inline document. */
export interface InlineHunkRange {
  /** The hunk's index in its file's hunk list. */
  index: number;
  /** First line of the hunk in the inline document (where its lenses go). */
  firstLine: number;
  /** The removed (red) lines, or null when the hunk removes nothing or is rejected. */
  removed: LineSpan | null;
  /** The added (green) lines, or null when the hunk adds nothing or is rejected. */
  added: LineSpan | null;
}

/** The inline document text for one file, and the line ranges of its hunks. */
export interface InlineView {
  text: string;
  hunks: InlineHunkRange[];
}

/** Splits text into lines on "\n"; the empty string has no lines. */
function toLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

/**
 * Builds the inline document for one file. Pure: no I/O, no VS Code.
 * Unchanged lines stay plain. For an accepted or pending hunk, the removed lines are kept
 * (red) and the added lines follow them (green). A rejected hunk shows its original lines
 * only. A new file (empty original) comes out as the proposed text, every line added.
 * `rejected` holds the indexes of rejected hunks.
 */
export function buildInlineView(originalText: string, hunks: DiffHunk[], rejected: ReadonlySet<number>): InlineView {
  const original = toLines(originalText);
  const out: string[] = [];
  const ranges: InlineHunkRange[] = [];
  let cursor = 0;
  for (const hunk of hunks) {
    for (; cursor < hunk.oldStart && cursor < original.length; cursor++) {
      out.push(original[cursor]);
    }
    const firstLine = out.length;
    if (rejected.has(hunk.index)) {
      out.push(...hunk.oldLines);
      ranges.push({ index: hunk.index, firstLine, removed: null, added: null });
    } else {
      out.push(...hunk.oldLines);
      const addedStart = out.length;
      out.push(...hunk.newLines);
      ranges.push({
        index: hunk.index,
        firstLine,
        removed: hunk.oldLines.length > 0 ? { start: firstLine, count: hunk.oldLines.length } : null,
        added: hunk.newLines.length > 0 ? { start: addedStart, count: hunk.newLines.length } : null,
      });
    }
    cursor = hunk.oldStart + hunk.oldLines.length;
  }
  for (; cursor < original.length; cursor++) {
    out.push(original[cursor]);
  }
  return { text: out.join("\n"), hunks: ranges };
}
