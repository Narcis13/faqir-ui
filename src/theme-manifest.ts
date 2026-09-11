// Theme manifest — the `{name}.theme.json` descriptor shipped next to every theme.
//
// A theme manifest is the machine-readable card that lives beside each registry
// stylesheet (`registry/themes/{name}.theme.json` ↔ `registry/themes/{name}.css`).
// It lets agents *choose* a theme by mood or scheme, it drives the CI coverage
// matrix (`tests/themes/coverage.test.ts` reads the declared scheme from here,
// not from a CSS heuristic), and it is embedded into `faqir context` so an agent
// building UI knows the active theme's character and exactly which tokens it owns.
//
// Format (schema 1.1 — see FAQIR-NEXT §C1; published as part of manifest.schema.json in 0.5-07,
// grown by the five optional theme fields of SPEC-1.0 §6.4 in 1.1A-07):
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

import { existsSync } from "node:fs";
import { join } from "node:path";
import { extractTokenDefinitions } from "./parser/css-parser";

/** The color schemes a theme declares it ships. */
export type ThemeSchemeDecl = "light" | "dark" | "both";

/** How a theme provides its dark rendering. */
export type ThemeDarkMode = "native" | "none";

// ── Schema 1.1: the theme side's optional fields (task 1.1A-07) ─────────────
//
// Five fields the theme manifest may carry, all optional and all validated when
// present (SPEC-1.0 §6.4). Two of them — `axes` and `distinctiveness` — are
// DERIVED, written by a generator from the stylesheet itself, exactly like
// `tokens_overridden` has been since 0.4.
//
// The axis vocabulary is stated ONCE, here, as data. `manifest.schema.json`
// states the same vocabulary for the published contract, and
// `tests/schema/manifest-schema.test.ts` compares the two in both directions —
// so the CLI's validator and the schema an editor resolves cannot disagree
// about what `shape.corner` may be.

/**
 * Every enumerated axis, addressed by its dotted path inside a seed. Paths
 * rather than nested objects because that is what makes the validator a loop
 * and the schema drift-test a walk; the nesting itself lives in
 * {@link THEME_AXIS_GROUPS}.
 */
export const THEME_AXIS_VALUES = {
  neutral: ["gray", "cool", "warm", "tinted"],
  scheme: ["light", "dark", "both"],
  "type.pairing": [
    "system",
    "sans-humanist",
    "sans-grotesque",
    "sans-geometric",
    "rounded",
    "serif-editorial",
    "serif-modern",
    "slab",
    "mono",
    "custom",
  ],
  "type.scale": [1.125, 1.2, 1.25, 1.333],
  "type.base": [15, 16, 17, 18],
  "type.voice.weight": ["regular", "medium", "semibold", "bold", "black"],
  "type.voice.tracking": ["tight", "normal", "wide"],
  "type.voice.transform": ["none", "uppercase", "small-caps"],
  "shape.radius": ["sharp", "crisp", "soft", "round", "pill"],
  "shape.border": ["hairline", "regular", "heavy"],
  "shape.corner": ["round", "bevel", "scoop", "notch"],
  depth: ["flat", "soft", "layered", "hard", "glass", "inset"],
  material: ["none", "grain", "paper", "dots", "grid", "stripes", "mesh"],
  motion: ["none", "minimal", "smooth", "snappy", "springy", "playful"],
  density: ["compact", "comfortable", "spacious"],
  focus: ["ring", "glow", "inset", "bold"],
  "decoration.link": ["none", "plain", "offset", "thick"],
  "decoration.divider": ["solid", "dashed", "dotted", "double"],
  "controls.button": ["rect", "pill", "soft"],
  "controls.input": ["box", "filled", "underline"],
  "controls.checkbox": ["square", "round"],
  "controls.switch": ["pill", "square"],
  contrast: ["standard", "high"],
} as const;

/** The axes that are objects, and the keys each one accepts. */
export const THEME_AXIS_GROUPS = {
  type: ["pairing", "scale", "base", "voice"],
  "type.voice": ["weight", "tracking", "transform"],
  shape: ["radius", "border", "corner"],
  decoration: ["link", "divider"],
  controls: ["button", "input", "checkbox", "switch"],
} as const;

