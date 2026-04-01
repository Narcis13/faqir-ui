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
