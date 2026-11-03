import * as vscode from "vscode";
import { DiffHunk, splitHunks } from "../plan/diffHunks";
import { Decision, setDecision, summarizeDecisions } from "../plan/hunkDecisions";
import { Plan, isSafeRelativePath } from "../plan/plan";

/** Result of starting a review: a message for the status line, and whether it worked. */
export type ReviewResult = { ok: true; message: string } | { ok: false; message: string };

/** URI scheme for the virtual "original" side (used only for new files). */
const ORIGINAL_SCHEME = "claude-artifact-original";

/** URI scheme for the virtual "proposed" side. */
const PROPOSED_SCHEME = "claude-artifact-proposed";

/** One reviewed file: its texts, its hunks, and where each hunk starts in the proposed text. */
interface ReviewFile {
  path: string;
  originalText: string;
  proposedText: string;
  hunks: DiffHunk[];
  /** Zero-based line index in the proposed text where each hunk's added lines start. */
  newStarts: number[];
  leftUri: vscode.Uri;
  rightUri: vscode.Uri;
}

/** One review session: the files and the in-memory accept/reject decisions. */
interface ReviewSession {
  id: number;
  files: Map<string, ReviewFile>;
  decisions: Map<string, Decision>;
  total: number;
}

/** The current session. A new click on Implement the Design replaces it. */
let session: ReviewSession | undefined;

/** Counter that gives each session a unique id. */
let nextSessionId = 1;

/** Fires when lenses must be recomputed. */
const lensChanged = new vscode.EventEmitter<void>();

/** Decoration for added lines (right side). Created on first use. */
let addedType: vscode.TextEditorDecorationType | undefined;

/** Decoration for removed lines (left side). Created on first use. */
let removedType: vscode.TextEditorDecorationType | undefined;

/** Returns the two decoration types, creating them from VS Code theme colours once. */
function decorationTypes(): { added: vscode.TextEditorDecorationType; removed: vscode.TextEditorDecorationType } {
  addedType ??= vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("diffEditor.insertedLineBackground"),
  });
  removedType ??= vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("diffEditor.removedLineBackground"),
  });
  return { added: addedType, removed: removedType };
}

/** Builds the key used for one hunk's decision: "<path>#<hunk index>". */
function hunkKey(path: string, index: number): string {
  return `${path}#${index}`;
}

/** Builds a virtual document URI for a path under the given scheme. */
function virtualUri(scheme: string, path: string, sessionId: number): vscode.Uri {
  return vscode.Uri.from({ scheme, path: `/${path}`, query: `session=${sessionId}` });
}

/** Finds the reviewed file that owns a document URI (real left file or either virtual side). */
function fileForUri(uri: vscode.Uri): ReviewFile | undefined {
  if (session === undefined) {
    return undefined;
  }
  for (const file of session.files.values()) {
    if (file.leftUri.toString() === uri.toString() || file.rightUri.toString() === uri.toString()) {
      return file;
    }
  }
  return undefined;
}

/** Builds a range covering `count` whole lines from `start`, limited to the document's lines. */
function lineRange(document: vscode.TextDocument, start: number, count: number): vscode.Range | undefined {
  if (count <= 0 || document.lineCount === 0 || start >= document.lineCount) {
    return undefined;
  }
  const last = Math.min(start + count - 1, document.lineCount - 1);
  return new vscode.Range(start, 0, last, 0);
}

/** Paints green (added) and red (removed) lines on every visible editor that belongs to the session. */
function refreshDecorations(): void {
  const types = decorationTypes();
  for (const editor of vscode.window.visibleTextEditors) {
    const file = fileForUri(editor.document.uri);
    if (file === undefined || session === undefined) {
      editor.setDecorations(types.added, []);
      editor.setDecorations(types.removed, []);
      continue;
    }
    const isRight = editor.document.uri.toString() === file.rightUri.toString();
    const added: vscode.Range[] = [];
    const removed: vscode.Range[] = [];
    for (const hunk of file.hunks) {
      if (session.decisions.get(hunkKey(file.path, hunk.index)) === "reject") {
        continue;
      }
      const range = isRight
        ? lineRange(editor.document, file.newStarts[hunk.index], hunk.newLines.length)
        : lineRange(editor.document, hunk.oldStart, hunk.oldLines.length);
      if (range !== undefined) {
        (isRight ? added : removed).push(range);
      }
    }
    editor.setDecorations(types.added, added);
    editor.setDecorations(types.removed, removed);
  }
}

/** Builds the status message from the current decision counts. */
function summaryMessage(): string {
  if (session === undefined) {
    return "No review in progress.";
  }
  const s = summarizeDecisions(session.total, session.decisions);
  return `Review the hunks in the editor. Nothing has been written. Accepted: ${s.accepted}, rejected: ${s.rejected}, pending: ${s.pending}.`;
}

/** Reads a workspace file as text, or returns null when it cannot be read (treated as new). */
async function readOriginal(uri: vscode.Uri): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Starts the hunk review for a plan's proposedFiles: opens a diff per changed file,
 * paints hunks green or red, and offers Accept and Reject lenses. Reads files only; never
 * changes anything on disk. Never throws.
 */
