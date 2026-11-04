/** The five callout kinds, in the order they are documented. */
export const CALLOUT_MARKERS = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;

/** One of the five callout marker names. */
export type CalloutMarker = (typeof CALLOUT_MARKERS)[number];

/** A text block that starts with a callout marker, split into its parts. */
export interface Callout {
  /** The marker name, for example "NOTE". */
  marker: CalloutMarker;
  /** The CSS class suffix for the kind, for example "note". */
  kind: string;
  /** The exact text removed from the start: the marker, the colon, and the whitespace after it. */
  prefix: string;
  /** The text after the prefix, shown as the callout body. May be empty. */
  body: string;
}

/**
 * Detects a callout marker at the very start of a text. The match is case-sensitive and
 * needs a colon right after the marker. Returns null when the text is not a callout.
 * Joining `prefix` and `body` gives back the original text.
 */
export function splitCallout(text: string): Callout | null {
  const match = /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\s*/.exec(text);
  if (match === null) {
    return null;
  }
  const marker = match[1] as CalloutMarker;
  return { marker, kind: marker.toLowerCase(), prefix: match[0], body: text.slice(match[0].length) };
}

/** Short file-type labels for common language names, keyed by the lowercased language. */
const CODE_LABELS: Readonly<Record<string, string>> = {
  typescript: "ts",
  typescriptreact: "tsx",
  javascript: "js",
  javascriptreact: "jsx",
  python: "py",
  ruby: "rb",
  rust: "rs",
  golang: "go",
  bash: "sh",
  shell: "sh",
  shellscript: "sh",
  zsh: "sh",
  markdown: "md",
  yaml: "yml",
  csharp: "cs",
  "c#": "cs",
  "c++": "cpp",
  kotlin: "kt",
  powershell: "ps1",
};

/**
 * Returns the short label shown on a code block. Known languages map to their usual file
 * type (typescript to ts); unknown ones are kept, lowercased and trimmed.
 */
export function codeLabel(language: string): string {
  const key = language.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CODE_LABELS, key) ? CODE_LABELS[key] : key;
}