/**
 * The fourteen axes of FAQIR-VISION §5.2, in the order the schema states them.
 * `accent` and `document` belong to the seed; the derived `axes` block trades
 * them for `accent_hue` + `accent_chroma` and drops `document` (an authored
 * theme has no such input), which is why both sides count fourteen.
 */
export const THEME_SEED_AXES = [
  "accent",
  "neutral",
  "scheme",
  "type",
  "shape",
  "depth",
  "material",
  "motion",
  "density",
  "focus",
  "decoration",
  "controls",
  "contrast",
  "document",
] as const;

/** The axes shared by a seed and a derived `axes` block, in schema order. */
export const THEME_SHARED_AXES = [
  "neutral",
  "scheme",
  "type",
  "shape",
  "depth",
  "material",
  "motion",
  "density",
  "focus",
  "decoration",
  "controls",
  "contrast",
] as const;

/** Every key a derived `axes` block carries — all of them required. */
export const THEME_DERIVED_AXES = ["accent_hue", "accent_chroma", ...THEME_SHARED_AXES] as const;

/**
 * What each axis means when a seed leaves it out. Together they describe the
 * shipped `default` theme's character, which is what makes `{ name, accent }`
 * a complete seed rather than a fragment.
 */
export const THEME_SEED_DEFAULTS = {
  neutral: "gray",
  scheme: "both",
  "type.pairing": "system",
  "type.scale": 1.2,
  "type.base": 16,
  "type.voice.weight": "bold",
  "type.voice.tracking": "normal",
  "type.voice.transform": "none",
  "shape.radius": "soft",
  "shape.border": "hairline",
  "shape.corner": "round",
  depth: "soft",
  material: "none",
  motion: "smooth",
  density: "comfortable",
  focus: "ring",
  "decoration.link": "offset",
  "decoration.divider": "solid",
  "controls.button": "soft",
  "controls.input": "box",
  "controls.checkbox": "square",
  "controls.switch": "pill",
  contrast: "standard",
  document: false,
} as const;

/** The OKLCH hue of a derived accent, in degrees. */
export const ACCENT_HUE_RANGE = { min: 0, max: 360 } as const;
/** The OKLCH chroma of a derived accent. sRGB tops out around 0.37. */
export const ACCENT_CHROMA_RANGE = { min: 0, max: 0.5 } as const;

type AxisValue<K extends keyof typeof THEME_AXIS_VALUES> = (typeof THEME_AXIS_VALUES)[K][number];

/** Heading voice — how headings are set, whichever family sets them. */
export interface ThemeAxisVoice {
  weight?: AxisValue<"type.voice.weight">;
  tracking?: AxisValue<"type.voice.tracking">;
  transform?: AxisValue<"type.voice.transform">;
}

/** The `type` axis: which families, how big a ramp, how headings are voiced. */
export interface ThemeAxisType {
  pairing?: AxisValue<"type.pairing">;
  scale?: AxisValue<"type.scale">;
  base?: AxisValue<"type.base">;
  voice?: ThemeAxisVoice;
}

/** The `shape` axis: the silhouette — radius ramp, edge weight, corner shape. */
export interface ThemeAxisShape {
  radius?: AxisValue<"shape.radius">;
  border?: AxisValue<"shape.border">;
  corner?: AxisValue<"shape.corner">;
}

/** The `decoration` axis: link underlines and divider style. */
export interface ThemeAxisDecoration {
  link?: AxisValue<"decoration.link">;
  divider?: AxisValue<"decoration.divider">;
}

/** The `controls` axis: the silhouette of the four controls a theme is known by. */
export interface ThemeAxisControls {
  button?: AxisValue<"controls.button">;
  input?: AxisValue<"controls.input">;
  checkbox?: AxisValue<"controls.checkbox">;
  switch?: AxisValue<"controls.switch">;
}

/**
 * The generator input a generated theme was produced from, and the contents of
 * the standalone `<name>.seed.json` beside it. Absent on an authored theme.
 * Everything but `name` and `accent` is optional — see {@link THEME_SEED_DEFAULTS}.
 */
