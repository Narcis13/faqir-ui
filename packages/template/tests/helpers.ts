// Shared test helpers for @faqir-ui/template: compile-and-render shortcuts and
// a loader over an in-memory file map.
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import type { CompileOptions } from "../src/compile.js";
import type { RenderOptions, Template } from "../src/index.js";

/** Compile, failing the test with the diagnostics if there are any. */
export function ok(source: string, options: CompileOptions = {}): Template {
  const { ast, diagnostics } = compile(source, options);
  if (!ast) throw new Error(`unexpected diagnostics: ${JSON.stringify(diagnostics, null, 2)}`);
  return ast;
}

/** The diagnostic codes compiling `source` reports. */
export function codes(source: string, options: CompileOptions = {}): string[] {
  return compile(source, options).diagnostics.map((d) => d.code);
}

/** Compile and render in one step. */
export function html(source: string, data: Record<string, unknown> = {}, options: CompileOptions = {}, renderOptions: RenderOptions = {}): string {
  return render(ok(source, options), data, renderOptions);
}

/** The code of the error rendering throws, or "" when it renders. */
export function renderCode(source: string, data: Record<string, unknown> = {}, options: CompileOptions = {}, renderOptions: RenderOptions = {}): string {
  try {
    render(ok(source, options), data, renderOptions);
    return "";
  } catch (error) {
    return String((error as { code?: string }).code);
  }
}

/** A loader over an in-memory map of files. */
export function memoryLoader(files: Record<string, string>) {
  return (name: string) => (Object.prototype.hasOwnProperty.call(files, name) ? files[name] : null);
}
