import * as vscode from "vscode";
import { applyAcceptedHunks } from "../plan/applyHunks";
import { DiffHunk, splitHunks } from "../plan/diffHunks";
import { Decision, setDecision, summarizeDecisions } from "../plan/hunkDecisions";
import { InlineView, LineSpan, buildInlineView } from "../plan/inlineReview";
import { ACCEPT_MARKER, REJECT_MARKER } from "../plan/decisionMarkers";
import { Plan, isSafeRelativePath } from "../plan/plan";
import { listPendingPaths, pickNextPath } from "../plan/nextChange";

/** Result of starting a review: a message for the status line, and whether it worked. */
export type ReviewResult = { ok: true; message: string } | { ok: false; message: string };

/** URI scheme for the read-only inline review document (real file name, virtual content). */
const INLINE_SCHEME = "claude-artifact-inline";

/** One reviewed file: its original text, its hunks, and its inline document URI. */
interface ReviewFile {
  path: string;
  originalText: string;
  hunks: DiffHunk[];
  /** True when the file does not exist in the workspace yet. */
  isNew: boolean;
  /** URI of the virtual inline document. */
  uri: vscode.Uri;
}

/** One review session: the files and the in-memory accept/reject decisions. */
interface ReviewSession {
  id: number;
  /** The workspace folder the paths are relative to. */
  folder: vscode.Uri;
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

/** Decoration for the blue accept marker on a hunk's first line. Created on first use. */
let acceptMarkerType: vscode.TextEditorDecorationType | undefined;

/** Decoration for the red reject marker on a hunk's first line. Created on first use. */
let rejectMarkerType: vscode.TextEditorDecorationType | undefined;

/**
 * Returns the two marker decoration types (one per glyph, so both render on the same line),
 * creating them from theme colours once.
 */
function markerTypes(): { accept: vscode.TextEditorDecorationType; reject: vscode.TextEditorDecorationType } {
  acceptMarkerType ??= vscode.window.createTextEditorDecorationType({
    before: {
      contentText: ACCEPT_MARKER.glyph,
      color: new vscode.ThemeColor(ACCEPT_MARKER.colorId),
      margin: "0 0.4em 0 0",
    },
  });
  rejectMarkerType ??= vscode.window.createTextEditorDecorationType({
    before: {
      contentText: REJECT_MARKER.glyph,
      color: new vscode.ThemeColor(REJECT_MARKER.colorId),
      margin: "0 0.4em 0 0",
    },
  });
  return { accept: acceptMarkerType, reject: rejectMarkerType };
}

/**
 * Returns the two decoration types, creating them from VS Code theme colours once.
 * Each type also sets an overview ruler colour so hunks show on the scrollbar strip.
 */
function decorationTypes(): { added: vscode.TextEditorDecorationType; removed: vscode.TextEditorDecorationType } {
  addedType ??= vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("diffEditor.insertedLineBackground"),
    overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.addedForeground"),
  });
  removedType ??= vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("diffEditor.removedLineBackground"),
    overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.deletedForeground"),
  });
  return { added: addedType, removed: removedType };
}

/** The "Next change (N)" status bar item. Created once in registerHunkReview. */
let nextChangeItem: vscode.StatusBarItem | undefined;

/** Returns the number of session files that still have a pending hunk (0 with no session). */
export function pendingFileCount(): number {
  return pendingPaths().length;
}

/** Lists the session's paths with a pending hunk, in plan order. */
function pendingPaths(): string[] {
  if (session === undefined) {
    return [];
  }
  const files = [...session.files.values()].map((f) => ({ path: f.path, hunkCount: f.hunks.length }));
  return listPendingPaths(files, new Set(session.decisions.keys()));
}

/** Shows the status bar item with the pending count while a session exists, and hides it otherwise. */
function refreshNextChangeItem(): void {
  if (nextChangeItem === undefined) {
    return;
  }
  if (session === undefined) {
    nextChangeItem.hide();
    return;
  }
  nextChangeItem.text = `Next change (${pendingFileCount()})`;
  nextChangeItem.show();
}

/**
 * Opens the next file with a pending hunk, in plan order, starting after the active editor's
 * file when it is a review document. Shows an information message when nothing is pending.
 */
