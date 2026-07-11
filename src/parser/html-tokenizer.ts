// ─────────────────────────────────────────────────────────────────────────────
// html-tokenizer.ts — a small, spec-informed HTML tokenizer (task 0.5-08, §9.1)
//
// A vendored, zero-dependency scanner that replaces the previous single-regex
// tag matcher. It follows the shape of the WHATWG tokenizer state machine
// closely enough to get the cases a regex can't: HTML comments (including a
// body that contains `>` or a stray `-->`), raw-text elements (`<script>` /
// `<style>`) whose bodies must NOT be parsed as markup, quoted attribute values
// that contain `>`, void elements with or without a trailing `/`, unclosed
// tags, and CRLF input. Every token carries the byte offset AND the 1-based
// line/column of its opening `<`, so callers can report exact source positions.
//
// Complexity: a single left-to-right pass, O(n) in the source length. Position
// lookup uses a precomputed line-start index (binary search, O(log n) per
// token). No backtracking, no recursion — the only nested scans are the bounded
// attribute loop and the raw-text end-tag search. ~300 lines, no dependencies.
//
// Scope note: this is a *pragmatic* tokenizer, not a conformance-complete one.
// It intentionally does not decode character references, does not implement
// RCDATA for `<title>`/`<textarea>`, and keeps attribute names verbatim (HTML
// treats them case-insensitively, but the audit/generator callers key off the
// lowercase-in-source names they already receive). It is sized to the parser's
// job: locating elements/attributes for audit, not rendering a DOM.
// ─────────────────────────────────────────────────────────────────────────────

export type TokenType = "startTag" | "endTag" | "comment" | "doctype" | "text";

export interface Token {
  type: TokenType;
  /** Lowercased tag name for start/end tags; "" for comment/doctype/text. */
  name: string;
  /** Attributes for a start tag (names kept verbatim); empty otherwise. */
  attrs: Record<string, string>;
  /** True when a start tag had an explicit `/` before `>` (e.g. `<br/>`). */
  selfClosing: boolean;
  /** Byte offset of the token's leading `<` (or first char, for text). */
  start: number;
  /** Byte offset just past the end of the token. */
  end: number;
  /** 1-based line of `start`. */
  line: number;
  /** 1-based column of `start` (characters from the line start). */
  column: number;
}

/** Elements whose content is raw text — no markup is recognized inside them. */
export const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

const isWhitespace = (c: string): boolean =>
  c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";

const isAsciiAlpha = (c: string | undefined): boolean =>
  c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));

/**
 * Offsets at which each line begins (index 0 → line 1). Used to turn a byte
 * offset into a line/column without an O(n) rescan per token. Only `\n` starts a
 * new line, so a CR of a CRLF pair stays on its line's tail — this matches
 * `offsetToPosition` in html-parser.ts exactly.
 */
function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function positionAt(lineStarts: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
}

/**
 * From `<script>`/`<style>` content starting at `from`, find the offset of the
 * `<` that begins the matching end tag (`</script`, case-insensitive, followed
 * by whitespace, `/`, or `>`). Returns `source.length` if there is no such end
 * tag (an unclosed raw-text element runs to EOF). Everything up to that offset
 * is raw text — `<div>` and friends inside it are NOT markup.
 */
function findRawTextEnd(source: string, from: number, name: string): number {
  const n = source.length;
  const lower = name.toLowerCase();
  let i = from;
  while (i < n) {
    const lt = source.indexOf("</", i);
    if (lt === -1) return n;
    const candidate = source.slice(lt + 2, lt + 2 + name.length).toLowerCase();
    if (candidate === lower) {
      const after = source[lt + 2 + name.length];
      if (after === undefined || isWhitespace(after) || after === "/" || after === ">") {
        return lt;
      }
    }
    i = lt + 2;
  }
  return n;
}

/**
 * Parse a start or end tag whose `<` is at `start`. `isEnd` selects `</name …>`
 * (attributes are read but discarded for end tags). Returns the finished token
 * and the offset just past `>` (or EOF for an unclosed tag). Quoted attribute
 * values may contain `>` — the scan only ends the tag on an *unquoted* `>`.
 */
