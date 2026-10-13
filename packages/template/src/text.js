// Interpolated text (docs/template.md §6). Splits inline text, piped text and
// quoted attribute literals into parts: literal strings and `{{ expr }}` holes.
// `\{{` is the only escape. A hole ends at the `}}` after a complete
// expression, so a string literal inside a hole may itself contain `}}`.

import { report } from "./diagnostics.js";
import { parseExpression } from "./expr.js";

/**
 * Parse text from `start` up to the end of `src`, or up to the first `stop`
 * character outside a hole (for attribute literals). Returns the parts and the
 * index of the `stop` character (or `src.length`), or null after a diagnostic.
 * `line`/`colBase` place `src[0]` in the template.
 * @param {string} src
 * @param {number} start
 * @param {import("./diagnostics.js").Context} ctx
 * @param {number} line
 * @param {number} colBase
 * @param {string} [stop]
 * @returns {{ parts: Array<string | { expr: any }>, end: number } | null}
 */
export function parseText(src, start, ctx, line, colBase, stop) {
  /** @type {Array<string | { expr: any }>} */
  const parts = [];
  let literal = "";
  let i = start;
  while (i < src.length && src[i] !== stop) {
    if (src.startsWith("\\{{", i)) { literal += "{{"; i += 3; continue; }
    if (!src.startsWith("{{", i)) { literal += src[i++]; continue; }
    if (literal) parts.push(literal);
    literal = "";
    const hole = parseHole(src, i, ctx, line, colBase);
    if (!hole) return null;
    parts.push({ expr: hole.node });
    i = hole.end;
  }
  if (literal) parts.push(literal);
  return { parts, end: i };
}

/**
 * Parse the hole opening at `open` (the index of `{{`). Returns the expression
 * and the index after the closing `}}`, or null after a diagnostic.
 * @param {string} src
 * @param {number} open
 * @param {import("./diagnostics.js").Context} ctx
 * @param {number} line
 * @param {number} colBase
 */
function parseHole(src, open, ctx, line, colBase) {
  const body = open + 2;
  const close = /^ *\}\}/.exec(src.slice(body));
  if (close) {
    report(ctx, "bad-hole", "empty {{ }} hole", line, colBase + open);
    return null;
  }
  if (!src.includes("}}", body)) {
    report(ctx, "bad-hole", "{{ without a closing }}", line, colBase + open);
    return null;
  }
  const parsed = parseExpression(src, body, ctx, line, colBase);
  if (!parsed) return null;
  const after = /^ *\}\}/.exec(src.slice(parsed.end));
  if (!after) {
    const at = parsed.end + (/^ */.exec(src.slice(parsed.end))?.[0].length ?? 0);
    report(ctx, "bad-expr", `unexpected "${src[at]}" in a hole`, line, colBase + at);
    return null;
  }
  return { node: parsed.node, end: parsed.end + after[0].length };
}