export async function openNextChange(): Promise<void> {
  if (session === undefined) {
    return;
  }
  const pending = pendingPaths();
  const allPaths = [...session.files.keys()];
  const active = vscode.window.activeTextEditor;
  const activeFile = active === undefined ? undefined : fileForUri(active.document.uri);
  const next = pickNextPath(allPaths, pending, activeFile?.path);
  const target = next === undefined ? undefined : session.files.get(next);
  if (target === undefined) {
    void vscode.window.showInformationMessage("No pending changes to review.");
    return;
  }
  await vscode.window.showTextDocument(target.uri, { preview: false });
}

/** Builds the key used for one hunk's decision: "<path>#<hunk index>". */
function hunkKey(path: string, index: number): string {
  return `${path}#${index}`;
}

/** Builds the inline document URI for a path. The path is the real file's, so title and language match. */
function inlineUri(path: string, sessionId: number): vscode.Uri {
  return vscode.Uri.from({ scheme: INLINE_SCHEME, path: `/${path}`, query: `session=${sessionId}` });
}

/** Finds the reviewed file that owns an inline document URI. */
function fileForUri(uri: vscode.Uri): ReviewFile | undefined {
  if (session === undefined) {
    return undefined;
  }
  for (const file of session.files.values()) {
    if (file.uri.toString() === uri.toString()) {
      return file;
    }
  }
  return undefined;
}

/** Computes the inline view of one file from the current in-memory decisions. */
function viewFor(s: ReviewSession, file: ReviewFile): InlineView {
  const rejected = new Set<number>();
  for (const hunk of file.hunks) {
    if (s.decisions.get(hunkKey(file.path, hunk.index)) === "reject") {
      rejected.add(hunk.index);
    }
  }
  return buildInlineView(file.originalText, file.hunks, rejected);
}

/** Turns a line span into a whole-line range. */
function spanRange(span: LineSpan): vscode.Range {
  return new vscode.Range(span.start, 0, span.start + span.count - 1, 0);
}

/** Paints green (added) and red (removed) lines on every visible inline editor of the session. */
function refreshDecorations(): void {
  const types = decorationTypes();
  const markers = markerTypes();
  for (const editor of vscode.window.visibleTextEditors) {
    const file = fileForUri(editor.document.uri);
    if (file === undefined || session === undefined) {
      editor.setDecorations(types.added, []);
      editor.setDecorations(types.removed, []);
      editor.setDecorations(markers.accept, []);
      editor.setDecorations(markers.reject, []);
      continue;
    }
    const added: vscode.Range[] = [];
    const removed: vscode.Range[] = [];
    const markerRanges: vscode.Range[] = [];
    for (const range of viewFor(session, file).hunks) {
      const line = Math.min(range.firstLine, Math.max(0, editor.document.lineCount - 1));
      markerRanges.push(new vscode.Range(line, 0, line, 0));
      if (range.added !== null) {
        added.push(spanRange(range.added));
      }
      if (range.removed !== null) {
        removed.push(spanRange(range.removed));
      }
    }
    editor.setDecorations(types.added, added);
    editor.setDecorations(types.removed, removed);
    editor.setDecorations(markers.accept, markerRanges);
    editor.setDecorations(markers.reject, markerRanges);
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
 * Starts the hunk review for a plan's proposedFiles: opens a read-only inline document per
 * changed file, paints hunks green or red, and offers Accept and Reject lenses. Reads files only; never
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
      files.set(item.path, {
        path: item.path,
        originalText,
        hunks,
        isNew: original === null,
        uri: inlineUri(item.path, id),
      });
      total += hunks.length;
    }
    if (files.size === 0) {
      return { ok: false, message: "The proposed files match the current files. No changes to review." };
    }
    session = { id, folder, files, decisions: new Map(), total };
    lensChanged.fire();
    refreshNextChangeItem();
    for (const file of files.values()) {
      contentChanged.fire(file.uri);
      await vscode.window.showTextDocument(file.uri, { preview: false });
    }
    refreshDecorations();
    return { ok: true, message: summaryMessage() };
  } catch (err) {
    return { ok: false, message: `Could not start the review: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Fires when an inline document's text must be rebuilt (a decision changed). */
const contentChanged = new vscode.EventEmitter<vscode.Uri>();

/** Serves the inline document text from the current session's hunks and decisions. */
class SessionContentProvider implements vscode.TextDocumentContentProvider {
  /** Lets VS Code reload an inline document when its text is rebuilt. */
  readonly onDidChange = contentChanged.event;

  /** Returns the inline text for a virtual URI, or "" when unknown. */
  provideTextDocumentContent(uri: vscode.Uri): string {
    const file = fileForUri(uri);
    if (file === undefined || session === undefined) {
      return "";
    }
    return viewFor(session, file).text;
  }
}

/** Gives each hunk in an inline document an Accept and a Reject lens above its first line. */
class HunkLensProvider implements vscode.CodeLensProvider {
  /** Lets VS Code refresh lenses when decisions change. */
  readonly onDidChangeCodeLenses = lensChanged.event;

  /** Builds the lenses for one inline document. */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const file = fileForUri(document.uri);
    if (file === undefined || session === undefined) {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    const accepted = summarizeDecisions(session.total, session.decisions).accepted;
    lenses.push(
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        title: `▶ Apply accepted (${accepted})`,
        command: "claudeArtifact.applyAccepted",
        arguments: [{ sessionId: session.id }],
      })
    );
    const view = viewFor(session, file);
    for (const hunk of file.hunks) {
      const line = Math.min(view.hunks[hunk.index].firstLine, Math.max(0, document.lineCount - 1));
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
  for (const file of session.files.values()) {
    if (key.startsWith(`${file.path}#`)) {
      contentChanged.fire(file.uri);
    }
  }
  lensChanged.fire();
  refreshDecorations();
  refreshNextChangeItem();
  void vscode.window.setStatusBarMessage(summaryMessage(), 10000);
}

