/**
 * Scan configuration for the a11y gate (task 0.4-24 · FAQIR-PLAN §12.3).
 *
 * The gate enforces the WCAG 2.0 + 2.1, Level A + AA success criteria — the
 * conformance target the registry commits to. axe's `best-practice` tag (rules
 * like `region` / `page-has-heading-one` that are advisory, not WCAG failures)
 * is deliberately excluded: the reference pages are isolated component fragments,
 * not whole documents, so those rules would flag structure that is correct in
 * context and turn the gate into noise. Kept as a standalone, pure constant so
 * both the spec and the meta-test reference one authoritative list.
 */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;
