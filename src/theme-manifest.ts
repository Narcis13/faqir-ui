// Theme manifest — the `{name}.theme.json` descriptor shipped next to every theme.
//
// A theme manifest is the machine-readable card that lives beside each registry
// stylesheet (`registry/themes/{name}.theme.json` ↔ `registry/themes/{name}.css`).
// It lets agents *choose* a theme by mood or scheme, it drives the CI coverage
// matrix (`tests/themes/coverage.test.ts` reads the declared scheme from here,
// not from a CSS heuristic), and it is embedded into `faqir context` so an agent
// building UI knows the active theme's character and exactly which tokens it owns.
//
// Format (schema 1.0 — see FAQIR-NEXT §C1; published as part of manifest.schema.json in 0.5-07):
//
//   {
//     "name": "midnight",
//     "version": "1.0.0",
//     "mood": ["dark", "technical", "vibrant"],   // agent-selectable descriptors
//     "scheme": "both",                            // "light" | "dark" | "both" — which schemes ship
//     "dark_mode": "native",                       // "native" (explicit dark block) | "none"
//     "tokens_overridden": ["color-bg", "…"],      // DERIVED from CSS — never hand-written
//     "tokens_inherited":  ["space-4", "…"],       // DERIVED: surface − overridden
//     "pairs_with": ["brutalist"],                 // themes that compose/read well together
//     "preview": "midnight.preview.html"           // preview reference (filename)
//   }
//
// `tokens_overridden` / `tokens_inherited` are generated from the stylesheet by
// `scripts/gen-theme-manifests.mjs` and re-derived + asserted by the manifest
// consistency test, so a hand-edit that drifts from the CSS fails CI.

import { extractTokenDefinitions } from "./parser/css-parser";

/** The color schemes a theme declares it ships. */
export type ThemeSchemeDecl = "light" | "dark" | "both";

/** How a theme provides its dark rendering. */
export type ThemeDarkMode = "native" | "none";

export interface ThemeManifest {
  name: string;
  version: string;
  /** Agent-selectable mood/character descriptors (≥ 1). */
  mood: string[];
  /** Which color schemes the theme ships. Drives the coverage matrix. */
  scheme: ThemeSchemeDecl;
  /** Dark-mode strategy: `native` ships an explicit dark block, `none` is light-only. */
  dark_mode: ThemeDarkMode;
  /** Custom properties the theme redefines — derived from the CSS, sorted. */
  tokens_overridden: string[];
  /** Surface tokens the theme leaves at their base value — derived, sorted. */
  tokens_inherited: string[];
  /** Names of themes this one composes/reads well alongside. */
  pairs_with: string[];
  /** Preview reference (a `{name}.preview.html` filename). */
  preview: string;
}

export interface ThemeManifestValidationError {
  field: string;
  message: string;
}

const VALID_SCHEMES: ThemeSchemeDecl[] = ["light", "dark", "both"];
const VALID_DARK_MODES: ThemeDarkMode[] = ["native", "none"];

/** Strip `/* … *\/` block comments so commented-out declarations are never parsed. */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Every distinct custom property a theme stylesheet defines, deduplicated and
 * sorted. This is the literal "what this theme overrides" — the invariant the
 * consistency test asserts against `tokens_overridden`.
 */
export function overriddenTokens(themeCss: string): string[] {
  const names = new Set<string>();
  for (const def of extractTokenDefinitions(stripCssComments(themeCss))) {
    names.add(def.name);
  }
  return [...names].sort();
}

/**
 * The themeable "surface": every token the base token layer defines, minus raw
 * palette primitives (`palette-*`). Palette steps are the substrate every theme
 * references via `var()` but none owns, so they are not part of the inherit/override
 * surface. Pass the base token stylesheets (registry/tokens/*.css).
 */
export function surfaceTokens(baseCssSources: string[]): string[] {
  const names = new Set<string>();
  for (const src of baseCssSources) {
    for (const def of extractTokenDefinitions(stripCssComments(src))) {
      if (!def.name.startsWith("palette-")) names.add(def.name);
    }
  }
  return [...names].sort();
}

/**
 * Surface tokens a theme leaves at their base value (`surface − overridden`),
 * sorted. Derived, never hand-written.
 */
export function inheritedTokens(themeCss: string, surface: string[]): string[] {
  const overridden = new Set(overriddenTokens(themeCss));
  return surface.filter((t) => !overridden.has(t)).sort();
}

/**
 * Validate a theme manifest object. Returns an array of field/message errors
 * (empty when valid), mirroring `validateManifest` for component manifests.
 */
export function validateThemeManifest(data: unknown): ThemeManifestValidationError[] {
  const errors: ThemeManifestValidationError[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push({ field: "(root)", message: "Theme manifest must be an object" });
    return errors;
  }

  const m = data as Record<string, unknown>;

  // Required non-empty strings.
  for (const field of ["name", "version", "preview"]) {
    if (typeof m[field] !== "string" || (m[field] as string).length === 0) {
      errors.push({ field, message: `Required string field '${field}' is missing or empty` });
    }
  }

  // mood — non-empty array of non-empty strings.
  if (!Array.isArray(m.mood) || m.mood.length === 0) {
    errors.push({ field: "mood", message: "Required non-empty array 'mood'" });
  } else if (!m.mood.every((t) => typeof t === "string" && t.length > 0)) {
    errors.push({ field: "mood", message: "'mood' must contain only non-empty strings" });
  }

  // scheme — enum.
  if (typeof m.scheme !== "string" || !VALID_SCHEMES.includes(m.scheme as ThemeSchemeDecl)) {
    errors.push({ field: "scheme", message: `'scheme' must be one of: ${VALID_SCHEMES.join(", ")}` });
  }

  // dark_mode — enum.
  if (typeof m.dark_mode !== "string" || !VALID_DARK_MODES.includes(m.dark_mode as ThemeDarkMode)) {
    errors.push({ field: "dark_mode", message: `'dark_mode' must be one of: ${VALID_DARK_MODES.join(", ")}` });
  }

  // Cross-field: a light-only scheme has no dark mode, and vice-versa.
  if (
    (m.scheme === "light" || m.dark_mode === "none") &&
    !(m.scheme === "light" && m.dark_mode === "none")
  ) {
    errors.push({
      field: "dark_mode",
      message: "'dark_mode: none' requires 'scheme: light' (and vice-versa)",
    });
  }

  // Token partitions — arrays of non-empty strings (overridden may not be empty).
  for (const field of ["tokens_overridden", "tokens_inherited"]) {
    if (!Array.isArray(m[field]) || !(m[field] as unknown[]).every((t) => typeof t === "string" && t.length > 0)) {
      errors.push({ field, message: `Required array '${field}' of non-empty token names` });
    }
  }
  if (Array.isArray(m.tokens_overridden) && m.tokens_overridden.length === 0) {
    errors.push({ field: "tokens_overridden", message: "'tokens_overridden' must not be empty — a theme overrides at least one token" });
  }

  // pairs_with — array of non-empty strings (may be empty).
  if (!Array.isArray(m.pairs_with) || !m.pairs_with.every((t) => typeof t === "string" && t.length > 0)) {
    errors.push({ field: "pairs_with", message: "Required array 'pairs_with' of non-empty theme names (may be empty)" });
  }

  return errors;
}

/** Load and parse a `{name}.theme.json` file. */
export async function loadThemeManifest(path: string): Promise<ThemeManifest> {
  const file = Bun.file(path);
  const json = await file.json();
  return json as ThemeManifest;
}
