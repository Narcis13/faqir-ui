/**
 * `@faqir-ui/rules/plugin` — the browser glue, for bundlers. [1.1B-04 · §8.3]
 *
 * Importing this module SELF-REGISTERS with a global `Faqir` if one is already
 * present, which is why the package marks it as its only side-effectful file.
 * A page that loads `registry/core/plugins/faqir-rules.js` with a `<script>`
 * tag needs none of this; `install` is here for the bundled case, where the
 * plugin is imported after faqir-core and installed by hand.
 */

/**
 * The slice of faqir-core the plugin uses. Deliberately structural: this
 * package declares no dependency on the engine, so the real `Faqir` global
 * satisfies it without either side importing the other.
 */
export interface RulesPluginEngine {
  reactive(target: Record<string, unknown>): Record<string, unknown>;
  evaluate(expression: string, scope: unknown, el: unknown): unknown;
  magic(name: string, callback: (el: unknown, scope: unknown) => unknown): void;
  directive(
    name: string,
    /** The `l-rules` handler returns its cleanup, which the engine runs when the form's scope is destroyed. */
    handler: (el: any, dir: { expression?: string }, scope: any) => unknown,
  ): void;
  devtools?: { report?(message: string, el?: unknown): boolean };
  /** Written by `install`: the plugin's public surface, `Faqir.rules`. */
  rules?: RulesApi;
  validate?: {
    register(
      form: unknown,
      field: string,
      name: string,
      fn: (value: unknown, ctx: unknown) => unknown,
      message?: string,
    ): unknown; // faqir-validate answers with the function that undoes it
  };
}

/** `Faqir.rules`, installed beside `l-rules` and `$rules`. */
export interface RulesApi {
  /**
   * The form's data as a server's `coerce(definition, fromFormData(body))`
   * would make it: every named control read the way `FormData` reads it, except
   * that a control someone else disabled (a wizard's other steps) still answers
   * and one a `show` rule hides does not. On a form with no bound `l-rules` it
   * is the uncoerced `fromFormData` read. `form` is an element or a selector.
   */
  data(form: Element | string): Record<string, unknown>;
}

/** Register `l-rules` and the `$rules` magic on one engine instance. */
export declare function install(Faqir: RulesPluginEngine): void;