/** True once the user has clicked Apply in the write confirmation during this extension session. */
let confirmedThisSession = false;

/**
 * Clears the remembered write confirmation so the next apply prompts again.
 * Read by integration tests; the extension does not use it.
 */
export function resetApplyConfirmationForTests(): void {
  confirmedThisSession = false;
}

/** True while an apply run is in progress, so a second click cannot start a second run. */
let applying = false;

/** The outcome for one file after an apply run. */
interface FileResult {
  path: string;
  status: "written" | "skipped" | "failed";
  /** One-line detail for the summary message. */
  detail: string;
}

/** Counts the accepted hunks of one reviewed file. */
function acceptedCount(s: ReviewSession, file: ReviewFile): number {
  return file.hunks.filter((h) => s.decisions.get(hunkKey(file.path, h.index)) === "accept").length;
}

/**
 * Writes one file's accepted hunks through a WorkspaceEdit, after the path, freshness, and
 * unsaved-changes checks. Returns the per-file result. Never throws.
 */
async function writeOneFile(s: ReviewSession, file: ReviewFile): Promise<FileResult> {
  const path = file.path;
  try {
    if (!isSafeRelativePath(path)) {
      return { path, status: "skipped", detail: "unsafe path" };
    }
    const uri = vscode.Uri.joinPath(s.folder, ...path.split("/").filter((seg) => seg !== "" && seg !== "."));
    const root = s.folder.toString().replace(/\/$/, "") + "/";
    if (!uri.toString().startsWith(root)) {
      return { path, status: "skipped", detail: "path is outside the workspace folder" };
    }
    const isNew = file.isNew;
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open !== undefined && open.isDirty) {
      return { path, status: "skipped", detail: "has unsaved changes" };
    }
    const current = await readOriginal(uri);
    if (isNew ? current !== null : current !== file.originalText) {
      return { path, status: "skipped", detail: "changed since review" };
    }
    const result = applyAcceptedHunks(file.originalText, file.hunks, s.decisions, path);
    if (result.applied === 0) {
      return { path, status: "skipped", detail: "no accepted hunks" };
    }
    const edit = new vscode.WorkspaceEdit();
    if (isNew) {
      const parts = path.split("/").filter((seg) => seg !== "" && seg !== ".");
      if (parts.length > 1) {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(s.folder, ...parts.slice(0, -1)));
      }
      edit.createFile(uri, { ignoreIfExists: false });
      edit.insert(uri, new vscode.Position(0, 0), result.text);
    } else {
      const doc = await vscode.workspace.openTextDocument(uri);
      const lines = file.originalText.split("\n");
      const full = doc.validateRange(new vscode.Range(0, 0, lines.length - 1, lines[lines.length - 1].length));
      edit.replace(uri, full, result.text);
    }
    if (!(await vscode.workspace.applyEdit(edit))) {
      return { path, status: "failed", detail: "VS Code did not apply the edit" };
    }
    const saved = await vscode.workspace.openTextDocument(uri);
    await saved.save();
    return { path, status: "written", detail: `wrote ${result.applied} hunk${result.applied === 1 ? "" : "s"}` };
  } catch (err) {
    return { path, status: "failed", detail: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }
}

