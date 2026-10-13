// Escaping by context (docs/template.md §12.2). Every value the engine writes
// goes through one of these: text, a double-quoted attribute value, or a URL
// attribute, whose scheme must be on the allow-list after the characters a
// browser ignores in a scheme are removed.

/** Attributes whose value a browser follows as a URL (§12.2). */
export const URL_ATTRS = new Set(["href", "src", "action", "formaction"]);

const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * Escape text content.
 * @param {string} value
 */
export function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escape a value for a double-quoted attribute.
 * @param {string} value
 */
export function escapeAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * True when a URL is safe to write: relative, or with an allowed scheme.
 * ASCII whitespace and control characters are removed first, because browsers
 * drop them before reading a scheme (`java\tscript:` is `javascript:`).
 * @param {string} value
 */
export function isSafeUrl(value) {
  const compact = value.replace(/[\u0000- \u007f]/g, "");
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact)?.[1];
  return scheme === undefined || SAFE_SCHEMES.has(scheme.toLowerCase());
}