export interface ThemeSeed {
  name: string;
  /** `oklch(L C H)`, a hex triplet, or `white`/`black`. */
  accent: string;
  neutral?: AxisValue<"neutral">;
  scheme?: AxisValue<"scheme">;
  type?: ThemeAxisType;
  shape?: ThemeAxisShape;
  depth?: AxisValue<"depth">;
  material?: AxisValue<"material">;
  motion?: AxisValue<"motion">;
  density?: AxisValue<"density">;
  focus?: AxisValue<"focus">;
  decoration?: ThemeAxisDecoration;
  controls?: ThemeAxisControls;
  contrast?: AxisValue<"contrast">;
  document?: boolean;
}

/**
 * The fourteen axes a theme actually lands on, DERIVED from its CSS by
 * `gen:theme-manifests` (1.1A-08) and never hand-written. Every axis is
 * present: an incomplete block is the drift the field exists to catch.
 */
export interface ThemeAxes {
  accent_hue: number;
  accent_chroma: number;
  neutral: AxisValue<"neutral">;
  scheme: AxisValue<"scheme">;
  type: ThemeAxisType;
  shape: ThemeAxisShape;
  depth: AxisValue<"depth">;
  material: AxisValue<"material">;
  motion: AxisValue<"motion">;
  density: AxisValue<"density">;
  focus: AxisValue<"focus">;
  decoration: ThemeAxisDecoration;
  controls: ThemeAxisControls;
  contrast: AxisValue<"contrast">;
}

/** One self-hosted family a theme's role tokens name (1.1A-18). */
export interface ThemeFont {
  family: string;
  license: string;
  role: "heading" | "body" | "ui" | "mono";
  source?: string;
}

/** How far a theme sits from the nearest other, written by the gate (1.1A-12). */
export interface ThemeDistinctiveness {
  nearest: string;
  axis_distance: number;
  token_distance: number;
}

/** The roles a self-hosted family may fill. */
export const THEME_FONT_ROLES: ThemeFont["role"][] = ["heading", "body", "ui", "mono"];

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

  // Schema 1.1, all optional [1.1A-07].

  /** The generator input, on a generated theme. Absent on an authored one. */
  seed?: ThemeSeed;
  /** The fourteen axes, derived from the CSS — never hand-written. */
  axes?: ThemeAxes;
  /** Self-hosted families the theme's role tokens name, each with its licence. */
  fonts?: ThemeFont[];
  /** Distance to the nearest other shipped theme, written by the gate. */
  distinctiveness?: ThemeDistinctiveness;
  /** Whether the theme enters the full screenshot/axe matrix. Absent means true. */
  visual_matrix?: boolean;
}

export interface ThemeManifestValidationError {
  field: string;
  message: string;
}

const VALID_SCHEMES: ThemeSchemeDecl[] = ["light", "dark", "both"];
const VALID_DARK_MODES: ThemeDarkMode[] = ["native", "none"];

/**
 * `registry/tokens/*.css` files that contribute NO themeable surface, and so are
 * excluded everywhere the surface is derived (the generator, the registry audit
 * and their tests must agree — hence one shared list).
 *
 * - `index.css` is only `@import`s.
 * - `density.css` introduces nothing new: it re-declares tokens the surface
 *   already owns inside `[data-density]` subtree scopes. A theme's `:root` block
 *   cannot override a subtree scope, so listing those as theme-inheritable would
 *   be a lie.
 * - `textures.css` is a PALETTE, not a surface: six named SVG data URIs that no
 *   component reads. The themeable part of the material family is the pair of
 *   role tokens in `aliases.css` (`--texture-page`, `--texture-surface`) that
 *   components do read, and those stay in the surface. Listing the palette too
 *   would put six data URIs into every theme's `tokens_inherited` to say
 *   nothing — the same reasoning as `density.css`, one level up.
 */
export const NON_SURFACE_TOKEN_FILES = ["index.css", "density.css", "textures.css"] as const;

