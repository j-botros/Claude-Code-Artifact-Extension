import * as vscode from "vscode";
import { AgyRunResult, runAgyWithRetry } from "./agy/agyRunner";
import { RunResult, runClaude } from "./claude/claudeRunner";
import { Plan, parsePlanJson, samplePlan } from "./plan/plan";
import { buildPlanPrompt, buildReviewPrompt } from "./plan/planPrompt";
import { registerHunkReview, startImplementReview } from "./review/hunkReview";
import { PlanPanel } from "./webview/planPanel";

/** Extension context, stored in activate so the agy warning flag can use globalState. */
let extensionContext: vscode.ExtensionContext | undefined;

/** Text of the one-time warning shown before the first agy run. */
const AGY_WARNING =
  "The agy fallback runs under your own agy permission settings and is not sandboxed. Those settings may allow agy to run shell commands without asking. The extension asks agy not to use tools, but that is not a security boundary. Review ~/.gemini/config/config.json (userSettings: permissionPreset, autoExecutionPolicy) before you continue.";

/**
 * Runs the prompt through agy. Shows the security warning modal once
 * (remembered in globalState); cancelling returns a failure without running agy.
 */
async function runAgyFallback(prompt: string, cwd: string): Promise<AgyRunResult> {
  const accepted = extensionContext?.globalState.get<boolean>("agyWarningAccepted") === true;
  if (!accepted) {
    const choice = await vscode.window.showWarningMessage(AGY_WARNING, { modal: true }, "Run agy");
    if (choice !== "Run agy") {
      return { ok: false, kind: "failed", message: "The agy fallback was cancelled." };
    }
    await extensionContext?.globalState.update("agyWarningAccepted", true);
  }
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Asking agy for a plan..." },
    () => runAgyWithRetry(prompt, cwd)
  );
}

/**
 * Runs Claude Code headless with a prompt and parses the reply into a plan.
 * Falls back to agy only when claude is missing or not logged in.
 */
export async function runPlanPrompt(
  prompt: string,
  cwd: string
): Promise<{ ok: true; plan: Plan } | { ok: false; message: string }> {
  let result: RunResult | AgyRunResult = await runClaude(prompt, cwd);
  let source = "Claude Code";
  if (!result.ok && (result.kind === "missing-cli" || result.kind === "not-logged-in")) {
    result = await runAgyFallback(prompt, cwd);
    source = "agy";
  }
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  const parsed = parsePlanJson(result.text);
  if (!parsed.ok) {
    return { ok: false, message: `${source} returned a plan that could not be read: ${parsed.error}` };
  }
  return { ok: true, plan: parsed.plan };
}

/** Sends the plan and comments to Claude Code and returns the revised plan. */
export async function reviewPlan(
  plan: Plan,
  comments: Record<string, string>
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

/** Starts the hunk review for the plan's proposed files in the first workspace folder. Writes nothing. */
async function implementPlan(plan: Plan): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    return { ok: false, message: "Open a folder first." };
  }
  return startImplementReview(plan, folder.uri);
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
  PlanPanel.show(result.plan, reviewPlan, implementPlan);
}

/** Called by VS Code when the extension activates; registers the commands. */
export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  registerHunkReview(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeArtifact.openSamplePlan", () => {
      PlanPanel.show(samplePlan, reviewPlan, implementPlan);
    }),
    vscode.commands.registerCommand("claudeArtifact.generatePlan", generatePlan)
  );
}

/** Called by VS Code when the extension deactivates. Nothing to clean up. */
export function deactivate(): void {}
