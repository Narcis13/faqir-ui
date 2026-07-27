// CSS token extractor — extracts var(--token-name) references from CSS files
// and collects defined custom properties from token files

/** A reference to a CSS custom property via var() */
export interface TokenReference {
  /** The token name without -- prefix */
  name: string;
  /** Line number in the source */
  line: number;
  /** The full var() expression */
  expression: string;
}

/** A defined CSS custom property */
export interface TokenDefinition {
  /** The token name without -- prefix */
  name: string;
  /** The value assigned */
  value: string;
  /** Line number in the source */
  line: number;
}

// Match var(--name) or var(--name, fallback)
const VAR_RE = /var\(\s*--([a-zA-Z][\w-]*)\s*(?:,\s*[^)]+)?\)/g;

// Match --name: value; declarations
const PROP_RE = /--([a-zA-Z][\w-]*)\s*:\s*([^;]+);/g;

// Match @media (prefers-reduced-motion: reduce)
const REDUCED_MOTION_RE = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/;

// Match hardcoded color values (hex, rgb, hsl, oklch without var())
const HARDCODED_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(|hsla?\s*\(|oklch\s*\(/g;

/**
 * Extract all var(--token) references from a CSS source string.
 */
export function extractTokenReferences(source: string): TokenReference[] {
  const refs: TokenReference[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue;

    let match: RegExpExecArray | null;
    VAR_RE.lastIndex = 0;
    while ((match = VAR_RE.exec(line)) !== null) {
      refs.push({
        name: match[1],
        line: i + 1,
        expression: match[0],
      });
    }
  }

  return refs;
}

/**
 * Extract all custom property definitions from a CSS source string.
 */
export function extractTokenDefinitions(source: string): TokenDefinition[] {
  const defs: TokenDefinition[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    PROP_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PROP_RE.exec(line)) !== null) {
      defs.push({
        name: match[1],
        value: match[2].trim(),
        line: i + 1,
      });
    }
  }

  return defs;
}

/**
 * Check if a CSS file contains a prefers-reduced-motion media query.
 */
export function hasReducedMotionQuery(source: string): boolean {
  return REDUCED_MOTION_RE.test(source);
}

/**
 * Check if a CSS file contains animation or transition properties.
 */
export function hasAnimationProperties(source: string): boolean {
  const lines = source.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith("/*") || trimmed.startsWith("//")) continue;
    // Check for animation/transition properties
    if (/\b(animation|transition)\s*:/.test(trimmed)) return true;
    if (/\b(animation-name|animation-duration|transition-property|transition-duration)\s*:/.test(trimmed)) return true;
  }
  return false;
}

/**
 * Collect all defined token names from one or more CSS sources.
 * Returns a Set of token names (without -- prefix).
 */
export function collectDefinedTokens(sources: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const source of sources) {
    for (const def of extractTokenDefinitions(source)) {
      tokens.add(def.name);
    }
  }
  return tokens;
}

// ── Anti-pattern detection ──

/** A violation found in a CSS source file */
export interface CssViolation {
  line: number;
  text: string;
}

/** Strip block comments, preserving line numbers */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    "\n".repeat((m.match(/\n/g) || []).length),
  );
}

/**
 * Find !important declarations in component CSS (anti-pattern #8).
 */
export function findImportantDeclarations(source: string): CssViolation[] {
  const violations: CssViolation[] = [];
  const lines = stripBlockComments(source).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (trimmed.includes("!important")) {
      violations.push({ line: i + 1, text: trimmed });
    }
  }
  return violations;
}

/**
 * Find class selectors (.class) in component CSS (anti-pattern #1).
 * Flags .word patterns in selector contexts (not inside strings).
 */
export function findClassSelectors(source: string): CssViolation[] {
  const violations: CssViolation[] = [];
  const lines = stripBlockComments(source).split("\n");
  // Match .word preceded by selector-context chars (start, space, comma, combinators, parens, brackets)
  const CLASS_RE = /(?:^|[\s,>+~(\[\]])(\.[a-zA-Z][\w-]*)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    CLASS_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CLASS_RE.exec(line)) !== null) {
      // Skip if inside a quoted string
      const before = line.slice(0, match.index);
      const singleQuotes = (before.match(/'/g) || []).length;
      const doubleQuotes = (before.match(/"/g) || []).length;
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) continue;
      violations.push({ line: i + 1, text: match[1] });
    }
  }
  return violations;
}

/**
 * Find ID selectors (#id) in component CSS (anti-pattern #9).
 * Excludes hex color values (#fff, #ffffff, etc.).
 */
export function findIdSelectors(source: string): CssViolation[] {
  const violations: CssViolation[] = [];
  const lines = stripBlockComments(source).split("\n");
  // Match #word where word starts with a letter or underscore
  const ID_RE = /#([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  // Valid hex color patterns (only hex digits, length 3/4/6/8)
  const HEX_COLOR_RE = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    ID_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ID_RE.exec(line)) !== null) {
      if (HEX_COLOR_RE.test(match[1])) continue; // hex color
      violations.push({ line: i + 1, text: `#${match[1]}` });
    }
  }
  return violations;
}

