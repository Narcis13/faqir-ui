/**
 * Documented exemption mechanism for the automated a11y gate
 * (task 0.4-24 · FAQIR-PLAN §12.3).
 *
 * The registry runs a **zero-violation** policy: a real accessibility problem is
 * fixed, not suppressed. This list is the *only* sanctioned escape hatch, for the
 * rare case where axe reports a genuine false positive (e.g. a rule that
 * mis-fires on a deliberately-static reference fragment). Every entry is:
 *
 *   - **per-rule**    — scoped to a single axe rule id, never a blanket mute;
 *   - **per-page**    — scoped to one component (or "*" for every page, used only
 *                       for a rule that is a false positive framework-wide);
 *   - **justified**   — a non-empty `justification` explaining *why* it is a false
 *                       positive. The meta-test rejects an empty justification, so
 *                       an exemption can never be added silently.
 *
 * An exemption is a documented, reviewable decision, not a way to quiet the gate.
 * When you add one, the diff carries the justification with it. The only entries
 * here waive `color-contrast` on the *disabled* state of three controls, which
 * WCAG 2 SC 1.4.3 explicitly exempts ("inactive user interface component") —
 * axe cannot tell an inactive control from an active one, so it over-reports.
 * Everything else the gate found was fixed at the source (see git log for 0.4-24).
 */

import type { AxeViolation } from "./axe-types";

export interface A11yExemption {
  /** axe rule id this exemption waives, e.g. "color-contrast". */
  rule: string;
  /** Component name (from the `@ui:component` header) the waiver applies to,
   *  or "*" to waive the rule on every reference page. */
  component: string;
  /** Why this violation is a false positive. Must be non-empty — enforced by the
   *  meta-test. Written for the next person who reads the gate output. */
  justification: string;
}

/** Wildcard that widens an exemption's `component` scope to every page. */
export const ALL_COMPONENTS = "*";

/**
 * The active exemptions. Add an entry ONLY for a confirmed axe false positive,
 * always with a justification a reviewer can weigh. The three below all cover the
 * WCAG 2 SC 1.4.3 "inactive component" exception, which axe does not implement.
 */
export const A11Y_EXEMPTIONS: readonly A11yExemption[] = [
  {
    rule: "color-contrast",
    component: "label",
    justification:
      "Only the disabled-state label (label[data-state=disabled]) is below 4.5:1. " +
      "WCAG 2 SC 1.4.3 exempts text that is part of an inactive UI component; a " +
      "muted disabled label is the intended affordance. Active labels use --color-fg.",
  },
  {
    rule: "color-contrast",
    component: "switch",
    justification:
      "Only the two disabled switches' labels are below 4.5:1. WCAG 2 SC 1.4.3 " +
      "exempts inactive UI components; the muted label signals the control is disabled.",
  },
  {
    rule: "color-contrast",
    component: "slider",
    justification:
      "Only the disabled slider's value output ([data-disabled] > output) is below " +
      "4.5:1. WCAG 2 SC 1.4.3 exempts inactive UI components; a muted readout is the " +
      "intended disabled affordance.",
  },
];

/**
 * The exemption (if any) that waives `ruleId` for `component`. A wildcard
 * (`component: "*"`) entry matches any component; an exact name match wins too.
 */
export function findExemption(
  ruleId: string,
  component: string,
  exemptions: readonly A11yExemption[] = A11Y_EXEMPTIONS,
): A11yExemption | undefined {
  return exemptions.find(
    (e) => e.rule === ruleId && (e.component === ALL_COMPONENTS || e.component === component),
  );
}

export interface PartitionedViolations {
  /** Violations that fail the gate (no matching exemption). */
  blocking: AxeViolation[];
  /** Violations waived by an exemption, paired with the entry that waived them. */
  exempted: { violation: AxeViolation; exemption: A11yExemption }[];
}

/**
 * Split a page's axe violations into gate-failing and exemption-waived buckets,
 * keyed on the page's component name. Pure — no browser, no axe engine — so the
 * partitioning contract is unit-testable in `bun test`.
 */
export function partitionViolations(
  violations: readonly AxeViolation[],
  component: string,
  exemptions: readonly A11yExemption[] = A11Y_EXEMPTIONS,
): PartitionedViolations {
  const blocking: AxeViolation[] = [];
  const exempted: { violation: AxeViolation; exemption: A11yExemption }[] = [];
  for (const violation of violations) {
    const exemption = findExemption(violation.id, component, exemptions);
    if (exemption) exempted.push({ violation, exemption });
    else blocking.push(violation);
  }
  return { blocking, exempted };
}
