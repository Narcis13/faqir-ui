// ═══════════════════════════════════════════════════════════════════════════
// Audit rule: contrast-tokens  [task 0.4-16]
// ═══════════════════════════════════════════════════════════════════════════
//
// A static, browser-free WCAG contrast gate over a theme's token pairs. For a
// fixed list of foreground/background token pairs — body text on surfaces, and
// each solid action's label on its own color — we resolve both sides through
// the token graph (theme override → semantic → palette), compute the WCAG
// relative-luminance contrast ratio from the oklch values, and flag any pair
// that falls below the AA minimum of 4.5:1.
//
// Pure math: everything runs on the parsed stylesheets, no DOM, no rendering.
// The pair list is encoded once, here.

import type { AuditResult, Severity } from "./rules";
import type { RuleInfo } from "./rules";
import {
  parseThemeValues,
  flattenLayers,
  resolveColorString,
  parseCssColor,
  contrastRatio,
  cssColorToOklch,
  isOpaqueColor,
} from "../utils/oklch";

/** WCAG 2.x AA minimum contrast for normal-size text. */
export const CONTRAST_AA = 4.5;

/**
 * WCAG 2.2 SC 1.4.11 (Non-text Contrast) minimum, for the focus indicator.
 *
 * A focus ring is not text, so 4.5:1 would be the wrong bar — but 3:1 IS a bar,
 * and the rule could not see the ring at all. `--color-ring` was authored
 * translucent (α 0.35–0.6) in every shipped theme except `contrast`, and the
 * rule skips translucent pairs by design (a composited colour has no
 * context-free ratio), so the one token whose entire job is to be visible was
 * exempt from the check by construction. Composited, those rings landed at
 * 1.37–2.72:1 in 19 of 24 theme × mode combinations: a keyboard user could not
 * see where focus was, on almost every theme the framework ships. [W3-3]
 */
export const CONTRAST_NON_TEXT = 3;

export const CONTRAST_TOKENS_RULE: RuleInfo = {
  id: "contrast-tokens",
  severity: "error",
  applies_to: "theme token CSS (the active theme + base palette/semantic tokens)",
  exempt: [
    "color-fg-subtle and other low-emphasis/decorative weights (placeholder, disabled) — not held to AA body-text contrast",
    "interactive-state pairs (hover/active) — gated by the dedicated AAA `contrast` theme, not this general rule",
    "translucent decorative values (alpha < 1) whose declared pair is neither text-bearing nor the focus ring — contrast is undefined without a known backdrop",
  ],
  description:
    "Every declared foreground/background token pair (body text on surfaces, and " +
    "each semantic color on its subtle fill, and each solid action's label on its color) " +
    "must clear WCAG AA (≥ 4.5:1), and the focus ring must be opaque and clear the " +
    "WCAG 2.2 SC 1.4.11 non-text minimum (≥ 3:1) on every surface it can land on. Both " +
    "sides are resolved through the token graph (theme → semantic → palette) from " +
    "their oklch values — pure static math, no browser.",
};

/** A foreground-on-background token pair to check. Names omit the leading `--`. */
export interface ContrastPair {
  fg: string;
  bg: string;
}

// ── The declared pair list (encoded once) ───────────────────────────────────
//
// The model: every foreground text weight that carries real content must clear
// AA on every surface it realistically sits on, and every solid action's label
// must clear AA on its own color.
//
//   • color-fg        — primary body text — on all three surfaces.
//   • color-fg-muted  — secondary text    — on bg and the subtle surface.
//   • <sem> / <sem>-subtle — semantic text on the tinted fill components use.
//   • *-fg / *             — a button's own label on its base color.
//
// color-fg-subtle (placeholder/disabled weight) is deliberately absent: it is a
// low-emphasis decorative weight, not body text, and is not held to AA. So are
// hover/active states — see CONTRAST_TOKENS_RULE.exempt.
//
// This list is hand-written, so anything it omits is exempt by accident rather
// than by decision. `tests/audit/contrast-tokens.test.ts` asserts its exact
// contents, which is what turns "we forgot one" into a visible diff. Text-bearing semantic
// subtle fills are deliberately opaque: an alpha fill has no context-free
// contrast guarantee, so this rule reports it rather than silently skipping it.
export const CONTRAST_PAIRS: ContrastPair[] = [
  // Body text on surfaces.
  { fg: "color-fg", bg: "color-bg" },
  { fg: "color-fg", bg: "color-bg-subtle" },
  { fg: "color-fg", bg: "color-bg-muted" },
  // Secondary (muted) text on the surfaces it sits on.
  { fg: "color-fg-muted", bg: "color-bg" },
  { fg: "color-fg-muted", bg: "color-bg-subtle" },
  { fg: "color-fg-muted", bg: "color-bg-muted" },
  // An accent-coloured label on a muted plate. The gate exempted this pair by
  // forgetting it, and it went sub-AA in the shipped default theme: a `<code>`
  // plate (background `--color-bg-muted`, no colour of its own) inside a link
  // computed 4.41:1 in dark. The docs site worked around it by not nesting the
  // two; the token pair stayed reachable by anyone who wrote that markup. Adding
  // the pair, rather than only retuning the theme, is what stops it recurring in
  // the next theme somebody writes. [W3-3 · follow-up 0.7-18]
  { fg: "color-primary", bg: "color-bg-muted" },
  { fg: "color-primary", bg: "color-bg-subtle" },
  // Semantic text on the subtle fills used by badge/callout/chip/stat/stepper.
  { fg: "color-primary", bg: "color-primary-subtle" },
  { fg: "color-destructive", bg: "color-destructive-subtle" },
  { fg: "color-success", bg: "color-success-subtle" },
  { fg: "color-warning", bg: "color-warning-subtle" },
  { fg: "color-info", bg: "color-info-subtle" },
  // Solid action labels on their own color.
  { fg: "color-primary-fg", bg: "color-primary" },
  { fg: "color-secondary-fg", bg: "color-secondary" },
  { fg: "color-destructive-fg", bg: "color-destructive" },
];

