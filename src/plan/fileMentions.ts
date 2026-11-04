/** One piece of text: either a plain run or a file-path mention. */
export interface MentionSegment {
  /** The exact source text of this piece. */
  text: string;
  /** True when the piece is a file-path mention. */
  mention: boolean;
}

/** File extensions that make a bare token count as a path (keeps words like "e.g." out). */
const EXTENSIONS =
  "ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|css|scss|html|htm|yml|yaml|toml|txt|sh|zsh|py|go|rs|java|kt|swift|rb|php|c|h|cpp|hpp|cs|sql|xml|svg|png|vsix|lock|env|mjs|vue";

/** Escapes text for literal use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits text into plain and file-path-mention segments. A mention is either a path equal
 * to one of `knownPaths` (a plan `files[].path`), or a relative path token that ends in a
 * common file extension (for example `src/plan/plan.ts` or `package.json`). Trailing
 * punctuation such as a period or comma is not part of the mention. Joining all segment
 * texts always gives back the input.
 */
export function splitFileMentions(text: string, knownPaths: readonly string[] = []): MentionSegment[] {
  const known = knownPaths
    .filter((p) => p !== "")
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const generic = `(?:\\.{1,2}/)*(?:[\\w.@-]+/)*[\\w@-][\\w.@-]*\\.(?:${EXTENSIONS})`;
  const alternatives = [...known, generic].join("|");
  const re = new RegExp(`(?<![\\w./@-])(?:${alternatives})(?![\\w-]|\\.\\w)`, "g");
  const out: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) {
      out.push({ text: text.slice(last, start), mention: false });
    }
    out.push({ text: m[0], mention: true });
    last = start + m[0].length;
  }
  if (last < text.length) {
    out.push({ text: text.slice(last), mention: false });
  }
  return out;
}
