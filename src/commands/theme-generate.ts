import {
  buildSchemeLookups,
  checkThemeContrast,
  checkThemeElevation,
  CONTRAST_AA,
  CONTRAST_NON_TEXT,
  CONTRAST_PAIRS,
  ELEVATION_MIN_DELTA,
  ELEVATION_PAIRS,
  NON_TEXT_PAIRS,
  perceptualDelta,
} from "../audit/contrast-tokens";
import {
  inheritedTokens,
  overriddenTokens,
  stripCssComments,
  surfaceTokens,
  validateThemeManifest,
  type ThemeManifest,
  type ThemeSchemeDecl,
} from "../theme-manifest";
import {
  contrastOf,
  cssColorToOklch,
  isOpaqueColor,
  parseCssColor,
  parseThemeValues,
  resolveColorString,
  contrastRatio,
  type OklchColor,
} from "../utils/oklch";
import { axesFromCss } from "../theme/axes";
import {
  axisDeclarations,
  densityDirective,
  depthFamily,
  neutralAxisFor,
  neutralTint,
  NEUTRAL_TINT_MIN_CHROMA,
  type Declaration,
  type NeutralTint,
} from "../theme/families";
import {
  expectedAxes,
  normalizeSeed,
  SHAPE_LEGACY_RADIUS,
  seedRecord,
  type NormalizedSeed,
  type ThemeRadius,
  type ThemeSeedInput,
} from "../theme/seed";
import type { ThemeAxes, ThemeSeed } from "../theme-manifest";

/** The 1.0 neutral flag. A 1.1 seed may also say `tinted`. */
export type ThemeNeutral = "cool" | "warm" | "gray";
/** The `contrast` axis, which picks which neutral surface ramp is used. */
export type ThemeContrast = "standard" | "high";
export type { ThemeRadius };

/**
 * What `generateThemeBundle` accepts. This is the full 1.1 seed plus the two
 * 1.0 flags that never became axes (`radius`, `legacyBlocks`) — so every 1.0
 * call site keeps compiling and keeps producing the same colours, and a 1.1
 * caller passes a `.seed.json` straight through.
 *
 * `legacyBlocks` emits a dual-scheme theme as three colour blocks (`:root`,
 * `[data-theme="dark"]`, and the `prefers-color-scheme` mirror) instead of one
 * `light-dark()` block [1.1A-06]. Ignored for single-scheme themes, which have
 * nothing to collapse.
 */
export type ThemeGenerateInput = ThemeSeedInput;

export interface GeneratedContrastRatio {
  theme: string;
  scheme: "light" | "dark";
  foreground: string;
  background: string;
  foreground_value: string;
  background_value: string;
  ratio: number;
  threshold: number;
  passes: boolean;
  auto_adjusted: boolean;
}

export interface GeneratedThemeFile {
  kind: "theme" | "document";
  name: string;
  css_path: string;
  manifest_path: string;
  css: string;
  manifest: ThemeManifest & { $schema: string };
  contrast: GeneratedContrastRatio[];
}

export interface GeneratedThemeBundle {
  name: string;
  accent: {
    input: string;
    oklch: string;
    lightness: number;
    chroma: number;
    hue: number;
  };
  neutral: ThemeSeed["neutral"];
  radius: ThemeRadius;
  scheme: ThemeSchemeDecl;
  document: boolean;
  /** Whether the dual-scheme output was written as three blocks [1.1A-06]. */
  legacyBlocks: boolean;
  /** The seed, filled out to every axis — what 1.1A-11 writes to `<name>.seed.json`. */
  seed: ThemeSeed;
  /** The fourteen axes the emitted stylesheet actually derives to. */
  axes: ThemeAxes;
  generated: GeneratedThemeFile[];
}

export const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

const CHROMA_CURVE = [0.18, 0.32, 0.5, 0.7, 0.88, 1, 1, 0.92, 0.78, 0.6, 0.42] as const;
const LIGHTER_CURVE = [0.9, 0.78, 0.62, 0.45, 0.25] as const;
const DARKER_CURVE = [0.88, 0.72, 0.56, 0.4, 0.25] as const;

interface AccentStep {
  step: (typeof ACCENT_STEPS)[number];
  color: OklchColor;
  css: string;
}

interface PrimarySelection {
  index: number;
  hoverIndex: number;
  activeIndex: number;
  primary: string;
  hover: string;
  active: string;
  foreground: string;
  adjusted: boolean;
  ratio: number;
}

// ── The neutral surface ramp, per contrast level ────────────────────────────
//
// Every neutral surface and text weight, as `[lightness, chromaScale]`. The
// `standard` rows are the 1.0 generator's own numbers, moved out of the
// declaration lists so the `high` variant can state only what it changes and a
// reader can see the two ramps side by side.
//
// `high` exists to make the 1.1A-08 `contrast` classifier return `high`, which
// asks two things of EVERY shipped scheme: body text at least
// CONTRAST_HIGH_TEXT_MIN (15:1) on the page, and a strong border that still
// clears SC 1.4.11's 3:1. The 1.0 ramp already cleared the first (19.6:1 in
// light) and missed the second at 2.7:1 — which is why `high` moves the
// borders as much as it moves the text.

type NeutralRole =
  | "bg"
  | "bg-subtle"
  | "bg-muted"
  | "fg"
  | "fg-muted"
  | "fg-subtle"
  | "secondary"
  | "secondary-hover"
  | "secondary-fg"
  | "border"
  | "border-strong";

type NeutralRamp = Record<NeutralRole, readonly [lightness: number, chromaScale: number]>;