/**
 * Non-text pairs, held to SC 1.4.11's 3:1 rather than AA's 4.5:1.
 *
 * The focus ring against every surface a focusable control sits on. Unlike the
 * text pairs above, a translucent value here is a FINDING rather than a skip:
 * "the ring is see-through so we cannot judge it" is exactly how a ring nobody
 * can see passed the gate in 19 of 24 theme × mode combinations.
 */
export const NON_TEXT_PAIRS: ContrastPair[] = [
  { fg: "color-ring", bg: "color-bg" },
  { fg: "color-ring", bg: "color-bg-subtle" },
  { fg: "color-ring", bg: "color-bg-muted" },
  { fg: "color-ring", bg: "color-surface-1" },
  { fg: "color-ring", bg: "color-surface-2" },
];

/** The color schemes a theme declares. `auto` mirrors `dark` by construction. */
const SCHEMES = ["light", "dark"] as const;
type Scheme = (typeof SCHEMES)[number];

/** Minimum OKLab Euclidean delta between adjacent elevation colors. */
export const ELEVATION_MIN_DELTA = 0.03;

export const SURFACE_ELEVATION_RULE: RuleInfo = {
  id: "surface-elevation",
  severity: "error",
  applies_to: "theme token CSS (the active theme + base palette/semantic tokens)",
  description:
    "The bg → surface-1 → surface-2 elevation ramp, including each surface's border, " +
    `must keep an adjacent OKLab ΔE of at least ${ELEVATION_MIN_DELTA.toFixed(2)} in light and dark schemes.`,
};

/** Pairs that make both the fill ramp and its borders mechanically separable. */
export const ELEVATION_PAIRS: ContrastPair[] = [
  { fg: "color-bg", bg: "color-surface-1" },
  { fg: "color-surface-1", bg: "color-surface-2" },
  { fg: "color-surface-1", bg: "color-surface-1-border" },
  { fg: "color-surface-2", bg: "color-surface-2-border" },
];

export interface ThemeContrastInput {
  /** Theme identifier, for messages (e.g. "aurora"). */
  themeName: string;
  /** The theme stylesheet (its `:root` + `[data-theme="dark"]` overrides). */
  themeCss: string;
  /**
   * The base token stylesheets concatenated — palette + semantic + aliases.
   * Supplies the `:root` defaults a theme inherits when it doesn't override a
   * token, and the palette literals that `var()` chains terminate at.
   */
  baseCss: string;
  /** Path recorded on each finding (defaults to `themeName`). */
  file?: string;
  /** Minimum ratio; defaults to CONTRAST_AA (4.5). */
  threshold?: number;
  /** Pair list override, for tests; defaults to CONTRAST_PAIRS. */
  pairs?: ContrastPair[];
  /** Non-text (3:1) pair list override, for tests; defaults to NON_TEXT_PAIRS. */
  nonTextPairs?: ContrastPair[];
}

/** Euclidean distance in OKLab, the perceptually uniform space underlying OKLCH. */
export function perceptualDelta(colorA: string, colorB: string): number | null {
  const a = cssColorToOklch(colorA);
  const b = cssColorToOklch(colorB);
  if (!a || !b) return null;
  const aHue = (a.h * Math.PI) / 180;
  const bHue = (b.h * Math.PI) / 180;
  const aa = a.c * Math.cos(aHue);
  const ab = a.c * Math.sin(aHue);
  const ba = b.c * Math.cos(bHue);
  const bb = b.c * Math.sin(bHue);
  return Math.hypot(a.l - b.l, aa - ba, ab - bb);
}

