// Component calls (docs/template.md §11). A `+name` call is checked against the
// component table — arguments, values, slots — and expanded at compile time
// into plain element nodes built from the component's reference tree, inside
// a `Component` node that carries its id. Rendering a call is then rendering
// ordinary elements: the renderer knows nothing about manifests.

import { reportAt } from "./diagnostics.js";
import { mapChildren } from "./compose.js";
import { isDirective } from "./checks.js";

const PROTOCOL = new Set(["data-ui", "data-part", "data-state", "data-variant", "data-size"]);
const PASSTHROUGH = new Set(["class", "role", "title", "tabindex", "hidden", "lang", "dir"]);

/**
 * @typedef {import("./diagnostics.js").Context} Context
 * @typedef {{ name: string, value: any, col?: number }} Arg
 * @typedef {{ variants: Map<string, any>, states: Map<string, any>, props: Map<string, any>,
 *   id: any, pass: Arg[] }} Args
 */

/**
 * Expand every call in the body and the partials.
 * @param {any[]} body
 * @param {Record<string, any[]>} partials
 * @param {Context} ctx
 * @param {any} table
 */
export function expandCalls(body, partials, ctx, table) {
  /** @param {any[]} nodes @returns {any[]} */
  const expand = (nodes) => nodes.flatMap((node) => {
    if (node.type !== "Call") return [mapChildren(node, expand)];
    for (const fill of node.fills) fill.body = expand(fill.body);
    node.body = expand(node.body);
    const component = expandCall(node, ctx, table);
    return component ? [component] : [];
  });
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const [name, nodes] of Object.entries(partials)) out[name] = expand(nodes);
  return { body: expand(body), partials: out };
}

/**
 * An own entry of a table record, never an inherited one.
 * @param {any} record
 * @param {string} key
 */
