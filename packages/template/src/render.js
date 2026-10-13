// Renderer (docs/template.md §9, §10.3, §11.5–§11.7, §12, §13): compiled AST +
// data → HTML string. It interprets a closed set of plain-data nodes, so an AST
// that went through JSON renders the same bytes. Every value is escaped for
// its context; output size, steps and include depth are bounded, so a hostile
// template cannot make a render run away.

import { renderError } from "./diagnostics.js";
import { escapeAttr, escapeText, isSafeUrl, isUrlAttr } from "./escape.js";
import { evaluate, kind, MISSING, readOwn } from "./evaluate.js";
import { islandJson } from "./json.js";

export const DEFAULT_MAX_OUTPUT = 16 * 1024 * 1024;
export const DEFAULT_MAX_STEPS = 10_000_000;
export const MAX_INCLUDE_DEPTH = 16;
export const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** Elements whose content is written exactly, with nothing added (§12.1). */
const VERBATIM = new Set(["pre", "textarea", "script", "style"]);

/**
 * @typedef {{ ast: any, out: string[], size: number, steps: number, maxOutput: number,
 *   maxSteps: number, helpers: Record<string, unknown>, idPrefix: string, idCount: number,
 *   ids: Array<{ value: string | null }>, includes: number, loc?: number[] }} State
 * @typedef {{ scope: object[], depth: number, verbatim: boolean, raw?: boolean }} Frame
 */

/**
 * Render a compiled template.
 * @param {any} ast
 * @param {Record<string, unknown>} [data]
 * @param {{ helpers?: Record<string, unknown>, idPrefix?: string, maxOutput?: number, maxSteps?: number }} [options]
 * @returns {string}
 */
export function render(ast, data = {}, options = {}) {
  if (ast?.type !== "Template") throw new TypeError("render: the first argument must be a compiled template");
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new TypeError("render: data must be a plain object");
  const state = newState(ast, options);
  try {
    return renderTemplate(ast, data, state);
  } catch (error) {
    // Anything without a code came from a node the renderer could not read: a
    // hand-made or damaged AST (a missing list, a cycle deep enough to exhaust
    // the stack). It is still a template error, never a crash of the host's.
    if (error instanceof Error && "code" in error) throw error;
    throw renderError("bad-ast", `malformed template: ${error instanceof Error ? error.message : String(error)}`, ast, undefined);
  }
}

/**
 * Validate render's options and build the render state. Wrong options are a
 * programming error, so they throw; a limit that is not a positive integer
 * would silently switch the limit off.
 * @param {any} ast
 * @param {{ helpers?: Record<string, unknown>, idPrefix?: string, maxOutput?: number, maxSteps?: number }} options
 * @returns {State}
 */
function newState(ast, options) {
  const { helpers = {}, idPrefix = "t", maxOutput = DEFAULT_MAX_OUTPUT, maxSteps = DEFAULT_MAX_STEPS } = options;
  for (const [name, n] of [["maxOutput", maxOutput], ["maxSteps", maxSteps]]) {
    if (!Number.isSafeInteger(n) || /** @type {number} */ (n) <= 0) throw new TypeError(`render: ${name} must be a positive integer`);
  }
  if (typeof idPrefix !== "string") throw new TypeError("render: idPrefix must be a string");
  if (typeof helpers !== "object" || helpers === null) throw new TypeError("render: helpers must be an object");
  return { ast, out: [], size: 0, steps: 0, maxOutput, maxSteps, helpers, idPrefix, idCount: 0, ids: [], includes: 0 };
}

/**
 * Render the template's body, with the @ui:requires line after the doctype.
 * @param {any} ast
 * @param {Record<string, unknown>} data
 * @param {State} state
 */
