// Expression evaluation (docs/template.md §8.2–§8.4). Walks an expression tree
// against a scope of plain data. It reads own data properties only, refuses the
// prototype names even as computed keys, treats a missing value as an error
// (except on the left of `??`), and calls nothing but the helpers the host
// registered. No string is ever turned into code.

import { renderError } from "./diagnostics.js";
import { FORBIDDEN_NAMES, exprText } from "./expr.js";

/** What a lookup returns when the value does not hold the property. */
const MISSING = Symbol("missing");

/**
 * @typedef {{ ast: { files: string[] }, loc: number[] | undefined,
 *   scope: object[], helpers: Record<string, unknown> }} Env
 */

/**
 * Evaluate an expression tree to a value.
 * @param {any} node
 * @param {Env} env
 * @returns {unknown}
 */
export function evaluate(node, env) {
  switch (node?.type) {
    case "Literal": return node.value;
    case "Path": return readPath(node, env, false);
    case "Call": return callHelper(node, env);
    case "Unary": return unary(node, env);
    case "Binary": return binary(node, env);
    case "Cond": return evaluate(node.test, env) ? evaluate(node.then, env) : evaluate(node.else, env);
    default: throw renderError("bad-ast", `unknown expression node ${JSON.stringify(node?.type)}`, env.ast, env.loc);
  }
}

/**
 * Throw a render error about expression `node`.
 * @param {Env} env
 * @param {string} code
 * @param {string} message
 * @param {any} node
 * @returns {never}
 */
function fail(env, code, message, node) {
  throw renderError(code, message, env.ast, env.loc, exprText(node));
}

/**
 * Read `key` from `value` as an own data property (§8.2): MISSING when it is
 * not there; an error for a value that has no properties, a forbidden key, or
 * an accessor (whose getter would be code run on read).
 * @param {unknown} value
 * @param {unknown} key
 * @param {Env} env
 * @param {any} node the path, for messages
 */
export function readOwn(value, key, env, node) {
  if (typeof key === "number" && Number.isInteger(key)) key = String(key);
  if (typeof key !== "string") return fail(env, "type", `a key must be a string or an integer, not ${kind(key)}`, node);
  if (FORBIDDEN_NAMES.has(key)) return fail(env, "type", `"${key}" cannot be read`, node);
  if (typeof value === "string") {
    if (key === "length") return value.length;
    return /^\d+$/.test(key) && Number(key) < value.length ? value[Number(key)] : MISSING;
  }
  if (typeof value !== "object" || value === null) return fail(env, "type", `cannot read "${key}" of ${kind(value)}`, node);
  const desc = Object.getOwnPropertyDescriptor(value, key);
  if (!desc) return MISSING;
  if (!("value" in desc)) return fail(env, "type", `"${key}" is an accessor, not data`, node);
  return desc.value;
}

/**
 * Evaluate a path. With `optional`, a missing step yields MISSING instead of
 * the `missing` error — the left side of `??`.
 * @param {any} node
 * @param {Env} env
 * @param {boolean} optional
 * @returns {unknown}
 */
function readPath(node, env, optional) {
  let value = lookup(node, env);
  for (const key of node.keys) {
    if (value === MISSING) break;
    value = readOwn(value, typeof key === "string" ? key : evaluate(key, env), env, node);
  }
  if (value !== MISSING) return value;
  if (optional) return MISSING;
  return fail(env, "missing", `${exprText(node)} is missing`, node);
}

/**
 * The value of a path's first name: the innermost scope frame holding it.
 * @param {any} node
 * @param {Env} env
 */
function lookup(node, env) {
  for (let i = env.scope.length - 1; i >= 0; i--) {
    const value = readOwn(env.scope[i], node.root, env, node);
    if (value !== MISSING) return value;
  }
  return MISSING;
}

/**
 * Call a registered helper with evaluated arguments (§8.4).
 * @param {any} node
 * @param {Env} env
 */