function isSemanticSubtlePair(fg: string, bg: string): boolean {
  return bg === `${fg}-subtle` && /^color-(?:primary|destructive|success|warning|info)$/.test(fg);
}

/**
 * Per-scheme name → raw-value lookups, modeling the cascade a browser applies:
 * a theme's dark block overrides its light block, which overrides the base
 * `:root` tokens. Resolution then follows `var()` hops within a single scheme.
 */
export function buildSchemeLookups(
  themeCss: string,
  baseCss: string,
): Record<Scheme, Map<string, string>> {
  const base = parseThemeValues(baseCss);
  const theme = parseThemeValues(themeCss);
  return {
    // Light: theme's :root overrides beat base :root defaults.
    light: flattenLayers([theme.light, base.light]),
    // Dark: theme dark overrides, then theme light, then base light (the
    // cascade fallback for any token the dark block doesn't restate).
    dark: flattenLayers([theme.dark, theme.light, base.light]),
  };
}

/** 1-based line of the last `--<token>:` declaration in `css`, or 0 if absent. */
function tokenLine(css: string, token: string): number {
  const re = new RegExp(`--${token.replace(/[-]/g, "\\-")}\\s*:`);
  const lines = css.split("\n");
  let found = 0;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) found = i + 1;
  }
  return found;
}

/**
 * Run the contrast gate over one theme. Returns a finding per pair × scheme that
 * resolves to two opaque colors and falls below the threshold. Undefined or
 * non-color values are skipped. A translucent semantic-subtle pair is itself a
 * finding because text-bearing fills need a context-free contrast guarantee;
 * other translucent decorative pairs remain outside the rule.
 */
export function checkThemeContrast(input: ThemeContrastInput): AuditResult[] {
  const threshold = input.threshold ?? CONTRAST_AA;
  const pairs = input.pairs ?? CONTRAST_PAIRS;
  const file = input.file ?? input.themeName;
  const severity: Severity = CONTRAST_TOKENS_RULE.severity;
  const lookups = buildSchemeLookups(input.themeCss, input.baseCss);
  const results: AuditResult[] = [];

  for (const scheme of SCHEMES) {
    const lk = lookups[scheme];
    for (const { fg, bg } of pairs) {
      const fgRaw = lk.get(fg);
      const bgRaw = lk.get(bg);
      if (fgRaw == null || bgRaw == null) continue; // token undefined in this scheme

      const fgVal = resolveColorString(fgRaw, lk);
      const bgVal = resolveColorString(bgRaw, lk);
      if (!fgVal || !bgVal) continue; // dead-ends at a non-color / missing token

      // Text-bearing semantic fills must be context-free. Reporting alpha here
      // is what removes the old decorative `-subtle` exemption: otherwise the
      // newly declared pair could still evade the rule before ratio math.
      if (!isOpaqueColor(fgVal) || !isOpaqueColor(bgVal)) {
        if (isSemanticSubtlePair(fg, bg)) {
          const line = tokenLine(input.themeCss, bg) || tokenLine(input.themeCss, fg) || 1;
          results.push({
            rule_id: CONTRAST_TOKENS_RULE.id,
            severity,
            component_name: input.themeName,
            file,
            line,
            message:
              `[${input.themeName} · ${scheme}] --${fg} on --${bg} cannot be guaranteed because ` +
              `the text-bearing pair is translucent (${fgVal} on ${bgVal}). Use opaque colors and ` +
              `clear the ${threshold}:1 WCAG AA minimum.`,
          });
        }
        continue;
      }

      const fgRgb = parseCssColor(fgVal);
      const bgRgb = parseCssColor(bgVal);
      if (!fgRgb || !bgRgb) continue;

      const ratio = contrastRatio(fgRgb, bgRgb);
      if (ratio >= threshold) continue;

      // Point at the failing foreground's declaration when the theme states it;
      // otherwise the background's; otherwise the top of the file (inherited).
      const line = tokenLine(input.themeCss, fg) || tokenLine(input.themeCss, bg) || 1;

      results.push({
        rule_id: CONTRAST_TOKENS_RULE.id,
        severity,
        component_name: input.themeName,
        file,
        line,
        message:
          `[${input.themeName} · ${scheme}] --${fg} on --${bg} is ${ratio.toFixed(2)}:1 — ` +
          `below the ${threshold}:1 WCAG AA minimum (${fgVal} on ${bgVal}). ` +
          `Darken the background or the foreground until the pair clears ${threshold}:1.`,
      });
    }
  }

  results.push(...checkNonTextContrast(input, lookups, file, severity));

  return results;
}

