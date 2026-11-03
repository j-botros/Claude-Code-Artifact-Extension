import * as vscode from "vscode";
import { runClaude } from "./claude/claudeRunner";
import { Plan, parsePlanJson, samplePlan } from "./plan/plan";
import { buildPlanPrompt, buildReviewPrompt } from "./plan/planPrompt";
import { PlanPanel } from "./webview/planPanel";

/** Runs Claude Code headless with a prompt and parses the reply into a plan. */
async function runPlanPrompt(
  prompt: string,
  cwd: string
): Promise<{ ok: true; plan: Plan } | { ok: false; message: string }> {
  const result = await runClaude(prompt, cwd);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  const parsed = parsePlanJson(result.text);
  if (!parsed.ok) {
    return { ok: false, message: `Claude Code returned a plan that could not be read: ${parsed.error}` };
  }
  return { ok: true, plan: parsed.plan };
}

/** Sends the plan and comments to Claude Code and returns the revised plan. */
async function reviewPlan(
  plan: Plan,
  comments: Record<number, string>
): Promise<{ ok: true; plan: Plan } | { ok: false; message: string }> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    return { ok: false, message: "Open a folder first." };
  }
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Asking Claude Code to review the plan..." },
    () => runPlanPrompt(buildReviewPrompt(plan, comments), folder.uri.fsPath)
  );
}

/** Asks for a request, runs Claude Code headless, and shows the resulting plan. */
async function generatePlan(): Promise<void> {
  const request = await vscode.window.showInputBox({
    prompt: "What should Claude Code plan?",
    ignoreFocusOut: true,
  });
  if (request === undefined || request.trim() === "") {
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    void vscode.window.showErrorMessage("Open a folder first, then generate a plan.");
    return;
  }
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Asking Claude Code for a plan..." },
    () => runPlanPrompt(buildPlanPrompt(request), folder.uri.fsPath)
  );
  if (!result.ok) {
    void vscode.window.showErrorMessage(result.message);
    return;
  }
  PlanPanel.show(result.plan, reviewPlan);
}

/** Called by VS Code when the extension activates; registers the commands. */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeArtifact.openSamplePlan", () => {
      PlanPanel.show(samplePlan, reviewPlan);
    }),
    vscode.commands.registerCommand("claudeArtifact.generatePlan", generatePlan)
  );
}

/** Called by VS Code when the extension deactivates. Nothing to clean up. */
export function deactivate(): void {}
