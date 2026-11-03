import { DiffHunk } from "./diffHunks";
import { Decision } from "./hunkDecisions";

/** Result of applying the accepted hunks to one file's original text. */
export interface ApplyResult {
  /** The new text: the original with every accepted hunk applied. */
  text: string;
  /** Number of hunks that were accepted and applied. */
  applied: number;
  /** Number of hunks that were rejected or pending and left alone. */
  skipped: number;
}

/**
 * Applies only the accepted hunks to the original text. Pure: no I/O, and it does not
 * change its inputs. A hunk is accepted when decisions has "<path>#<index>" set to "accept".
 * Rejected and pending hunks keep the original lines. Throws if the hunks overlap or are
 * out of order, or reach past the end of the original.
 */
export function applyAcceptedHunks(
  original: string,
  hunks: DiffHunk[],
  decisions: Map<string, Decision>,
  path: string
): ApplyResult {
  const lines = original === "" ? [] : original.split("\n");
  const out: string[] = [];
  let cursor = 0;
  let applied = 0;
  let skipped = 0;
  for (const hunk of hunks) {
    if (hunk.oldStart < cursor || hunk.oldStart + hunk.oldLines.length > lines.length) {
      throw new Error(`Hunk ${hunk.index} overlaps another hunk, is out of order, or is outside the file.`);
    }
    // Copy the untouched lines before this hunk.
    out.push(...lines.slice(cursor, hunk.oldStart));
    const end = hunk.oldStart + hunk.oldLines.length;
    if (decisions.get(`${path}#${hunk.index}`) === "accept") {
      out.push(...hunk.newLines);
      applied++;
    } else {
      out.push(...lines.slice(hunk.oldStart, end));
      skipped++;
    }
    cursor = end;
  }
  out.push(...lines.slice(cursor));
  return { text: applied === 0 ? original : out.join("\n"), applied, skipped };
}
