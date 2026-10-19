// Parser (docs/template.md §4–§7, §9): the indentation tree of lines.js →
// template nodes (§16.1), plus three compile-internal nodes that later passes
// consume — `Layout` and `Block` (compose.js) and `Call` with its `@` fills
// (components.js). A line's first word decides what it is.

import { report } from "./diagnostics.js";
import { FORBIDDEN_NAMES, parseExpression } from "./expr.js";
import { parseAttrs } from "./attrs.js";
import { buildLineTree } from "./lines.js";
import { MAX_INCLUDE_DEPTH, VOID_TAGS } from "./render.js";
import { isKnownTag } from "./tags.js";
import { parseText } from "./text.js";

const KEYWORDS = new Set(["doctype", "layout", "block", "include", "params", "if", "else", "each", "raw"]);
/** Elements whose content is written exactly (§12.1 rule 3): `#[` is literal text there. */
const VERBATIM = new Set(["pre", "textarea", "script", "style"]);
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
  const nodes = parseNodes(buildLineTree(source, ctx), ctx, false, true);
  nodes.forEach((node, i) => {
    if (node.type === "Doctype" && i > 0) report(ctx, "misplaced", "doctype must be the first line", node.loc[1], node.loc[2]);
    if (node.type === "Params" && i > 0) report(ctx, "misplaced", "params must be the first statement of a partial", node.loc[1], node.loc[2]);
  });
  return nodes;
}

/**
 * Parse sibling lines, attaching `else` lines to the `if` or `each` before
 * them. `@` fills are accepted only where `fills` is true (directly under a
 * call or a fill, or in an `if`/`each` there), `params` only at a file's top.
 * @param {LineNode[]} lines
 * @param {Context} ctx
 * @param {boolean} fills
 * @param {boolean} [top]
 * @returns {any[]}
 */
function parseNodes(lines, ctx, fills, top = false) {
  /** @type {any[]} */
  const out = [];
  const closed = new WeakSet();
  for (const line of lines) {
    const node = parseLine(line, ctx, fills);
    if (!node) continue;
    // A piped line with inline elements is a run of nodes (§6.1).
    if (Array.isArray(node)) out.push(...node);
    else if (node.type === "Else") attachElse(node, out, closed, ctx);
    else if (node.type === "Fill" && !fills) report(ctx, "misplaced", "an @ fill must be directly under a component call", line.line, line.col);
    else if (node.type === "Params" && !top) report(ctx, "misplaced", "params must be the first statement of a partial", line.line, line.col);
    else out.push(node);
  }
  return out;
}

/**
 * Split a call's or a fill's children into content and fills: `@` lines, and
 * the `if`/`each` that hold them (§11.4).
 * @param {any[]} nodes
 */
function splitFills(nodes) {
  const isFill = (/** @type {any} */ n) => n.type === "Fill" || holdsFill(n);
  return { body: nodes.filter((n) => !isFill(n)), fills: nodes.filter(isFill) };
}

/**
 * True for an `if` or `each` with an `@` fill in a branch.
 * @param {any} node
 * @returns {boolean}
 */
