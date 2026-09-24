/**
 * @faqir-ui/rules — the logic evaluator. [1.1B-02 · §8.2]
 *
 * Imports two leaves and nothing else. Touches no DOM, no filesystem, no
 * process: `evaluateLogic(expr, data)` is a pure function of its two arguments
 * in every realm, which is the property that lets the browser plugin and the
 * server that re-checks the submission reach the same conclusion.
 *
 * ── The subset ──────────────────────────────────────────────────────────────
 *
 * A **JSONLogic** expression is either a literal (`3`, `"a"`, `true`, `null`),
 * an array of expressions, or a one-key object `{ "<op>": <args> }`. The ops
 * implemented here are the ones a *form* needs:
 *
 *   data      `var`, `missing`, `missing_some`
 *   logic     `if`, `and`, `or`, `!`, `!!`
 *   compare   `==`, `===`, `!=`, `!==`, `<`, `<=`, `>`, `>=` (incl. 3-ary between)
 *   arith     `+`, `-`, `*`, `/`, `%`, `min`, `max`
 *   string    `cat`, `substr`, `in`
 *   arrays    `some`, `all`, `none`
 *   faqir     `date`, `regex`
 *
 * Anything else — `map`, `filter`, `reduce`, `merge`, `method`, a typo — is a
 * `DefinitionError` naming the operator. There is no "unknown ops evaluate to
 * null" mode: a condition that silently answers `null` is a field that silently
 * stays hidden, and §3's invariants forbid a runtime feature that fails quietly.
 *
 * Semantics follow the reference implementation, including the parts that are
 * surprising until you have been bitten by them:
 *
 *   · **Truthiness** is JavaScript's, except that an empty array is falsy —
 *     so `{"missing": [...]}`, which answers with a list, drops straight into
 *     `if` and reads as "if anything is missing".
 *   · `and`/`or` answer with the deciding *value*, not with a boolean.
 *   · `==` is loose and `===` is strict, exactly as in JavaScript, so
 *     `{"==": [1, "1"]}` is true — which is what you want for form data that
 *     arrives as strings, and why `===` is there for when it is not.
 *   · Arithmetic coerces its operands with `parseFloat`, so `{"+": ["1", 1]}`
 *     is 2 and `{"+": "0"}` is the unary cast 0.
 *   · `all` over an empty array is **false** ("all of nothing" is not a pass),
 *     while `none` over an empty array is true.
 *
 * The public JSONLogic test suite is vendored at `tests/vendor/` and every
 * vector covering an implemented op is run against this file verbatim.
 *
 * ── The two Faqir ops ───────────────────────────────────────────────────────
 *
 *   { "date": ["2026-01-01", "<=", { "var": "start" }] }
 *   { "regex": ["^[A-Z]{2}\\d+$", { "var": "code" }] }
 *
 * `date` compares ISO 8601 instants, parsed here rather than by `Date.parse`:
 * a date-time with no zone is read as UTC, so the same comparison answers the
 * same thing in Berlin, in a CI container set to UTC and in a browser in Lima.
 * A value that is not a parseable instant makes the comparison `false` —
 * comparing a blank date box against a deadline has no true answer, and
 * `required` is the rule that should be complaining about it.
 *
 * `regex` takes a literal pattern (checked and compiled once, at definition
 * time) and answers `false` for a non-string subject or one longer than
 * `MAX_REGEX_SUBJECT_LENGTH` — see `limits.js` for why the bounds exist. A
 * pattern whose shape backtracks catastrophically (`(a+)+`) is refused at that
 * same moment; `pattern.js` says which shapes, and why a length cap cannot.
 */

import { DefinitionError } from "./errors.js";
import {
  MAX_LOGIC_DEPTH,
  MAX_LOGIC_NODES,
  MAX_PATTERN_LENGTH,
  MAX_REGEX_SUBJECT_LENGTH,
} from "./limits.js";
import { catastrophicMessage, patternRisk } from "./pattern.js";

