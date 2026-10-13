// Parser (docs/template.md §4–§7, §9): the indentation tree of lines.js →
// template nodes (§16.1), plus three compile-internal nodes that later passes
// consume — `Layout` and `Block` (compose.js) and `Call` with its `@` fills
// (components.js). A line's first word decides what it is.

import { report } from "./diagnostics.js";
import { FORBIDDEN_NAMES, parseExpression } from "./expr.js";
import { parseAttrs } from "./attrs.js";
import { buildLineTree } from "./lines.js";
import { VOID_TAGS } from "./render.js";
import { parseText } from "./text.js";

const KEYWORDS = new Set(["doctype", "layout", "block", "include", "if", "else", "each", "raw"]);
const TAG = /^[A-Za-z][A-Za-z0-9-]*/;
const NAME = /^[a-z][a-z0-9-]*/;
const ID = /^#([A-Za-z_][A-Za-z0-9_-]*)/;
const EACH = /^each +([A-Za-z_]\w*)(?: *, *([A-Za-z_]\w*))? +in +/;
const QUOTED = /^"([^"]*)"|^'([^']*)'/;

/**
 * @typedef {import("./lines.js").LineNode} LineNode
 * @typedef {import("./diagnostics.js").Context} Context
 */

/**
 * Parse a whole file into nodes. A `doctype` is accepted only as the file's
 * first node.
 * @param {string} source
 * @param {Context} ctx
 * @returns {any[]}
 */
export function parseFile(source, ctx) {
  const nodes = parseNodes(buildLineTree(source, ctx), ctx, false);
  nodes.forEach((node, i) => {
    if (node.type === "Doctype" && i > 0) report(ctx, "misplaced", "doctype must be the first line", node.loc[1], node.loc[2]);
  });
  return nodes;
}

/**
 * Parse sibling lines, attaching `else` lines to the `if` or `each` before
 * them. `@` fills are accepted only where `fills` is true (directly under a
 * call).
 * @param {LineNode[]} lines
 * @param {Context} ctx
 * @param {boolean} fills
 * @returns {any[]}
 */
function parseNodes(lines, ctx, fills) {
  /** @type {any[]} */
  const out = [];
  const closed = new WeakSet();
  for (const line of lines) {
    const node = parseLine(line, ctx);
    if (!node) continue;
    if (node.type === "Else") attachElse(node, out, closed, ctx);
    else if (node.type === "Fill" && !fills) report(ctx, "misplaced", "an @ fill must be directly under a component call", line.line, line.col);
    else out.push(node);
  }
  return out;
}

/**
 * Attach an `else` / `else if` to the node before it.
 * @param {any} node
 * @param {any[]} out
 * @param {WeakSet<object>} closed nodes that already have their final `else`
 * @param {Context} ctx
 */
function attachElse(node, out, closed, ctx) {
  const prev = out[out.length - 1];
  const open = prev && !closed.has(prev);
  if (open && prev.type === "If") {
    prev.branches.push({ test: node.test, body: node.body });
    if (node.test === null) closed.add(prev);
  } else if (open && prev.type === "Each" && node.test === null) {
    prev.else = node.body;
    closed.add(prev);
  } else {
    report(ctx, "orphan-else", "else has no if or each before it", node.loc[1], node.loc[2]);
  }
}

/**
 * Parse one line (and its children) into a node, or null when the line emits
 * nothing (a template comment) or is wrong (reported).
 * @param {LineNode} line
 * @param {Context} ctx
 * @returns {any}
 */
function parseLine(line, ctx) {
  const text = line.text;
  if (text.startsWith("//-")) return null;
  if (text.startsWith("//")) return parseComment(line, ctx);
  if (text.startsWith("|")) return parsePiped(line, ctx);
  if (text.startsWith("+")) return parseCall(line, ctx);
  if (text.startsWith("@")) return parseFill(line, ctx);
  const word = /^[a-z]+(?= |$)/.exec(text)?.[0];
  if (word && KEYWORDS.has(word)) return parseStatement(word, line, ctx);
  if (TAG.test(text)) return parseElement(line, ctx);
  const hint = text.startsWith("<") ? " (write raw HTML with `raw`)" : "";
  report(ctx, "bad-line", `cannot read this line${hint}`, line.line, line.col);
  return null;
}

