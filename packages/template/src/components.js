// Component calls (docs/template.md §11). A `+name` call is checked against the
// component table — arguments, values, slots — and expanded at compile time
// into plain element nodes built from the component's reference tree, inside
// a `Component` node that carries its id. Rendering a call is then rendering
// ordinary elements: the renderer knows nothing about manifests. The one
// exception is a repeated fill (§11.4), which becomes a `Copy` node so that
// ids derived per copy can be numbered at render time, where `each` runs.

import { reportAt } from "./diagnostics.js";
import { mapChildren } from "./compose.js";
import { isDirective } from "./checks.js";

const PROTOCOL = new Set(["data-ui", "data-part", "data-state", "data-variant", "data-size"]);
const PASSTHROUGH = new Set(["class", "role", "title", "tabindex", "hidden", "lang", "dir", "name", "value"]);
const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

/**
 * @typedef {import("./diagnostics.js").Context} Context
 * @typedef {{ name: string, value: any, col?: number }} Arg
 * @typedef {{ variants: Map<string, any>, states: Map<string, any>, props: Map<string, any>,
 *   id: any, pass: Arg[], heading?: string }} Args
 * @typedef {{ tag: string, attrs: any[], children: any[], dyn?: any[], sample?: true, self?: true }} TreeNode
 * @typedef {{ node: TreeNode, path: TreeNode[] }} Occurrence
 * @typedef {{ entry: any, args: Args, call: any, ctx: Context }} Call
 * @typedef {{ fills: Map<TreeNode, any>, removed: Set<TreeNode>, inserts: Map<TreeNode, any[]>,
 *   filled: Set<string> }} Plan
 * @typedef {{ c: Call, plan: Plan, index?: number, root: TreeNode, fill?: any }} Scope
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
    node.fills = expand(node.fills);
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
  const slots = Object.keys(entry.slots);
  if (call.body.length > 0 && !entry.defaultSlot) reportAt(ctx, "no-default-slot", `+${call.name} takes no default content; fill a slot: ${slots.join(", ") || "none"}`, call.loc);
  else if (call.body.length > 0 && call.fills.length > 0) reportAt(ctx, "slot-conflict", `+${call.name} cannot take default content and named fills together`, call.loc);
  const root = buildScope(entry.tree, call.fills, { entry, args, call, ctx }, undefined, undefined);
  if (ctx.diagnostics.length > errors) return null;
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
    const loc = argLoc(arg, call);
    const variant = own(entry.variants, arg.name);
    if (variant) checkVariant(arg, variant, args, loc, ctx);
    else if (own(entry.states, arg.name) || entry.bools.includes(arg.name)) checkBoolean(arg, args, loc, ctx);
    else if (own(entry.props, arg.name)) checkProp(arg, args, loc, ctx);
    else if (arg.name === "heading" && entry.heading) checkHeading(arg, args, loc, ctx);
    else if (arg.name === "id" && arg.value === true) reportAt(ctx, "bad-value", "id needs a value", loc);
    else if (arg.name === "id") args.id = arg.value;
    else if (PROTOCOL.has(arg.name.toLowerCase())) reportAt(ctx, "protocol-attr", `${arg.name} is written through the manifest's own names (${argList(entry)})`, loc);
    else if (isPassthrough(arg.name)) args.pass.push(arg);
    else reportAt(ctx, "unknown-arg", `+${call.name} takes no "${arg.name}"; it takes ${argList(entry)}`, loc);
  }
  return args;
}

/** @param {Arg} arg @param {any} node */
function argLoc(arg, node) {
  return arg.col ? [node.loc[0], node.loc[1], arg.col] : node.loc;
}

/** True for an argument passed through onto the root (§11.3). @param {string} name */
function isPassthrough(name) {
  const n = name.toLowerCase();
  return PASSTHROUGH.has(n) || n.startsWith("aria-") || n.startsWith("data-") || isDirective(n);
}

