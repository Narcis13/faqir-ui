// Types for @faqir-ui/template, the runtime entry (docs/template.md §15.1, §16).

export interface Diagnostic {
  code: string;
  message: string;
  file: string;
  line: number;
  col: number;
}

/** A component table (§11.1, §16.3). */
export interface ComponentTable {
  version: number;
  plugins: Record<string, string>;
  controllers: Record<string, string[]>;
  components: Record<string, unknown>;
  unavailable: Record<string, string>;
}

/** A compiled template: plain JSON (§16). */
export interface Template {
  type: "Template";
  files: string[];
  requires: string[];
  body: unknown[];
  partials: Record<string, unknown[]>;
}

export interface RenderOptions {
  /** Helper functions by name. */
  helpers?: Record<string, (...args: any[]) => unknown>;
  /** Prefix of generated ids. Default "t". */
  idPrefix?: string;
  /** Output limit in UTF-16 code units. Default 16 MiB. */
  maxOutput?: number;
  /** Step limit. Default 10 000 000. */
  maxSteps?: number;
}

/** The error `render` throws (§14.2). */
export interface RenderError extends Error {
  code: string;
  file?: string;
  line?: number;
  col?: number;
  path?: string;
}

export function render(ast: Template, data?: Record<string, unknown>, options?: RenderOptions): string;
