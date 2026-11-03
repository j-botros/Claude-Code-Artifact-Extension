/** A reviewer's choice for one hunk. */
export type Decision = "accept" | "reject";

/** Returns a new map with the decision for `key` set. Does not change the input map. */
export function setDecision(
  decisions: Map<string, Decision>,
  key: string,
  value: Decision
): Map<string, Decision> {
  const next = new Map(decisions);
  next.set(key, value);
  return next;
}

/** Counts accepted, rejected, and pending hunks out of `total`. */
export function summarizeDecisions(
  total: number,
  decisions: Map<string, Decision>
): { accepted: number; rejected: number; pending: number } {
  let accepted = 0;
  let rejected = 0;
  for (const value of decisions.values()) {
    if (value === "accept") {
      accepted++;
    } else {
      rejected++;
    }
  }
  return { accepted, rejected, pending: Math.max(0, total - accepted - rejected) };
}
