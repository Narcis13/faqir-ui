// @faqir-ui/template/compile — the compiler entry (docs/template.md §15.1).
// `compile` turns template source into a plain-JSON AST plus diagnostics: the
// static analysis a host runs once, when a template is saved. Like the runtime
// entry it imports nothing outside this directory and touches no host global,
// so it runs in Node, Bun and a browser alike.

import { check } from "./checks.js";
import { compose } from "./compose.js";
import { expandCalls } from "./components.js";
import { parseFile } from "./parse.js";

const OPTION_KEYS = new Set(["file", "loader", "components", "helpers", "raw"]);

/**
 * Compile template source (§15.1). Never throws for anything in the template:
 * every mistake is a diagnostic, and when there is one, `ast` is null.
 * @param {string} source
 * @param {{ file?: string, loader?: (name: string) => string | null, components?: any,
 *   helpers?: string[], raw?: boolean }} [options]
 */
export function compile(source, options = {}) {
  const opts = checkOptions(source, options);
  const ctx = { files: [opts.file], file: 0, diagnostics: [] };
  const { body, partials } = compose(parseFile(source, ctx), ctx, opts.loader);
  const expanded = expandCalls(body, partials, ctx, opts.components);
  const requires = check(expanded.body, expanded.partials, ctx, { helpers: opts.helpers, raw: opts.raw, table: opts.components });
  if (ctx.diagnostics.length > 0) return { ast: null, diagnostics: ctx.diagnostics };
  const ast = { type: "Template", files: ctx.files, requires, body: expanded.body, partials: expanded.partials };
  return { ast, diagnostics: [] };
}

/**
 * Validate compile's arguments; wrong options are a programming error, so
 * they throw.
 * @param {unknown} source
 * @param {Record<string, any>} options
 */
function checkOptions(source, options) {
  if (typeof source !== "string") throw new TypeError("compile: source must be a string");
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key)) throw new TypeError(`compile: unknown option "${key}"`);
  }
  const { file = "template.faqir", loader, components, helpers = [], raw = true } = options;
  if (typeof file !== "string") throw new TypeError("compile: file must be a string");
  if (loader !== undefined && typeof loader !== "function") throw new TypeError("compile: loader must be a function");
  if (!Array.isArray(helpers) || helpers.some((h) => typeof h !== "string")) throw new TypeError("compile: helpers must be an array of names");
  if (typeof raw !== "boolean") throw new TypeError("compile: raw must be a boolean");
  if (components !== undefined && (typeof components !== "object" || components === null || typeof components.components !== "object")) {
    throw new TypeError("compile: components must be a component table");
  }
  return { file, loader, components, helpers, raw };
}
