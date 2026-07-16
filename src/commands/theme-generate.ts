import {
  buildSchemeLookups,
  checkThemeContrast,
  CONTRAST_AA,
  CONTRAST_PAIRS,
} from "../audit/contrast-tokens";
import {
  inheritedTokens,
  overriddenTokens,
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
  resolveColorString,
  contrastRatio,
  type OklchColor,
} from "../utils/oklch";

export type ThemeNeutral = "cool" | "warm" | "gray";
export type ThemeRadius = "sm" | "md" | "lg";

export interface ThemeGenerateInput {
  name: string;
  accent: string;
  neutral: ThemeNeutral;
  radius: ThemeRadius;
  scheme: ThemeSchemeDecl;
  document: boolean;
}

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
  neutral: ThemeNeutral;
  radius: ThemeRadius;
  scheme: ThemeSchemeDecl;
  document: boolean;
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
  primary: string;
  hover: string;
  active: string;
  foreground: string;
  adjusted: boolean;
  ratio: number;
}

interface NeutralDefinition {
  c: number;
  h: number;
}

const NEUTRALS: Record<ThemeNeutral, NeutralDefinition> = {
  cool: { c: 0.015, h: 250 },
  warm: { c: 0.015, h: 75 },
  gray: { c: 0, h: 0 },
};