/** @param {LineNode} line @param {Context} ctx */
function loc(line, ctx) {
  return [ctx.file, line.line, line.col];
}

/**
 * Report children under a line that cannot have any.
 * @param {LineNode} line
 * @param {Context} ctx
 * @param {string} what
 */
function noChildren(line, ctx, what) {
  if (line.children.length === 0) return true;
  report(ctx, "misplaced", `${what} cannot have children`, line.children[0].line, line.children[0].col);
  return false;
}

/**
 * `// text` and its verbatim block → Comment (§7). Literal only.
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseComment(line, ctx) {
  const inline = line.text.slice(2).trim();
  const block = line.block ?? [];
  const text = block.length === 0 ? ` ${inline} ` : `${inline ? ` ${inline}` : ""}\n${block.join("\n")}\n`;
  const bad = text.includes("{{") ? "a hole" : text.includes("--") ? '"--"' : inline.startsWith(">") ? 'a leading ">"' : "";
  if (!bad) return { type: "Comment", text, loc: loc(line, ctx) };
  report(ctx, "bad-comment", `an HTML comment cannot contain ${bad}`, line.line, line.col);
  return null;
}

/**
 * `| text` → Text.
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parsePiped(line, ctx) {
  if (line.text.length > 1 && line.text[1] !== " ") {
    report(ctx, "bad-line", "piped text needs a space after |", line.line, line.col);
    return null;
  }
  if (!noChildren(line, ctx, "text")) return null;
  return textNode(line.text, 2, line, ctx);
}

/**
 * A Text node from `src` at `start`, or null after a diagnostic.
 * @param {string} src
 * @param {number} start
 * @param {LineNode} line
 * @param {Context} ctx
 */
function textNode(src, start, line, ctx) {
  const text = parseText(src, start, ctx, line.line, line.col);
  return text && { type: "Text", parts: text.parts, loc: loc(line, ctx) };
}

/**
 * The body of an element, call or fill: its inline text (from `rest`, which
 * starts with the separating space) followed by its children.
 * @param {string} rest
 * @param {number} restAt index of `rest` in the line's text
 * @param {LineNode} line
 * @param {Context} ctx
 * @param {boolean} fills
 * @returns {any[] | null}
 */
function body(rest, restAt, line, ctx, fills) {
  /** @type {any[]} */
  const nodes = [];
  if (rest !== "") {
    if (rest[0] !== " ") {
      report(ctx, "bad-line", `unexpected "${rest[0]}"`, line.line, line.col + restAt);
      return null;
    }
    const text = textNode(line.text, restAt + 1, line, ctx);
    if (!text) return null;
    nodes.push(text);
  }
  return nodes.concat(parseNodes(line.children, ctx, fills));
}

/**
 * `tag#id(attrs) text` → Element (§5).
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseElement(line, ctx) {
  const src = line.text;
  const tag = /** @type {string} */ (TAG.exec(src)?.[0]);
  let i = tag.length;
  /** @type {any[]} */
  const attrs = [];
  const id = ID.exec(src.slice(i));
  if (id) {
    attrs.push({ name: "id", value: { parts: [id[1]] }, col: line.col + i });
    i += id[0].length;
  }
  const parsed = src[i] === "(" ? parseAttrs(src, i, ctx, line.line, line.col) : { attrs: [], end: i };
  if (!parsed) return null;
  if (id && parsed.attrs.some((a) => a.name === "id")) {
    report(ctx, "duplicate-attr", 'attribute "id" is given twice', line.line, line.col);
    return null;
  }
  const children = body(src.slice(parsed.end), parsed.end, line, ctx, false);
  if (!children) return null;
  if (VOID_TAGS.has(tag.toLowerCase()) && children.length > 0) {
    report(ctx, "void-children", `<${tag}> is a void element and takes no children`, line.line, line.col);
    return null;
  }
  return { type: "Element", tag, attrs: attrs.concat(parsed.attrs), children, loc: loc(line, ctx) };
}