function renderTemplate(ast, data, state) {
  if (!Array.isArray(ast.body) || !Array.isArray(ast.requires) || !Array.isArray(ast.files) || typeof ast.partials !== "object" || ast.partials === null) {
    throw renderError("bad-ast", "a template needs files, requires, body and partials", ast, undefined);
  }
  const frame = { scope: [data], depth: 0, verbatim: false };
  const body = /** @type {any[]} */ (ast.body);
  const lead = body[0]?.type === "Doctype" ? 1 : 0;
  renderNodes(body.slice(0, lead), frame, state);
  if (ast.requires.length > 0) {
    line(state, 0);
    put(state, `<!-- @ui:requires ${ast.requires.join(" ")} -->`);
  }
  renderNodes(body.slice(lead), frame, state);
  return state.out.join("") + "\n";
}

/**
 * Append output, enforcing the output limit.
 * @param {State} state
 * @param {string} text
 */
function put(state, text) {
  state.size += text.length;
  if (state.size > state.maxOutput) throw renderError("output-limit", `output is larger than ${state.maxOutput} characters`, state.ast, state.loc);
  state.out.push(text);
}

/**
 * Start a new output line at `depth` (no break before the very first line).
 * @param {State} state
 * @param {number} depth
 */
function line(state, depth) {
  put(state, (state.out.length > 0 ? "\n" : "") + "  ".repeat(depth));
}

/**
 * Count one step against the step limit.
 * @param {State} state
 * @param {number[] | undefined} loc
 */
function step(state, loc) {
  if (++state.steps > state.maxSteps) throw renderError("step-limit", `rendering took more than ${state.maxSteps} steps`, state.ast, loc);
}

/**
 * The evaluation environment for a node.
 * @param {State} state
 * @param {Frame} frame
 * @param {number[] | undefined} loc
 */
function env(state, frame, loc) {
  return { ast: state.ast, loc, scope: frame.scope, helpers: state.helpers };
}

/**
 * Render sibling nodes. In verbatim content, consecutive text nodes are joined
 * by a line break and nothing else is added (§12.1 rule 3).
 * @param {any[]} nodes
 * @param {Frame} frame
 * @param {State} state
 */
function renderNodes(nodes, frame, state) {
  nodes.forEach((node, i) => {
    if (frame.verbatim && i > 0 && node.type === "Text" && nodes[i - 1].type === "Text") put(state, "\n");
    renderNode(node, frame, state);
  });
}

/**
 * Render one node.
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function renderNode(node, frame, state) {
  step(state, node?.loc);
  // The node being written, for an output-limit error raised while writing it.
  const outer = state.loc;
  if (node?.loc) state.loc = node.loc;
  renderNodeOf(node, frame, state);
  state.loc = outer;
}

/**
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function renderNodeOf(node, frame, state) {
  switch (node?.type) {
    case "Doctype": return lineOrNot(state, frame, "<!doctype html>");
    case "Element": return renderElement(node, frame, state);
    case "Text": return lineOrNot(state, frame, textOf(node.parts, node, frame, state, frame.raw ? String : escapeText));
    case "Comment": return lineOrNot(state, frame, `<!--${node.text}-->`);
    case "Raw": return renderRaw(node, frame, state);
    case "If": return renderIf(node, frame, state);
    case "Each": return renderEach(node, frame, state);
    case "Include": return renderInclude(node, frame, state);
    case "Component": return renderComponent(node, frame, state);
    default: throw renderError("bad-ast", `unknown node ${JSON.stringify(node?.type)}`, state.ast, undefined);
  }
}

/**
 * Write `text` on its own line, or inline inside verbatim content.
 * @param {State} state
 * @param {Frame} frame
 * @param {string} text
 */
function lineOrNot(state, frame, text) {
  if (!frame.verbatim) line(state, frame.depth);
  put(state, text);
}