const RADIUS_VALUES: Record<ThemeRadius, Record<string, string>> = {
  sm: {
    "radius-sm": "0.125rem",
    "radius-md": "0.25rem",
    "radius-lg": "0.375rem",
    "radius-xl": "0.5rem",
    "radius-2xl": "0.75rem",
  },
  md: {
    "radius-sm": "0.25rem",
    "radius-md": "0.375rem",
    "radius-lg": "0.5rem",
    "radius-xl": "0.75rem",
    "radius-2xl": "1rem",
  },
  lg: {
    "radius-sm": "0.375rem",
    "radius-md": "0.625rem",
    "radius-lg": "0.875rem",
    "radius-xl": "1.25rem",
    "radius-2xl": "1.75rem",
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

function neutralColor(neutral: ThemeNeutral, lightness: number, chromaScale = 1): string {
  const seed = NEUTRALS[neutral];
  return oklch({ l: lightness, c: seed.c * chromaScale, h: seed.h });
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
): PrimarySelection {
  const candidates = mode === "light" ? [5, 6, 7, 8, 9, 10] : [4, 3, 2, 1, 0];
  const foreground = mode === "light" ? "white" : darkForeground;
  const preferred = candidates[0];

  for (const index of candidates) {
    const ratio = contrastOf(ramp[index].css, foreground);
    if (ratio < CONTRAST_AA) continue;
    const direction = mode === "light" ? 1 : -1;
    const hoverIndex = clamp(index + direction, 0, ramp.length - 1);
    const activeIndex = clamp(index + direction * 2, 0, ramp.length - 1);
    return {
      index,
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

type Declaration = readonly [name: string, value: string];

function lightDeclarations(
  neutral: ThemeNeutral,
  ramp: AccentStep[],
  primary: PrimarySelection,
): Declaration[] {
  const brand = (index: number) => ramp[index].css;
  return [
    ["color-bg", neutralColor(neutral, 0.995, 0.1)],
    ["color-bg-subtle", neutralColor(neutral, 0.975, 0.25)],
    ["color-bg-muted", neutralColor(neutral, 0.94, 0.4)],
    ["color-fg", neutralColor(neutral, 0.14)],
    ["color-fg-muted", neutralColor(neutral, 0.4)],
    ["color-fg-subtle", neutralColor(neutral, 0.53)],
    ["color-primary", primary.primary],
    ["color-primary-hover", primary.hover],
    ["color-primary-active", primary.active],
    ["color-primary-fg", primary.foreground],
    ["color-primary-subtle", brand(0)],
    ["color-secondary", neutralColor(neutral, 0.94, 0.4)],
    ["color-secondary-hover", neutralColor(neutral, 0.89, 0.55)],
    ["color-secondary-fg", neutralColor(neutral, 0.16)],
    ["color-destructive", "oklch(0.45 0.18 25)"],
    ["color-destructive-hover", "oklch(0.39 0.19 25)"],
    ["color-destructive-fg", "white"],
    ["color-destructive-subtle", "oklch(0.96 0.03 25)"],
    ["color-success", "oklch(0.45 0.12 150)"],
    ["color-success-subtle", "oklch(0.96 0.02 150)"],
    ["color-warning", "oklch(0.55 0.14 75)"],
    ["color-warning-subtle", "oklch(0.96 0.03 75)"],
    ["color-info", brand(Math.max(primary.index, 6))],
    ["color-info-subtle", brand(0)],
    ["color-border", neutralColor(neutral, 0.84, 0.6)],
    ["color-border-strong", neutralColor(neutral, 0.7, 0.8)],
    ["color-ring", oklch(ramp[primary.index].color, 0.42)],
    ["shadow-xs", "0 1px 2px oklch(0 0 0 / 0.04)"],
    ["shadow-sm", "0 1px 3px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04)"],
    ["shadow-md", "0 4px 6px oklch(0 0 0 / 0.06), 0 2px 4px oklch(0 0 0 / 0.04)"],
    ["shadow-lg", "0 10px 15px oklch(0 0 0 / 0.08), 0 4px 6px oklch(0 0 0 / 0.05)"],
    ["shadow-xl", "0 20px 25px oklch(0 0 0 / 0.1), 0 8px 10px oklch(0 0 0 / 0.05)"],
  ];
}

function darkDeclarations(
  neutral: ThemeNeutral,
  ramp: AccentStep[],
  primary: PrimarySelection,
): Declaration[] {
  const brand = (index: number) => ramp[index].css;
  return [
    ["color-bg", neutralColor(neutral, 0.13)],
    ["color-bg-subtle", neutralColor(neutral, 0.18)],
    ["color-bg-muted", neutralColor(neutral, 0.25)],
    ["color-fg", neutralColor(neutral, 0.97, 0.25)],
    ["color-fg-muted", neutralColor(neutral, 0.74, 0.7)],
    ["color-fg-subtle", neutralColor(neutral, 0.64, 0.8)],
    ["color-primary", primary.primary],
    ["color-primary-hover", primary.hover],
    ["color-primary-active", primary.active],
    ["color-primary-fg", primary.foreground],
    ["color-primary-subtle", oklch(ramp[5].color, 0.16)],
    ["color-secondary", neutralColor(neutral, 0.27)],
    ["color-secondary-hover", neutralColor(neutral, 0.34)],
    ["color-secondary-fg", neutralColor(neutral, 0.94, 0.3)],
    ["color-destructive", "oklch(0.65 0.2 25)"],
    ["color-destructive-hover", "oklch(0.72 0.18 25)"],
    ["color-destructive-fg", neutralColor(neutral, 0.13)],
    ["color-destructive-subtle", "oklch(0.55 0.2 25 / 0.16)"],
    ["color-success", "oklch(0.72 0.16 155)"],
    ["color-success-subtle", "oklch(0.6 0.18 155 / 0.16)"],
    ["color-warning", "oklch(0.8 0.14 80)"],
    ["color-warning-subtle", "oklch(0.75 0.15 75 / 0.16)"],
    ["color-info", brand(Math.min(primary.index, 4))],
    ["color-info-subtle", oklch(ramp[5].color, 0.16)],
    ["color-border", neutralColor(neutral, 0.29)],
    ["color-border-strong", neutralColor(neutral, 0.38)],
    ["color-ring", oklch(ramp[primary.index].color, 0.48)],
    ["shadow-xs", "none"],
    ["shadow-sm", "0 1px 3px oklch(0 0 0 / 0.3)"],
    ["shadow-md", "0 4px 6px oklch(0 0 0 / 0.3)"],
    ["shadow-lg", "0 10px 15px oklch(0 0 0 / 0.4)"],
    ["shadow-xl", "0 20px 25px oklch(0 0 0 / 0.5)"],
  ];
}

function documentDeclarations(
  neutral: ThemeNeutral,
  ramp: AccentStep[],
  primary: PrimarySelection,
): Declaration[] {
  const base = lightDeclarations(neutral, ramp, primary).map(([name, value]) => {
    if (name === "color-bg") return [name, "white"] as const;
    if (name === "color-bg-subtle") return [name, neutralColor(neutral, 0.97, 0.2)] as const;
    if (name === "color-bg-muted") return [name, neutralColor(neutral, 0.94, 0.35)] as const;
    if (name.startsWith("shadow-")) return [name, "none"] as const;
    return [name, value] as const;
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

function radiusDeclarations(radius: ThemeRadius): Declaration[] {
  const values = RADIUS_VALUES[radius];
  return [
    ...Object.entries(values).map(([name, value]) => [name, value] as const),
    ["button-radius", "var(--radius-md)"],
    ["card-radius", "var(--radius-lg)"],
    ["input-radius", "var(--radius-md)"],
    ["dialog-radius", "var(--radius-xl)"],
  ];
}

function renderDarkBlocks(declarations: Declaration[]): string {
  const body = renderDeclarations(declarations);
  const autoBody = renderDeclarations(declarations, "    ");
  return `
/* ── Dark mode: inverted accent steps and neutral surfaces ── */
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

function renderThemeCss(
  input: ThemeGenerateInput,
  ramp: AccentStep[],
  light: Declaration[],
  dark: Declaration[],
): string {
  const rootSemantic = input.scheme === "dark" ? dark : light;
  const schemes = input.scheme === "both" ? "light dark" : input.scheme;
  const root = [
    ...paletteDeclarations(input.name, ramp),
    ...rootSemantic,
    ...radiusDeclarations(input.radius),
  ];
  const darkBlocks = input.scheme === "light" ? "" : renderDarkBlocks(dark);

  return `/* @ui:theme ${input.name} — generated from ${input.accent} */
/* @ui:schemes ${schemes} */
/* Deterministic parametric theme. Regenerate instead of editing the accent ramp by hand. */

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

function manifestFor(
  name: string,
  css: string,
  surface: string[],
  scheme: ThemeSchemeDecl,
  mood: string[],
  pairsWith: string[],
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

  const findings = checkThemeContrast({ themeName: name, themeCss: css, baseCss });
  if (findings.length > 0) {
    throw new Error(
      `Generated theme '${name}' failed contrast verification before writing: ${findings[0].message} ` +
        `Try a darker accent or choose a different brand color.`,
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

/** Build and verify every output in memory. This function performs no filesystem writes. */
export function generateThemeBundle(
  input: ThemeGenerateInput,
  baseCssSources: string[],
): GeneratedThemeBundle {
  const accent = cssColorToOklch(input.accent);
  if (!accent) {
    throw new Error(
      `Invalid accent '${input.accent}'. Use an opaque oklch() color or hex value (#rgb or #rrggbb), ` +
        `for example --accent "oklch(0.55 0.2 150)" or --accent "#168c5b".`,
    );
  }

  const ramp = generateAccentRamp(accent);
  const darkForeground = neutralColor(input.neutral, 0.13);
  const lightPrimary = pickPrimary(ramp, "light", darkForeground);
  const darkPrimary = pickPrimary(ramp, "dark", darkForeground);
  const light = lightDeclarations(input.neutral, ramp, lightPrimary);
  const dark = darkDeclarations(input.neutral, ramp, darkPrimary);
  const baseCss = baseCssSources.join("\n");
  const surface = surfaceTokens(baseCssSources);
  const css = renderThemeCss(input, ramp, light, dark);
  const documentName = `${input.name}-document`;
  const manifest = manifestFor(
    input.name,
    css,
    surface,
    input.scheme,
    ["generated", "brand", input.neutral, input.scheme],
    input.document ? [documentName] : [],
  );
  const generated = [
    verifiedFile(
      "theme",
      input.name,
      css,
      manifest,
      baseCss,
      { light: lightPrimary.adjusted, dark: darkPrimary.adjusted },
    ),
  ];

  if (input.document) {
    const documentCss = renderDocumentCss(
      documentName,
      input.name,
      input.accent,
      ramp,
      documentDeclarations(input.neutral, ramp, lightPrimary),
    );
    const documentManifest = manifestFor(
      documentName,
      documentCss,
      surface,
      "light",
      ["generated", "brand", "print", "document", input.neutral],
      [input.name],
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
    name: input.name,
    accent: {
      input: input.accent,
      oklch: oklch(accent),
      lightness: Number(accent.l.toFixed(6)),
      chroma: Number(accent.c.toFixed(6)),
      hue: Number(accent.h.toFixed(4)),
    },
    neutral: input.neutral,
    radius: input.radius,
    scheme: input.scheme,
    document: input.document,
    generated,
  };
}
