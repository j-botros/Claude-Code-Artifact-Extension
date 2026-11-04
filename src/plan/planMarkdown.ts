import { Plan } from "./plan";

/** Returns the number of non-empty comments in a map of comments keyed by block id. */
export function countComments(comments: Record<string, string> | null | undefined): number {
  if (typeof comments !== "object" || comments === null) {
    return 0;
  }
  return Object.values(comments).filter((text) => typeof text === "string" && text.trim() !== "").length;
}

/**
 * Picks a code fence long enough to hold `code`: three backticks, or one more than the
 * longest run of backticks inside the code.
 */
function fenceFor(code: string): string {
  let longest = 0;
  for (const run of code.match(/`+/g) ?? []) {
    longest = Math.max(longest, run.length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Renders a plan as Markdown, in the order the artifact view shows it: title, overview,
 * proposed changes, files, implementation steps, verification. `proposedFiles` is not
 * included, because it is not part of the plan text. Pure; never throws.
 */
export function planToMarkdown(plan: Plan): string {
  const lines: string[] = [];
  lines.push(`# ${plan.title}`, "");
  lines.push("## Overview", "", plan.overview.summary, "");
  lines.push("### Out of scope", "", plan.overview.outOfScope ?? "Nothing excluded.", "");
  const fence = fenceFor(plan.proposedChanges.code);
  lines.push("## Proposed changes", "");
  lines.push(`${fence}${plan.proposedChanges.language}`, plan.proposedChanges.code, fence, "");
  lines.push("## Files", "");
  if (plan.files.length === 0) {
    lines.push("No files.");
  } else {
    for (const f of plan.files) {
      lines.push(`- \`${f.path}\`${f.isNew ? " (new)" : ""}: ${f.change}`);
    }
  }
  lines.push("", "## Implementation steps", "");
  plan.implementationSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push("", "## Verification", "");
  for (const v of plan.verification) {
    lines.push(`- ${v}`);
  }
  return lines.join("\n") + "\n";
}

/** Builds a safe Markdown file name (ending in .md) from a plan title, matching planFileName. */
export function planMarkdownFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return `${slug === "" ? "plan" : slug}.md`;
}
