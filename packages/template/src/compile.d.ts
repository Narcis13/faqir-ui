// Types for @faqir-ui/template/compile, the compiler entry (docs/template.md §15.1).
import type { ComponentTable, Diagnostic, Template } from "./index.js";

export interface CompileOptions {
  /** Name used in diagnostics. Default "template.faqir". */
  file?: string;
  /** Returns a template's source by name, or null. Needed by include and layout. */
  loader?: (name: string) => string | null;
  /** The component table component calls are checked against. */
  components?: ComponentTable;
  /** Names of the helpers calls may use. */
  helpers?: string[];
  /** false refuses `raw`. Default true. */
  raw?: boolean;
}

export interface CompileResult {
  ast: Template | null;
  diagnostics: Diagnostic[];
}

export function compile(source: string, options?: CompileOptions): CompileResult;
