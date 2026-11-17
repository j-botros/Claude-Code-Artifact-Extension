import { Plan } from "./plan";

/**
 * Returns the message shown when Implement the Design has no proposedFiles to review.
 * When the plan lists files but has no proposedFiles, the message names that cause, so the
 * owner knows to ask Claude Code for the file contents. Pure: no vscode import, so it can be unit-tested.
 */
export function noProposedFilesMessage(plan: Plan): string {
  if (plan.files.length > 0) {
    return "This plan lists changed files under Files but has no proposedFiles, so there is no code to review. Ask Claude Code to add proposedFiles with the full new content of each file in Files, then try again.";
  }
  return "This plan has no proposed files.";
}