function parseTag(
  source: string,
  start: number,
  isEnd: boolean,
  lineStarts: number[],
): { token: Token; next: number } {
  const n = source.length;
  let i = start + (isEnd ? 2 : 1); // past "<" or "</"

  // Tag name: run until whitespace, "/", or ">".
  const nameStart = i;
  while (i < n && !isWhitespace(source[i]) && source[i] !== "/" && source[i] !== ">") i++;
  const name = source.slice(nameStart, i).toLowerCase();

  const attrs: Record<string, string> = {};
  let selfClosing = false;

  // Attribute loop (before-attribute-name state and friends, flattened).
  while (i < n) {
    while (i < n && isWhitespace(source[i])) i++;
    if (i >= n) break;

    const c = source[i];
    if (c === ">") {
      i++;
      break;
    }
    if (c === "/") {
      // A `/` here is only meaningful as the self-closing marker before `>`.
      i++;
      while (i < n && isWhitespace(source[i])) i++;
      if (source[i] === ">") {
        selfClosing = true;
        i++;
        break;
      }
      continue; // stray slash — reconsume in attribute position
    }

    // Attribute name: run until whitespace, "/", ">", or "=".
    const anStart = i;
    while (
      i < n &&
      !isWhitespace(source[i]) &&
      source[i] !== "/" &&
      source[i] !== ">" &&
      source[i] !== "="
    ) i++;
    const attrName = source.slice(anStart, i);

    while (i < n && isWhitespace(source[i])) i++;

    let value = "";
    if (source[i] === "=") {
      i++;
      while (i < n && isWhitespace(source[i])) i++;
      const q = source[i];
      if (q === '"' || q === "'") {
        i++;
        const vStart = i;
        while (i < n && source[i] !== q) i++;
        value = source.slice(vStart, i);
        if (i < n) i++; // consume the closing quote
      } else {
        const vStart = i;
        while (i < n && !isWhitespace(source[i]) && source[i] !== ">") i++;
        value = source.slice(vStart, i);
      }
    }

    if (attrName) attrs[attrName] = value; // later duplicate wins (matches prior parser)
  }

  const p = positionAt(lineStarts, start);
  return {
    token: {
      type: isEnd ? "endTag" : "startTag",
      name,
      attrs: isEnd ? {} : attrs,
      selfClosing,
      start,
      end: i,
      line: p.line,
      column: p.column,
    },
    next: i,
  };
}

const DOCTYPE_RE = /^<!doctype/i;

/**
 * Tokenize HTML source into a flat, ordered token stream. Text runs between
 * markup become `text` tokens; comments and doctypes are emitted (and skipped by
 * the tree builder); raw-text element bodies are emitted as a single `text`
 * token so their contents are never mistaken for markup.
 */
export function tokenizeHTML(source: string): Token[] {
  const tokens: Token[] = [];
  const n = source.length;
  const lineStarts = buildLineStarts(source);
  const pos = (off: number) => positionAt(lineStarts, off);

  const pushText = (s: number, e: number) => {
    if (e <= s) return;
    const p = pos(s);
    tokens.push({ type: "text", name: "", attrs: {}, selfClosing: false, start: s, end: e, line: p.line, column: p.column });
  };

  let i = 0;
  while (i < n) {
    if (source[i] !== "<") {
      const textStart = i;
      while (i < n && source[i] !== "<") i++;
      pushText(textStart, i);
      continue;
    }

    const next = source[i + 1];

    if (next === "!") {
      const start = i;
      if (source.startsWith("<!--", i)) {
        // Comment. Handle the abrupt-closing forms `<!-->` and `<!--->` (empty
        // comments) explicitly, else close at the first `-->`.
        let contentStart = i + 4;
        let end: number;
        if (source[contentStart] === ">") {
          end = contentStart + 1;
        } else if (source[contentStart] === "-" && source[contentStart + 1] === ">") {
          end = contentStart + 2;
        } else {
          const close = source.indexOf("-->", contentStart);
          end = close === -1 ? n : close + 3;
        }
        const p = pos(start);
        tokens.push({ type: "comment", name: "", attrs: {}, selfClosing: false, start, end, line: p.line, column: p.column });
        i = end;
        continue;
      }
      if (DOCTYPE_RE.test(source.slice(i, i + 9))) {
        const gt = source.indexOf(">", i);
        const end = gt === -1 ? n : gt + 1;
        const p = pos(start);
        tokens.push({ type: "doctype", name: "", attrs: {}, selfClosing: false, start, end, line: p.line, column: p.column });
        i = end;
        continue;
      }
      // Bogus comment: `<!` … `>` (e.g. a CDATA-ish or processing marker).
      const gt = source.indexOf(">", i);
      const end = gt === -1 ? n : gt + 1;
      const p = pos(start);
      tokens.push({ type: "comment", name: "", attrs: {}, selfClosing: false, start, end, line: p.line, column: p.column });
      i = end;
      continue;
    }

    if (next === "/") {
      if (isAsciiAlpha(source[i + 2])) {
        const { token, next: after } = parseTag(source, i, true, lineStarts);
        tokens.push(token);
        i = after;
        continue;
      }
      // `</` not followed by a letter (e.g. `</>`): treat the `<` as text.
      pushText(i, i + 1);
      i++;
      continue;
    }

    if (isAsciiAlpha(next)) {
      const { token, next: after } = parseTag(source, i, false, lineStarts);
      tokens.push(token);
      i = after;

      // Raw-text element: its body is text up to the matching end tag.
      if (RAW_TEXT_ELEMENTS.has(token.name) && !token.selfClosing) {
        const rawEnd = findRawTextEnd(source, i, token.name);
        pushText(i, rawEnd);
        i = rawEnd;
      }
      continue;
    }

    // `<` not starting a tag/comment/doctype (e.g. `a < b`): literal text.
    pushText(i, i + 1);
    i++;
  }

  return tokens;
}