/** Minimum argument count per operator; `0` means "any number, including none". */
const OP_ARITY = Object.freeze({
  var: 0, missing: 0, missing_some: 2,
  if: 0, and: 1, or: 1, "!": 1, "!!": 1,
  "==": 2, "===": 2, "!=": 2, "!==": 2, "<": 2, "<=": 2, ">": 2, ">=": 2,
  "+": 1, "-": 1, "*": 1, "/": 2, "%": 2, min: 1, max: 1,
  cat: 0, substr: 2, in: 2,
  some: 2, all: 2, none: 2,
  date: 3, regex: 2,
});

/** Every operator this evaluator implements, in the order the header lists them. */
export const LOGIC_OPS = Object.freeze(Object.keys(OP_ARITY));

const LOGIC_OP_SET = new Set(LOGIC_OPS);

/** The comparators `date` accepts as its middle argument. */
export const DATE_COMPARATORS = Object.freeze(["==", "!=", "<", "<=", ">", ">="]);

const DATE_COMPARATOR_SET = new Set(DATE_COMPARATORS);

/**
 * Compiled `regex` patterns, keyed by pattern source. Bounded: a definition
 * compiled in a long-lived server must not grow the process one pattern at a
 * time. Eviction is "start over", which is correct if crude — the cache only
 * ever holds derivable values.
 */
/** @type {Map<string, RegExp>} */
const REGEX_CACHE = new Map();
const REGEX_CACHE_LIMIT = 200;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * JSONLogic truthiness: JavaScript's, except that an empty array is falsy.
 *
 * @param {unknown} value @returns {boolean}
 */
export function truthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