/** Whether a `registry/tokens/<file>` contributes to the themeable surface. */
export function isSurfaceTokenFile(file: string): boolean {
  return !(NON_SURFACE_TOKEN_FILES as readonly string[]).includes(file);
}

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

/** A plain object — not null, not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate one axis value — a group recurses into its declared keys, a leaf is
 * checked against its vocabulary. `path` addresses the axis in
 * {@link THEME_AXIS_VALUES}/{@link THEME_AXIS_GROUPS}; `field` is what the error
 * names, so a caller can report the same axis as `seed.type.voice.weight` or
 * `axes.type.voice.weight`.
 */
function validateAxis(
  path: string,
  field: string,
  value: unknown,
  errors: ThemeManifestValidationError[],
): void {
  const group = (THEME_AXIS_GROUPS as Record<string, readonly string[] | undefined>)[path];
  if (group) {
    if (!isRecord(value)) {
      errors.push({ field, message: `'${field}' must be an object` });
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (!group.includes(key)) {
        errors.push({ field: `${field}.${key}`, message: `Unknown key '${key}' — one of: ${group.join(", ")}` });
        continue;
      }
      validateAxis(`${path}.${key}`, `${field}.${key}`, child, errors);
    }
    return;
  }

  const values = (THEME_AXIS_VALUES as Record<string, readonly (string | number)[] | undefined>)[path];
  if (!values) return; // No vocabulary for this path — nothing to say about it.
  if (!values.includes(value as string | number)) {
    errors.push({ field, message: `'${field}' must be one of: ${values.join(", ")}` });
  }
}

/** A number inside an inclusive range, or an error naming the range. */
function validateRange(
  field: string,
  value: unknown,
  range: { min: number; max: number },
  errors: ThemeManifestValidationError[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ field, message: `'${field}' must be a number` });
    return;
  }
  if (value < range.min || value > range.max) {
    errors.push({ field, message: `'${field}' must be between ${range.min} and ${range.max}` });
  }
}

/**
 * The `seed` block (schema 1.1). `name` and `accent` are required; every axis is
 * optional and defaults per {@link THEME_SEED_DEFAULTS}. An unknown key is an
 * error rather than ignored noise — a typo'd axis in a seed is a theme that
 * silently comes out wrong.
 */
export function validateThemeSeed(data: unknown): ThemeManifestValidationError[] {
  const errors: ThemeManifestValidationError[] = [];
  if (!isRecord(data)) {
    errors.push({ field: "seed", message: "'seed' must be an object" });
    return errors;
  }

  for (const field of ["name", "accent"]) {
    if (typeof data[field] !== "string" || (data[field] as string).length === 0) {
      errors.push({ field: `seed.${field}`, message: `Required string field 'seed.${field}' is missing or empty` });
    }
  }

  const allowed = new Set<string>(["name", ...THEME_SEED_AXES]);
  for (const [key, value] of Object.entries(data)) {
    if (!allowed.has(key)) {
      errors.push({ field: `seed.${key}`, message: `Unknown seed axis '${key}'` });
      continue;
    }
    if (key === "name" || key === "accent") continue;
    if (key === "document") {
      if (typeof value !== "boolean") errors.push({ field: "seed.document", message: "'seed.document' must be a boolean" });
      continue;
    }
    validateAxis(key, `seed.${key}`, value, errors);
  }
  return errors;
}

/**
 * The `axes` block (schema 1.1) — derived, so every one of the fourteen keys is
 * required. A missing axis is drift, which is the thing the field exists to make
 * visible.
 */