/**
 * `+name(args) text` → Call, whose `@` children become its fills.
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseCall(line, ctx) {
  const src = line.text;
  const name = NAME.exec(src.slice(1))?.[0];
  if (!name) {
    report(ctx, "bad-line", "a component call needs a name after +", line.line, line.col);
    return null;
  }
  const at = 1 + name.length;
  const parsed = src[at] === "(" ? parseAttrs(src, at, ctx, line.line, line.col) : { attrs: [], end: at };
  if (!parsed) return null;
  const nodes = body(src.slice(parsed.end), parsed.end, line, ctx, true);
  if (!nodes) return null;
  return {
    type: "Call", name, args: parsed.attrs,
    body: nodes.filter((n) => n.type !== "Fill"),
    fills: nodes.filter((n) => n.type === "Fill"),
    loc: loc(line, ctx),
  };
}

/**
 * `@name text` → Fill (only kept directly under a call).
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseFill(line, ctx) {
  const name = NAME.exec(line.text.slice(1))?.[0];
  if (!name) {
    report(ctx, "bad-line", "a slot fill needs a name after @", line.line, line.col);
    return null;
  }
  const nodes = body(line.text.slice(1 + name.length), 1 + name.length, line, ctx, false);
  return nodes && { type: "Fill", name, body: nodes, loc: loc(line, ctx) };
}

/**
 * Parse the expression filling the rest of a statement line from `start`;
 * trailing text after it is an error.
 * @param {LineNode} line
 * @param {number} start
 * @param {Context} ctx
 */
function wholeExpr(line, start, ctx) {
  const parsed = parseExpression(line.text, start, ctx, line.line, line.col);
  if (!parsed) return null;
  const rest = line.text.slice(parsed.end).trim();
  if (rest === "") return parsed.node;
  report(ctx, "bad-expr", `unexpected "${rest}"`, line.line, line.col + line.text.indexOf(rest, parsed.end));
  return null;
}

/**
 * A keyword line (§4 `statement`).
 * @param {string} word
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseStatement(word, line, ctx) {
  switch (word) {
    case "doctype": return parseDoctype(line, ctx);
    case "layout": return parseLayout(line, ctx);
    case "block": return parseBlock(line, ctx);
    case "include": return parseInclude(line, ctx);
    case "if": return parseIf(line, ctx);
    case "else": return parseElse(line, ctx);
    case "each": return parseEach(line, ctx);
    default: return parseRaw(line, ctx);
  }
}

/** @param {LineNode} line @param {Context} ctx */
function parseDoctype(line, ctx) {
  if (line.text !== "doctype html") {
    report(ctx, "bad-doctype", "only `doctype html` is supported", line.line, line.col);
    return null;
  }
  if (line.indent > 0) {
    report(ctx, "misplaced", "doctype must be the first line", line.line, line.col);
    return null;
  }
  return noChildren(line, ctx, "doctype") ? { type: "Doctype", loc: loc(line, ctx) } : null;
}

/**
 * A quoted file name at `start` of a statement line, or null (reported).
 * @param {LineNode} line
 * @param {number} start
 * @param {Context} ctx
 */
function quotedName(line, start, ctx) {
  const m = QUOTED.exec(line.text.slice(start));
  if (m) return { name: m[1] ?? m[2], end: start + m[0].length };
  report(ctx, "bad-line", "expected a quoted file name", line.line, line.col + start);
  return null;
}

/** @param {LineNode} line @param {Context} ctx */
function parseLayout(line, ctx) {
  const q = quotedName(line, 7, ctx);
  if (!q) return null;
  if (line.text.slice(q.end).trim() !== "") {
    report(ctx, "bad-line", "unexpected text after the layout name", line.line, line.col + q.end);
    return null;
  }
  return noChildren(line, ctx, "layout") ? { type: "Layout", name: q.name, loc: loc(line, ctx) } : null;
}