/**
 * Find hardcoded color values in component CSS (anti-pattern #2).
 * Flags hex colors, rgb(), hsl(), oklch() used directly in property values,
 * but skips token definitions (lines starting with --) and values inside var().
 */
export function findHardcodedColorValues(source: string): CssViolation[] {
  const violations: CssViolation[] = [];
  const lines = stripBlockComments(source).split("\n");
  const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(|hsla?\s*\(|oklch\s*\(/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    // Only check property declaration context (: after { if { present, or : anywhere if no {)
    const braceIdx = line.indexOf("{");
    const searchFrom = braceIdx >= 0 ? braceIdx : 0;
    const colonAfterBrace = line.indexOf(":", searchFrom);
    if (colonAfterBrace < 0) continue;
    // Skip token/alias definitions (--name: value) — check trimmed or the part after {
    const declPart = braceIdx >= 0 ? line.slice(braceIdx).trim().slice(1).trim() : trimmed;
    if (declPart.startsWith("--")) continue;
    COLOR_RE.lastIndex = searchFrom;
    let match: RegExpExecArray | null;
    while ((match = COLOR_RE.exec(line)) !== null) {
      // Skip if inside var() — count unmatched var( before this position
      const before = line.slice(0, match.index);
      const varOpens = (before.match(/\bvar\s*\(/g) || []).length;
      const closes = (before.match(/\)/g) || []).length;
      if (varOpens > closes) continue;
      violations.push({ line: i + 1, text: match[0] });
    }
  }
  return violations;
}

// ── Selector + at-rule structure (task 0.8-10) ──
//
// Two rules need to read a stylesheet's *shape* rather than its declarations:
// `undeclared-attribute` needs every attribute a selector matches on, and
// `breakpoint-canon` needs every `@media`/`@container` prelude. Both live here,
// beside the other source scanners, and both are pure string→data functions with
// no `node:*` reachable from them — the audit bundles for the browser.

/** One attribute condition found in a selector. */
export interface SelectedAttribute {
  /** Attribute name as written, e.g. `data-cols-md`. */
  attr: string;
  /** Value the selector matches, or `null` for a bareword `[data-wrap]`. */
  value: string | null;
  /** 1-based line of the attribute's own `[`. */
  line: number;
  /** The single selector (one comma-separated branch) it appeared in. */
  selector: string;
}

/** An `@media` / `@container` prelude, whitespace-normalized. */
export interface AtRulePrelude {
  kind: "media" | "container";
  /** Everything between the at-keyword and the `{`, e.g. `(min-width: 48rem)`. */
  text: string;
  /** 1-based line of the `@`. */
  line: number;
}

// `[name]`, `[name="v"]`, `[name='v']`, `[name=v]`, and the `~= |= ^= $= *=`
// matchers. Deliberately tolerant of whitespace: `[ data-wrap ]` is legal CSS.
const ATTR_SELECTOR_RE =
  /\[\s*([A-Za-z_][\w:.-]*)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*)?[is]?\s*\]/g;

/** Offsets of every newline, for O(log n) offset → 1-based line lookups. */
function lineIndex(source: string): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") offsets.push(i);
  return offsets;
}