/**
 * An element: open tag, children, close tag (§12.1 rules 1–3).
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function renderElement(node, frame, state) {
  const tag = String(node.tag);
  const open = `<${tag}${renderAttrs(node, frame, state)}>`;
  if (!frame.verbatim) line(state, frame.depth);
  put(state, open);
  if (VOID_TAGS.has(tag.toLowerCase())) return;
  const children = /** @type {any[]} */ (node.children);
  const verbatim = frame.verbatim || VERBATIM.has(tag.toLowerCase());
  const inline = verbatim || (children.length === 1 && children[0].type === "Text");
  // script and style content is checked literal text at compile time (§12.3)
  // and must reach the browser unescaped.
  const raw = frame.raw || tag.toLowerCase() === "script" || tag.toLowerCase() === "style";
  const inner = { scope: frame.scope, depth: frame.depth + 1, verbatim: inline, raw };
  if (inline && !verbatim) {
    step(state, children[0].loc);
    put(state, textOf(children[0].parts, children[0], frame, state, escapeText));
  } else {
    renderNodes(children, inner, state);
  }
  if (!inline && children.length > 0) line(state, frame.depth);
  put(state, `</${tag}>`);
}

/**
 * Render an element's attributes (§5, §12.2, §16.1 AttrValue).
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function renderAttrs(node, frame, state) {
  let out = "";
  for (const attr of node.attrs) {
    const value = attrValue(attr, node, frame, state);
    if (value === false) continue;
    if (value === true) { out += ` ${attr.name}`; continue; }
    if (isUrlAttr(attr.name) && !isSafeUrl(value)) {
      throw renderError("unsafe-url", `${attr.name} has an unsafe URL scheme: ${JSON.stringify(value.slice(0, 40))}`, state.ast, node.loc);
    }
    out += ` ${attr.name}="${escapeAttr(value)}"`;
  }
  return out;
}

/**
 * The value of one attribute: `true` (bare), `false` (left out) or a string.
 * @param {any} attr
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 * @returns {boolean | string}
 */
function attrValue(attr, node, frame, state) {
  const v = attr.value;
  if (v === true) return true;
  if (v.parts) return textOf(v.parts, node, frame, state, String);
  const e = env(state, frame, node.loc);
  if (v.json) {
    const json = islandJson(evaluate(v.json, e));
    if ("error" in json) throw renderError("json-value", `json() value is not JSON data: ${json.error}`, state.ast, node.loc);
    return json.text;
  }
  const value = evaluate(v.expr, e);
  if (v.allow) return variantValue(value, v, attr, node, state);
  if (typeof value === "boolean") return value;
  return asText(value, node, state, `attribute ${attr.name}`);
}

/**
 * A variant argument's value: one of the manifest's values, left out when it
 * is the default (§11.3).
 * @param {unknown} value
 * @param {any} v
 * @param {any} attr
 * @param {any} node
 * @param {State} state
 */
function variantValue(value, v, attr, node, state) {
  if (typeof value !== "string" || !v.allow.includes(value)) {
    throw renderError("bad-value", `${attr.name} cannot be ${JSON.stringify(value)}; allowed: ${v.allow.join(", ")}`, state.ast, node.loc);
  }
  return value === v.omit ? false : value;
}

/**
 * A value as text: strings, finite numbers and booleans only (§6).
 * @param {unknown} value
 * @param {any} node
 * @param {State} state
 * @param {string} where
 */
function asText(value, node, state, where) {
  if (typeof value === "string") return value;
  if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") return String(value);
  throw renderError("not-text", `${where} cannot show ${kind(value)}`, state.ast, node.loc);
}

/**
 * Join text parts — literals, holes and component ids — escaping each value.
 * @param {any[]} parts
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 * @param {(s: string) => string} escape
 */
function textOf(parts, node, frame, state, escape) {
  let out = "";
  for (const part of parts) {
    if (typeof part === "string") out += escape(part);
    else if (part.id) out += escape(componentId(state));
    else out += escape(asText(evaluate(part.expr, env(state, frame, node.loc)), node, state, "text"));
  }
  return out;
}

/**
 * `raw`: a literal block or a string value, written exactly (§12.5).
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function renderRaw(node, frame, state) {
  const value = node.expr ? evaluate(node.expr, env(state, frame, node.loc)) : node.text;
  if (typeof value !== "string") throw renderError("type", `raw needs a string, not ${kind(value)}`, state.ast, node.loc);
  if (!frame.verbatim && state.out.length > 0) put(state, "\n");
  put(state, value);
}

/** @param {any} node @param {Frame} frame @param {State} state */
function renderIf(node, frame, state) {
  for (const branch of node.branches) {
    if (branch.test === null || evaluate(branch.test, env(state, frame, node.loc))) return renderNodes(branch.body, frame, state);
  }
}

