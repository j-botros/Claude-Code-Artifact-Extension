import * as vscode from "vscode";
import { runClaude } from "./claude/claudeRunner";
import { parsePlanJson, samplePlan } from "./plan/plan";
import { buildPlanPrompt } from "./plan/planPrompt";
import { PlanPanel } from "./webview/planPanel";

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
    () => runClaude(buildPlanPrompt(request), folder.uri.fsPath)
  );
  if (!result.ok) {
    void vscode.window.showErrorMessage(result.message);
    return;
  }
  const parsed = parsePlanJson(result.text);
  if (!parsed.ok) {
    void vscode.window.showErrorMessage(`Claude Code returned a plan that could not be read: ${parsed.error}`);
    return;
  }
  PlanPanel.show(parsed.plan);
}

/** Called by VS Code when the extension activates; registers the commands. */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeArtifact.openSamplePlan", () => {
      PlanPanel.show(samplePlan);
    }),
    vscode.commands.registerCommand("claudeArtifact.generatePlan", generatePlan)
  );
}

/** Called by VS Code when the extension deactivates. Nothing to clean up. */
export function deactivate(): void {}