function lineAt(newlines: number[], offset: number): number {
  let lo = 0;
  let hi = newlines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (newlines[mid] < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

/**
 * Walk a stylesheet's rule preludes, handing each one to `visit`.
 *
 * A "prelude" is the text between the previous block delimiter and a `{` — a
 * selector list for a style rule, or the condition of an at-rule. Declaration
 * bodies are skipped (the buffer resets at `;` and `}`), quoted strings are
 * passed through intact so a `content: "}"` cannot desynchronize the walk, and
 * nesting is handled by construction: an at-rule's children are ordinary
 * preludes one level down.
 */
function eachPrelude(
  source: string,
  visit: (text: string, start: number, lineOf: (offset: number) => number) => void,
): void {
  // `stripBlockComments` replaces each comment with its own newlines, so a line
  // number measured on the stripped source is the line number in the original —
  // but a byte OFFSET is not, which is why the index is built from the stripped
  // text and never from `source`.
  const css = stripBlockComments(source);
  const newlines = lineIndex(css);
  const lineOf = (offset: number) => lineAt(newlines, offset);
  let buffer = "";
  let start = -1;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      buffer += c;
      if (c === quote && css[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      if (start < 0) start = i;
      buffer += c;
      continue;
    }
    if (c === "{") {
      if (buffer.trim()) visit(buffer, start < 0 ? i : start, lineOf);
      buffer = "";
      start = -1;
      continue;
    }
    if (c === "}" || c === ";") {
      buffer = "";
      start = -1;
      continue;
    }
    if (start < 0 && !/\s/.test(c)) start = i;
    buffer += c;
  }
}

/**
 * Every attribute condition every selector in the sheet matches on (task 0.8-10).
 *
 * Includes attributes on descendants and children (`[data-ui="x"] > [data-span]`)
 * and inside functional pseudo-classes (`:not([data-col-hidden])`,
 * `:has([data-dragging])`) — a component styles what it selects, wherever in the
 * subtree that is, so the `undeclared-attribute` contract has to see all of it.
 * At-rule preludes are not selectors and are never scanned.
 */
export function findSelectedAttributes(source: string): SelectedAttribute[] {
  const found: SelectedAttribute[] = [];

  eachPrelude(source, (text, start, lineOf) => {
    if (text.trimStart().startsWith("@")) return; // at-rule condition, not a selector
    // Split into comma-separated branches, keeping each branch's own offset so a
    // multi-line selector list reports the line the attribute is really on.
    let branchStart = 0;
    const branches: Array<{ text: string; offset: number }> = [];
    for (let i = 0; i <= text.length; i++) {
      if (i === text.length || text[i] === ",") {
        branches.push({ text: text.slice(branchStart, i), offset: branchStart });
        branchStart = i + 1;
      }
    }
    for (const branch of branches) {
      const selector = branch.text.trim().replace(/\s+/g, " ");
      if (!selector) continue;
      ATTR_SELECTOR_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = ATTR_SELECTOR_RE.exec(branch.text)) !== null) {
        const value = match[2] ? (match[3] ?? match[4] ?? match[5] ?? "") : null;
        found.push({
          attr: match[1],
          value,
          line: lineOf(start + branch.offset + match.index),
          selector,
        });
      }
    }
  });

  return found;
}

/** Every `@media` / `@container` prelude in the sheet, in document order. */
export function findAtRulePreludes(source: string): AtRulePrelude[] {
  const found: AtRulePrelude[] = [];

  eachPrelude(source, (text, start, lineOf) => {
    const m = /^@(media|container)\b([^]*)$/.exec(text.trim());
    if (!m) return;
    found.push({
      kind: m[1] as "media" | "container",
      text: m[2].trim().replace(/\s+/g, " "),
      line: lineOf(start),
    });
  });

  return found;
}

// ── Logical properties detection (task 0.3-09) ──
//
// Physical, direction-bound CSS properties (margin-left, padding-right,
// left/right offsets, border-*-left/right*, corner radii, text-align: left|right)
// break in right-to-left locales. Their logical equivalents (margin-inline-start,
// inset-inline-end, border-start-end-radius, text-align: start, …) flip
// automatically with the writing direction. Every mapping below is 1:1, so
// `faqir repair` can rewrite them deterministically.

/** 1:1 physical → logical CSS property renames. Keys are lowercase property names. */
export const PHYSICAL_TO_LOGICAL_PROPERTY: Record<string, string> = {
  "margin-left": "margin-inline-start",
  "margin-right": "margin-inline-end",
  "padding-left": "padding-inline-start",
  "padding-right": "padding-inline-end",
  "left": "inset-inline-start",
  "right": "inset-inline-end",
  "border-left": "border-inline-start",
  "border-right": "border-inline-end",
  "border-left-width": "border-inline-start-width",
  "border-right-width": "border-inline-end-width",
  "border-left-style": "border-inline-start-style",
  "border-right-style": "border-inline-end-style",
  "border-left-color": "border-inline-start-color",
  "border-right-color": "border-inline-end-color",
  "border-top-left-radius": "border-start-start-radius",
  "border-top-right-radius": "border-start-end-radius",
  "border-bottom-left-radius": "border-end-start-radius",
  "border-bottom-right-radius": "border-end-end-radius",
};

