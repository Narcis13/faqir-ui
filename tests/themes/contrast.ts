// ═══════════════════════════════════════════════════════════════════════════
// Contrast util — re-export of the shared oklch pipeline  [tasks 0.4-13, 0.4-16]
// ═══════════════════════════════════════════════════════════════════════════
//
// The manual oklch → WCAG contrast math (added in 0.4-13) moved to the shared
// `src/utils/oklch.ts` in 0.4-16, where it also backs the `contrast-tokens`
// audit rule. The theme spot-checks (contrast.test.ts) import from here, so this
// file stays as the thin re-export that keeps that entry point stable.

export {
  oklchToLinearRgb,
  relativeLuminance,
  parseCssColor,
  colorAlpha,
  isOpaqueColor,
  contrastRatio,
  contrastOf,
  parseThemeValues,
  resolveColorString,
  flattenLayers,
  type LinearRgb,
  type SchemeValues,
} from "../../src/utils/oklch";
