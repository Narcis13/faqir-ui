// Attribute lists (docs/template.md §5): the `( … )` after a tag, a call or an
// include. Each attribute is bare, a quoted literal that may hold holes, or an
// expression. Expressions need no delimiter: the expression parser stops at
// the first token that cannot continue it, so `(href=page.url title=x)` reads
// as two attributes.

import { report } from "./diagnostics.js";
import { parseExpression } from "./expr.js";
import { parseText } from "./text.js";

const NAME = /^[A-Za-z_:@][^\s=(),"']*/;

/**
 * @typedef {true | { parts: Array<string | { expr: any }> } | { expr: any }} AttrValue
 * @typedef {{ name: string, value: AttrValue, col: number }} ParsedAttr
 */

/**
 * Parse the attribute list whose `(` is at `open` in a line's text.
 * Returns the attributes and the index after `)`, or null after a diagnostic.
 * @param {string} src
 * @param {number} open
 * @param {import("./diagnostics.js").Context} ctx
 * @param {number} line
 * @param {number} colBase
 * @returns {{ attrs: ParsedAttr[], end: number } | null}
 */
export function parseAttrs(src, open, ctx, line, colBase) {
  /** @type {ParsedAttr[]} */
  const attrs = [];
  let i = open + 1;
  for (;;) {
    while (src[i] === " " || src[i] === ",") i++;
    if (i >= src.length) {
      report(ctx, "bad-attr", "attribute list is missing its )", line, colBase + open);
      return null;
    }
    if (src[i] === ")") return { attrs, end: i + 1 };
    const attr = parseAttr(src, i, ctx, line, colBase);
    if (!attr) return null;
    if (attrs.some((a) => a.name === attr.attr.name)) {
      report(ctx, "duplicate-attr", `attribute "${attr.attr.name}" is given twice`, line, colBase + i);
      return null;
    }
    attrs.push(attr.attr);
    i = attr.end;
  }
}

/**
 * Parse one `name`, `name="literal"` or `name=expr` at `start`.
 * @param {string} src
 * @param {number} start
 * @param {import("./diagnostics.js").Context} ctx
 * @param {number} line
 * @param {number} colBase
 * @returns {{ attr: ParsedAttr, end: number } | null}
 */
function parseAttr(src, start, ctx, line, colBase) {
  const name = NAME.exec(src.slice(start))?.[0];
  if (!name) {
    report(ctx, "bad-attr", `"${src[start]}" cannot start an attribute name`, line, colBase + start);
    return null;
  }
  const col = colBase + start;
  let i = start + name.length;
  if (src[i] !== "=") return { attr: { name, value: true, col }, end: i };
  i++;
  const quote = src[i];
  if (quote === '"' || quote === "'") {
    const text = parseText(src, i + 1, ctx, line, colBase, quote);
    if (!text) return null;
    if (text.end >= src.length) {
      report(ctx, "bad-string", `attribute "${name}" has an unterminated ${quote}`, line, colBase + i);
      return null;
    }
    return { attr: { name, value: { parts: text.parts }, col }, end: text.end + 1 };
  }
  const parsed = parseExpression(src, i, ctx, line, colBase);
  if (!parsed) return null;
  return { attr: { name, value: { expr: parsed.node }, col }, end: parsed.end };
}