/** @param {LineNode} line @param {Context} ctx */
function parseBlock(line, ctx) {
  const name = /^block ([a-z][a-z0-9-]*)$/.exec(line.text)?.[1];
  if (!name) {
    report(ctx, "bad-line", "expected `block name`", line.line, line.col);
    return null;
  }
  return { type: "Block", name, body: parseNodes(line.children, ctx, false), loc: loc(line, ctx) };
}

/**
 * `include "name" (params)` — the parameters are written as attributes, but
 * each name becomes a variable in the partial's scope, so it must be an
 * identifier and not a forbidden name (§10.3).
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseInclude(line, ctx) {
  const q = quotedName(line, 8, ctx);
  if (!q) return null;
  let i = q.end;
  while (line.text[i] === " ") i++;
  const parsed = line.text[i] === "(" ? parseAttrs(line.text, i, ctx, line.line, line.col) : { attrs: [], end: i };
  if (!parsed) return null;
  if (line.text.slice(parsed.end).trim() !== "") {
    report(ctx, "bad-line", "unexpected text after the include", line.line, line.col + parsed.end);
    return null;
  }
  const bad = parsed.attrs.find((a) => !/^[A-Za-z_]\w*$/.test(a.name) || FORBIDDEN_NAMES.has(a.name));
  if (bad) {
    const code = FORBIDDEN_NAMES.has(bad.name) ? "forbidden-name" : "bad-attr";
    report(ctx, code, `"${bad.name}" is not a parameter name`, line.line, bad.col);
    return null;
  }
  const params = parsed.attrs.map((a) => ({ name: a.name, value: a.value }));
  return noChildren(line, ctx, "include") ? { type: "Include", name: q.name, params, loc: loc(line, ctx) } : null;
}

/** @param {LineNode} line @param {Context} ctx */
function parseIf(line, ctx) {
  const test = wholeExpr(line, 2, ctx);
  return test && { type: "If", branches: [{ test, body: parseNodes(line.children, ctx, false) }], loc: loc(line, ctx) };
}

/** @param {LineNode} line @param {Context} ctx */
function parseElse(line, ctx) {
  if (line.text === "else") return { type: "Else", test: null, body: parseNodes(line.children, ctx, false), loc: loc(line, ctx) };
  if (!line.text.startsWith("else if ")) {
    report(ctx, "bad-line", "expected `else` or `else if expr`", line.line, line.col);
    return null;
  }
  const test = wholeExpr(line, 8, ctx);
  return test && { type: "Else", test, body: parseNodes(line.children, ctx, false), loc: loc(line, ctx) };
}

/** @param {LineNode} line @param {Context} ctx */
function parseEach(line, ctx) {
  const m = EACH.exec(line.text);
  if (!m) {
    report(ctx, "bad-line", "expected `each name[, name] in expr`", line.line, line.col);
    return null;
  }
  const names = [m[1], m[2]].filter((n) => n !== undefined);
  const forbidden = names.find((n) => FORBIDDEN_NAMES.has(n));
  if (forbidden) {
    report(ctx, "forbidden-name", `"${forbidden}" cannot be used as a name`, line.line, line.col);
    return null;
  }
  const of = wholeExpr(line, m[0].length, ctx);
  return of && { type: "Each", names, of, body: parseNodes(line.children, ctx, false), else: [], loc: loc(line, ctx) };
}

/**
 * `raw` with a verbatim block, or `raw expr` (§12.5).
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseRaw(line, ctx) {
  if (line.text === "raw") return { type: "Raw", text: (line.block ?? []).join("\n"), loc: loc(line, ctx) };
  const expr = wholeExpr(line, 4, ctx);
  return expr && noChildren(line, ctx, "raw expr") ? { type: "Raw", expr, loc: loc(line, ctx) } : null;
}