function callHelper(node, env) {
  const fn = FORBIDDEN_NAMES.has(node.name) ? undefined : Object.getOwnPropertyDescriptor(env.helpers, node.name)?.value;
  if (typeof fn !== "function") return fail(env, "helper-error", `helper "${node.name}" is not registered`, node);
  const args = node.args.map((/** @type {any} */ a) => evaluate(a, env));
  try {
    return fn(...args);
  } catch (error) {
    return fail(env, "helper-error", `helper "${node.name}" failed: ${error instanceof Error ? error.message : String(error)}`, node);
  }
}

/** @param {any} node @param {Env} env */
function unary(node, env) {
  const value = evaluate(node.arg, env);
  if (node.op === "!") return !value;
  if (node.op === "-" && typeof value === "number") return -value;
  return fail(env, "type", `cannot apply ${node.op} to ${kind(value)}`, node);
}

/**
 * Binary operators (§8.3). `??`, `||` and `&&` evaluate their right side only
 * when needed.
 * @param {any} node
 * @param {Env} env
 */
function binary(node, env) {
  const op = node.op;
  if (op === "??") {
    const left = node.left.type === "Path" ? readPath(node.left, env, true) : evaluate(node.left, env);
    return left === MISSING || left === null ? evaluate(node.right, env) : left;
  }
  const left = evaluate(node.left, env);
  if (op === "||") return left || evaluate(node.right, env);
  if (op === "&&") return left && evaluate(node.right, env);
  const right = evaluate(node.right, env);
  if (op === "==") return left === right;
  if (op === "!=") return left !== right;
  if (op === "+") return plus(left, right, env, node);
  if (op === "<" || op === "<=" || op === ">" || op === ">=") return compare(op, left, right, env, node);
  return arithmetic(op, left, right, env, node);
}

/**
 * `+`: numbers add; a string on either side joins both as text.
 * @param {unknown} left
 * @param {unknown} right
 * @param {Env} env
 * @param {any} node
 */
function plus(left, right, env, node) {
  if (typeof left === "number" && typeof right === "number") return finite(left + right, env, node);
  const textual = (/** @type {unknown} */ v) => typeof v === "string" || typeof v === "number";
  if ((typeof left === "string" || typeof right === "string") && textual(left) && textual(right)) return String(left) + String(right);
  return fail(env, "type", `cannot add ${kind(left)} and ${kind(right)}`, node);
}

/**
 * Ordering: two numbers or two strings.
 * @param {string} op
 * @param {unknown} left
 * @param {unknown} right
 * @param {Env} env
 * @param {any} node
 */
function compare(op, left, right, env, node) {
  const same = (typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string");
  if (!same) return fail(env, "type", `cannot compare ${kind(left)} with ${kind(right)}`, node);
  const l = /** @type {number | string} */ (left);
  const r = /** @type {number | string} */ (right);
  return op === "<" ? l < r : op === "<=" ? l <= r : op === ">" ? l > r : l >= r;
}

/**
 * `-`, `*`, `/`, `%` on numbers, with a finite result.
 * @param {string} op
 * @param {unknown} left
 * @param {unknown} right
 * @param {Env} env
 * @param {any} node
 */
function arithmetic(op, left, right, env, node) {
  if (typeof left !== "number" || typeof right !== "number") return fail(env, "type", `cannot apply ${op} to ${kind(left)} and ${kind(right)}`, node);
  const value = op === "-" ? left - right : op === "*" ? left * right : op === "/" ? left / right : left % right;
  return finite(value, env, node);
}

/** @param {number} value @param {Env} env @param {any} node */
function finite(value, env, node) {
  return Number.isFinite(value) ? value : fail(env, "type", "the result is not a finite number", node);
}

/**
 * A short name for a value's kind, for messages.
 * @param {unknown} value
 */
export function kind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "object" ? "an object" : typeof value;
}