/** The argument list of an operator, whose sugar is "a lone argument need not be wrapped". */
/** @param {unknown} raw @returns {unknown[]} */
function argsOf(raw) {
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * Walk an expression, rejecting anything the evaluator will not run — an
 * unknown operator, an object with two keys, a `date` with a comparator that
 * is not one, a `regex` whose pattern cannot compile — and bounding the walk
 * itself by node count and depth.
 *
 * Checking happens *during* the walk rather than after it, so a 10,000-node
 * expression is refused having been read only as far as the bound; and it
 * happens before `run`, so an expression that is too big is never evaluated at
 * all. Called once per `evaluateLogic`, and once per rule at compile time —
 * after which `rules.js` runs the pre-checked expression directly.
 *
 * @param {unknown} expr
 * @param {string} [where] position reported in a `DefinitionError`
 */
export function assertLogic(expr, where) {
  const at = where ?? "";
  const site = at ? at : "this expression";
  let nodes = 0;

  /** @param {unknown} node @param {number} depth */
  const walk = (node, depth) => {
    nodes += 1;
    if (nodes > MAX_LOGIC_NODES) {
      throw new DefinitionError(
        `the logic at ${site} has more than ${MAX_LOGIC_NODES} nodes.`,
        at,
      );
    }
    if (depth > MAX_LOGIC_DEPTH) {
      throw new DefinitionError(
        `the logic at ${site} nests deeper than ${MAX_LOGIC_DEPTH} levels.`,
        at,
      );
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!isRecord(node)) return;

    const keys = Object.keys(node);
    if (keys.length !== 1) {
      throw new DefinitionError(
        `a logic expression at ${site} must be a single-operator object; ` +
          `this one has ${keys.length === 0 ? "none" : `${keys.length} (${keys.join(", ")})`}.`,
        at,
      );
    }
    const op = keys[0];
    if (!LOGIC_OP_SET.has(op)) {
      throw new DefinitionError(
        `unsupported operator "${op}" at ${site} (implemented: ${LOGIC_OPS.join(", ")}).`,
        at,
      );
    }
    const args = argsOf(node[op]);
    const arity = /** @type {Record<string, number>} */ (OP_ARITY)[op];
    if (args.length < arity) {
      throw new DefinitionError(
        `"${op}" at ${site} needs at least ${arity} argument${arity === 1 ? "" : "s"}, got ${args.length}.`,
        at,
      );
    }
    if (op === "date" && !DATE_COMPARATOR_SET.has(String(args[1]))) {
      throw new DefinitionError(
        `"date" at ${site} needs one of ${DATE_COMPARATORS.join(", ")} as its ` +
          `middle argument (got ${JSON.stringify(args[1])}).`,
        at,
      );
    }
    if (op === "regex") compilePattern(args[0], at);
    for (const arg of args) walk(arg, depth + 1);
  };

  walk(expr, 0);
}

/**
 * Compile a `regex` operand's pattern, with the same bound `shape.js` puts on a
 * field's `pattern`. The pattern must be a literal: a computed one could not be
 * checked at definition time, which is the only moment a bad pattern is cheap
 * to report.
 *
 * @param {unknown} pattern @param {string} where @returns {RegExp}
 */
function compilePattern(pattern, where) {
  const site = where ? where : "this expression";
  if (typeof pattern !== "string") {
    throw new DefinitionError(
      `"regex" at ${site} needs a literal pattern string as its first argument.`,
      where,
    );
  }
  const cached = REGEX_CACHE.get(pattern);
  if (cached) return cached;
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new DefinitionError(
      `the "regex" pattern at ${site} is ${pattern.length} characters; ` +
        `the limit is ${MAX_PATTERN_LENGTH}.`,
      where,
    );
  }
  let compiled;
  try {
    compiled = new RegExp(pattern);
  } catch (error) {
    throw new DefinitionError(
      `the "regex" pattern at ${site} is not a valid regular expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      where,
    );
  }
  if (patternRisk(pattern) === "catastrophic") {
    throw new DefinitionError(catastrophicMessage(`the "regex" pattern at ${site}`), where);
  }
  if (REGEX_CACHE.size >= REGEX_CACHE_LIMIT) REGEX_CACHE.clear();
  REGEX_CACHE.set(pattern, compiled);
  return compiled;
}

/**
 * Read a dotted path out of `data`, JSONLogic-style: `""`, `null` and an empty
 * list all mean "the data itself", a missing path answers `null` rather than
 * `undefined` (JSON has no `undefined`, and the reference implementation is
 * explicit about this), and an array is indexed by a numeric segment.
 *
 * @param {unknown} data @param {unknown} name @param {unknown} fallback @returns {unknown}
 */
function readVar(data, name, fallback) {
  if (name === undefined || name === null || name === "" ||
      (Array.isArray(name) && name.length === 0)) {
    return data === undefined ? null : data;
  }
  /** @type {any} */
  let current = data;
  for (const segment of String(name).split(".")) {
    if (current === undefined || current === null) return fallback ?? null;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (isRecord(current)) {
      // Own properties only: `{"var": "constructor"}` over plain data reads a
      // field, and there is none, so it is absent — not `Object`, which is
      // truthy and would show a field nobody's data asked for.
      current = Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : undefined;
    } else {
      return fallback ?? null;
    }
  }
  if (current === undefined) return fallback ?? null;
  return current;
}

/** `missing` and `missing_some` count a value as absent when it is blank. */
/** @param {unknown} value */
function isBlank(value) {
  return value === undefined || value === null || value === "";
}

/** Arithmetic coercion, as the reference implementation does it. */
/** @param {unknown} value @returns {number} */
function toNumber(value) {
  return typeof value === "number" ? value : parseFloat(String(value));
}

/**
 * Parse an ISO 8601 date or date-time into a UTC instant, independently of the
 * host's time zone. Returns `null` for anything that is not one.
 *
 * `Date.parse` is deliberately not used: a date-time with no offset is
 * *local* time there, which would make the same rule answer differently on a
 * laptop and on the server that re-checks it — the one thing this package
 * exists to prevent.
 *
 * @param {unknown} value @returns {number | null}
 */
export function parseInstant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/
    .exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, ms, zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const hours = h === undefined ? 0 : Number(h);
  const minutes = mi === undefined ? 0 : Number(mi);
  const seconds = s === undefined ? 0 : Number(s);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const millis = ms === undefined ? 0 : Number(ms.padEnd(3, "0"));
  const instant = Date.UTC(year, month - 1, day, hours, minutes, seconds, millis);
  // Date.UTC rolls 2026-02-31 forward into March; a calendar date that moved
  // was not a calendar date.
  const rolled = new Date(instant);
  if (rolled.getUTCFullYear() !== year || rolled.getUTCMonth() !== month - 1 ||
      rolled.getUTCDate() !== day) {
    return null;
  }
  if (zone === undefined || zone === "Z") return instant;
  const sign = zone[0] === "-" ? 1 : -1;
  const offsetHours = Number(zone.slice(1, 3));
  const offsetMinutes = Number(zone.slice(-2));
  return instant + sign * (offsetHours * 60 + offsetMinutes) * 60000;
}

/** @param {number} left @param {string} comparator @param {number} right @returns {boolean} */
function compareInstants(left, comparator, right) {
  switch (comparator) {
    case "==": return left === right;
    case "!=": return left !== right;
    case "<": return left < right;
    case "<=": return left <= right;
    case ">": return left > right;
    default: return left >= right;
  }
}

/**
 * Evaluate a pre-checked expression. Internal: `evaluateLogic` is the entry
 * point that checks first, and `rules.js` calls this after `assertLogic` has
 * run once at compile time.
 *
 * @param {unknown} expr @param {unknown} data @returns {unknown}
 */
export function runLogic(expr, data) {
  if (Array.isArray(expr)) return expr.map((item) => runLogic(item, data));
  if (!isRecord(expr)) return expr;

  const op = Object.keys(expr)[0];
  const raw = expr[op];

  // Lazy operators evaluate their arguments themselves, one at a time, because
  // that is the whole reason they exist.
  if (op === "if") {
    const args = argsOf(raw);
    for (let i = 0; i + 1 < args.length; i += 2) {
      if (truthy(runLogic(args[i], data))) return runLogic(args[i + 1], data);
    }
    return args.length % 2 === 1 ? runLogic(args[args.length - 1], data) : null;
  }
  if (op === "and" || op === "or") {
    const args = argsOf(raw);
    /** @type {unknown} */
    let current = null;
    for (const arg of args) {
      current = runLogic(arg, data);
      if (truthy(current) === (op === "or")) return current;
    }
    return current;
  }
  if (op === "some" || op === "all" || op === "none") {
    const args = argsOf(raw);
    const list = runLogic(args[0], data);
    if (!Array.isArray(list)) return op === "none";
    // Each item becomes the data for the test, so `{"var": ""}` is the item and
    // `{"var": "qty"}` is one of its properties.
    const any = list.some((item) => truthy(runLogic(args[1], item)));
    if (op === "some") return any;
    if (op === "none") return !any;
    return list.length > 0 && list.every((item) => truthy(runLogic(args[1], item)));
  }
  if (op === "regex") {
    const args = argsOf(raw);
    const pattern = compilePattern(args[0], "");
    const subject = runLogic(args[1], data);
    if (typeof subject !== "string" || subject.length > MAX_REGEX_SUBJECT_LENGTH) return false;
    return pattern.test(subject);
  }

  const args = argsOf(raw).map((arg) => runLogic(arg, data));

  switch (op) {
    case "var":
      return readVar(data, args[0], args.length > 1 ? args[1] : undefined);
    case "missing": {
      // `{"missing": ["a", "b"]}` lists keys; a lone array argument is that
      // same list arriving from a sub-expression.
      const keys = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return keys.filter((key) => isBlank(readVar(data, key, undefined)));
    }
    case "missing_some": {
      const minimum = Number(args[0]);
      const keys = Array.isArray(args[1]) ? args[1] : [args[1]];
      const missing = keys.filter((key) => isBlank(readVar(data, key, undefined)));
      return keys.length - missing.length >= minimum ? [] : missing;
    }
    case "!": return !truthy(args[0]);
    case "!!": return truthy(args[0]);
    // Loose by design: form data arrives as strings, so `{"==": [1, "1"]}`
    // answering true is the useful reading — and `===` is right there for when
    // it is not. eslint would want `==` spelled out; this repo has no eslint,
    // and the reference implementation's semantics are the contract.
    case "==": return args[0] == args[1];
    case "!=": return args[0] != args[1];
    case "===": return args[0] === args[1];
    case "!==": return args[0] !== args[1];
    case "<":
      return args.length > 2
        ? /** @type {any} */ (args[0]) < /** @type {any} */ (args[1]) &&
          /** @type {any} */ (args[1]) < /** @type {any} */ (args[2])
        : /** @type {any} */ (args[0]) < /** @type {any} */ (args[1]);
    case "<=":
      return args.length > 2
        ? /** @type {any} */ (args[0]) <= /** @type {any} */ (args[1]) &&
          /** @type {any} */ (args[1]) <= /** @type {any} */ (args[2])
        : /** @type {any} */ (args[0]) <= /** @type {any} */ (args[1]);
    case ">":
      return args.length > 2
        ? /** @type {any} */ (args[0]) > /** @type {any} */ (args[1]) &&
          /** @type {any} */ (args[1]) > /** @type {any} */ (args[2])
        : /** @type {any} */ (args[0]) > /** @type {any} */ (args[1]);
    case ">=":
      return args.length > 2
        ? /** @type {any} */ (args[0]) >= /** @type {any} */ (args[1]) &&
          /** @type {any} */ (args[1]) >= /** @type {any} */ (args[2])
        : /** @type {any} */ (args[0]) >= /** @type {any} */ (args[1]);
    case "+": return args.map(toNumber).reduce((sum, value) => sum + value, 0);
    case "-": return args.length === 1 ? -toNumber(args[0]) : toNumber(args[0]) - toNumber(args[1]);
    case "*": return args.map(toNumber).reduce((product, value) => product * value);
    case "/": return toNumber(args[0]) / toNumber(args[1]);
    case "%": return toNumber(args[0]) % toNumber(args[1]);
    case "min": return Math.min(.../** @type {any[]} */ (args));
    case "max": return Math.max(.../** @type {any[]} */ (args));
    case "cat":
      return args.map((value) => (value === null || value === undefined ? "" : String(value))).join("");
    case "substr": {
      const chars = [...String(args[0])];
      let start = Math.trunc(Number(args[1])) || 0;
      if (start < 0) start = Math.max(chars.length + start, 0);
      let end = chars.length;
      if (args.length > 2) {
        const length = Math.trunc(Number(args[2])) || 0;
        end = length < 0 ? chars.length + length : Math.min(start + length, chars.length);
      }
      return chars.slice(start, Math.max(end, start)).join("");
    }
    case "in": {
      const haystack = args[1];
      if (Array.isArray(haystack)) return haystack.indexOf(args[0]) !== -1;
      if (typeof haystack === "string") return haystack.indexOf(String(args[0])) !== -1;
      return false;
    }
    default: {
      // `date` — the only op left, and the only one whose operands are parsed
      // rather than compared as they came.
      const left = parseInstant(args[0]);
      const right = parseInstant(args[2]);
      if (left === null || right === null) return false;
      return compareInstants(left, String(args[1]), right);
    }
  }
}

/**
 * The value of `expr` for `data`. Checks the expression first — an unsupported
 * operator or an oversized expression is a `DefinitionError`, never a `null`.
 *
 * @param {unknown} expr @param {unknown} data @returns {unknown}
 */
export function evaluateLogic(expr, data) {
  assertLogic(expr, "");
  return runLogic(expr, data);
}

/**
 * Every path a `var` in this expression reads, in walk order. `rules.js` uses
 * it to order `compute` rules by dependency — and to notice a cycle.
 *
 * A `var` whose name is itself computed (`{"var": {"cat": [...]}}`) contributes
 * nothing: its path is not knowable until the data is. Such an expression is
 * legal, but it cannot participate in dependency ordering, which is the
 * honest answer — and `compute` rules that need ordering write literal names.
 *
 * @param {unknown} expr @returns {string[]}
 */
export function varPaths(expr) {
  /** @type {string[]} */
  const paths = [];
  /** @param {unknown} node */
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isRecord(node)) return;
    const op = Object.keys(node)[0];
    const args = argsOf(node[op]);
    if (op === "var") {
      const name = args[0];
      if (typeof name === "string" && name.length > 0) paths.push(name);
    } else if (op === "missing" || op === "missing_some") {
      for (const arg of args.flat()) if (typeof arg === "string") paths.push(arg);
    }
    for (const arg of args) walk(arg);
  };
  walk(expr);
  return paths;
}
