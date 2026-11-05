/** One reviewed file as the next-change rules see it: its path and how many hunks it has. */
export interface ChangeFile {
  path: string;
  hunkCount: number;
}

/**
 * Lists the paths that still have a pending hunk, in the order of the given files.
 * A hunk is pending when its key "<path>#<index>" is not in decidedKeys.
 */
export function listPendingPaths(files: readonly ChangeFile[], decidedKeys: ReadonlySet<string>): string[] {
  const pending: string[] = [];
  for (const file of files) {
    for (let i = 0; i < file.hunkCount; i++) {
      if (!decidedKeys.has(`${file.path}#${i}`)) {
        pending.push(file.path);
        break;
      }
    }
  }
  return pending;
}

/**
 * Picks the next path to open. Walks allPaths (plan order) from just after the current path,
 * wrapping around, and returns the first path that is in pending. When current is undefined or
 * not in allPaths, starts from the beginning. The current path is returned only when it is the
 * only candidate. Returns undefined when nothing is pending.
 */
export function pickNextPath(
  allPaths: readonly string[],
  pending: readonly string[],
  current: string | undefined
): string | undefined {
  if (pending.length === 0) {
    return undefined;
  }
  const candidates = new Set(pending);
  const at = current === undefined ? -1 : allPaths.indexOf(current);
  for (let step = 1; step <= allPaths.length; step++) {
    const path = allPaths[(at + step) % allPaths.length];
    if (candidates.has(path)) {
      return path;
    }
  }
  return undefined;
}
