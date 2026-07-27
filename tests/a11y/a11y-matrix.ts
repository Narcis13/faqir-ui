/**
 * Accessibility (axe-core) matrix — generated from the registry at runtime
 * (task 0.4-24 · FAQIR-PLAN §12.3).
 *
 * Deliberately built on the **same discovery util** as the visual-regression
 * suite (`../visual/matrix`): `discoverComponents()` is the single source of truth
 * for *which* reference pages exist, and `buildPageHtml()` assembles the identical
 * self-contained, network-free document. So the a11y gate and the visual gate can
 * never disagree about the set of pages under test — a component added to one is
 * automatically covered by the other, with zero suite edits. The meta-test
 * (`a11y-matrix.test.ts`) asserts that parity directly.
 *
 * The a11y axes are narrower than the visual matrix on purpose:
 *
 *   every component  ×  { default, contrast } themes  ×  { light, dark }
 *
 * §12.3 requires "at least default + contrast themes, light+dark". axe rules are
 * DOM/role/contrast checks: colour-contrast is scheme- and theme-sensitive (hence
 * both schemes and both a neutral + a high-contrast theme), but nothing axe
 * evaluates depends on text direction, so the RTL axis the visual suite sweeps
 * would only double the runtime without covering a new failure mode. Widen
 * `A11Y_THEMES` to sweep more themes at any time — it stays a subset of the
 * registry's themes, guarded by the meta-test.
 *
 * Task 0.8-11 adds a second, narrower matrix below — `buildMobileA11yMatrix` —
 * which re-scans only the layout-bearing set at 390px, where mobile layouts have
 * failure classes the desktop scan cannot see.
 */

import {
  discoverComponents,
  discoverThemes,
  buildPageHtml,
  SCHEMES,
  type Case,
  type Component,
} from "../visual/matrix";
import { discoverLayoutBearing } from "../visual/responsive-matrix";

/**
 * Themes the a11y gate sweeps. `default` is the neutral baseline; `contrast` is
 * the WCAG-AAA high-contrast theme (`registry/themes/contrast.theme.json`,
 * mood: wcag-aaa). Both must exist in the registry — enforced by `buildA11yMatrix`
 * and the meta-test.
 */
export const A11Y_THEMES = ["default", "contrast"] as const;
export type A11yTheme = (typeof A11Y_THEMES)[number];

// The a11y suite captures each page in one direction — axe evaluates roles,
// names, and contrast, none of which change with `dir`. LTR is the canonical one.
const A11Y_DIRECTION = "ltr" as const;

export interface A11yCase extends Case {
  theme: A11yTheme;
}

/**
 * The full a11y cross-product: every discovered component × each a11y theme ×
 * both schemes. Each case is a visual-suite `Case` (so `buildPageHtml` consumes
 * it unchanged) with `dir` pinned to LTR and a stable, unique id.
 *
 * Throws if a required a11y theme is missing from the registry, so a renamed or
 * deleted theme fails loudly here instead of silently shrinking the gate.
 */
export function buildA11yMatrix(components: Component[] = discoverComponents()): A11yCase[] {
  const available = new Set(discoverThemes());
  const missing = A11Y_THEMES.filter((t) => !available.has(t));
  if (missing.length) {
    throw new Error(
      `a11y matrix: required theme(s) not found in registry/themes: ${missing.join(", ")}`,
    );
  }

  const cases: A11yCase[] = [];
  for (const component of components) {
    for (const theme of A11Y_THEMES) {
      for (const scheme of SCHEMES) {
        cases.push({
          component,
          theme,
          scheme,
          dir: A11Y_DIRECTION,
          id: `${component.kind}__${component.name}__${theme}__${scheme}`,
        });
      }
    }
  }
  return cases;
}

// ── the mobile sweep (task 0.8-11) ───────────────────────────────────────────

/**
 * The phone viewport the mobile sweep scans at — the same 390px the viewport
 * axis of the visual suite captures at, so the two gates look at the identical
 * rendering. 844 is the iPhone 14's height; axe evaluates the whole document,
 * not the fold, so it matters only for what `position: fixed` overlays cover.
 */
export const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844 });

/** One mobile scan: a layout-bearing page at the phone width. */
export interface MobileA11yCase extends A11yCase {
  width: number;
}

/**
 * The mobile a11y sweep: the **layout-bearing set** (manifest `category: layout`
 * or `kind: pattern` — the same discovery the viewport axis of the visual suite
 * uses, imported, not re-implemented) × the a11y themes × both schemes, all at
 * 390px.
 *
 * Why only that set, and why at all when the desktop scan is already green: a
 * mobile layout is a *different DOM rendering* of the same markup, and it has
 * failure classes the 1280px scan structurally cannot see — an off-canvas drawer
 * that is `position: fixed` and translated out of view but still focusable, a
 * pane hidden by a media query, controls that reflow into overlapping targets, a
 * heading order that only holds while two columns sit side by side. Components
 * with no responsive behaviour render identically at both widths, so scanning
 * them again would double the job for zero new information — which is exactly
 * the set this filter excludes.
 */
export function buildMobileA11yMatrix(
  components: Component[] = discoverLayoutBearing(),
): MobileA11yCase[] {
  const cases: MobileA11yCase[] = [];
  for (const component of components) {
    for (const theme of A11Y_THEMES) {
      for (const scheme of SCHEMES) {
        cases.push({
          component,
          theme,
          scheme,
          dir: A11Y_DIRECTION,
          width: MOBILE_VIEWPORT.width,
          id: `mobile__${component.kind}__${component.name}__${theme}__${scheme}`,
        });
      }
    }
  }
  return cases;
}

// Re-exported so the spec assembles pages through the exact same builder the
// visual suite uses — one code path, no divergence.
export { buildPageHtml, discoverComponents, discoverLayoutBearing };