const LIGHT_SURFACES: Record<ThemeContrast, NeutralRamp> = {
  standard: {
    bg: [0.995, 0.1],
    "bg-subtle": [0.96, 0.25],
    "bg-muted": [0.92, 0.4],
    fg: [0.14, 1],
    "fg-muted": [0.4, 1],
    "fg-subtle": [0.53, 1],
    secondary: [0.94, 0.4],
    "secondary-hover": [0.89, 0.55],
    "secondary-fg": [0.16, 1],
    border: [0.84, 0.6],
    "border-strong": [0.7, 0.8],
  },
  high: {
    bg: [1, 0.1],
    "bg-subtle": [0.96, 0.25],
    "bg-muted": [0.92, 0.4],
    fg: [0.15, 1],
    "fg-muted": [0.32, 1],
    "fg-subtle": [0.4, 1],
    secondary: [0.9, 0.4],
    "secondary-hover": [0.85, 0.55],
    "secondary-fg": [0.18, 1],
    border: [0.78, 0.7],
    // 5.4:1 on the page, where the standard ramp's 0.7 sits at 2.7:1.
    "border-strong": [0.52, 0.8],
  },
};

const DARK_SURFACES: Record<ThemeContrast, NeutralRamp> = {
  standard: {
    bg: [0.13, 1],
    "bg-subtle": [0.18, 1],
    "bg-muted": [0.25, 1],
    fg: [0.97, 0.25],
    "fg-muted": [0.74, 0.7],
    "fg-subtle": [0.64, 0.8],
    secondary: [0.27, 1],
    "secondary-hover": [0.34, 1],
    "secondary-fg": [0.94, 0.3],
    border: [0.29, 1],
    "border-strong": [0.38, 1],
  },
  high: {
    bg: [0.1, 1],
    "bg-subtle": [0.16, 1],
    "bg-muted": [0.22, 1],
    fg: [0.99, 0.25],
    "fg-muted": [0.84, 0.7],
    "fg-subtle": [0.74, 0.8],
    secondary: [0.24, 1],
    "secondary-hover": [0.3, 1],
    "secondary-fg": [0.97, 0.3],
    border: [0.42, 1],
    // 4.9:1 on the page, where the standard ramp's 0.38 is invisible to the gate.
    "border-strong": [0.58, 1],
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function decimal(value: number, digits = 4): string {
  const rounded = Math.abs(value) < 10 ** -digits ? 0 : value;
  return rounded.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function oklch(color: OklchColor, alpha?: number): string {
  const base = `oklch(${decimal(color.l)} ${decimal(color.c)} ${decimal(color.h, 2)}`;
  return alpha == null ? `${base})` : `${base} / ${decimal(alpha)})`;
}

/**
 * One step of the neutral ramp.
 *
 * The chroma floor is 1.1A-10's one deliberate departure from the 1.0 colours,
 * and it is what makes `neutral` a derivable axis rather than a label. The
 * light end of the ramp scales its chroma down hard — a page is near white —
 * and at 1.0's factors the tint landed at 0.0015, BELOW the classifier's
 * `NEUTRAL_GRAY_MAX_CHROMA` line for achromatic. So `--neutral cool` produced
 * a page `axesFromCss` called gray, and was right to: a tint that weak is not
 * a tint. Flooring it at `NEUTRAL_TINT_MIN_CHROMA` moves six declarations per
 * cool/warm theme (the near-white surfaces and the two lightest text weights);
 * `tests/commands/theme-generate.test.ts` names each one against its 1.0
 * value, and every other colour stays byte-identical.
 */
function neutralColor(tint: NeutralTint | null, lightness: number, chromaScale = 1): string {
  if (!tint) return oklch({ l: lightness, c: 0, h: 0 });
  return oklch({
    l: lightness,
    c: Math.max(tint.c * chromaScale, NEUTRAL_TINT_MIN_CHROMA),
    h: tint.h,
  });
}

/** Resolve one role of a neutral ramp. */
function surfaceColor(ramp: NeutralRamp, tint: NeutralTint | null, role: NeutralRole): string {
  const [lightness, chromaScale] = ramp[role];
  return neutralColor(tint, lightness, chromaScale);
}

function subtleColor(color: OklchColor, lightness: number): string {
  return oklch({
    l: lightness,
    c: clamp(color.c * 0.3, 0.025, 0.07),
    h: color.h,
  });
}

/** Fixed interpolation curve anchored by the supplied brand color. */
export function generateAccentRamp(seed: OklchColor): AccentStep[] {
  // Extreme source colors still need a useful full ramp. The anchor clamp only
  // shapes the ramp; the original normalized input remains in JSON metadata.
  const anchorL = clamp(seed.l, 0.42, 0.72);
  const peakC = clamp(seed.c, 0, 0.28);

  return ACCENT_STEPS.map((step, index) => {
    let l = anchorL;
    if (index < 5) l = anchorL + (1 - anchorL) * LIGHTER_CURVE[index];
    if (index > 5) l = anchorL * DARKER_CURVE[index - 6];
    const color = { l, c: peakC * CHROMA_CURVE[index], h: seed.h };
    return { step, color, css: oklch(color) };
  });
}

function pickPrimary(
  ramp: AccentStep[],
  mode: "light" | "dark",
  darkForeground: string,
  mutedSurface: string,
): PrimarySelection {
  const candidates = mode === "light" ? [5, 6, 7, 8, 9, 10] : [4, 3, 2, 1, 0];
  const foreground = mode === "light" ? "white" : darkForeground;
  const preferred = candidates[0];

  for (const index of candidates) {
    const ratio = contrastOf(ramp[index].css, foreground);
    if (ratio < CONTRAST_AA) continue;
    // In light mode the same semantic color is also text on the palest brand
    // step (`color-primary-subtle`). Select a step that clears both contracts.
    if (mode === "light" && contrastOf(ramp[index].css, ramp[0].css) < CONTRAST_AA) continue;
    // …and it is an accent-coloured label on the muted plate, which is the
    // darkest surface it lands on in light mode and the lightest in dark. That
    // pair is the one the gate used to omit, so the generator could pick a step
    // that failed it. [W3-3]
    if (contrastOf(ramp[index].css, mutedSurface) < CONTRAST_AA) continue;
    const direction = mode === "light" ? 1 : -1;
    const hoverIndex = clamp(index + direction, 0, ramp.length - 1);
    const activeIndex = clamp(index + direction * 2, 0, ramp.length - 1);
    return {
      index,
      hoverIndex,
      activeIndex,
      primary: ramp[index].css,
      hover: ramp[hoverIndex].css,
      active: ramp[activeIndex].css,
      foreground,
      adjusted: index !== preferred,
      ratio,
    };
  }

  throw new Error(
    `The accent ramp cannot reach ${CONTRAST_AA}:1 contrast in ${mode} mode. ` +
      `Try an accent with more chroma or a less extreme lightness.`,
  );
}

function lightDeclarations(
  seed: NormalizedSeed,
  tint: NeutralTint | null,
  ramp: AccentStep[],
  primary: PrimarySelection,
): Declaration[] {
  const brand = (index: number) => `var(--palette-${seed.name}-${ramp[index].step})`;
  const surfaces = LIGHT_SURFACES[seed.contrast];
  const surface = (role: NeutralRole) => surfaceColor(surfaces, tint, role);
  return [
    ["color-bg", surface("bg")],
    ["color-bg-subtle", surface("bg-subtle")],
    ["color-bg-muted", surface("bg-muted")],
    ["color-surface-1", "var(--color-bg-subtle)"],
    ["color-surface-2", "var(--color-bg-muted)"],
    ["color-surface-1-border", "var(--color-border)"],
    ["color-surface-2-border", "var(--color-border-strong)"],
    ["color-fg", surface("fg")],
    ["color-fg-muted", surface("fg-muted")],
    ["color-fg-subtle", surface("fg-subtle")],
    ["color-primary", brand(primary.index)],
    ["color-primary-hover", brand(primary.hoverIndex)],
    ["color-primary-active", brand(primary.activeIndex)],
    ["color-primary-fg", primary.foreground],
    ["color-primary-subtle", brand(0)],
    ["color-secondary", surface("secondary")],
    ["color-secondary-hover", surface("secondary-hover")],
    ["color-secondary-fg", surface("secondary-fg")],
    ["color-destructive", "oklch(0.45 0.18 25)"],
    ["color-destructive-hover", "oklch(0.39 0.19 25)"],
    ["color-destructive-fg", "white"],
    ["color-destructive-subtle", "oklch(0.96 0.03 25)"],
    ["color-success", "oklch(0.45 0.12 150)"],
    ["color-success-subtle", "oklch(0.96 0.02 150)"],
    ["color-warning", "oklch(0.52 0.14 75)"],
    ["color-warning-subtle", "oklch(0.96 0.03 75)"],
    ["color-info", brand(Math.max(primary.index, 6))],
    ["color-info-subtle", brand(0)],
    ["color-border", surface("border")],
    ["color-border-strong", surface("border-strong")],
    // Opaque. A translucent ring composites down to 1.4–2.7:1 against the page
    // it is drawn on — below SC 1.4.11's 3:1, on a token whose only job is to be
    // seen. [W3-3]
    ["color-ring", oklch(ramp[primary.index].color)],
    // The depth axis [1.1A-04, now the `depth` family of 1.1A-10]. Scheme-bound,
    // which is why it renders here rather than in the one `:root` axis group:
    // `light-dark()` is a <color> function and a shadow list is not a colour.
    ...depthFamily(seed, "light"),
  ];
}

function darkDeclarations(
  seed: NormalizedSeed,
  tint: NeutralTint | null,
  ramp: AccentStep[],
  primary: PrimarySelection,
): Declaration[] {
  const brand = (index: number) => `var(--palette-${seed.name}-${ramp[index].step})`;
  const surfaces = DARK_SURFACES[seed.contrast];
  const surface = (role: NeutralRole) => surfaceColor(surfaces, tint, role);
  return [
    ["color-bg", surface("bg")],
    ["color-bg-subtle", surface("bg-subtle")],
    ["color-bg-muted", surface("bg-muted")],
    ["color-surface-1", "var(--color-bg-subtle)"],
    ["color-surface-2", "var(--color-bg-muted)"],
    ["color-surface-1-border", "var(--color-border)"],
    ["color-surface-2-border", "var(--color-border-strong)"],
    ["color-fg", surface("fg")],
    ["color-fg-muted", surface("fg-muted")],
    ["color-fg-subtle", surface("fg-subtle")],
    ["color-primary", brand(primary.index)],
    ["color-primary-hover", brand(primary.hoverIndex)],
    ["color-primary-active", brand(primary.activeIndex)],
    ["color-primary-fg", primary.foreground],
    ["color-primary-subtle", subtleColor(ramp[primary.index].color, 0.23)],
    ["color-secondary", surface("secondary")],
    ["color-secondary-hover", surface("secondary-hover")],
    ["color-secondary-fg", surface("secondary-fg")],
    ["color-destructive", "oklch(0.68 0.2 25)"],
    ["color-destructive-hover", "oklch(0.72 0.18 25)"],
    ["color-destructive-fg", darkForegroundColor(seed, tint)],
    ["color-destructive-subtle", "oklch(0.23 0.06 25)"],
    ["color-success", "oklch(0.72 0.16 155)"],
    ["color-success-subtle", "oklch(0.23 0.05 155)"],
    ["color-warning", "oklch(0.8 0.14 80)"],
    ["color-warning-subtle", "oklch(0.23 0.045 80)"],
    ["color-info", brand(Math.min(primary.index, 4))],
    ["color-info-subtle", subtleColor(ramp[Math.min(primary.index, 4)].color, 0.23)],
    ["color-border", surface("border")],
    ["color-border-strong", surface("border-strong")],
    ["color-ring", oklch(ramp[primary.index].color)],
    ...depthFamily(seed, "dark"),
  ];
}

/**
 * The label colour a solid accent carries in dark mode: the darkest page the
 * theme ships, so a bright accent's text is the page it sits on rather than an
 * invented colour.
 */
function darkForegroundColor(seed: NormalizedSeed, tint: NeutralTint | null): string {
  return surfaceColor(DARK_SURFACES[seed.contrast], tint, "bg");
}

function documentDeclarations(
  seed: NormalizedSeed,
  tint: NeutralTint | null,
  ramp: AccentStep[],
  primary: PrimarySelection,
): Declaration[] {
  const base = lightDeclarations(seed, tint, ramp, primary).map(([token, value]) => {
    if (token === "color-bg") return [token, "white"] as const;
    if (token === "color-bg-subtle") return [token, neutralColor(tint, 0.97, 0.2)] as const;
    if (token === "color-bg-muted") return [token, neutralColor(tint, 0.94, 0.35)] as const;
    // A printed page casts no shadow — but --shadow-color is the channel the
    // ramp is cast IN, not a shadow itself: `oklch(none / 0.04)` is invalid CSS.
    if (token === "shadow-color") return [token, value] as const;
    if (token.startsWith("shadow-")) return [token, "none"] as const;
    return [token, value] as const;
  });
  return base;
}

function renderDeclarations(declarations: Declaration[], indent = "  "): string {
  const width = Math.max(...declarations.map(([name]) => name.length));
  return declarations
    .map(([name, value]) => `${indent}--${name.padEnd(width)}: ${value};`)
    .join("\n");
}

function paletteDeclarations(name: string, ramp: AccentStep[]): Declaration[] {
  return ramp.map(({ step, css }) => [`palette-${name}-${step}`, css] as const);
}


function renderDarkBlocks(declarations: Declaration[], heading: string): string {
  const body = renderDeclarations(declarations);
  const autoBody = renderDeclarations(declarations, "    ");
  return `
/* ── ${heading} ── */
[data-theme="dark"] {
${body}
}

/* Keep automatic dark mode byte-for-byte equivalent to explicit dark mode. */
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] {
${autoBody}
  }
}
`;
}

/**
 * The family `light-dark()` cannot collapse. It is a `<color>` function and a
 * shadow list is not a colour, so a step whose two schemes differ in geometry
 * — `none` against two layers, here — has no one-block spelling that isn't a
 * fake: padding the dark ramp with alpha-0 layers writes a shadow where the
 * theme says `none`. The ramp therefore keeps its blocks in BOTH forms, and
 * `--shadow-color` travels with it so a dark block still owns the whole family.
 */
function isShadow([name]: Declaration): boolean {
  return name.startsWith("shadow-");
}

/**
 * Pair the two schemes' declarations into one `light-dark()` list. A token whose
 * two values are identical is emitted once, plainly — `light-dark(x, x)` states
 * nothing a browser does not already do, and a value built out of scheme-aware
 * tokens (`--color-surface-1: var(--color-bg-subtle)`) is scheme-aware itself.
 */
function mergeSchemes(light: Declaration[], dark: Declaration[]): Declaration[] {
  const byName = new Map(dark);
  return light.map(([name, value]) => {
    const other = byName.get(name);
    return other == null || other === value
      ? ([name, value] as const)
      : ([name, `light-dark(${value}, ${other})`] as const);
  });
}

function renderThemeCss(
  seed: NormalizedSeed,
  ramp: AccentStep[],
  light: Declaration[],
  dark: Declaration[],
): string {
  const schemes = seed.scheme === "both" ? "light dark" : seed.scheme;
  // One block is the default for a dual-scheme theme: the colours state both
  // sides with light-dark(), which base/reset.css activates by mapping
  // `data-theme` onto `color-scheme`. --legacy-blocks restores the triple form.
  const oneBlock = seed.scheme === "both" && !seed.legacyBlocks;
  const rootSemantic = oneBlock
    ? [...mergeSchemes(light.filter((d) => !isShadow(d)), dark), ...light.filter(isShadow)]
    : seed.scheme === "dark"
      ? dark
      : light;
  const root = [
    ...paletteDeclarations(seed.name, ramp),
    ...rootSemantic,
    // The axis families (1.1A-10). Scheme-independent by construction: a
    // silhouette, a type ramp and a motion curve are the same in both schemes,
    // and the one family that is not — depth — renders above, beside the
    // colours it has to share a block with.
    ...axisDeclarations(seed),
  ];
  const darkBlocks = seed.scheme === "light"
    ? ""
    : oneBlock
      ? renderDarkBlocks(dark.filter(isShadow), "Dark mode: the shadow ramp")
      : renderDarkBlocks(dark, "Dark mode: inverted accent steps and neutral surfaces");
  const note = oneBlock
    ? "/* Both schemes live in the :root block below, as light-dark(). That function reads\n" +
      "   color-scheme, which base/reset.css derives from data-theme — regenerate with\n" +
      "   --legacy-blocks for the three-block form if your browser floor predates it. */\n"
    : "";

  return `/* @ui:theme ${seed.name} — generated from ${seed.accent} */
/* @ui:schemes ${schemes} */
${densityDirective(seed)}
/* Deterministic parametric theme. Regenerate instead of editing the accent ramp by hand. */
${note}
:root {
${renderDeclarations(root)}
}
${darkBlocks}`;
}

function renderDocumentCss(
  name: string,
  sourceName: string,
  accent: string,
  ramp: AccentStep[],
  declarations: Declaration[],
): string {
  const root: Declaration[] = [
    ...paletteDeclarations(sourceName, ramp),
    ...declarations,
    ["radius-sm", "0"],
    ["radius-md", "0"],
    ["radius-lg", "0"],
    ["radius-xl", "0"],
    ["radius-2xl", "0"],
    ["radius-full", "0"],
    ["button-radius", "0"],
    ["card-radius", "0"],
    ["card-shadow", "none"],
    ["input-radius", "0"],
    ["badge-radius", "0.125rem"],
    ["doc-font", "'Arial', 'Helvetica Neue', var(--font-sans)"],
    ["doc-font-size", "10pt"],
    ["doc-line-height", "1.4"],
    ["doc-heading-font", "'Arial', 'Helvetica Neue', var(--font-sans)"],
    ["doc-heading-weight", "var(--weight-bold)"],
    ["doc-heading-size", "14pt"],
    ["doc-subheading-size", "12pt"],
    ["doc-legal-size", "8pt"],
    ["doc-section-gap", "var(--space-6)"],
    ["doc-component-gap", "var(--space-3)"],
    ["doc-table-font-size", "9pt"],
    ["doc-table-header-bg", "var(--color-bg-muted)"],
    ["doc-table-border", "var(--color-border-strong)"],
    ["doc-table-footer-bg", "var(--color-bg-muted)"],
    ["doc-table-stripe-bg", "var(--color-bg-subtle)"],
    ["doc-max-width", "210mm"],
    ["font-sans", "'Arial', 'Helvetica Neue', system-ui, sans-serif"],
    ["font-mono", "'Courier New', ui-monospace, monospace"],
  ];

  return `/* @ui:theme ${name} — brand-matched, print-optimized document theme */
/* @ui:schemes light */
/* Generated from ${accent}; white paper, flat surfaces, crisp edges, and ink-safe contrast. */

:root {
${renderDeclarations(root)}
}

@page {
  size: var(--page-format) var(--page-orientation);
  margin: var(--page-margin);
}

@media print {
  :root {
    color-scheme: light;
  }

  [data-ui="document"] {
    color: var(--color-fg);
    background: var(--color-bg);
    box-shadow: none;
    print-color-adjust: exact;
  }
}
`;
}

/**
 * The schema-1.1 blocks a GENERATED manifest carries that an authored one does
 * not [1.1A-07]: the seed it came from, and the axes its own CSS derives back
 * to. Only the primary theme carries them — the document companion is a print
 * variant of that theme rather than a theme with a seed of its own, and writing
 * the parent's axes onto a stylesheet nobody ran `axesFromCss` over would be a
 * claim rather than a derivation.
 */
interface GeneratedProvenance {
  seed?: ThemeSeed;
  axes?: ThemeAxes;
}

function manifestFor(
  name: string,
  css: string,
  surface: string[],
  scheme: ThemeSchemeDecl,
  mood: string[],
  pairsWith: string[],
  provenance: GeneratedProvenance = {},
): ThemeManifest & { $schema: string } {
  const manifest: ThemeManifest & { $schema: string } = {
    $schema: "../manifest.schema.json",
    name,
    version: "1.0.0",
    mood,
    scheme,
    dark_mode: scheme === "light" ? "none" : "native",
    tokens_overridden: overriddenTokens(css),
    tokens_inherited: inheritedTokens(css, surface),
    pairs_with: pairsWith,
    preview: `${name}.preview.html`,
    ...(provenance.seed ? { seed: provenance.seed } : {}),
    ...(provenance.axes ? { axes: provenance.axes } : {}),
  };

  const errors = validateThemeManifest(manifest);
  if (errors.length > 0) {
    throw new Error(
      `Generated theme manifest is invalid: ${errors.map((error) => `${error.field}: ${error.message}`).join("; ")}`,
    );
  }
  return manifest;
}

function contrastReport(
  themeName: string,
  css: string,
  baseCss: string,
  scheme: ThemeSchemeDecl,
  adjusted: { light: boolean; dark: boolean },
): GeneratedContrastRatio[] {
  const lookups = buildSchemeLookups(css, baseCss);
  const schemes: Array<"light" | "dark"> = scheme === "both" ? ["light", "dark"] : [scheme];
  const reports: GeneratedContrastRatio[] = [];

  for (const activeScheme of schemes) {
    const lookup = lookups[activeScheme];
    for (const pair of CONTRAST_PAIRS) {
      const fgRaw = lookup.get(pair.fg);
      const bgRaw = lookup.get(pair.bg);
      const fg = fgRaw ? resolveColorString(fgRaw, lookup) : null;
      const bg = bgRaw ? resolveColorString(bgRaw, lookup) : null;
      if (!fg || !bg || !isOpaqueColor(fg) || !isOpaqueColor(bg)) {
        throw new Error(
          `Generated theme '${themeName}' could not resolve --${pair.fg} on --${pair.bg} in ${activeScheme} mode.`,
        );
      }
      const fgRgb = parseCssColor(fg);
      const bgRgb = parseCssColor(bg);
      if (!fgRgb || !bgRgb) {
        throw new Error(
          `Generated theme '${themeName}' produced an unsupported color for --${pair.fg} on --${pair.bg}.`,
        );
      }
      const ratio = contrastRatio(fgRgb, bgRgb);
      reports.push({
        theme: themeName,
        scheme: activeScheme,
        foreground: pair.fg,
        background: pair.bg,
        foreground_value: fg,
        background_value: bg,
        ratio: Number(ratio.toFixed(3)),
        threshold: CONTRAST_AA,
        passes: ratio >= CONTRAST_AA,
        auto_adjusted: pair.fg === "color-primary-fg" && pair.bg === "color-primary"
          ? adjusted[activeScheme]
          : false,
      });
    }
  }
  return reports;
}

function verifiedFile(
  kind: "theme" | "document",
  name: string,
  css: string,
  manifest: ThemeManifest & { $schema: string },
  baseCss: string,
  adjusted: { light: boolean; dark: boolean },
): GeneratedThemeFile {
  if (manifest.tokens_overridden.join("\0") !== overriddenTokens(css).join("\0")) {
    throw new Error(`Generated theme '${name}' has a CSS/manifest token mismatch.`);
  }

  const baseValues = parseThemeValues(baseCss);
  const themeValues = parseThemeValues(css);
  const required = [...baseValues.light.keys()]
    .filter((token) => token.startsWith("color-") || token.startsWith("shadow-"));
  const coverageMaps = manifest.scheme === "light"
    ? [["light", new Set([...baseValues.light.keys(), ...themeValues.light.keys()])]] as const
    : [
        ["dark", new Set(themeValues.dark.keys())],
        ["auto", new Set(themeValues.auto.keys())],
      ] as const;
  for (const [scheme, tokens] of coverageMaps) {
    const missing = required.filter((token) => !tokens.has(token));
    if (missing.length > 0) {
      throw new Error(
        `Generated theme '${name}' is missing required ${scheme} tokens: ${missing.join(", ")}.`,
      );
    }
  }

  const input = { themeName: name, themeCss: css, baseCss };
  const findings = [
    ...checkThemeContrast(input),
    ...checkThemeElevation(input),
  ];
  if (findings.length > 0) {
    throw new Error(
      `Generated theme '${name}' failed token verification before writing: ${findings[0].message} ` +
        `Adjust the accent or surface ramp until every reported contract passes.`,
    );
  }

  return {
    kind,
    name,
    css_path: `themes/${name}.css`,
    manifest_path: `themes/${name}.theme.json`,
    css,
    manifest,
    contrast: contrastReport(name, css, baseCss, manifest.scheme, adjusted),
  };
}

/**
 * Every token an axis family emits must already exist in the themeable
 * surface. A theme that declares a token nothing reads is an axis with no
 * consumer — the dead-axis drift 1.1A-21 tracks — and the cheapest place to
 * catch it is here, on every generated theme, rather than in a test that only
 * runs over the seeds someone thought to write down.
 */
function assertSurfaceOnly(declarations: Declaration[], surface: string[], name: string): void {
  const known = new Set(surface);
  const unknown = declarations.map(([token]) => token).filter((token) => !known.has(token));
  if (unknown.length > 0) {
    throw new Error(
      `Generated theme '${name}' declares ${unknown.length} token(s) the base layer does not ` +
        `define: ${[...new Set(unknown)].join(", ")}. A theme may only re-point the themeable surface.`,
    );
  }
}

/**
 * The closed loop: read the fourteen axes back out of the stylesheet just
 * written and compare them with what the seed asked for.
 *
 * This is not belt-and-braces over the tests — it is the property that makes
 * the manifest's `axes` block trustworthy. `gen:theme-manifests` DERIVES that
 * block from the CSS, so a family renderer that emits something the classifier
 * reads differently would publish a theme whose manifest quietly contradicts
 * the seed beside it. Running the real `axesFromCss` on the real output is the
 * only check that cannot be fooled by the two sides sharing an assumption.
 */
export function assertAxesRoundTrip(css: string, baseSources: string[], expected: ThemeAxes, name: string): ThemeAxes {
  const derived = axesFromCss(css, baseSources);
  const mismatches: string[] = [];
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (a !== null && typeof a === "object" && b !== null && typeof b === "object") {
      for (const key of Object.keys(a as Record<string, unknown>)) {
        walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      }
      return;
    }
    if (a !== b) mismatches.push(`${path}: seed says ${JSON.stringify(a)}, the CSS derives ${JSON.stringify(b)}`);
  };
  walk(expected, derived, "");
  if (mismatches.length > 0) {
    throw new Error(
      `Generated theme '${name}' does not derive back to its own seed: ${mismatches.join("; ")}. ` +
        `A family renderer and its axesFromCss classifier disagree.`,
    );
  }
  return derived;
}

/** Build and verify every output in memory. This function performs no filesystem writes. */
export function generateThemeBundle(
  input: ThemeGenerateInput,
  baseCssSources: string[],
): GeneratedThemeBundle {
  const seed = normalizeSeed(input);
  const accent = cssColorToOklch(seed.accent);
  if (!accent) {
    throw new Error(
      `Invalid accent '${seed.accent}'. Use an opaque oklch() color or hex value (#rgb or #rrggbb), ` +
        `for example --accent "oklch(0.55 0.2 150)" or --accent "#168c5b".`,
    );
  }

  const ramp = generateAccentRamp(accent);
  const tint = neutralTint(seed.neutral, accent.h);
  const darkForeground = darkForegroundColor(seed, tint);
  // The muted plate each mode's `--color-bg-muted` resolves to; derived from
  // the same ramp table the declaration lists read, so the two cannot drift.
  const lightMuted = surfaceColor(LIGHT_SURFACES[seed.contrast], tint, "bg-muted");
  const darkMuted = surfaceColor(DARK_SURFACES[seed.contrast], tint, "bg-muted");
  const lightPrimary = pickPrimary(ramp, "light", darkForeground, lightMuted);
  const darkPrimary = pickPrimary(ramp, "dark", darkForeground, darkMuted);
  const light = lightDeclarations(seed, tint, ramp, lightPrimary);
  const dark = darkDeclarations(seed, tint, ramp, darkPrimary);
  const baseCss = baseCssSources.join("\n");
  const surface = surfaceTokens(baseCssSources);
  assertSurfaceOnly([...axisDeclarations(seed), ...depthFamily(seed, "light")], surface, seed.name);
  const css = renderThemeCss(seed, ramp, light, dark);
  // `axesFromCss` reads a theme's accent out of the block its `:root` states,
  // which for a dark-only theme is the dark selection — a different ramp step.
  const primaryStep = seed.scheme === "dark" ? darkPrimary : lightPrimary;
  const axes = assertAxesRoundTrip(
    css,
    baseCssSources,
    expectedAxes(seed, ramp[primaryStep.index].color, neutralAxisFor(tint)),
    seed.name,
  );
  const documentName = `${seed.name}-document`;
  const manifest = manifestFor(
    seed.name,
    css,
    surface,
    seed.scheme,
    ["generated", "brand", seed.neutral, seed.scheme],
    seed.document ? [documentName] : [],
    { seed: seedRecord(seed), axes },
  );
  const generated = [
    verifiedFile(
      "theme",
      seed.name,
      css,
      manifest,
      baseCss,
      { light: lightPrimary.adjusted, dark: darkPrimary.adjusted },
    ),
  ];

  if (seed.document) {
    const documentCss = renderDocumentCss(
      documentName,
      seed.name,
      seed.accent,
      ramp,
      documentDeclarations(seed, tint, ramp, lightPrimary),
    );
    const documentManifest = manifestFor(
      documentName,
      documentCss,
      surface,
      "light",
      ["generated", "brand", "print", "document", seed.neutral],
      [seed.name],
    );
    generated.push(
      verifiedFile(
        "document",
        documentName,
        documentCss,
        documentManifest,
        baseCss,
        { light: lightPrimary.adjusted, dark: false },
      ),
    );
  }

  return {
    name: seed.name,
    accent: {
      input: seed.accent,
      oklch: oklch(accent),
      lightness: Number(accent.l.toFixed(6)),
      chroma: Number(accent.c.toFixed(6)),
      hue: Number(accent.h.toFixed(4)),
    },
    neutral: seed.neutral,
    // The 1.0 flag the CLI still reports, mapped back out of the axis that
    // replaced it — `sharp` and `pill` have no 1.0 spelling, so they report
    // the nearest one the flag could express.
    radius: input.radius ?? SHAPE_LEGACY_RADIUS[seed.shape.radius],
    scheme: seed.scheme,
    document: seed.document,
    legacyBlocks: seed.legacyBlocks,
    seed: seedRecord(seed),
    axes,
    generated,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Scorecard v2 — what the generator knows about what it just made [1.1A-11]
// ═══════════════════════════════════════════════════════════════════════════
//
// v1 reported the paths, the normalised accent and the contrast ratios. A 1.1
// theme states thirteen more axes than a 1.0 one, and three of the guarantees
// that used to be invisible pass/fail gates inside `verifiedFile` are numbers a
// reader (or an agent, or Night Shift's taste rubric) wants to SEE:
//
//   • elevation ΔE — how separable the surface ramp is, per scheme;
//   • focus-ring ratios — SC 1.4.11's 3:1, on every surface the ring lands on;
//   • tap targets — the control heights the seed's DENSITY lands on, which is
//     the one axis whose consequence is a physical size rather than a colour.
//
// The scorecard is assembled from the bundle and the same base CSS the bundle
// was generated from, so it performs no filesystem access and the MCP tool
// returns exactly what the CLI prints.

/** The scorecard's version. Also the `--json` payload's schema version. */
export const THEME_SCORECARD_VERSION = 2;

/** WCAG 2.2 SC 2.5.8 (Target Size, Minimum), in CSS pixels. */
export const TAP_TARGET_MIN_PX = 24;

/** Where one generated artefact was (or would be) written, relative to the cwd. */
export interface ThemeScorecardFile {
  kind: "theme" | "document";
  name: string;
  css: string;
  manifest: string;
  preview: string;
  /** The resolved seed, written beside the primary theme only. */
  seed?: string;
}

export interface ThemeElevationDelta {
  theme: string;
  scheme: "light" | "dark";
  from: string;
  to: string;
  /** OKLab ΔE, or `null` when a translucent or unresolvable colour makes it unmeasurable. */
  delta: number | null;
  threshold: number;
  passes: boolean;
}

export interface ThemeFocusRingRatio {
  theme: string;
  scheme: "light" | "dark";
  ring: string;
  surface: string;
  /** `null` when the ring is translucent — see `translucent`, which is a finding, not a skip. */
  ratio: number | null;
  translucent: boolean;
  threshold: number;
  passes: boolean;
}

export interface ThemeTapTarget {
  control: string;
  density: string;
  height_px: number | null;
  threshold_px: number;
  passes: boolean;
}

export interface ThemeScorecard {
  /** The 1.0 key, kept so an automation reading v1 sees the number move. */
  theme_generate_schema_version: number;
  scorecard_version: number;
  command: "theme generate";
  name: string;
  accent: GeneratedThemeBundle["accent"];
  /** The 1.0 flags, reported as before. Every 1.1 axis is in `seed`/`axes`. */
  options: {
    neutral: ThemeSeed["neutral"];
    radius: ThemeRadius;
    scheme: ThemeSchemeDecl;
    document: boolean;
    legacy_blocks: boolean;
  };
  /** The seed filled out to every axis — byte-identical to `<name>.seed.json`. */
  seed: ThemeSeed;
  /** The fourteen axes the emitted CSS derives back to. */
  axes: ThemeAxes;
  generated: ThemeScorecardFile[];
  contrast: GeneratedContrastRatio[];
  elevation: ThemeElevationDelta[];
  focus_ring: ThemeFocusRingRatio[];
  tap_targets: ThemeTapTarget[];
  /** Distance to the nearest shipped theme. `null` until 1.1A-12 lands. */
  distinctiveness: null;
}

export interface ThemeScorecardOptions {
  /** Directory the artefacts are written to, relative to the cwd. Default `themes`. */
  outDir?: string;
  /** `registry/tokens/density.css`, for the tap-target ramp. Omit for no tap targets. */
  densityCss?: string;
}

/** The control heights one `[data-density]` block declares, in CSS pixels. */
export function densityControlHeights(
  densityCss: string,
  density: string,
): Record<string, number | null> {
  const blocks = stripCssComments(densityCss).split(/(?=\[data-density=)/);
  const block = blocks.find((chunk) => chunk.startsWith(`[data-density="${density}"]`)) ?? "";
  const read = (token: string): number | null => {
    const match = block.match(new RegExp(`--${token}\\s*:\\s*([0-9.]+)px`));
    return match ? Number(match[1]) : null;
  };
  const md = read("control-height-md");
  return {
    "control-height-sm": read("control-height-sm"),
    "control-height-md": md,
    "control-height-lg": read("control-height-lg"),
    // `--input-height: var(--control-height-md)` in every block, so it is the
    // md rung by definition rather than by a second measurement.
    "input-height": md,
  };
}

/**
 * Assemble the scorecard. Pure: `bundle` and `baseCssSources` are the same two
 * values `generateThemeBundle` was called with, and `options.densityCss` is a
 * string the caller read — nothing here touches the filesystem, which is what
 * lets the MCP tool return the identical object in memory.
 */
export function themeScorecard(
  bundle: GeneratedThemeBundle,
  baseCssSources: string[],
  options: ThemeScorecardOptions = {},
): ThemeScorecard {
  const outDir = options.outDir ?? "themes";
  const baseCss = baseCssSources.join("\n");
  const elevation: ThemeElevationDelta[] = [];
  const focusRing: ThemeFocusRingRatio[] = [];

  for (const file of bundle.generated) {
    const lookups = buildSchemeLookups(file.css, baseCss);
    const schemes: Array<"light" | "dark"> =
      file.manifest.scheme === "both" ? ["light", "dark"] : [file.manifest.scheme];

    for (const scheme of schemes) {
      const lookup = lookups[scheme];
      const resolve = (token: string): string | null => {
        const raw = lookup.get(token);
        return raw == null ? null : resolveColorString(raw, lookup);
      };

      for (const { fg, bg } of ELEVATION_PAIRS) {
        const from = resolve(fg);
        const to = resolve(bg);
        const delta = from && to ? perceptualDelta(from, to) : null;
        elevation.push({
          theme: file.name,
          scheme,
          from: fg,
          to: bg,
          delta: delta == null ? null : Number(delta.toFixed(4)),
          threshold: ELEVATION_MIN_DELTA,
          passes: delta != null && delta + Number.EPSILON >= ELEVATION_MIN_DELTA,
        });
      }

      for (const { fg, bg } of NON_TEXT_PAIRS) {
        const ring = resolve(fg);
        const surface = resolve(bg);
        // A translucent ring is a finding, not a skip: "we cannot compute it"
        // is exactly how an invisible ring passed the gate in 1.0 (see
        // `checkNonTextContrast`). The scorecard says so rather than omitting
        // the row.
        const translucent = ring != null && !isOpaqueColor(ring);
        const ringRgb = ring && !translucent ? parseCssColor(ring) : null;
        const surfaceRgb = surface && isOpaqueColor(surface) ? parseCssColor(surface) : null;
        const ratio = ringRgb && surfaceRgb ? contrastRatio(ringRgb, surfaceRgb) : null;
        focusRing.push({
          theme: file.name,
          scheme,
          ring: fg,
          surface: bg,
          ratio: ratio == null ? null : Number(ratio.toFixed(3)),
          translucent,
          threshold: CONTRAST_NON_TEXT,
          passes: ratio != null && ratio >= CONTRAST_NON_TEXT,
        });
      }
    }
  }

  const tapTargets: ThemeTapTarget[] = [];
  if (options.densityCss) {
    const density = bundle.axes.density;
    for (const [control, height] of Object.entries(densityControlHeights(options.densityCss, density))) {
      tapTargets.push({
        control,
        density,
        height_px: height,
        threshold_px: TAP_TARGET_MIN_PX,
        passes: height != null && height >= TAP_TARGET_MIN_PX,
      });
    }
  }

  return {
    theme_generate_schema_version: THEME_SCORECARD_VERSION,
    scorecard_version: THEME_SCORECARD_VERSION,
    command: "theme generate",
    name: bundle.name,
    accent: bundle.accent,
    options: {
      neutral: bundle.neutral,
      radius: bundle.radius,
      scheme: bundle.scheme,
      document: bundle.document,
      legacy_blocks: bundle.legacyBlocks,
    },
    seed: bundle.seed,
    axes: bundle.axes,
    generated: bundle.generated.map((file) => ({
      kind: file.kind,
      name: file.name,
      css: `${outDir}/${file.name}.css`,
      manifest: `${outDir}/${file.name}.theme.json`,
      preview: `${outDir}/${file.name}.preview.html`,
      // One seed per generation, beside the theme it describes: the document
      // companion is derived from the same seed rather than from one of its own.
      ...(file.kind === "theme" ? { seed: `${outDir}/${file.name}.seed.json` } : {}),
    })),
    contrast: bundle.generated.flatMap((file) => file.contrast),
    elevation,
    focus_ring: focusRing,
    tap_targets: tapTargets,
    distinctiveness: null,
  };
}
