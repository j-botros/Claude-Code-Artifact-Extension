/** The kind of a code token. "plain" text gets no colour; the others map to `--code-<kind>` colours. */
export type TokenKind =
  | "plain"
  | "comment"
  | "keyword"
  | "control"
  | "string"
  | "number"
  | "type"
  | "function"
  | "property"
  | "operator";

/** One piece of source text and its kind. Joining all token texts gives back the source. */
export interface CodeToken {
  kind: TokenKind;
  text: string;
}

/** Declaration and literal keywords (cyan). */
const KEYWORDS = new Set([
  "const", "let", "var", "function", "class", "interface", "type", "enum", "export", "import", "from",
  "as", "extends", "implements", "new", "this", "super", "public", "private", "protected", "readonly",
  "static", "async", "await", "null", "undefined", "true", "false", "typeof", "instanceof", "in", "of",
  "default", "declare", "abstract", "namespace", "keyof", "delete",
]);

/** Control-flow keywords (purple). */
const CONTROL = new Set([
  "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "throw", "try",
  "catch", "finally", "yield",
]);

/** Built-in type names (green). */
const BUILTIN_TYPES = new Set(["string", "number", "boolean", "void", "any", "unknown", "never", "object"]);

/** Punctuation and operator characters. */
const OPERATORS = "{}()[];,.:<>=+-*/%&|!?^~@";

/**
 * Returns true for the languages the tokeniser understands, given the short label from
 * `codeLabel` (ts, tsx, js, jsx). Other languages are shown uncoloured.
 */
export function highlightsLanguage(label: string): boolean {
  return label === "ts" || label === "tsx" || label === "js" || label === "jsx";
}

/** Returns the index of the first character after the string that starts at `start` (quote at `start`). */
function endOfString(code: string, start: number): number {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === "\\") {
      i += 2;
    } else if (code[i] === quote) {
      return i + 1;
    } else if (code[i] === "\n" && quote !== "`") {
      return i;
    } else {
      i++;
    }
  }
  return code.length;
}

/** Classifies an identifier using its text and the nearest non-space characters around it. */
function classifyWord(word: string, before: string, after: string): TokenKind {
  if (CONTROL.has(word)) {
    return "control";
  }
  if (KEYWORDS.has(word)) {
    return "keyword";
  }
  if (BUILTIN_TYPES.has(word)) {
    return "type";
  }
  if (after === "(") {
    return "function";
  }
  if (before === ".") {
    return "property";
  }
  if (/^[A-Z]/.test(word)) {
    return "type";
  }
  return "plain";
}

/**
 * Splits TypeScript or JavaScript source into coloured tokens with a small hand-written scanner.
 * It knows line and block comments, quoted and template strings, numbers, keywords, control
 * keywords, types (built-in names and capitalised words), function calls and declarations
 * (a word followed by an opening parenthesis), properties (a word after a dot), and
 * operators. Everything else is "plain". Adjacent plain pieces are merged, and the token
 * texts always join back to the exact input. It never throws.
 */
export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  /** Appends a token, merging into the previous one when both are plain. */
  const push = (kind: TokenKind, text: string): void => {
    const last = tokens[tokens.length - 1];
    if (kind === "plain" && last !== undefined && last.kind === "plain") {
      last.text += text;
    } else {
      tokens.push({ kind, text });
    }
  };
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const two = code.slice(i, i + 2);
    if (two === "//") {
      let end = code.indexOf("\n", i);
      end = end === -1 ? code.length : end;
      push("comment", code.slice(i, end));
      i = end;
    } else if (two === "/*") {
      const close = code.indexOf("*/", i + 2);
      const end = close === -1 ? code.length : close + 2;
      push("comment", code.slice(i, end));
      i = end;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      const end = endOfString(code, i);
      push("string", code.slice(i, end));
      i = end;
    } else if (/[0-9]/.test(ch)) {
      const m = /^(?:0[xX][0-9a-fA-F_]+|[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9]+)?)/.exec(code.slice(i));
      const text = m === null ? ch : m[0];
      push("number", text);
      i += text.length;
    } else if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z0-9_$]+/.exec(code.slice(i));
      const word = m === null ? ch : m[0];
      const rest = code.slice(i + word.length);
      const after = /^\s*(.)/.exec(rest)?.[1] ?? "";
      const prior = code.slice(0, i).trimEnd();
      const before = prior.length > 0 ? prior[prior.length - 1] : "";
      push(classifyWord(word, before, after), word);
      i += word.length;
    } else if (OPERATORS.includes(ch)) {
      push("operator", ch);
      i++;
    } else {
      push("plain", ch);
      i++;
    }
  }
  return tokens;
}
