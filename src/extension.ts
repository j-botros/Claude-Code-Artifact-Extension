import * as vscode from "vscode";
import { samplePlan } from "./plan/plan";
import { PlanPanel } from "./webview/planPanel";

/** Called by VS Code when the extension activates; registers the sample-plan command. */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeArtifact.openSamplePlan", () => {
      PlanPanel.show(samplePlan);
    })
  );
}

/** Called by VS Code when the extension deactivates. Nothing to clean up. */
export function deactivate(): void {}