/**
 * The SC 1.4.11 half: the focus ring, at 3:1, on every surface it lands on.
 *
 * Two findings are possible, and the first is the one that mattered. A
 * translucent ring is reported rather than skipped, because a ring's whole job
 * is to be visible and "we cannot compute it" is not a pass — the shipped
 * default was `oklch(… / 0.4)`, which composites to 1.47:1 on its own page
 * background. Opaque rings are then measured normally.
 */
function checkNonTextContrast(
  input: ThemeContrastInput,
  lookups: Record<Scheme, Map<string, string>>,
  file: string,
  severity: Severity,
): AuditResult[] {
  // An explicit `pairs` override means the caller is driving the text half only.
  if (input.pairs && !input.nonTextPairs) return [];
  const pairs = input.nonTextPairs ?? NON_TEXT_PAIRS;
  const results: AuditResult[] = [];

  for (const scheme of SCHEMES) {
    const lk = lookups[scheme];
    // One report per scheme for a translucent ring: the same token, not five.
    const translucent = new Set<string>();

    for (const { fg, bg } of pairs) {
      const fgRaw = lk.get(fg);
      const bgRaw = lk.get(bg);
      if (fgRaw == null || bgRaw == null) continue;

      const fgVal = resolveColorString(fgRaw, lk);
      const bgVal = resolveColorString(bgRaw, lk);
      if (!fgVal || !bgVal) continue;

      if (!isOpaqueColor(fgVal)) {
        if (translucent.has(fg)) continue;
        translucent.add(fg);
        results.push({
          rule_id: CONTRAST_TOKENS_RULE.id,
          severity,
          component_name: input.themeName,
          file,
          line: tokenLine(input.themeCss, fg) || 1,
          message:
            `[${input.themeName} · ${scheme}] --${fg} is translucent (${fgVal}), so the focus ` +
            `indicator it draws has no contrast guarantee against any surface. WCAG 2.2 SC 1.4.11 ` +
            `requires ${CONTRAST_NON_TEXT}:1; make --${fg} opaque.`,
        });
        continue;
      }
      if (!isOpaqueColor(bgVal)) continue; // a translucent SURFACE is out of scope

      const fgRgb = parseCssColor(fgVal);
      const bgRgb = parseCssColor(bgVal);
      if (!fgRgb || !bgRgb) continue;

      const ratio = contrastRatio(fgRgb, bgRgb);
      if (ratio >= CONTRAST_NON_TEXT) continue;

      results.push({
        rule_id: CONTRAST_TOKENS_RULE.id,
        severity,
        component_name: input.themeName,
        file,
        line: tokenLine(input.themeCss, fg) || tokenLine(input.themeCss, bg) || 1,
        message:
          `[${input.themeName} · ${scheme}] --${fg} on --${bg} is ${ratio.toFixed(2)}:1 — below the ` +
          `${CONTRAST_NON_TEXT}:1 WCAG 2.2 SC 1.4.11 minimum for a focus indicator ` +
          `(${fgVal} on ${bgVal}).`,
      });
    }
  }

  return results;
}

/**
 * Check the canonical elevation ramp with the same theme/scheme cascade model
 * as text contrast. Missing, translucent, or unparseable ramp colors are
 * findings: unlike decorative colors, an elevation guarantee may not be skipped.
 */
export function checkThemeElevation(input: ThemeContrastInput): AuditResult[] {
  const threshold = input.threshold ?? ELEVATION_MIN_DELTA;
  const pairs = input.pairs ?? ELEVATION_PAIRS;
  const file = input.file ?? input.themeName;
  const severity: Severity = SURFACE_ELEVATION_RULE.severity;
  const lookups = buildSchemeLookups(input.themeCss, input.baseCss);
  const results: AuditResult[] = [];

  for (const scheme of SCHEMES) {
    const lookup = lookups[scheme];
    for (const { fg, bg } of pairs) {
      const from = lookup.get(fg);
      const to = lookup.get(bg);
      const fromValue = from == null ? null : resolveColorString(from, lookup);
      const toValue = to == null ? null : resolveColorString(to, lookup);
      const delta = fromValue && toValue ? perceptualDelta(fromValue, toValue) : null;
      if (delta != null && delta + Number.EPSILON >= threshold) continue;

      const line = tokenLine(input.themeCss, bg) || tokenLine(input.themeCss, fg) || 1;
      const measured = delta == null ? "unresolvable" : delta.toFixed(3);
      results.push({
        rule_id: SURFACE_ELEVATION_RULE.id,
        severity,
        component_name: input.themeName,
        file,
        line,
        message:
          `[${input.themeName} · ${scheme}] --${fg} → --${bg} has OKLab ΔE ${measured}; ` +
          `the elevation ramp requires at least ${threshold.toFixed(2)}.`,
      });
    }
  }

  return results;
}
