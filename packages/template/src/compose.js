// Composition (docs/template.md §10): `layout` + `block`, and `include` of
// partials, resolved at compile time through the host's loader. The result is
// one body with every block in place, and a table of parsed partials that
// `Include` nodes name. Cycles and over-deep chains are found here, so a
// compiled template recurses only through an include with a depth budget,
// which render enforces.

import { reportAt } from "./diagnostics.js";
import { parseFile } from "./parse.js";
import { MAX_INCLUDE_DEPTH } from "./render.js";

/**
 * @typedef {import("./diagnostics.js").Context} Context
 * @typedef {(name: string) => string | null} Loader
 * @typedef {{ ctx: Context, loader: Loader | undefined, partials: Record<string, any[]>,
 *   heights: Map<string, number> }} Composer
 */

/**
 * True when `name` is a valid loader name (§10.1).
 * @param {string} name
 */
export function isValidName(name) {
  if (!name.endsWith(".faqir") || name.includes("\\") || name.includes("\0") || name.startsWith("/")) return false;
  return name.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/**
 * Resolve the layout and the includes of the parsed main file.
 * @param {any[]} nodes the main file's nodes
 * @param {Context} ctx
 * @param {Loader | undefined} loader
 * @returns {{ body: any[], partials: Record<string, any[]> }}
 */
export function compose(nodes, ctx, loader) {
  /** @type {Composer} */
  const c = { ctx, loader, partials: Object.create(null), heights: new Map() };
  notParams(nodes, c);
  const body = nodes.some((n) => n.type === "Layout") ? applyLayout(nodes, c) : flattenBlocks(nodes, c, false);
  resolveIncludes(body, c, [ctx.files[0]]);
  return { body, partials: { ...c.partials } };
}

/**
 * Load and parse a file through the loader, or report why not.
 * @param {string} name
 * @param {number[]} loc where the name was written
 * @param {Composer} c
 * @returns {any[] | null}
 */
function load(name, loc, c) {
  if (!isValidName(name)) return reportAt(c.ctx, "bad-path", `"${name}" is not a valid template name`, loc), null;
  if (!c.loader) return reportAt(c.ctx, "no-loader", `cannot load "${name}" without a loader`, loc), null;
  const source = c.loader(name);
  if (source === null) return reportAt(c.ctx, "not-found", `"${name}" was not found`, loc), null;
  if (typeof source !== "string") throw new TypeError("compile: a loader must return a string or null");
  const saved = c.ctx.file;
  c.ctx.files.push(name);
  c.ctx.file = c.ctx.files.length - 1;
  const nodes = parseFile(source, c.ctx);
  c.ctx.file = saved;
  return nodes;
}

/**
 * A page: `layout` first, then only top-level blocks, which replace the
 * layout's blocks of the same name (§10.2).
 * @param {any[]} nodes
 * @param {Composer} c
 */
function applyLayout(nodes, c) {
  const [first, ...rest] = nodes;
  if (first.type !== "Layout") {
    const late = nodes.find((n) => n.type === "Layout");
    reportAt(c.ctx, "misplaced", "layout must be the first statement", late.loc);
    return [];
  }
  const blocks = pageBlocks(rest, c);
  const layout = load(first.name, first.loc, c);
  if (!layout) return [];
  notParams(layout, c);
  const nested = layout.find((n) => n.type === "Layout");
  if (nested) {
    reportAt(c.ctx, "nested-layout", "a layout cannot itself have a layout", nested.loc);
    return [];
  }
  const names = layoutBlocks(layout, c, new Set());
  for (const [name, block] of blocks) {
    if (!names.has(name)) reportAt(c.ctx, "unknown-block", `the layout has no block "${name}"`, block.loc);
  }
  return fillBlocks(layout, blocks);
}

/**
 * `params` declares a partial's parameters; a page or a layout has none.
 * Removes it from `nodes` after reporting it.
 * @param {any[]} nodes
 * @param {Composer} c
 */
function notParams(nodes, c) {
  if (nodes[0]?.type !== "Params") return;
  reportAt(c.ctx, "misplaced", "params belongs to a partial, not a page or a layout", nodes[0].loc);
  nodes.shift();
}

/**
 * An include against its partial's `params` (§10.3): every parameter it passes
 * is declared, and every declared one without a default is passed.
 * @param {any} node the Include
 * @param {any[]} partial
 * @param {Composer} c
 */
function checkParams(node, partial, c) {
  if (partial[0]?.type !== "Params") return;
  const declared = new Map(partial[0].params.map((/** @type {any} */ p) => [p.name, p]));
  const given = new Set(node.params.map((/** @type {any} */ p) => p.name));
  for (const p of node.params) {
    if (!declared.has(p.name)) reportAt(c.ctx, "unknown-param", `"${node.name}" takes no parameter "${p.name}"; it takes ${[...declared.keys()].join(", ")}`, node.loc);
  }
  for (const [name, p] of declared) {
    if (p.value === null && !given.has(name)) reportAt(c.ctx, "missing-param", `"${node.name}" needs the parameter "${name}"`, node.loc);
  }
}

/**
 * Every block name the layout has, nested ones included — a page may define a
 * block that sits inside another block it also replaces. Reports a name
 * defined twice.
 * @param {any[]} nodes
 * @param {Composer} c
 * @param {Set<string>} names
 */
function layoutBlocks(nodes, c, names) {
  for (const node of nodes) {
    if (node.type === "Block") {
      if (names.has(node.name)) reportAt(c.ctx, "duplicate-block", `block "${node.name}" is defined twice`, node.loc);
      names.add(node.name);
    }
    mapChildren(node, (kids) => (layoutBlocks(kids, c, names), kids));
  }
  return names;
}

/**
 * The page's blocks by name. Anything else at the top level, and any block
 * nested inside one, is misplaced.
 * @param {any[]} nodes
 * @param {Composer} c
 * @returns {Map<string, any>}
 */
function pageBlocks(nodes, c) {
  const blocks = new Map();
  for (const node of nodes) {
    if (node.type !== "Block") {
      reportAt(c.ctx, "misplaced", "a page with a layout holds only top-level blocks", node.loc ?? [c.ctx.file, 1, 1]);
    } else if (blocks.has(node.name)) {
      reportAt(c.ctx, "duplicate-block", `block "${node.name}" is defined twice`, node.loc);
    } else {
      blocks.set(node.name, node);
      flattenBlocks(node.body, c, true);
    }
  }
  return blocks;
}

/**
 * Replace the layout's blocks with the page's (or their defaults), recursively.
 * @param {any[]} nodes
 * @param {Map<string, any>} blocks
 * @returns {any[]}
 */
function fillBlocks(nodes, blocks) {
  return nodes.flatMap((node) => {
    if (node.type !== "Block") return [mapChildren(node, (kids) => fillBlocks(kids, blocks))];
    const own = blocks.get(node.name);
    return own ? own.body : fillBlocks(node.body, blocks);
  });
}

/**
 * Outside a page, blocks are just their content (a layout rendered on its
 * own). Inside a page block, or where `refuse` is set, a block is misplaced.
 * @param {any[]} nodes
 * @param {Composer} c
 * @param {boolean} refuse
 * @returns {any[]}
 */
function flattenBlocks(nodes, c, refuse) {
  return nodes.flatMap((node) => {
    if (node.type === "Layout") return reportAt(c.ctx, "misplaced", "layout must be the first statement", node.loc), [];
    if (node.type !== "Block") return [mapChildren(node, (kids) => flattenBlocks(kids, c, refuse))];
    if (refuse) reportAt(c.ctx, "misplaced", "a block cannot be nested here", node.loc);
    return flattenBlocks(node.body, c, refuse);
  });
}

/**
 * Apply `fn` to every child list a node holds, returning the node.
 * @param {any} node
 * @param {(nodes: any[]) => any[]} fn
 */
export function mapChildren(node, fn) {
  if (node.children) node.children = fn(node.children);
  if (node.body) node.body = fn(node.body);
  if (node.else) node.else = fn(node.else);
  if (node.branches) for (const b of node.branches) b.body = fn(b.body);
  if (node.fills) node.fills = fn(node.fills);
  return node;
}

/**
 * Load every partial `nodes` include, checking the chain (§10.3). Returns the
 * height of the include tree below these nodes.
 * @param {any[]} nodes
 * @param {Composer} c
 * @param {string[]} chain files from the main file down to here
 * @returns {number}
 */
function resolveIncludes(nodes, c, chain) {
  let height = 0;
  const visit = (/** @type {any[]} */ list) => {
    for (const node of list) {
      if (node.type === "Include") height = Math.max(height, includeHeight(node, c, chain));
      mapChildren(node, (kids) => (visit(kids), kids));
    }
  };
  visit(nodes);
  return height;
}

/**
 * The include height through one `include`, loading its partial once.
 * @param {any} node
 * @param {Composer} c
 * @param {string[]} chain
 */
function includeHeight(node, c, chain) {
  if (chain.includes(node.name)) {
    // Recursion is allowed only within an explicit budget, which render
    // enforces: how deep it goes depends on the data (§10.3). The file being
    // compiled is not a partial, so it cannot be included at all.
    const partial = c.partials[node.name];
    if (node.depth === undefined || !partial) {
      const hint = partial ? "; give the include a budget (depth=N) to recurse" : "";
      reportAt(c.ctx, "include-cycle", `including "${node.name}" returns to a file on its own chain: ${[...chain, node.name].join(" → ")}${hint}`, node.loc);
    } else {
      checkParams(node, partial, c);
    }
    return 0;
  }
  let height = c.heights.get(node.name);
  if (height === undefined) {
    const nodes = load(node.name, node.loc, c);
    c.heights.set(node.name, 0);
    if (!nodes) return 0;
    c.partials[node.name] = flattenBlocks(nodes, c, true);
    height = 1 + resolveIncludes(c.partials[node.name], c, [...chain, node.name]);
    c.heights.set(node.name, height);
  }
  if (chain.length - 1 + height > MAX_INCLUDE_DEPTH) {
    reportAt(c.ctx, "include-depth", `includes nest deeper than ${MAX_INCLUDE_DEPTH}`, node.loc);
  }
  if (c.partials[node.name]) checkParams(node, c.partials[node.name], c);
  return height;
}