/**
 * Handles the Apply lens: confirms once per extension session, then writes only the accepted
 * hunks, one file at a time, and reports per-file results. Never throws.
 */
async function applyAccepted(arg: unknown): Promise<void> {
  try {
    const current = session;
    if (current === undefined || applying || typeof arg !== "object" || arg === null) {
      return;
    }
    if ((arg as { sessionId?: unknown }).sessionId !== current.id) {
      return;
    }
    const targets = [...current.files.values()].filter((f) => acceptedCount(current, f) > 0);
    if (targets.length === 0) {
      void vscode.window.showInformationMessage("No hunks accepted. Nothing to write.");
      return;
    }
    if (!confirmedThisSession) {
      const list = targets.map((f) => `${f.path}: ${acceptedCount(current, f)} hunk(s)`).join("\n");
      const choice = await vscode.window.showWarningMessage(
        "Write the accepted hunks to these files in your workspace?",
        { modal: true, detail: list },
        "Apply"
      );
      if (choice !== "Apply") {
        return;
      }
      confirmedThisSession = true;
    }
    if (session !== current) {
      return;
    }
    applying = true;
    const results: FileResult[] = [];
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Applying accepted hunks", cancellable: false },
        async (progress) => {
          for (const file of targets) {
            progress.report({ message: file.path });
            results.push(await writeOneFile(current, file));
          }
        }
      );
    } finally {
      applying = false;
    }
    const lines = results.map((r) => (r.status === "written" ? `${r.path}: ${r.detail}` : `${r.path}: ${r.status} (${r.detail})`));
    void vscode.window.showInformationMessage(lines.join("\n"));
    if (results.some((r) => r.status === "written") && session === current) {
      session = undefined;
      lensChanged.fire();
      refreshDecorations();
      refreshNextChangeItem();
    }
  } catch (err) {
    applying = false;
    void vscode.window.showErrorMessage(`Could not apply: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Registers the virtual document provider, the CodeLens provider, the accept and reject
 * commands, and the decoration refresh listener. Everything is added to context.subscriptions.
 */
export function registerHunkReview(context: vscode.ExtensionContext): void {
  const contentProvider = new SessionContentProvider();
  nextChangeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  nextChangeItem.command = "claudeArtifact.nextChange";
  nextChangeItem.tooltip = "Open the next file with a pending change";
  refreshNextChangeItem();
  context.subscriptions.push(
    nextChangeItem,
    vscode.commands.registerCommand("claudeArtifact.nextChange", () => openNextChange()),
    vscode.workspace.registerTextDocumentContentProvider(INLINE_SCHEME, contentProvider),
    vscode.languages.registerCodeLensProvider(
      [{ scheme: INLINE_SCHEME }],
      new HunkLensProvider()
    ),
    vscode.commands.registerCommand("claudeArtifact.acceptHunk", (arg: unknown) => decide("accept", arg)),
    vscode.commands.registerCommand("claudeArtifact.rejectHunk", (arg: unknown) => decide("reject", arg)),
    vscode.commands.registerCommand("claudeArtifact.applyAccepted", (arg: unknown) => applyAccepted(arg)),
    vscode.window.onDidChangeVisibleTextEditors(() => refreshDecorations()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.scheme === INLINE_SCHEME) {
        refreshDecorations();
      }
    }),
    lensChanged,
    contentChanged,
    {
      dispose: () => {
        nextChangeItem = undefined;
        addedType?.dispose();
        removedType?.dispose();
        addedType = undefined;
        removedType = undefined;
        acceptMarkerType?.dispose();
        rejectMarkerType?.dispose();
        acceptMarkerType = undefined;
        rejectMarkerType = undefined;
      },
    }
  );
}
