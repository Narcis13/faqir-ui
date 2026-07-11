/**
 * Human-readable formatting for axe violations (task 0.4-24 · FAQIR-PLAN §12.3).
 *
 * The acceptance criterion is that a gate failure "names component + rule +
 * selector". This module turns axe's result objects into exactly that — one
 * block per rule, every offending selector listed — so a red CI run tells you
 * *what* broke and *where* without opening a report artifact. Pure and
 * browser-free, so the exact wording is pinned by a `bun test` unit test.
 */

import type { AxeNode, AxeViolation } from "./axe-types";

/**
 * axe's `node.target` is `string[]` for a single frame and `string[][]` for a
 * nested-frame path. Flatten either into one CSS selector string. Falls back to a
 * placeholder so a malformed/empty target never yields a blank, uninformative line.
 */
export function selectorOf(node: AxeNode): string {
  const flat = (node.target ?? [])
    .flat(Infinity as number)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  return flat.length ? flat.join(" ") : "<unknown selector>";
}

/**
 * One violation → a labelled block naming the rule and each offending selector:
 *
 *   ✗ [color-contrast] Elements must have sufficient colour contrast (serious)
 *       https://dequeuniversity.com/rules/axe/4.12/color-contrast
 *       → main.vr-root > .btn:nth-child(2)
 *       → main.vr-root > .badge
 */
export function formatViolation(v: AxeViolation): string {
  const impact = v.impact ? ` (${v.impact})` : "";
  const help = v.help ? ` ${v.help}` : "";
  const lines = [`  ✗ [${v.id}]${help}${impact}`];
  if (v.helpUrl) lines.push(`      ${v.helpUrl}`);
  for (const node of v.nodes) lines.push(`      → ${selectorOf(node)}`);
  return lines.join("\n");
}

/**
 * The full failure message for one page: a header naming the component/case,
 * then every blocking violation. `caseLabel` is the matrix case id (component +
 * theme + scheme), so the failing component is always named up front.
 */
export function formatViolations(caseLabel: string, violations: readonly AxeViolation[]): string {
  const count = violations.reduce((n, v) => n + v.nodes.length, 0);
  const header =
    `${violations.length} axe rule violation(s), ${count} element(s), on ${caseLabel}:`;
  return [header, ...violations.map(formatViolation)].join("\n");
}
