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
  isOpaqueColor,
} from "../utils/oklch";

/** WCAG 2.x AA minimum contrast for normal-size text. */
export const CONTRAST_AA = 4.5;

export const CONTRAST_TOKENS_RULE: RuleInfo = {
  id: "contrast-tokens",
  severity: "error",
  applies_to: "theme token CSS (the active theme + base palette/semantic tokens)",
  exempt: [
    "color-fg-subtle and other low-emphasis/decorative weights (placeholder, disabled) — not held to AA body-text contrast",
    "interactive-state pairs (hover/active) — gated by the dedicated AAA `contrast` theme, not this general rule",
    "translucent token values (alpha < 1) — contrast is undefined without a known backdrop, so the pair is skipped, not guessed",
  ],
  description:
    "Every declared foreground/background token pair (body text on surfaces, and " +
    "each solid action's label on its color) must clear WCAG AA (≥ 4.5:1). Both " +
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
//   • *-fg / *         — a button's own label on its base color.
//
// color-fg-subtle (placeholder/disabled weight) is deliberately absent: it is a
// low-emphasis decorative weight, not body text, and is not held to AA. So are
// hover/active states and the tinted `-subtle` feedback backgrounds (often
// translucent) — see CONTRAST_TOKENS_RULE.exempt.
export const CONTRAST_PAIRS: ContrastPair[] = [
  // Body text on surfaces.
  { fg: "color-fg", bg: "color-bg" },
  { fg: "color-fg", bg: "color-bg-subtle" },
  { fg: "color-fg", bg: "color-bg-muted" },
  // Secondary (muted) text on the surfaces it sits on.
  { fg: "color-fg-muted", bg: "color-bg" },
  { fg: "color-fg-muted", bg: "color-bg-subtle" },
  // Solid action labels on their own color.
  { fg: "color-primary-fg", bg: "color-primary" },
  { fg: "color-secondary-fg", bg: "color-secondary" },
  { fg: "color-destructive-fg", bg: "color-destructive" },
];

/** The color schemes a theme declares. `auto` mirrors `dark` by construction. */
const SCHEMES = ["light", "dark"] as const;
type Scheme = (typeof SCHEMES)[number];

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
 * resolves to two opaque colors and falls below the threshold. Pairs that can't
 * be resolved to two opaque colors (undefined token, non-color value, or a
 * translucent value whose contrast needs a backdrop) are skipped — the rule
 * never invents a ratio it can't compute.
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

      // Contrast is only defined over opaque colors; a translucent side would
      // need its backdrop composited in, which we can't do statically.
      if (!isOpaqueColor(fgVal) || !isOpaqueColor(bgVal)) continue;

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

  return results;
}
