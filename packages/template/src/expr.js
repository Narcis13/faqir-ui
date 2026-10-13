// Expression parser (docs/template.md §8.1). Turns the text of an attribute
// value, a hole or a statement into a plain-data tree (§16.2). It is the
// language's only parser of expressions: nothing is ever handed to `eval` or
// `new Function`. Parsing stops at the first token that cannot continue the
// expression, which is what lets attributes be separated by plain spaces.

import { report } from "./diagnostics.js";

/** Names no path step, variable, parameter or helper may use (§8.2). */
export const FORBIDDEN_NAMES = new Set(["__proto__", "prototype", "constructor"]);

/** Deepest expression nesting (§13). */
export const MAX_EXPR_DEPTH = 32;

const OPERATORS = ["}}", "??", "||", "&&", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "!", "?", ":", "(", ")", "[", "]", ".", ","];
const BINARY_LEVELS = [["||"], ["&&"], ["==", "!="], ["<", "<=", ">", ">="], ["+", "-"], ["*", "/", "%"]];
const ESCAPES = { "\\": "\\", '"': '"', "'": "'", n: "\n", t: "\t" };
const KEYWORDS = new Map([["true", true], ["false", false], ["null", null]]);

/** Thrown internally after a diagnostic is recorded, to unwind the parse. */
const FAIL = Object.freeze({ fail: true });

/**
 * @typedef {{ kind: "num" | "str" | "name" | "op" | "end" | "other", value: any, start: number, end: number }} Token
 * @typedef {{ src: string, pos: number, depth: number, ctx: import("./diagnostics.js").Context, line: number, colBase: number }} State
 */

/**
 * Parse one expression from `src` starting at `start`.
 * `line`/`colBase` place `src[0]` in the template, for diagnostics.
 * Returns the tree and the index just after its last token, or null once a
 * diagnostic has been recorded.
 * @param {string} src
 * @param {number} start
 * @param {import("./diagnostics.js").Context} ctx
 * @param {number} line
 * @param {number} colBase
 * @returns {{ node: any, end: number } | null}
 */
export function parseExpression(src, start, ctx, line, colBase) {
  const s = { src, pos: start, depth: 0, ctx, line, colBase };
  try {
    const node = parseExpr(s);
    return { node, end: s.pos };
  } catch (error) {
    if (error === FAIL) return null;
    throw error;
  }
}

/**
 * Record a diagnostic at `pos` and unwind.
 * @param {State} s
 * @param {string} code
 * @param {string} message
 * @param {number} pos
 * @returns {never}
 */
function fail(s, code, message, pos) {
  report(s.ctx, code, message, s.line, s.colBase + pos);
  throw FAIL;
}

/**
 * The token at the cursor, without consuming it.
 * @param {State} s
 * @returns {Token}
 */
function peek(s) {
  let p = s.pos;
  while (s.src[p] === " ") p++;
  if (p >= s.src.length) return { kind: "end", value: "", start: p, end: p };
  const rest = s.src.slice(p);
  const num = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
  if (num) return { kind: "num", value: num[0], start: p, end: p + num[0].length };
  const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
  if (name) return { kind: "name", value: name[0], start: p, end: p + name[0].length };
  if (rest[0] === '"' || rest[0] === "'") return readString(s, p);
  const op = OPERATORS.find((o) => rest.startsWith(o));
  if (op) return { kind: "op", value: op, start: p, end: p + op.length };
  return { kind: "other", value: rest[0], start: p, end: p + 1 };
}

/**
 * Read a quoted string literal at `p`, decoding the escapes §8.1 allows.
 * @param {State} s
 * @param {number} p
 * @returns {Token}
 */
function readString(s, p) {
  const quote = s.src[p];
  let value = "";
  for (let i = p + 1; i < s.src.length; i++) {
    const c = s.src[i];
    if (c === quote) return { kind: "str", value, start: p, end: i + 1 };
    if (c !== "\\") { value += c; continue; }
    const e = /** @type {Record<string, string>} */ (ESCAPES)[s.src[i + 1]];
    if (e === undefined) fail(s, "bad-string", `unknown escape \\${s.src[i + 1] ?? ""}`, i);
    value += e;
    i++;
  }
  return fail(s, "bad-string", "unterminated string", p);
}

/** @param {State} s */
function take(s) {
  const t = peek(s);
  s.pos = t.end;
  return t;
}

/** @param {State} s @param {string} op */
function isOp(s, op) {
  const t = peek(s);
  return t.kind === "op" && t.value === op;
}

/** @param {State} s @param {string} op */
function expect(s, op) {
  const t = peek(s);
  if (t.kind !== "op" || t.value !== op) fail(s, "bad-expr", `expected "${op}"`, t.start);
  take(s);
}

/**
 * expr = cond ; with the nesting guard every recursive descent passes through.
 * @param {State} s
 */