/** Every argument a component takes, for messages. @param {any} entry */
function argList(entry) {
  return ["id", ...Object.keys(entry.variants), ...Object.keys(entry.states), ...entry.bools, ...Object.keys(entry.props), ...(entry.heading ? ["heading"] : [])].join(", ");
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
 * @param {{ states: Map<string, any> }} args
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
 * `heading`: the level of the reference tree's headings, a literal h1–h6
 * (a tag is fixed at compile time).
 * @param {Arg} arg
 * @param {Args} args
 * @param {number[]} loc
 * @param {Context} ctx
 */
function checkHeading(arg, args, loc, ctx) {
  const text = literal(arg.value);
  if (text === undefined || !HEADINGS.includes(text)) return reportAt(ctx, "bad-value", `heading takes a literal one of: ${HEADINGS.join(", ")}`, loc);
  args.heading = text;
}

// ── The reference tree ──────────────────────────────────────────────────────

/** @param {any} c @returns {c is TreeNode} */
function isNode(c) {
  return typeof c === "object" && c !== null && typeof c.tag === "string";
}

/** @param {TreeNode} node @returns {TreeNode[]} */
function elements(node) {
  return node.children.filter(isNode);
}

/** A tree node's literal value of `name`, if any. @param {TreeNode} node @param {string} name */
function attrText(node, name) {
  const value = node.attrs.find((/** @type {any} */ [n]) => n === name)?.[1];
  return Array.isArray(value) && value.length === 1 && typeof value[0] === "string" ? value[0] : undefined;
}

/**
 * Every element below `root` (not itself) carrying `part`, with its ancestors
 * from `root` down, in document order.
 * @param {TreeNode} root
 * @param {string} part
 * @returns {Occurrence[]}
 */
function occurrences(root, part) {
  /** @type {Occurrence[]} */
  const out = [];
  const walk = (/** @type {TreeNode} */ node, /** @type {TreeNode[]} */ path) => {
    for (const child of elements(node)) {
      if (attrText(child, "data-part") === part) out.push({ node: child, path: [...path, node] });
      else walk(child, [...path, node]);
    }
  };
  walk(root, []);
  return out;
}

/**
 * Where a fill of a part writes (§11.4): the part, or — when the part holds
 * one part-less sample element beside other structure (accordion's trigger
 * and its icon) — that element.
 * @param {TreeNode} node
 * @returns {TreeNode}
 */
function fillTarget(node) {
  if (node.sample || node.children.some((c) => !isNode(c))) return node;
  const kids = elements(node);
  const held = kids.filter((c) => c.sample && attrText(c, "data-part") === undefined);
  return held.length === 1 && kids.length > 1 ? held[0] : node;
}

// ── Fills ───────────────────────────────────────────────────────────────────

/**
 * The fills written at one level — directly, or inside `if`/`each` there —
 * each with whether it is static (outside any control flow). A branch that
 * holds content beside fills is reported.
 * @param {any[]} items
 * @param {Context} ctx
 * @returns {Array<{ fill: any, fixed: boolean }>}
 */
function flatFills(items, ctx) {
  /** @type {Array<{ fill: any, fixed: boolean }>} */
  const out = [];
  const walk = (/** @type {any[]} */ nodes, /** @type {boolean} */ fixed) => {
    for (const node of nodes) {
      if (node.type === "Fill" && node.body.length > 0 && node.fills.length > 0) {
        reportAt(ctx, "slot-conflict", `@${node.name} holds content or @ fills, not both`, node.loc);
      }
      if (node.type === "Fill") out.push({ fill: node, fixed });
      else if (node.type === "If") for (const b of node.branches) walk(b.body, false);
      else if (node.type === "Each") { walk(node.body, false); walk(node.else, false); }
      else reportAt(ctx, "slot-conflict", "a branch under a call holds @ fills or content, not both", node.loc);
    }
  };
  walk(items, true);
  return out;
}

/**
 * Build one scope: the reference subtree at `root` with the fills written for
 * it. The call is the outer scope (`root` is the tree); a fill with nested
 * fills is a scope of its own, rooted at its part (§11.4).
 * @param {TreeNode} root
 * @param {any[]} items fill items: Fill nodes and the if/each holding them
 * @param {Call} c
 * @param {any} fill the fill this scope is, unless it is the call's
 * @param {number | undefined} index the copy number of the enclosing repeated part
 */
function buildScope(root, items, c, fill, index) {
  const plan = planFills(root, flatFills(items, c.ctx), items, c, fill);
  return /** @type {any} */ (buildNode(root, { c, plan, index, root, fill }));
}

/**
 * Decide where each fill goes, report what cannot be filled, and check the
 * required slots of the scope.
 * @param {TreeNode} root
 * @param {Array<{ fill: any, fixed: boolean }>} flat
 * @param {any[]} items
 * @param {Call} c
 * @param {any} fill
 * @returns {Plan}
 */
function planFills(root, flat, items, c, fill) {
  const { entry, ctx, call } = c;
  /** @type {Plan} */
  const plan = { fills: new Map(), removed: new Set(), inserts: new Map(), filled: new Set() };
  /** @type {Map<string, { occ: Occurrence[], fills: Array<{ fill: any, fixed: boolean }> }>} */
  const bySlot = new Map();
  const where = fill ? `@${fill.name}` : `+${call.name}`;
  for (const f of flat) {
    const name = f.fill.name;
    const slot = own(entry.slots, name);
    if (!slot) {
      reportAt(ctx, "unknown-slot", `${where} has no fillable slot "${name}"; it has: ${Object.keys(entry.slots).join(", ") || "none"}`, f.fill.loc);
      continue;
    }
    const known = bySlot.get(name);
    if (known) { known.fills.push(f); continue; }
    const occ = occurrences(root, name);
    if (occ.length === 0) {
      reportAt(ctx, "unknown-slot", `${where} holds no "${name}" part`, f.fill.loc);
      continue;
    }
    if (new Set(occ.map((o) => o.path[o.path.length - 1])).size > 1) {
      const inside = slot.within ? `; fill it inside @${slot.within}` : "";
      reportAt(ctx, "nested-slot", `"${name}" repeats with the part that holds it${inside}`, f.fill.loc);
      continue;
    }
    bySlot.set(name, { occ, fills: [f] });
  }
  // A slot inside another slot filled here belongs to that fill.
  for (const [name, { occ, fills }] of bySlot) {
    const outer = occ[0].path.map((n) => attrText(n, "data-part")).find((p) => p !== undefined && p !== name && bySlot.has(p));
    if (outer) {
      reportAt(ctx, "nested-slot", `"${name}" is inside "${outer}", which this call fills; fill it inside @${outer}`, fills[0].fill.loc);
      bySlot.delete(name);
    }
  }
  for (const name of bySlot.keys()) plan.filled.add(name);

  // In place: one occurrence, one fill outside control flow — the part keeps
  // its place. Anything else copies the part's unit, once per fill, and every
  // filled slot sharing a parent with a copied one is copied too, so that the
  // copies follow the order the fills are written in.
  /** @type {Map<TreeNode, string[]>} */
  const byParent = new Map();
  /** @type {Map<string, { parent: TreeNode, units: TreeNode[][] }>} */
  const units = new Map();
  for (const [name, { occ }] of bySlot) {
    const unitList = occ.map((o) => unitOf(o, root, plan.filled, name));
    const parent = unitList[0].parent;
    units.set(name, { parent, units: unitList.map((u) => u.nodes) });
    byParent.set(parent, [...(byParent.get(parent) ?? []), name]);
  }
  const copied = new Set();
  for (const [name, { occ, fills }] of bySlot) {
    if (occ.length > 1 || fills.length > 1 || !fills[0].fixed) copied.add(name);
  }
  for (const names of byParent.values()) {
    if (names.some((n) => copied.has(n))) for (const n of names) copied.add(n);
  }
  for (const [name, { occ, fills }] of bySlot) {
    if (!copied.has(name)) plan.fills.set(occ[0].node, fills[0].fill);
  }
  for (const name of copied) {
    const { fills } = /** @type {any} */ (bySlot.get(name));
    const many = fills.length > 1 || fills.some((/** @type {any} */ f) => !f.fixed);
    if (many && hasFixedId(/** @type {any} */ (units.get(name)).units[0], 1)) {
      reportAt(ctx, "duplicate-slot", `slot "${name}" cannot repeat: its part carries an id that would be written twice`, fills[1]?.fill.loc ?? fills[0].fill.loc);
    }
    for (const unit of /** @type {any} */ (units.get(name)).units) for (const n of unit) plan.removed.add(n);
  }
  checkPairs([...copied], bySlot, units, ctx);

  // Each parent with copies gets them, in written order, where its first
  // removed unit was.
  for (const [parent, names] of byParent) {
    if (!names.some((n) => copied.has(n))) continue;
    const first = elements(parent).find((n) => plan.removed.has(n));
    const mine = new Set(names);
    const seq = copySequence(items, mine, bySlot, units, c);
    if (first) plan.inserts.set(first, seq);
  }
  checkRequired(root, bySlot, plan, c, fill);
  return plan;
}

/**
 * A part's unit: the element that repeats with it. That is the part, widened
 * to part-less wrappers that hold only it (breadcrumb's `<li>`), plus the
 * empty decorations that follow it (breadcrumb's separator).
 * @param {Occurrence} o
 * @param {TreeNode} root
 * @param {Set<string>} filled
 * @param {string} name
 * @returns {{ parent: TreeNode, nodes: TreeNode[] }}
 */
function unitOf(o, root, filled, name) {
  let el = o.node;
  let i = o.path.length - 1;
  while (i > 0) {
    const up = o.path[i];
    if (up === root || attrText(up, "data-part") || attrText(up, "data-ui") || up.children.length !== 1) break;
    el = up;
    i--;
  }
  const parent = o.path[i];
  const nodes = [el];
  const sibs = elements(parent);
  for (let k = sibs.indexOf(el) + 1; k < sibs.length; k++) {
    const s = sibs[k];
    const part = attrText(s, "data-part");
    if (s.children.length > 0 || s.sample || part === name || (part && filled.has(part))) break;
    nodes.push(s);
  }
  return { parent, nodes };
}

/**
 * True when a unit carries an id a copy cannot renumber: a literal id, or a
 * derived one whose suffix is not the occurrence's number.
 * @param {TreeNode[]} unit
 * @param {number} index
 */
function hasFixedId(unit, index) {
  const fixed = (/** @type {TreeNode} */ node) => {
    const id = node.attrs.find((/** @type {any} */ [n]) => n === "id")?.[1];
    if (id !== undefined && indexedStem(id, index) === undefined) return true;
    return elements(node).some(fixed);
  };
  return unit.some(fixed);
}

/**
 * The stem of a derived, numbered id value (`{id}-tab-1` → "-tab-") when its
 * number is `index`.
 * @param {any} value
 * @param {number} index
 */
function indexedStem(value, index) {
  if (!Array.isArray(value) || value.length !== 2 || value[0]?.p !== "id" || typeof value[1] !== "string") return undefined;
  const m = /^(.*-)(\d+)$/.exec(value[1]);
  return m && Number(m[2]) === index ? m[1] : undefined;
}

/**
 * Copied slots whose units point at each other's numbered ids — tabs'
 * triggers and panels — must be filled the same number of times when the
 * counts are known at compile time (`fill-count`).
 * @param {string[]} names
 * @param {Map<string, any>} bySlot
 * @param {Map<string, { parent: TreeNode, units: TreeNode[][] }>} units
 * @param {Context} ctx
 */
function checkPairs(names, bySlot, units, ctx) {
  /** @type {Map<string, { defines: Set<string>, refers: Set<string> }>} */
  const stems = new Map();
  for (const name of names) {
    const s = { defines: new Set(), refers: new Set() };
    const walk = (/** @type {TreeNode} */ node) => {
      for (const [attr, value] of node.attrs) {
        const stem = indexedStem(value, 1);
        if (stem !== undefined) (attr === "id" ? s.defines : s.refers).add(stem);
      }
      elements(node).forEach(walk);
    };
    /** @type {any} */ (units.get(name)).units[0].forEach(walk);
    stems.set(name, s);
  }
  for (const a of names) {
    for (const b of names) {
      if (a >= b) continue;
      const sa = /** @type {any} */ (stems.get(a));
      const sb = /** @type {any} */ (stems.get(b));
      const paired = [...sa.refers].some((s) => sb.defines.has(s)) || [...sb.refers].some((s) => sa.defines.has(s));
      const fa = bySlot.get(a).fills;
      const fb = bySlot.get(b).fills;
      const fixed = [...fa, ...fb].every((f) => f.fixed);
      if (paired && fixed && fa.length !== fb.length) {
        reportAt(ctx, "fill-count", `"${a}" is filled ${fa.length} times and "${b}" ${fb.length}; each ${a} pairs with one ${b}`, fb[0].fill.loc);
      }
    }
  }
}

/**
 * The nodes that replace one parent's copied units: the fill items in
 * written order, keeping the if/each around them, each fill of a slot of
 * this parent becoming a Copy.
 * @param {any[]} items
 * @param {Set<string>} mine
 * @param {Map<string, any>} bySlot
 * @param {Map<string, { parent: TreeNode, units: TreeNode[][] }>} units
 * @param {Call} c
 * @returns {any[]}
 */
function copySequence(items, mine, bySlot, units, c) {
  /** @param {any[]} nodes @returns {any[]} */
  const map = (nodes) => {
    /** @type {any[]} */
    const out = [];
    for (const node of nodes) {
      if (node.type === "Fill" && mine.has(node.name) && bySlot.has(node.name)) out.push(copyOf(node, units, c));
      if (node.type === "If") {
        const branches = node.branches.map((/** @type {any} */ b) => ({ test: b.test, body: map(b.body) }));
        if (branches.some((/** @type {any} */ b) => b.body.length > 0)) out.push({ type: "If", branches, loc: node.loc });
      }
      if (node.type === "Each") {
        const body = map(node.body);
        const other = map(node.else);
        if (body.length + other.length > 0) out.push({ type: "Each", names: node.names, of: node.of, body, else: other, loc: node.loc });
      }
    }
    return out;
  };
  return map(items);
}

/**
 * One fill of a copied slot: a Copy whose bodies are the slot's first unit
 * and, when the reference repeats it, its second — copy 1 takes the first
 * (the selected tab), every later copy the second (§11.4).
 * @param {any} fill
 * @param {Map<string, { parent: TreeNode, units: TreeNode[][] }>} units
 * @param {Call} c
 */
function copyOf(fill, units, c) {
  const list = /** @type {any} */ (units.get(fill.name)).units;
  const bodies = list.slice(0, 2).map((/** @type {TreeNode[]} */ unit, /** @type {number} */ i) => {
    /** @type {Plan} */
    const plan = { fills: new Map(), removed: new Set(), inserts: new Map(), filled: new Set() };
    const part = findPart(unit, fill.name);
    plan.fills.set(/** @type {TreeNode} */ (part), fill);
    const scope = { c, plan, index: i + 1, root: unit[0] };
    // The second body checks the same fills against the same parts: what it
    // would report, the first already has.
    const reported = c.ctx.diagnostics.length;
    const built = unit.map((n) => buildNode(n, scope)).filter((n) => n !== null);
    if (i > 0) c.ctx.diagnostics.length = reported;
    return built;
  });
  return { type: "Copy", slot: fill.name, bodies, loc: fill.loc };
}

/** The element carrying `part` in a unit. @param {TreeNode[]} unit @param {string} part */
function findPart(unit, part) {
  for (const node of unit) {
    if (attrText(node, "data-part") === part) return node;
    const below = occurrences(node, part)[0];
    if (below) return below.node;
  }
  return undefined;
}

/**
 * Required slots (§11.4): a slot that must be filled, with an occurrence in
 * this scope that no fill here replaces, is `missing-slot`. A slot whose
 * occurrences sit in a repeating part is that part's to require.
 * @param {TreeNode} root
 * @param {Map<string, { occ: Occurrence[] }>} bySlot
 * @param {Plan} plan
 * @param {Call} c
 * @param {any} fill
 */
function checkRequired(root, bySlot, plan, c, fill) {
  const { entry, args, call, ctx } = c;
  const filledNodes = new Set([...bySlot.values()].flatMap((s) => s.occ.map((o) => o.node)));
  for (const [name, slot] of Object.entries(entry.slots)) {
    if (!(/** @type {any} */ (slot)).required || plan.filled.has(name)) continue;
    if (!fill && slot.prop && args.props.has(slot.prop)) continue;
    const occ = occurrences(root, name);
    if (occ.length === 0 || occ.some((o) => o.path.some((n) => filledNodes.has(n)))) continue;
    if (new Set(occ.map((o) => o.path[o.path.length - 1])).size > 1) continue;
    const by = fill ? `@${fill.name}` : `+${call.name}`;
    reportAt(ctx, "missing-slot", `${by} needs its required slot "${name}"${!fill && slot.prop ? ` (or ${slot.prop}=…)` : ""}`, fill ? fill.loc : call.loc);
  }
}

// ── Building ────────────────────────────────────────────────────────────────

/**
 * Turn a reference-tree node into an Element node (§16.3 → §16.1), or null
 * when it is an optional part left empty (§11.4).
 * @param {TreeNode} node
 * @param {Scope} s
 * @returns {any}
 */
function buildNode(node, s) {
  const { c } = s;
  const fill = node === s.root && s.fill ? s.fill : s.plan.fills.get(node);
  // A fill with fills of its own is a scope, rooted at its part.
  if (fill && fill.fills.length > 0 && fill !== s.fill) return buildScope(node, fill.fills, c, fill, s.index);
  const isSelf = node.self === true || (node === c.entry.tree && !hasSelf(c.entry.tree));
  /** @type {Map<string, any>} */
  const attrs = new Map();
  for (const [name, value] of node.attrs) {
    const built = treeAttr(value, s);
    if (built !== null) attrs.set(name, built);
  }
  let varied = false;
  for (const [arg, attr] of node.dyn ?? []) {
    const value = c.args.variants.get(arg);
    if (value) { attrs.set(attr, value); varied = true; }
  }
  if (isSelf) rootAttrs(attrs, c);
  if (fill) fillAttrs(attrs, fill, c);
  const tag = c.args.heading && node.tag === c.entry.heading ? c.args.heading : node.tag;
  const element = { type: "Element", tag, attrs: [...attrs].map(([name, value]) => ({ name, value })), children: /** @type {any[]} */ ([]), loc: c.call.loc };
  if (fill) {
    element.children = fill.fills.length > 0 ? referenceChildren(node, s) : fillContent(node, fill, s);
    return element;
  }
  if (node === c.entry.tree && c.call.body.length > 0) {
    element.children = c.call.body;
    return element;
  }
  element.children = referenceChildren(node, s);
  return omitted(node, element, attrs, varied, s) ? null : element;
}

/**
 * A filled part's children: the fill's content, written into the part or
 * into its sample element (§11.4).
 * @param {TreeNode} node
 * @param {any} fill
 * @param {Scope} s
 */
function fillContent(node, fill, s) {
  const target = fillTarget(node);
  if (target === node) return fill.body;
  /** @type {Plan} */
  const plan = { ...s.plan, fills: new Map([[target, { name: "", args: [], body: fill.body, fills: [], loc: fill.loc }]]) };
  return referenceChildren(node, { ...s, plan, root: node, fill: undefined });
}

/**
 * True when an optional part renders empty and is left out (§11.4): its
 * reference content was a sample or one unset prop with no default, or it held
 * only such parts. A part with an id (something may point at it) or a variant
 * the call set stays.
 * @param {TreeNode} node
 * @param {any} element the built element
 * @param {Map<string, any>} attrs
 * @param {boolean} varied
 * @param {Scope} s
 */
function omitted(node, element, attrs, varied, s) {
  const part = attrText(node, "data-part");
  if (!part || !own(s.c.entry.slots, part) || node === s.root || attrs.has("id") || varied || element.children.length > 0) return false;
  if (node.sample) return true;
  const only = node.children.length === 1 ? node.children[0] : undefined;
  if (only && typeof only === "object" && "p" in only && only.p !== "id") return true;
  return elements(node).length > 0 && node.children.every(isNode);
}

/**
 * A node's reference children, with copies in place of the units they replace
 * and omitted parts left out.
 * @param {TreeNode} node
 * @param {Scope} s
 * @returns {any[]}
 */
function referenceChildren(node, s) {
  /** @type {any[]} */
  const out = [];
  /** @type {any[]} */
  let run = [];
  const flush = () => {
    const parts = segParts(run, s);
    if (parts.length > 0) out.push({ type: "Text", parts, loc: s.c.call.loc });
    run = [];
  };
  for (const child of node.children) {
    if (!isNode(child)) { run.push(child); continue; }
    flush();
    const inserted = s.plan.inserts.get(child);
    if (inserted) out.push(...inserted);
    if (s.plan.removed.has(child)) continue;
    const built = buildNode(child, s);
    if (built !== null) out.push(built);
  }
  flush();
  return out;
}

/** True when the tree wraps the component's own element. @param {TreeNode} node @returns {boolean} */
function hasSelf(node) {
  return node.self === true || elements(node).some(hasSelf);
}

/**
 * One reference attribute: bare, an attribute-position boolean `{ b }`, or
 * segments with `{ p }` placeholders. Null when it is left out.
 * @param {any} value
 * @param {Scope} s
 */
function treeAttr(value, s) {
  if (value === true) return true;
  if (value.b !== undefined) {
    const on = s.c.args.states.get(value.b);
    return on === undefined ? null : on === true ? true : boolExpr(on);
  }
  return { parts: segParts(value, s) };
}

/**
 * Root-only attributes: states, then the author's id, then passthrough
 * arguments, each replacing a reference attribute of the same name.
 * @param {Map<string, any>} attrs
 * @param {Call} c
 */
function rootAttrs(attrs, c) {
  stateAttrs(attrs, c.args.states, c.entry.states);
  if (c.args.id && !usesId(c.entry.tree)) attrs.set("id", c.args.id);
  for (const arg of c.args.pass) attrs.set(arg.name, arg.value);
}

/**
 * States written as attributes: presence, aria and value kinds (§11.3).
 * @param {Map<string, any>} attrs
 * @param {Map<string, any>} on states set, by name
 * @param {any} table the states' table record
 */
function stateAttrs(attrs, on, table) {
  /** @type {Map<string, any[]>} */
  const byAttr = new Map();
  for (const [name, value] of on) {
    const state = own(table, name);
    if (!state) continue;
    if (state.kind === "presence") attrs.set(state.attr, value === true ? true : boolExpr(value));
    else if (state.kind === "aria") attrs.set(state.attr, value === true ? { parts: ["true"] } : { expr: cond(value, lit("true"), lit("false")) });
    else byAttr.set(state.attr, [...(byAttr.get(state.attr) ?? []), [value, state.value]]);
  }
  for (const [attr, list] of byAttr) attrs.set(attr, valueStates(list, attrs.get(attr)));
}

/**
 * A fill's arguments, on its part: the manifest states of that part, and
 * attributes written as on a plain element (§11.4). Checked here; the
 * attributes go through every element check after expansion.
 * @param {Map<string, any>} attrs
 * @param {any} fill
 * @param {Call} c
 */
function fillAttrs(attrs, fill, c) {
  const slot = own(c.entry.slots, fill.name);
  const states = new Map();
  for (const arg of fill.args ?? []) {
    const loc = argLoc(arg, fill);
    if (own(slot?.states, arg.name)) checkBoolean(arg, { states }, loc, c.ctx);
    else if (PROTOCOL.has(arg.name.toLowerCase())) reportAt(c.ctx, "protocol-attr", `${arg.name} is written by the component${slot?.states ? `; @${fill.name} takes the states ${Object.keys(slot.states).join(", ")}` : ""}`, loc);
    else attrs.set(arg.name, arg.value);
  }
  stateAttrs(attrs, states, slot?.states);
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
 * argument's own parts or expression, else the manifest default). Inside a
 * copy, a derived id numbered like the copied occurrence takes the copy's
 * number instead (`{ n: true }`).
 * @param {any[]} segs
 * @param {Scope} s
 * @returns {any[]}
 */
function segParts(segs, s) {
  const { c } = s;
  return segs.flatMap((seg, i) => {
    if (typeof seg === "string") {
      const stem = s.index !== undefined && segs[i - 1]?.p === "id" ? indexedStem([segs[i - 1], seg], s.index) : undefined;
      return stem === undefined ? [seg] : [stem, { n: true }];
    }
    if (seg.p === "id") return [{ id: true }];
    const given = c.args.props.get(seg.p);
    if (!given) return [own(c.entry.props, seg.p)?.default ?? ""].filter((t) => t !== "");
    return given.parts ?? [{ expr: given.expr }];
  });
}