export function validateThemeAxes(data: unknown): ThemeManifestValidationError[] {
  const errors: ThemeManifestValidationError[] = [];
  if (!isRecord(data)) {
    errors.push({ field: "axes", message: "'axes' must be an object" });
    return errors;
  }

  for (const axis of THEME_DERIVED_AXES) {
    if (!(axis in data)) errors.push({ field: `axes.${axis}`, message: `Derived axis 'axes.${axis}' is missing` });
  }

  const allowed = new Set<string>(THEME_DERIVED_AXES);
  for (const [key, value] of Object.entries(data)) {
    if (!allowed.has(key)) {
      errors.push({ field: `axes.${key}`, message: `Unknown axis '${key}'` });
      continue;
    }
    if (key === "accent_hue") validateRange("axes.accent_hue", value, ACCENT_HUE_RANGE, errors);
    else if (key === "accent_chroma") validateRange("axes.accent_chroma", value, ACCENT_CHROMA_RANGE, errors);
    else validateAxis(key, `axes.${key}`, value, errors);
  }
  return errors;
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

  // ── Schema 1.1: optional, and validated only when present [1.1A-07] ──
  // "Optional" is about the field's absence, never about its contents: a theme
  // that states `seed` states a seed the generator can re-run.

  if (m.seed !== undefined) errors.push(...validateThemeSeed(m.seed));
  if (m.axes !== undefined) errors.push(...validateThemeAxes(m.axes));

  if (m.fonts !== undefined) {
    if (!Array.isArray(m.fonts)) {
      errors.push({ field: "fonts", message: "'fonts' must be an array" });
    } else {
      m.fonts.forEach((font, i) => {
        if (!isRecord(font)) {
          errors.push({ field: `fonts[${i}]`, message: `'fonts[${i}]' must be an object` });
          return;
        }
        for (const field of ["family", "license"]) {
          if (typeof font[field] !== "string" || (font[field] as string).length === 0) {
            errors.push({ field: `fonts[${i}].${field}`, message: `Required string field '${field}' is missing or empty` });
          }
        }
        if (!THEME_FONT_ROLES.includes(font.role as ThemeFont["role"])) {
          errors.push({ field: `fonts[${i}].role`, message: `'role' must be one of: ${THEME_FONT_ROLES.join(", ")}` });
        }
        if (font.source !== undefined && (typeof font.source !== "string" || font.source.length === 0)) {
          errors.push({ field: `fonts[${i}].source`, message: "'source' must be a non-empty string when present" });
        }
      });
    }
  }

  if (m.distinctiveness !== undefined) {
    const d = m.distinctiveness;
    if (!isRecord(d)) {
      errors.push({ field: "distinctiveness", message: "'distinctiveness' must be an object" });
    } else {
      if (typeof d.nearest !== "string" || d.nearest.length === 0) {
        errors.push({ field: "distinctiveness.nearest", message: "Required non-empty string 'nearest'" });
      }
      for (const field of ["axis_distance", "token_distance"]) {
        const value = d[field];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          errors.push({ field: `distinctiveness.${field}`, message: `'${field}' must be a number >= 0` });
        }
      }
      if (typeof d.axis_distance === "number" && !Number.isInteger(d.axis_distance)) {
        errors.push({ field: "distinctiveness.axis_distance", message: "'axis_distance' counts axes — it must be an integer" });
      }
    }
  }

  if (m.visual_matrix !== undefined && typeof m.visual_matrix !== "boolean") {
    errors.push({ field: "visual_matrix", message: "'visual_matrix' must be a boolean (absent means true)" });
  }

  return errors;
}

/** Load and parse a `{name}.theme.json` file. */
export async function loadThemeManifest(path: string): Promise<ThemeManifest> {
  const file = Bun.file(path);
  const json = await file.json();
  return json as ThemeManifest;
}

/**
 * The names of every theme shipped in the registry, sorted. A theme is any
 * `registry/themes/{name}.css` stylesheet (each ships an adjacent
 * `{name}.theme.json` manifest). Shared by `faqir theme list` and the MCP
 * server's `faqir_theme_info` tool.
 */
export function listRegistryThemes(registryPath: string): string[] {
  const themesDir = join(registryPath, "themes");
  if (!existsSync(themesDir)) return [];

  const themes: string[] = [];
  const glob = new Bun.Glob("*.css");
  for (const file of glob.scanSync({ cwd: themesDir })) {
    // Skip preview/support stylesheets — a theme is `{name}.css` with no dot in `name`.
    if (file.endsWith(".preview.css")) continue;
    themes.push(file.replace(/\.css$/, ""));
  }
  return themes.sort();
}
