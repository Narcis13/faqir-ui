// Diagnostics and render errors — the two ways the engine reports a mistake
// (docs/template.md §14). Compile collects diagnostics and never throws for
// anything in a template; render throws one error and stops. Both carry a
// stable `code` and the template position, so a host can pin a message to the
// line it is about.

/**
 * @typedef {{ code: string, message: string, file: string, line: number, col: number }} Diagnostic
 * @typedef {{ files: string[], file: number, diagnostics: Diagnostic[], verbatim?: boolean }} Context
 */

/**
 * Record one compile diagnostic at `line`/`col` of the context's current file.
 * @param {Context} ctx
 * @param {string} code
 * @param {string} message
 * @param {number} line
 * @param {number} col
 */
export function report(ctx, code, message, line, col) {
  ctx.diagnostics.push({ code, message, file: ctx.files[ctx.file], line, col });
}

/**
 * Record a diagnostic at an AST location `[fileIndex, line, col]`. Used by the
 * passes that run after parsing, when the node, not the cursor, knows the place.
 * @param {Context} ctx
 * @param {string} code
 * @param {string} message
 * @param {number[]} loc
 */
export function reportAt(ctx, code, message, loc) {
  ctx.diagnostics.push({ code, message, file: ctx.files[loc[0]], line: loc[1], col: loc[2] });
}

/**
 * Build the error `render` throws: an Error carrying the code, the template
 * position and, when an expression is involved, its text as `path`.
 * @param {string} code
 * @param {string} message
 * @param {{ files: string[] }} ast
 * @param {number[] | undefined} loc
 * @param {string} [path]
 */
export function renderError(code, message, ast, loc, path) {
  const file = loc ? ast.files[loc[0]] : undefined;
  const where = loc ? ` (${file}:${loc[1]}:${loc[2]})` : "";
  const error = new Error(`${message}${where}`);
  return Object.assign(error, { code, file, line: loc?.[1], col: loc?.[2], path });
}
