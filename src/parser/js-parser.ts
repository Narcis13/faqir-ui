// JS anti-pattern detector for Faqir recipe controllers

/** A violation found in a JS source file */
export interface JsViolation {
  line: number;
  text: string;
}

/**
 * Find external (non-relative) imports in component JS (anti-pattern #4).
 * Valid imports start with ./, ../, or /. Everything else is an external dep.
 */
export function findExternalImports(source: string): JsViolation[] {
  const violations: JsViolation[] = [];
  const lines = source.split("\n");
  // Match: import ... from "specifier" or import "specifier"
  const IMPORT_RE = /\bimport\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(line)) !== null) {
      const specifier = match[1];
      // Relative paths are allowed; bare specifiers are external deps
      if (!specifier.startsWith("./") && !specifier.startsWith("../") && !specifier.startsWith("/")) {
        violations.push({ line: i + 1, text: specifier });
      }
    }
  }
  return violations;
}

/**
 * Find data-fetching patterns in component JS (anti-pattern #7).
 * Flags fetch(), XMLHttpRequest, and common routing patterns.
 */
export function findDataFetching(source: string): JsViolation[] {
  const violations: JsViolation[] = [];
  const lines = source.split("\n");
  const FETCH_RE = /\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\baxios\b|\bhistory\.(push|replace)\b|\brouter\.(push|navigate)\b/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    FETCH_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FETCH_RE.exec(line)) !== null) {
      violations.push({ line: i + 1, text: match[0].trim() });
    }
  }
  return violations;
}