export async function startImplementReview(plan: Plan, folder: vscode.Uri): Promise<ReviewResult> {
  try {
    const proposed = plan.proposedFiles;
    if (proposed === undefined || proposed.length === 0) {
      return { ok: false, message: "This plan has no proposed files." };
    }
    const id = nextSessionId++;
    const files = new Map<string, ReviewFile>();
    let total = 0;
    for (const item of proposed) {
      if (!isSafeRelativePath(item.path)) {
        return { ok: false, message: `Unsafe path in proposed files: ${item.path}` };
      }
      const realUri = vscode.Uri.joinPath(folder, ...item.path.split("/").filter((s) => s !== "" && s !== "."));
      const original = await readOriginal(realUri);
      const originalText = original ?? "";
      const hunks = splitHunks(originalText, item.content);
      if (hunks.length === 0) {
        continue;
      }
      const newStarts: number[] = [];
      let shift = 0;
      for (const hunk of hunks) {
        newStarts.push(hunk.oldStart + shift);
        shift += hunk.newLines.length - hunk.oldLines.length;
      }
      files.set(item.path, {
        path: item.path,
        originalText,
        proposedText: item.content,
        hunks,
        newStarts,
        leftUri: original === null ? virtualUri(ORIGINAL_SCHEME, item.path, id) : realUri,
        rightUri: virtualUri(PROPOSED_SCHEME, item.path, id),
      });
      total += hunks.length;
    }
    if (files.size === 0) {
      return { ok: false, message: "The proposed files match the current files. No changes to review." };
    }
    session = { id, files, decisions: new Map(), total };
    lensChanged.fire();
    for (const file of files.values()) {
      await vscode.commands.executeCommand(
        "vscode.diff",
        file.leftUri,
        file.rightUri,
        `${file.path} (proposed)`
      );
    }
    refreshDecorations();
    return { ok: true, message: summaryMessage() };
  } catch (err) {
    return { ok: false, message: `Could not start the review: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Serves the text of the virtual documents from the current session. */
class SessionContentProvider implements vscode.TextDocumentContentProvider {
  /** Returns the original or proposed text for a virtual URI, or "" when unknown. */
  provideTextDocumentContent(uri: vscode.Uri): string {
    const path = uri.path.replace(/^\//, "");
    const file = session?.files.get(path);
    if (file === undefined) {
      return "";
    }
    return uri.scheme === ORIGINAL_SCHEME ? file.originalText : file.proposedText;
  }
}

/** Gives each hunk on the proposed side an Accept and a Reject lens above its first line. */
class HunkLensProvider implements vscode.CodeLensProvider {
  /** Lets VS Code refresh lenses when decisions change. */
  readonly onDidChangeCodeLenses = lensChanged.event;

  /** Builds the lenses for one proposed document. */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const file = fileForUri(document.uri);
    if (file === undefined || session === undefined) {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    for (const hunk of file.hunks) {
      const line = Math.min(file.newStarts[hunk.index], Math.max(0, document.lineCount - 1));
      const range = new vscode.Range(line, 0, line, 0);
      const args = { sessionId: session.id, key: hunkKey(file.path, hunk.index) };
      const decision = session.decisions.get(args.key);
      lenses.push(
        new vscode.CodeLens(range, {
          title: decision === "accept" ? "✓ Accepted" : "✓ Accept",
          command: "claudeArtifact.acceptHunk",
          arguments: [args],
        }),
        new vscode.CodeLens(range, {
          title: decision === "reject" ? "✗ Rejected" : "✗ Reject",
          command: "claudeArtifact.rejectHunk",
          arguments: [args],
        })
      );
    }
    return lenses;
  }
}

/** Records an in-memory decision from a lens click and refreshes the view. Writes nothing. */
function decide(value: Decision, arg: unknown): void {
  if (session === undefined || typeof arg !== "object" || arg === null) {
    return;
  }
  const { sessionId, key } = arg as { sessionId?: unknown; key?: unknown };
  if (sessionId !== session.id || typeof key !== "string") {
    return;
  }
  session.decisions = setDecision(session.decisions, key, value);
  lensChanged.fire();
  refreshDecorations();
  void vscode.window.setStatusBarMessage(summaryMessage(), 10000);
}

/**
 * Registers the virtual document provider, the CodeLens provider, the accept and reject
 * commands, and the decoration refresh listener. Everything is added to context.subscriptions.
 */
export function registerHunkReview(context: vscode.ExtensionContext): void {
  const contentProvider = new SessionContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(ORIGINAL_SCHEME, contentProvider),
    vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, contentProvider),
    vscode.languages.registerCodeLensProvider(
      [{ scheme: PROPOSED_SCHEME }],
      new HunkLensProvider()
    ),
    vscode.commands.registerCommand("claudeArtifact.acceptHunk", (arg: unknown) => decide("accept", arg)),
    vscode.commands.registerCommand("claudeArtifact.rejectHunk", (arg: unknown) => decide("reject", arg)),
    vscode.window.onDidChangeVisibleTextEditors(() => refreshDecorations()),
    lensChanged,
    {
      dispose: () => {
        addedType?.dispose();
        removedType?.dispose();
        addedType = undefined;
        removedType = undefined;
      },
    }
  );
}