function parseExpr(s) {
  if (++s.depth > MAX_EXPR_DEPTH) fail(s, "expr-too-deep", `expression nested deeper than ${MAX_EXPR_DEPTH}`, s.pos);
  const test = parseDefault(s);
  let node = test;
  if (isOp(s, "?")) {
    take(s);
    const then = parseExpr(s);
    expect(s, ":");
    node = { type: "Cond", test, then, else: parseExpr(s) };
  }
  s.depth--;
  return node;
}

/** default = or { "??" or } @param {State} s */
function parseDefault(s) {
  let left = parseLevel(s, 0);
  while (isOp(s, "??")) {
    take(s);
    left = { type: "Binary", op: "??", left, right: parseLevel(s, 0) };
  }
  return left;
}

/**
 * One left-associative binary level of §8.1, from `||` (0) to `*` (5).
 * @param {State} s
 * @param {number} level
 * @returns {any}
 */
function parseLevel(s, level) {
  if (level === BINARY_LEVELS.length) return parseUnary(s);
  let left = parseLevel(s, level + 1);
  for (;;) {
    const t = peek(s);
    if (t.kind !== "op" || !BINARY_LEVELS[level].includes(t.value)) return left;
    take(s);
    left = { type: "Binary", op: t.value, left, right: parseLevel(s, level + 1) };
  }
}

/** unary = ( "!" | "-" ) unary | primary @param {State} s @returns {any} */
function parseUnary(s) {
  const t = peek(s);
  if (t.kind !== "op" || (t.value !== "!" && t.value !== "-")) return parsePrimary(s);
  take(s);
  if (++s.depth > MAX_EXPR_DEPTH) fail(s, "expr-too-deep", `expression nested deeper than ${MAX_EXPR_DEPTH}`, t.start);
  const arg = parseUnary(s);
  s.depth--;
  return { type: "Unary", op: t.value, arg };
}

/** primary = literal | path | call | "(" expr ")" @param {State} s */
function parsePrimary(s) {
  const t = take(s);
  if (t.kind === "num") {
    const value = Number(t.value);
    if (!Number.isFinite(value)) fail(s, "bad-expr", `number ${t.value.slice(0, 20)} is out of range`, t.start);
    return { type: "Literal", value };
  }
  if (t.kind === "str") return { type: "Literal", value: t.value };
  if (t.kind === "op" && t.value === "(") {
    const inner = parseExpr(s);
    expect(s, ")");
    return inner;
  }
  if (t.kind !== "name") return fail(s, "bad-expr", t.kind === "end" ? "expected a value" : `unexpected "${t.value}"`, t.start);
  if (KEYWORDS.has(t.value)) return { type: "Literal", value: KEYWORDS.get(t.value) };
  checkName(s, t);
  if (isOp(s, "(")) return parseCall(s, t.value);
  return parsePath(s, t.value);
}

/**
 * Refuse a forbidden name (§8.2).
 * @param {State} s
 * @param {Token} t
 */
function checkName(s, t) {
  if (FORBIDDEN_NAMES.has(t.value)) fail(s, "forbidden-name", `"${t.value}" cannot be used as a name`, t.start);
}

/** call = ident "(" [ expr { "," expr } ] ")" @param {State} s @param {string} name */
function parseCall(s, name) {
  take(s);
  const args = [];
  if (!isOp(s, ")")) {
    args.push(parseExpr(s));
    while (isOp(s, ",")) { take(s); args.push(parseExpr(s)); }
  }
  expect(s, ")");
  return { type: "Call", name, args };
}

/** path = ident { "." ident | "[" expr "]" } @param {State} s @param {string} root */
function parsePath(s, root) {
  const keys = [];
  for (;;) {
    if (isOp(s, ".")) {
      take(s);
      const t = take(s);
      if (t.kind !== "name") fail(s, "bad-expr", 'expected a name after "." (write [0] for an index)', t.start);
      checkName(s, t);
      keys.push(t.value);
    } else if (isOp(s, "[")) {
      take(s);
      keys.push(parseExpr(s));
      expect(s, "]");
    } else {
      return { type: "Path", root, keys };
    }
  }
}

/**
 * The source-like text of an expression tree, for messages (`page.steps[0]`).
 * @param {any} node
 * @returns {string}
 */
export function exprText(node) {
  switch (node.type) {
    case "Literal": return JSON.stringify(node.value);
    case "Path": return node.root + node.keys.map((/** @type {any} */ k) => (typeof k === "string" ? `.${k}` : `[${exprText(k)}]`)).join("");
    case "Call": return `${node.name}(${node.args.map(exprText).join(", ")})`;
    case "Unary": return `${node.op}${exprText(node.arg)}`;
    case "Binary": return `${exprText(node.left)} ${node.op} ${exprText(node.right)}`;
    case "Cond": return `${exprText(node.test)} ? ${exprText(node.then)} : ${exprText(node.else)}`;
    default: return "?";
  }
}