/** 1:1 physical → logical values for `text-align`. */
export const PHYSICAL_TO_LOGICAL_TEXT_ALIGN: Record<string, string> = {
  left: "start",
  right: "end",
};

/**
 * Escape hatch: a rule scoped to an explicit writing direction — e.g.
 * `[dir="ltr"]` or `[dir=rtl]` — has opted into physical directions on purpose,
 * so declarations inside it are never flagged.
 */
const DIR_SCOPE_RE = /\[\s*dir\s*(?:[~|^$*]?=)\s*["']?(?:ltr|rtl)["']?\s*\]/i;

/** A physical-direction property (or text-align value) that has a logical replacement. */
export interface LogicalPropertyViolation {
  line: number;
  /** "property" = rename the property; "value" = swap a text-align value. */
  kind: "property" | "value";
  /** The CSS property, e.g. "margin-left" or "text-align". */
  property: string;
  /** The physical token to replace: the property (kind "property") or the value (kind "value"). */
  physical: string;
  /** The logical replacement token. */
  logical: string;
  /** Human-readable "from" / "to" for the finding message, e.g. "margin-left" → "margin-inline-start". */
  from: string;
  to: string;
}

/**
 * Find physical, direction-bound properties in component CSS (task 0.3-09).
 *
 * Scans declaration-by-declaration, tracking the enclosing selector stack so the
 * `[dir="ltr"|"rtl"]` escape hatch can be honored. Skips comments (stripped),
 * strings, custom properties (`--foo`), at-rule preludes, and anything inside a
 * direction-scoped block. Values inside `url()`/`calc()` are left intact.
 */
export function findLogicalPropertyViolations(source: string): LogicalPropertyViolation[] {
  const violations: LogicalPropertyViolation[] = [];
  const stripped = stripBlockComments(source);

  const selectorStack: string[] = [];
  const dirScoped = () => selectorStack.some(sel => DIR_SCOPE_RE.test(sel));

  let buffer = "";
  let declLine = 0; // line of the first non-whitespace char in the current buffer
  let line = 1;
  let inString: '"' | "'" | null = null;
  let parenDepth = 0;

  const flush = () => {
    if (buffer.trim() && declLine > 0) processDeclaration(buffer, declLine);
    buffer = "";
    declLine = 0;
  };

  const processDeclaration = (decl: string, atLine: number) => {
    const trimmed = decl.trim();
    const colon = trimmed.indexOf(":");
    if (colon < 0) return;
    const prop = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    // Ignore at-rules (@media …), custom properties (--foo), and nesting refs (&…).
    if (!prop || prop.startsWith("@") || prop.startsWith("--") || prop.startsWith("&")) return;
    if (dirScoped()) return; // escape hatch

    if (prop in PHYSICAL_TO_LOGICAL_PROPERTY) {
      const logical = PHYSICAL_TO_LOGICAL_PROPERTY[prop];
      violations.push({ line: atLine, kind: "property", property: prop, physical: prop, logical, from: prop, to: logical });
      return;
    }

    if (prop === "text-align") {
      // First value token, minus any !important / trailing tokens.
      const first = value.split(/[\s!]/)[0]?.toLowerCase() ?? "";
      if (first in PHYSICAL_TO_LOGICAL_TEXT_ALIGN) {
        const logical = PHYSICAL_TO_LOGICAL_TEXT_ALIGN[first];
        violations.push({
          line: atLine,
          kind: "value",
          property: "text-align",
          physical: first,
          logical,
          from: `text-align: ${first}`,
          to: `text-align: ${logical}`,
        });
      }
    }
  };

  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (c === "\n") line++;

    if (inString) {
      buffer += c;
      if (c === inString && stripped[i - 1] !== "\\") inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      buffer += c;
      if (declLine === 0) declLine = line;
      continue;
    }
    if (c === "(") { parenDepth++; buffer += c; if (declLine === 0) declLine = line; continue; }
    if (c === ")") { parenDepth = Math.max(0, parenDepth - 1); buffer += c; continue; }
    if (parenDepth > 0) { buffer += c; continue; } // inside url()/calc() — ignore delimiters

    if (c === "{") {
      selectorStack.push(buffer.trim());
      buffer = "";
      declLine = 0;
      continue;
    }
    if (c === "}") {
      flush();
      selectorStack.pop();
      continue;
    }
    if (c === ";") {
      flush();
      continue;
    }

    buffer += c;
    if (declLine === 0 && !/\s/.test(c)) declLine = line;
  }

  return violations;
}
