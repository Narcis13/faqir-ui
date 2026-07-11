/**
 * Minimal structural types for the slice of axe-core's result shape this suite
 * consumes (task 0.4-24 · FAQIR-PLAN §12.3).
 *
 * Declared locally rather than imported from `axe-core` so the pure reporting /
 * exemption logic — and its `bun test` meta-tests — never has to pull the axe
 * engine (a browser-only dependency) into the fast unit suite. The real
 * `AxeResults` from `@axe-core/playwright` is structurally assignable to these.
 */

/** One offending DOM node inside a violation. */
export interface AxeNode {
  /** CSS selector(s) locating the node. axe returns `string[]` for a single
   *  frame (nested-frame targets are `string[][]`); we handle both defensively. */
  target: unknown[];
  html?: string;
  failureSummary?: string;
  impact?: string | null;
}

/** One failing axe rule, with every node that tripped it. */
export interface AxeViolation {
  /** The axe rule id, e.g. "color-contrast", "button-name". */
  id: string;
  impact?: string | null;
  help?: string;
  helpUrl?: string;
  nodes: AxeNode[];
}
