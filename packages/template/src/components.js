// Component calls (docs/template.md §11) — placeholder until piece 6: every
// call is unknown.

import { reportAt } from "./diagnostics.js";
import { mapChildren } from "./compose.js";

/**
 * @param {any[]} body
 * @param {Record<string, any[]>} partials
 * @param {import("./diagnostics.js").Context} ctx
 * @param {any} table
 */
export function expandCalls(body, partials, ctx, table) {
  const expand = (/** @type {any[]} */ nodes) => nodes.flatMap((node) => {
    if (node.type !== "Call") return [mapChildren(node, expand)];
    reportAt(ctx, "unknown-component", `no component "${node.name}"`, node.loc);
    return [];
  });
  void table;
  return { body: expand(body), partials: Object.fromEntries(Object.entries(partials).map(([k, v]) => [k, expand(v)])) };
}