function holdsFill(node) {
  const lists = node.type === "If" ? node.branches.map((/** @type {any} */ b) => b.body) : node.type === "Each" ? [node.body, node.else] : [];
  return lists.some((/** @type {any[]} */ list) => list.some((n) => n.type === "Fill" || holdsFill(n)));
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
 * @param {boolean} fills `if`/`each` here may hold `@` fills
 * @returns {any}
 */
function parseLine(line, ctx, fills) {
  const text = line.text;
  if (text.startsWith("//-")) return null;
  if (text.startsWith("//")) return parseComment(line, ctx);
  if (text.startsWith("|")) return parsePiped(line, ctx);
  if (text.startsWith("+")) return parseCall(line, ctx);
  if (text.startsWith("@")) return parseFill(line, ctx);
  const word = /^[a-z]+(?= |$)/.exec(text)?.[0];
  if (word && KEYWORDS.has(word)) return parseStatement(word, line, ctx, fills);
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
  return textNodes(line.text, 2, line, ctx, false);
}

/**
 * The text from `start` to the end of a line, as nodes: one Text node, or —
 * when the text holds `#[…]` inline elements (§6.1) — a run of Text and
 * Element nodes marked `glue`, so that they render on one line. With
 * `glueFirst` the run starts glued too (text after a tag, which follows the
 * open tag on its line). Null after a diagnostic.
 * @param {string} src
 * @param {number} start
 * @param {LineNode} line
 * @param {Context} ctx
 * @param {boolean} glueFirst
 * @returns {any[] | null}
 */
function textNodes(src, start, line, ctx, glueFirst) {
  if (ctx.verbatim) {
    const text = parseText(src, start, ctx, line.line, line.col);
    return text && [{ type: "Text", parts: text.parts, loc: loc(line, ctx) }];
  }
  const run = inlineRun(src, start, line, ctx, false);
  if (!run) return null;
  if (run.nodes.length === 0) return [{ type: "Text", parts: [], loc: loc(line, ctx) }];
  if (run.nodes.length === 1 && run.nodes[0].type === "Text") return run.nodes;
  run.nodes.forEach((node, i) => { if (i > 0 || glueFirst) node.glue = true; });
  return run.nodes;
}

/**
 * Text with inline elements, from `i` to the end of `src` — or, `closing`,
 * to the `]` that closes the `#[` it is in (brackets inside balance).
 * @param {string} src
 * @param {number} i
 * @param {LineNode} line
 * @param {Context} ctx
 * @param {boolean} closing
 * @returns {{ nodes: any[], end: number } | null}
 */
function inlineRun(src, i, line, ctx, closing) {
  /** @type {any[]} */
  const nodes = [];
  /** @type {any[]} */
  let parts = [];
  const add = (/** @type {any[]} */ more) => {
    for (const p of more) {
      if (typeof p === "string" && typeof parts[parts.length - 1] === "string") parts[parts.length - 1] += p;
      else parts.push(p);
    }
  };
  const flush = () => {
    if (parts.length > 0) nodes.push({ type: "Text", parts, loc: loc(line, ctx) });
    parts = [];
  };
  let depth = 0;
  for (;;) {
    const text = parseText(src, i, ctx, line.line, line.col, closing ? "#[]" : "#", true);
    if (!text) return null;
    add(text.parts);
    i = text.end;
    if (i >= src.length) {
      if (!closing) break;
      report(ctx, "bad-line", "#[ has no closing ]", line.line, line.col + i);
      return null;
    }
    const ch = src[i];
    if (ch === "#" && src[i + 1] === "[") {
      flush();
      const el = inlineElement(src, i + 2, line, ctx);
      if (!el) return null;
      nodes.push(el.node);
      i = el.end;
    } else if (ch === "#" || ch === "[" || depth > 0) {
      add([ch]);
      if (ch === "[") depth++;
      if (ch === "]") depth--;
      i++;
    } else {
      break;
    }
  }
  flush();
  return { nodes, end: i };
}

/**
 * `#[tag#id(attrs) text]` — an inline element (§6.1), from just after `#[`.
 * Returns the element and the index after its `]`.
 * @param {string} src
 * @param {number} at
 * @param {LineNode} line
 * @param {Context} ctx
 * @returns {{ node: any, end: number } | null}
 */
function inlineElement(src, at, line, ctx) {
  const head = elementHead(src, at, line, ctx, "");
  if (!head) return null;
  let i = head.end;
  /** @type {any[]} */
  let children = [];
  if (src[i] === " ") {
    const run = inlineRun(src, i + 1, line, ctx, true);
    if (!run) return null;
    children = run.nodes;
    i = run.end;
  } else if (src[i] !== "]") {
    report(ctx, "bad-line", `unexpected "${src[i] ?? "end of line"}" in #[`, line.line, line.col + i);
    return null;
  }
  if (!voidOk(head.tag, children, line, ctx)) return null;
  for (const child of children) child.glue = true;
  return { node: { type: "Element", tag: head.tag, attrs: head.attrs, children, loc: loc(line, ctx) }, end: i + 1 };
}

/**
 * A tag, its `#id` and its attribute list at `at`: the head of an element
 * line or of an inline element. `prose` is the line's text, for the
 * `unknown-tag` hint.
 * @param {string} src
 * @param {number} at
 * @param {LineNode} line
 * @param {Context} ctx
 * @param {string} prose
 * @returns {{ tag: string, attrs: any[], end: number } | null}
 */
function elementHead(src, at, line, ctx, prose) {
  const tag = TAG.exec(src.slice(at))?.[0];
  if (!tag) {
    report(ctx, "bad-line", "#[ needs an element name", line.line, line.col + at);
    return null;
  }
  if (!isKnownTag(tag)) {
    const hint = prose ? `; if this is text, pipe it: "| ${prose}"` : "";
    report(ctx, "unknown-tag", `<${tag}> is not an HTML, SVG or MathML element, and a custom element needs a hyphen${hint}`, line.line, line.col + at);
    return null;
  }
  let i = at + tag.length;
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
  return { tag, attrs: attrs.concat(parsed.attrs), end: parsed.end };
}

/** Report children under a void element. @param {string} tag @param {any[]} children @param {LineNode} line @param {Context} ctx */
function voidOk(tag, children, line, ctx) {
  if (!VOID_TAGS.has(tag.toLowerCase()) || children.length === 0) return true;
  report(ctx, "void-children", `<${tag}> is a void element and takes no children`, line.line, line.col);
  return false;
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
    const text = textNodes(line.text, restAt + 1, line, ctx, true);
    if (!text) return null;
    nodes.push(...text);
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
  const head = elementHead(src, 0, line, ctx, src);
  if (!head) return null;
  // Inside pre, textarea, script and style, text is written as given.
  const outer = ctx.verbatim;
  if (VERBATIM.has(head.tag.toLowerCase())) ctx.verbatim = true;
  const children = body(src.slice(head.end), head.end, line, ctx, false);
  ctx.verbatim = outer;
  if (!children || !voidOk(head.tag, children, line, ctx)) return null;
  return { type: "Element", tag: head.tag, attrs: head.attrs, children, loc: loc(line, ctx) };
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
  return { type: "Call", name, args: parsed.attrs, ...splitFills(nodes), loc: loc(line, ctx) };
}

/**
 * `@name(args) text` → Fill (only kept under a call or a fill). Its children
 * are content, or fills of the parts inside its own (§11.4).
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseFill(line, ctx) {
  const src = line.text;
  const name = NAME.exec(src.slice(1))?.[0];
  if (!name) {
    report(ctx, "bad-line", "a slot fill needs a name after @", line.line, line.col);
    return null;
  }
  const at = 1 + name.length;
  const parsed = src[at] === "(" ? parseAttrs(src, at, ctx, line.line, line.col) : { attrs: [], end: at };
  if (!parsed) return null;
  const nodes = body(src.slice(parsed.end), parsed.end, line, ctx, true);
  return nodes && { type: "Fill", name, args: parsed.attrs, ...splitFills(nodes), loc: loc(line, ctx) };
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
 * @param {boolean} fills
 */
function parseStatement(word, line, ctx, fills) {
  switch (word) {
    case "doctype": return parseDoctype(line, ctx);
    case "layout": return parseLayout(line, ctx);
    case "block": return parseBlock(line, ctx);
    case "include": return parseInclude(line, ctx);
    case "params": return parseParams(line, ctx);
    case "if": return parseIf(line, ctx, fills);
    case "else": return parseElse(line, ctx, fills);
    case "each": return parseEach(line, ctx, fills);
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
 * `include "name" (params) depth=N` — the parameters are written as
 * attributes, but each name becomes a variable in the partial's scope, so it
 * must be an identifier and not a forbidden name. `depth=N`, a whole number
 * from 1 to the include-depth limit, is the include's recursion budget
 * (§10.3).
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
  let end = parsed.end;
  while (line.text[end] === " ") end++;
  /** @type {number | undefined} */
  let depth;
  if (line.text.startsWith("depth", end) && !/\w/.test(line.text[end + 5] ?? "")) {
    const m = /^depth=([0-9]+)(?= |$)/.exec(line.text.slice(end));
    if (!m || !(Number(m[1]) >= 1 && Number(m[1]) <= MAX_INCLUDE_DEPTH)) {
      report(ctx, "bad-line", `an include's depth budget is depth=N, a whole number from 1 to ${MAX_INCLUDE_DEPTH}`, line.line, line.col + end);
      return null;
    }
    depth = Number(m[1]);
    end += m[0].length;
  }
  if (line.text.slice(end).trim() !== "") {
    report(ctx, "bad-line", "unexpected text after the include", line.line, line.col + end);
    return null;
  }
  const bad = parsed.attrs.find((a) => !/^[A-Za-z_]\w*$/.test(a.name) || FORBIDDEN_NAMES.has(a.name));
  if (bad) {
    const code = FORBIDDEN_NAMES.has(bad.name) ? "forbidden-name" : "bad-attr";
    report(ctx, code, `"${bad.name}" is not a parameter name`, line.line, bad.col);
    return null;
  }
  const params = parsed.attrs.map((a) => ({ name: a.name, value: a.value }));
  if (!noChildren(line, ctx, "include")) return null;
  return { type: "Include", name: q.name, params, ...(depth === undefined ? {} : { depth }), loc: loc(line, ctx) };
}

/**
 * `params name name=default …` — a partial's parameters (§10.3). A bare name
 * must be passed; one with a value defaults to it. Written like attributes,
 * without the parentheses.
 * @param {LineNode} line
 * @param {Context} ctx
 */
function parseParams(line, ctx) {
  if (line.text === "params") {
    report(ctx, "bad-line", "params needs at least one name", line.line, line.col);
    return null;
  }
  // `params a b=1` reads as the list `(a b=1)`; the "(" takes the space's
  // column, so every position in the list is where it was written.
  const src = `params(${line.text.slice(7)})`;
  const parsed = parseAttrs(src, 6, ctx, line.line, line.col);
  if (!parsed) return null;
  if (parsed.end !== src.length) {
    report(ctx, "bad-line", "unexpected text after the params", line.line, line.col + parsed.end - 1);
    return null;
  }
  const bad = parsed.attrs.find((a) => !/^[A-Za-z_]\w*$/.test(a.name) || FORBIDDEN_NAMES.has(a.name));
  if (bad) {
    const code = FORBIDDEN_NAMES.has(bad.name) ? "forbidden-name" : "bad-attr";
    report(ctx, code, `"${bad.name}" is not a parameter name`, line.line, bad.col);
    return null;
  }
  const params = parsed.attrs.map((a) => ({ name: a.name, value: a.value === true ? null : a.value }));
  return noChildren(line, ctx, "params") ? { type: "Params", params, loc: loc(line, ctx) } : null;
}

/** @param {LineNode} line @param {Context} ctx @param {boolean} fills */
function parseIf(line, ctx, fills) {
  const test = wholeExpr(line, 2, ctx);
  return test && { type: "If", branches: [{ test, body: parseNodes(line.children, ctx, fills) }], loc: loc(line, ctx) };
}

/** @param {LineNode} line @param {Context} ctx @param {boolean} fills */
function parseElse(line, ctx, fills) {
  if (line.text === "else") return { type: "Else", test: null, body: parseNodes(line.children, ctx, fills), loc: loc(line, ctx) };
  if (!line.text.startsWith("else if ")) {
    report(ctx, "bad-line", "expected `else` or `else if expr`", line.line, line.col);
    return null;
  }
  const test = wholeExpr(line, 8, ctx);
  return test && { type: "Else", test, body: parseNodes(line.children, ctx, fills), loc: loc(line, ctx) };
}

/** @param {LineNode} line @param {Context} ctx @param {boolean} fills */
function parseEach(line, ctx, fills) {
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
  return of && { type: "Each", names, of, body: parseNodes(line.children, ctx, fills), else: [], loc: loc(line, ctx) };
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
