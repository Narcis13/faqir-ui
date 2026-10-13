// Lines → indentation tree (docs/template.md §3). The first pass of parsing:
// it measures indentation, enforces the spaces-only, one-step-at-a-time rule,
// and nests every line under its parent. Lines under a `raw` block or a
// comment are not parsed at all; they are kept verbatim on their opener, since
// raw HTML and comment text may look like anything.

import { report } from "./diagnostics.js";

/** Deepest nesting one file may use (§13). */
export const MAX_DEPTH = 64;

/**
 * @typedef {{ text: string, line: number, col: number, indent: number,
 *   children: LineNode[], block: string[] | null }} LineNode
 */

/**
 * True when a line's content opens a verbatim block: `raw` with nothing after
 * it, or any comment.
 * @param {string} text
 */
function opensBlock(text) {
  return text === "raw" || text.startsWith("//");
}

/**
 * Split `source` into an indentation tree. Returns the root's children.
 * @param {string} source
 * @param {import("./diagnostics.js").Context} ctx
 * @returns {LineNode[]}
 */
export function buildLineTree(source, ctx) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  /** @type {LineNode} */
  const root = { text: "", line: 0, col: 0, indent: -1, children: [], block: null };
  /** @type {LineNode[]} stack[d] is the last node at depth d */
  const stack = [];
  const state = { step: 0 };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;
    const node = measure(raw, i + 1, ctx);
    if (!node) continue;
    const depth = depthOf(node, stack, state, ctx);
    if (depth < 0) continue;
    const parent = depth === 0 ? root : stack[depth - 1];
    parent.children.push(node);
    stack.length = depth;
    stack.push(node);
    if (opensBlock(node.text)) i = collectBlock(node, lines, i + 1, state, ctx) - 1;
  }
  return root.children;
}

/**
 * Measure one non-blank line's indentation. Reports a tab in the indentation
 * and returns null for that line.
 * @param {string} raw
 * @param {number} line
 * @param {import("./diagnostics.js").Context} ctx
 * @returns {LineNode | null}
 */
function measure(raw, line, ctx) {
  const indentText = /^[ \t]*/.exec(raw)?.[0] ?? "";
  if (indentText.includes("\t")) {
    report(ctx, "tab-indent", "indentation must be spaces, not tabs", line, indentText.indexOf("\t") + 1);
    return null;
  }
  const indent = indentText.length;
  return { text: raw.slice(indent).trimEnd(), line, col: indent + 1, indent, children: [], block: null };
}

/**
 * The depth a measured line nests at, or -1 when its indentation is wrong
 * (reported). The first indented line of the file sets the step.
 * @param {LineNode} node
 * @param {LineNode[]} stack
 * @param {{ step: number }} state
 * @param {import("./diagnostics.js").Context} ctx
 */
function depthOf(node, stack, state, ctx) {
  if (node.indent > 0 && state.step === 0) state.step = node.indent;
  const depth = node.indent === 0 ? 0 : node.indent / state.step;
  if (!Number.isInteger(depth) || depth > stack.length) {
    report(ctx, "bad-indent", `indent of ${node.indent} is not one step (${state.step || "unset"}) below a parent`, node.line, 1);
    return -1;
  }
  if (depth >= MAX_DEPTH) {
    report(ctx, "too-deep", `nesting deeper than ${MAX_DEPTH} levels`, node.line, node.col);
    return -1;
  }
  return depth;
}

/**
 * Collect the verbatim lines under a block opener, from `start`, removing the
 * opener's indentation plus one step. Blank lines inside are kept; trailing
 * ones are not. Returns the index of the first line after the block.
 * @param {LineNode} opener
 * @param {string[]} lines
 * @param {number} start
 * @param {{ step: number }} state
 * @param {import("./diagnostics.js").Context} ctx
 */
function collectBlock(opener, lines, start, state, ctx) {
  /** @type {string[]} */
  const block = [];
  let i = start;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const indent = /^ */.exec(raw)?.[0].length ?? 0;
    if (raw.trim() === "") { block.push(""); continue; }
    if (indent <= opener.indent) break;
    if (/^ *\t/.test(raw)) {
      report(ctx, "tab-indent", "indentation must be spaces, not tabs", i + 1, indent + 1);
      continue;
    }
    if (state.step === 0) state.step = indent - opener.indent;
    const strip = opener.indent + state.step;
    if (indent < strip) {
      report(ctx, "bad-indent", `block line must be indented at least ${strip} spaces`, i + 1, 1);
      continue;
    }
    block.push(raw.slice(strip));
  }
  while (block.length > 0 && block[block.length - 1] === "") block.pop();
  opener.block = block;
  return i;
}
