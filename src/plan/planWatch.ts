import { createHash } from "crypto";
import { Plan, parsePlanJson } from "./plan";

/** What the watcher should do with a plan file that was created or changed. */
export type WatchDecision =
  | { action: "open"; plan: Plan }
  | { action: "skip" }
  | { action: "warn"; error: string };

/** Hashes of content the extension wrote itself, kept for the session. */
const ownSaveHashes = new Set<string>();

/** Returns the SHA-256 hex digest of the exact text. */
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Records the hash of text the extension is about to write, so the watcher skips it. */
export function recordOwnSave(text: string): void {
  ownSaveHashes.add(hashText(text));
}

/** Returns the session's recorded own-save hashes. */
export function getOwnSaveHashes(): ReadonlySet<string> {
  return ownSaveHashes;
}

/**
 * Pure decision for a changed plan file: skip when its hash matches an own save
 * (the record is kept), warn when the JSON is invalid, otherwise open the parsed plan.
 */
export function decidePlanFile(
  content: string,
  hash: string,
  ownHashes: ReadonlySet<string>
): WatchDecision {
  if (ownHashes.has(hash)) {
    return { action: "skip" };
  }
  const parsed = parsePlanJson(content);
  if (!parsed.ok) {
    return { action: "warn", error: parsed.error };
  }
  return { action: "open", plan: parsed.plan };
}