function own(record, key) {
  return record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/**
 * Check one call and expand it into a Component node, or report and return null.
 * @param {any} call
 * @param {Context} ctx
 * @param {any} table
 */
function expandCall(call, ctx, table) {
  const entry = own(table?.components, call.name);
  if (!entry) {
    const why = own(table?.unavailable, call.name);
    const near = nearest(call.name, Object.keys(table?.components ?? {}));
    const hint = why ? ` (${why})` : near.length ? ` (did you mean ${near.join(", ")}?)` : "";
    reportAt(ctx, "unknown-component", `no component "${call.name}"${hint}`, call.loc);
    return null;
  }
  const errors = ctx.diagnostics.length;
  const args = sortArgs(call, entry, ctx);
  const fills = checkSlots(call, entry, args, ctx);
  if (ctx.diagnostics.length > errors) return null;
  const root = buildNode(entry.tree, true, { entry, args, fills, call });
  return { type: "Component", name: call.name, id: args.id, body: [root], loc: call.loc };
}

/**
 * Names in `names` within two edits of `name`, for the unknown-component hint.
 * @param {string} name
 * @param {string[]} names
 */
function nearest(name, names) {
  return names.filter((n) => distance(n, name) <= 2).slice(0, 3);
}

/**
 * Levenshtein distance, small strings only.
 * @param {string} a
 * @param {string} b
 */
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/**
 * Match each argument to what it is (§11.3), checking literal values.
 * @param {any} call
 * @param {any} entry
 * @param {Context} ctx
 * @returns {Args}
 */
function sortArgs(call, entry, ctx) {
  /** @type {Args} */
  const args = { variants: new Map(), states: new Map(), props: new Map(), id: null, pass: [] };
  for (const arg of call.args) {
    const loc = arg.col ? [call.loc[0], call.loc[1], arg.col] : call.loc;
    const variant = own(entry.variants, arg.name);
    if (variant) checkVariant(arg, variant, args, loc, ctx);
    else if (own(entry.states, arg.name) || entry.bools.includes(arg.name)) checkBoolean(arg, args, loc, ctx);
    else if (own(entry.props, arg.name)) checkProp(arg, args, loc, ctx);
    else if (arg.name === "id" && arg.value === true) reportAt(ctx, "bad-value", "id needs a value", loc);
    else if (arg.name === "id") args.id = arg.value;
    else if (PROTOCOL.has(arg.name.toLowerCase())) reportAt(ctx, "protocol-attr", `${arg.name} is written through the manifest's own names (${argList(entry)})`, loc);
    else if (isPassthrough(arg.name)) args.pass.push(arg);
    else reportAt(ctx, "unknown-arg", `+${call.name} takes no "${arg.name}"; it takes ${argList(entry)}`, loc);
  }
  return args;
}

/** True for an argument passed through onto the root (§11.3). @param {string} name */
function isPassthrough(name) {
  const n = name.toLowerCase();
  return PASSTHROUGH.has(n) || n.startsWith("aria-") || n.startsWith("data-") || isDirective(n);
}

/** Every argument a component takes, for messages. @param {any} entry */
function argList(entry) {
  return ["id", ...Object.keys(entry.variants), ...Object.keys(entry.states), ...entry.bools, ...Object.keys(entry.props)].join(", ");
}

/**
 * A literal string argument's value, or undefined when it holds a hole.
 * @param {any} value
 */
function literal(value) {
  return value?.parts && value.parts.every((/** @type {unknown} */ p) => typeof p === "string") ? value.parts.join("") : undefined;
}

/**
 * A variant: a literal is checked now, an expression at render time; the
 * default writes nothing.
 * @param {Arg} arg
 * @param {any} variant
 * @param {Args} args
 * @param {number[]} loc
 * @param {Context} ctx
 */
function checkVariant(arg, variant, args, loc, ctx) {
  const allowed = variant.values.join(", ");
  if (arg.value === true || (arg.value.parts && literal(arg.value) === undefined)) {
    return reportAt(ctx, "bad-value", `${arg.name} takes one of: ${allowed}`, loc);
  }
  const text = literal(arg.value);
  if (text === undefined) return void args.variants.set(arg.name, { expr: arg.value.expr, allow: variant.values, omit: variant.default });
  if (!variant.values.includes(text)) return reportAt(ctx, "bad-value", `${arg.name} cannot be "${text}"; it takes one of: ${allowed}`, loc);
  if (text !== variant.default) args.variants.set(arg.name, { parts: [text] });
}

/**
 * A state or boolean prop: bare is true, an expression is tested at render
 * time, a literal string is a mistake.
 * @param {Arg} arg
 * @param {Args} args
 * @param {number[]} loc
 * @param {Context} ctx
 */
function checkBoolean(arg, args, loc, ctx) {
  if (arg.value !== true && !arg.value.expr) return reportAt(ctx, "bad-value", `${arg.name} is on or off: write it bare or give an expression`, loc);
  args.states.set(arg.name, arg.value === true ? true : arg.value.expr);
}

/**
 * A string prop: a literal or an expression giving text.
 * @param {Arg} arg
 * @param {Args} args
 * @param {number[]} loc
 * @param {Context} ctx
 */
function checkProp(arg, args, loc, ctx) {
  if (arg.value === true) return reportAt(ctx, "bad-value", `${arg.name} needs a value`, loc);
  args.props.set(arg.name, arg.value);
}

/**
 * Check fills and default content against the component's slots (§11.4).
 * Returns the fills by slot name.
 * @param {any} call
 * @param {any} entry
 * @param {Args} args
 * @param {Context} ctx
 * @returns {Map<string, any[]>}
 */
function checkSlots(call, entry, args, ctx) {
  const fills = new Map();
  const slots = Object.keys(entry.slots);
  for (const fill of call.fills) {
    if (!own(entry.slots, fill.name)) reportAt(ctx, "unknown-slot", `+${call.name} has no fillable slot "${fill.name}"; it has: ${slots.join(", ") || "none"}`, fill.loc);
    else if (fills.has(fill.name)) reportAt(ctx, "duplicate-slot", `slot "${fill.name}" is filled twice`, fill.loc);
    else fills.set(fill.name, fill.body);
  }
  if (call.body.length > 0 && !entry.defaultSlot) reportAt(ctx, "no-default-slot", `+${call.name} takes no default content; fill a slot: ${slots.join(", ") || "none"}`, call.loc);
  else if (call.body.length > 0 && call.fills.length > 0) reportAt(ctx, "slot-conflict", `+${call.name} cannot take default content and named fills together`, call.loc);
  for (const [name, slot] of Object.entries(entry.slots)) {
    const satisfied = fills.has(name) || (slot.prop && args.props.has(slot.prop));
    if (slot.required && !satisfied) reportAt(ctx, "missing-slot", `+${call.name} needs its required slot "${name}"${slot.prop ? ` (or ${slot.prop}=…)` : ""}`, call.loc);
  }
  return fills;
}

/**
 * Turn a reference-tree node into an Element node (§16.3 → §16.1).
 * @param {any} node
 * @param {boolean} isRoot
 * @param {{ entry: any, args: Args, fills: Map<string, any[]>, call: any }} c
 * @returns {any}
 */
function buildNode(node, isRoot, c) {
  /** @type {Map<string, any>} */
  const attrs = new Map();
  for (const [name, value] of node.attrs) {
    const built = treeAttr(value, c);
    if (built !== null) attrs.set(name, built);
  }
  for (const [arg, attr] of node.dyn ?? []) {
    const value = c.args.variants.get(arg);
    if (value) attrs.set(attr, value);
  }
  if (isRoot) rootAttrs(attrs, c);
  return {
    type: "Element", tag: node.tag,
    attrs: [...attrs].map(([name, value]) => ({ name, value })),
    children: nodeChildren(node, isRoot, c),
    loc: c.call.loc,
  };
}

/**
 * One reference attribute: bare, an attribute-position boolean `{ b }`, or
 * segments with `{ p }` placeholders. Null when it is left out.
 * @param {any} value
 * @param {{ entry: any, args: Args, call: any }} c
 */
function treeAttr(value, c) {
  if (value === true) return true;
  if (value.b !== undefined) {
    const on = c.args.states.get(value.b);
    return on === undefined ? null : on === true ? true : boolExpr(on);
  }
  return { parts: segParts(value, c) };
}

/**
 * Root-only attributes: states, then the author's id, then passthrough
 * arguments, each replacing a reference attribute of the same name.
 * @param {Map<string, any>} attrs
 * @param {{ entry: any, args: Args, call: any }} c
 */
function rootAttrs(attrs, c) {
  /** @type {Map<string, any[]>} */
  const byAttr = new Map();
  for (const [name, on] of c.args.states) {
    const state = own(c.entry.states, name);
    if (!state) continue;
    if (state.kind === "presence") attrs.set(state.attr, on === true ? true : boolExpr(on));
    else if (state.kind === "aria") attrs.set(state.attr, on === true ? { parts: ["true"] } : { expr: cond(on, lit("true"), lit("false")) });
    else byAttr.set(state.attr, [...(byAttr.get(state.attr) ?? []), [on, state.value]]);
  }
  for (const [attr, list] of byAttr) attrs.set(attr, valueStates(list, attrs.get(attr)));
  if (c.args.id && !usesId(c.entry.tree)) attrs.set("id", c.args.id);
  for (const arg of c.args.pass) attrs.set(arg.name, arg.value);
}

/**
 * Value-kind states sharing one attribute: the first that is on wins, else the
 * reference value (or nothing).
 * @param {Array<[any, string]>} list
 * @param {any} fallback the reference attribute value, if any
 */
function valueStates(list, fallback) {
  const literalOn = list.find(([on]) => on === true);
  if (literalOn) return { parts: [literalOn[1]] };
  /** @type {any} */
  let expr = fallback?.parts && literal(fallback) !== undefined ? lit(literal(fallback)) : lit(false);
  for (const [on, value] of [...list].reverse()) expr = cond(on, lit(value), expr);
  return { expr };
}

/** @param {any} value */
function lit(value) {
  return { type: "Literal", value };
}

/** @param {any} test @param {any} then @param {any} otherwise */
function cond(test, then, otherwise) {
  return { type: "Cond", test, then, else: otherwise };
}

/** An attribute value that is bare when `on` is truthy and absent otherwise. @param {any} on */
function boolExpr(on) {
  return { expr: cond(on, lit(true), lit(false)) };
}

/**
 * True when the reference tree uses `{id}` anywhere.
 * @param {any} node
 * @returns {boolean}
 */
function usesId(node) {
  const segs = node.attrs.flatMap((/** @type {any} */ [, v]) => (Array.isArray(v) ? v : []));
  return [...segs, ...node.children].some((s) => (s && s.p === "id") || (s && s.tag && usesId(s)));
}

/**
 * Segments → text parts: literals, the component id, and string props (the
 * argument's own parts or expression, else the manifest default).
 * @param {any[]} segs
 * @param {{ entry: any, args: Args }} c
 * @returns {any[]}
 */
function segParts(segs, c) {
  return segs.flatMap((seg) => {
    if (typeof seg === "string") return [seg];
    if (seg.p === "id") return [{ id: true }];
    const given = c.args.props.get(seg.p);
    if (!given) return [own(c.entry.props, seg.p)?.default ?? ""].filter((s) => s !== "");
    return given.parts ?? [{ expr: given.expr }];
  });
}

/**
 * A node's children: its slot's fill, the call's default content at the
 * root, or its reference children (§11.4).
 * @param {any} node
 * @param {boolean} isRoot
 * @param {{ entry: any, args: Args, fills: Map<string, any[]>, call: any }} c
 * @returns {any[]}
 */
function nodeChildren(node, isRoot, c) {
  if (node.slot && c.fills.has(node.slot)) return /** @type {any[]} */ (c.fills.get(node.slot));
  if (isRoot && c.call.body.length > 0) return c.call.body;
  /** @type {any[]} */
  const out = [];
  /** @type {any[]} */
  let run = [];
  const flush = () => {
    const parts = segParts(run, c);
    if (parts.length > 0) out.push({ type: "Text", parts, loc: c.call.loc });
    run = [];
  };
  for (const child of node.children) {
    if (typeof child === "object" && child.tag) {
      flush();
      out.push(buildNode(child, false, c));
    } else {
      run.push(child);
    }
  }
  flush();
  return out;
}