/**
 * `each` over an array (item, index) or a plain object (key, value) (§9).
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function renderEach(node, frame, state) {
  const of = evaluate(node.of, env(state, frame, node.loc));
  const entries = eachEntries(of, node, state);
  if (entries.length === 0) return renderNodes(node.else, frame, state);
  for (const [a, b] of entries) {
    step(state, node.loc);
    const vars = Object.create(null);
    vars[node.names[0]] = a;
    if (node.names[1] !== undefined) vars[node.names[1]] = b;
    renderNodes(node.body, { ...frame, scope: [...frame.scope, vars] }, state);
  }
}

/**
 * The [first, second] pairs an `each` walks.
 * @param {unknown} of
 * @param {any} node
 * @param {State} state
 * @returns {Array<[unknown, unknown]>}
 */
function eachEntries(of, node, state) {
  const e = env(state, { scope: [], depth: 0, verbatim: false }, node.loc);
  // Items are read as own data, like any path step: an index getter would be
  // host code run by the template, and a hole is a missing value.
  const read = (/** @type {string | number} */ key) => {
    const value = readOwn(of, key, e, node.of);
    if (value === MISSING) throw renderError("missing", `item ${key} is missing`, state.ast, node.loc);
    return value;
  };
  if (Array.isArray(of)) return Array.from({ length: /** @type {number} */ (read("length")) }, (_, i) => [read(i), i]);
  const proto = typeof of === "object" && of !== null ? Object.getPrototypeOf(of) : undefined;
  if (proto === Object.prototype || proto === null) {
    return Object.keys(/** @type {object} */ (of)).map((key) => [key, read(key)]);
  }
  throw renderError("type", `each needs an array or a plain object, not ${kind(of)}`, state.ast, node.loc);
}

/**
 * An include: the partial, rendered with only its parameters in scope (§10.3).
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function renderInclude(node, frame, state) {
  const partial = Object.getOwnPropertyDescriptor(state.ast.partials, node.name)?.value;
  if (!Array.isArray(partial)) throw renderError("bad-ast", `no partial ${JSON.stringify(node.name)}`, state.ast, node.loc);
  if (state.includes >= MAX_INCLUDE_DEPTH) throw renderError("include-depth", `includes nest deeper than ${MAX_INCLUDE_DEPTH}`, state.ast, node.loc);
  const params = Object.create(null);
  for (const p of node.params) params[p.name] = paramValue(p.value, node, frame, state);
  state.includes++;
  renderNodes(partial, { scope: [params], depth: frame.depth, verbatim: frame.verbatim }, state);
  state.includes--;
}

/**
 * A parameter's value: `true`, the text of a literal, or an expression's value
 * as it is (a partial may take objects and arrays).
 * @param {any} value
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function paramValue(value, node, frame, state) {
  if (value === true) return true;
  if (value.parts) return textOf(value.parts, node, frame, state, String);
  return evaluate(value.expr, env(state, frame, node.loc));
}

/**
 * A component's expansion, with its id available to `{ id: true }` parts.
 * The id is the author's, or the next counter id, taken only when used.
 * @param {any} node
 * @param {Frame} frame
 * @param {State} state
 */
function renderComponent(node, frame, state) {
  const given = node.id ? attrValue({ name: "id", value: node.id }, node, frame, state) : null;
  if (given !== null && typeof given !== "string") throw renderError("not-text", "a component id must be text", state.ast, node.loc);
  state.ids.push({ value: given });
  renderNodes(node.body, frame, state);
  state.ids.pop();
}

/** The current component's id, generating it on first use (§11.5). @param {State} state */
function componentId(state) {
  const current = state.ids[state.ids.length - 1];
  if (!current) return `${state.idPrefix}-${++state.idCount}`;
  current.value ??= `${state.idPrefix}-${++state.idCount}`;
  return current.value;
}
