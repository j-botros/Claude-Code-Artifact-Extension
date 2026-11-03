/** One changed region between an original text and a proposed text. */
export interface DiffHunk {
  /** Position of this hunk in the file's hunk list, starting at 0. */
  index: number;
  /** Zero-based line index in the original where the removed lines start. */
  oldStart: number;
  /** Lines removed from the original (empty for a pure insert). */
  oldLines: string[];
  /** Lines added by the proposal (empty for a pure delete). */
  newLines: string[];
}

/** Largest oldLines * newLines product that gets a full line diff; above it the file is one hunk. */
const MAX_DIFF_CELLS = 4_000_000;

/** Splits text into lines on "\n"; the empty string has no lines. */
function toLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

/**
 * Splits the difference between two texts into hunks. Pure: no I/O.
 * Uses a line-level longest-common-subsequence diff and groups each maximal
 * run of changes into one hunk, with no context lines.
 */
export function splitHunks(original: string, proposed: string): DiffHunk[] {
  if (original === proposed) {
    return [];
  }
  const a = toLines(original);
  const b = toLines(proposed);
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_DIFF_CELLS) {
    return [{ index: 0, oldStart: 0, oldLines: a, newLines: b }];
  }
  // lcs[i * (m + 1) + j] is the LCS length of a[i..] and b[j..].
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      current = null;
      i++;
      j++;
      continue;
    }
    if (current === null) {
      current = { index: hunks.length, oldStart: i, oldLines: [], newLines: [] };
      hunks.push(current);
    }
    if (j >= m || (i < n && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      current.oldLines.push(a[i]);
      i++;
    } else {
      current.newLines.push(b[j]);
      j++;
    }
  }
  return hunks;
}
