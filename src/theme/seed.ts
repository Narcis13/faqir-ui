// ═══════════════════════════════════════════════════════════════════════════
// The seed — one complete description of a theme's character   [task 1.1A-10]
// ═══════════════════════════════════════════════════════════════════════════
//
// `axesFromCss` (1.1A-08) reads a theme's fourteen axes OUT of its stylesheet.
// This file is the other direction: it takes whatever a caller supplies — a
// 1.0-era `{ accent, neutral, radius, scheme }`, a hand-written `.seed.json`,
// or a single `{ name, accent }` — and fills it out into the one shape every
// family renderer in `families.ts` reads.
//
// Three rules shape it:
//
//  1. **Every absent axis gets its documented default.** The defaults are not
//     invented here: `THEME_SEED_DEFAULTS` (1.1A-07) is the single table, and
//     it is exactly what the shipped `default` theme derives, which is what
//     makes `{ name, accent }` a COMPLETE seed rather than a fragment.
//
//  2. **A seed that cannot come out right is refused, not silently bent.** Two
//     axes are coupled by the 1.1A-08 classifiers rather than by taste (see
//     `PILL_COUPLING` below), and one value — `type.pairing: "custom"` — is a
//     DERIVED observation with no generator meaning. Both are errors with a
//     sentence saying what to write instead.
//
//  3. **Normalisation is pure and total.** The result has no optional fields,
//     so every family renderer is a total function of it and `expectedAxes()`
//     can state, up front, exactly what the generator's own output must derive
//     back to. That prediction is the closed loop `generateThemeBundle` runs.

import {
  THEME_AXIS_VALUES,
  THEME_SEED_DEFAULTS,
  type ThemeSeed,
  type ThemeAxes,
  type ThemeManifestValidationError,
  validateThemeSeed,
} from "../theme-manifest";
import type { OklchColor } from "../utils/oklch";

type AxisValues = typeof THEME_AXIS_VALUES;
/** One enumerated axis value, by its dotted path. */
export type Axis<K extends keyof AxisValues> = AxisValues[K][number];

/** The 1.0 `--radius` flag. Kept as a type so the CLI signature does not move. */
export type ThemeRadius = "sm" | "md" | "lg";

/**
 * The 1.0 three-step radius flag, in the five-step vocabulary that replaced it.
 * `sm|md|lg` were always the middle three bands — 1.1 adds a floor (`sharp`)
 * and a ceiling (`pill`) the old flag could not reach.
 */
export const LEGACY_RADIUS_SHAPE: Record<ThemeRadius, Axis<"shape.radius">> = {
  sm: "crisp",
  md: "soft",
  lg: "round",
};

/** The inverse of {@link LEGACY_RADIUS_SHAPE}, for the CLI's own JSON report. */
export const SHAPE_LEGACY_RADIUS: Record<Axis<"shape.radius">, ThemeRadius> = {
  sharp: "sm",
  crisp: "sm",
  soft: "md",
  round: "lg",
  pill: "lg",
};

/**
 * Everything a caller may pass. `ThemeSeed` is the 1.1 shape; `radius` and
 * `legacyBlocks` are the two 1.0 flags that have no axis of their own.
 */
export interface ThemeSeedInput extends ThemeSeed {
  /** 1.0's three-step radius flag. Mapped onto `shape.radius`. */
  radius?: ThemeRadius;
  /** Emit a dual-scheme theme as three colour blocks instead of `light-dark()`. */
  legacyBlocks?: boolean;
}

/** A seed with every axis present. The input to every family renderer. */
export interface NormalizedSeed {
  name: string;
  accent: string;
  neutral: Axis<"neutral">;
  scheme: Axis<"scheme">;
  type: {
    pairing: Exclude<Axis<"type.pairing">, "custom">;
    scale: Axis<"type.scale">;
    base: Axis<"type.base">;
    voice: {
      weight: Axis<"type.voice.weight">;
      tracking: Axis<"type.voice.tracking">;
      transform: Axis<"type.voice.transform">;
    };
  };
  shape: {
    radius: Axis<"shape.radius">;
    border: Axis<"shape.border">;
    corner: Axis<"shape.corner">;
  };
  depth: Axis<"depth">;
  material: Axis<"material">;
  motion: Axis<"motion">;
  density: Axis<"density">;
  focus: Axis<"focus">;
  decoration: {
    link: Axis<"decoration.link">;
    divider: Axis<"decoration.divider">;
  };
  controls: {
    button: Axis<"controls.button">;
    input: Axis<"controls.input">;
    checkbox: Axis<"controls.checkbox">;
    switch: Axis<"controls.switch">;
  };
  contrast: Axis<"contrast">;
  document: boolean;
  legacyBlocks: boolean;
}

/**
 * The one coupling the vocabulary does not make obvious, stated where a reader
 * trips over it.
 *
 * `shape.radius` and `controls.button` are not independent, because the 1.1A-08
 * classifier reads `shape.radius: "pill"` off `--button-radius` and nothing
 * else: no ramp value can express "pill" (the bands above `--radius-md` stop at
 * `round`), so a pill theme is one whose BUTTON is a pill. The two therefore
 * agree or the seed is wrong — the generator would otherwise emit a theme that
 * derives an axis its own seed denies, and the closed loop would reject it one
 * step later with a worse message.
 */
/**
 * What an UNSTATED `controls.button` follows. A theme that asked for square
 * corners and said nothing about its buttons wants square buttons — a flat
 * default of `soft` would leave one rounded control in an otherwise sharp
 * theme, which is not what the shape axis was asked for.
 *
 * This is the one place a `THEME_SEED_DEFAULTS` entry is derived rather than
 * constant, and the table still holds where it is quoted: the DEFAULT shape is
 * `soft`, whose button is `soft`, so `{ name, accent }` still describes the
 * shipped `default` theme exactly. A stated value always wins — `sharp` panels
 * with `soft` buttons is a deliberate contrast, and `families.ts` renders it.
 */
export const BUTTON_FOLLOWS_SHAPE: Partial<
  Record<Axis<"shape.radius">, Axis<"controls.button">>
> = { sharp: "rect", pill: "pill" };

export const PILL_COUPLING =
  "shape.radius: \"pill\" and controls.button: \"pill\" are the same statement — " +
  "a pill theme is one whose buttons are pills, which is the only thing " +
  "--button-radius can say. Set both, or neither.";

/** `type.pairing: "custom"` is an observation, not an instruction. */
export const CUSTOM_PAIRING_REFUSAL =
  "type.pairing: \"custom\" is a DERIVED value — it is what axesFromCss reports " +
  "when a theme's heading and body faces classify differently, which no single " +
  "pairing can name. Name the class you want (e.g. \"serif-editorial\"), or " +
  "author the --font-heading / --font-body roles by hand.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a nested key out of a partially-specified seed, or `undefined`. */
function group(seed: ThemeSeedInput, name: string): Record<string, unknown> {
  const value = (seed as unknown as Record<string, unknown>)[name];
  return isPlainObject(value) ? value : {};
}

/** `value` when present, else the documented default for `path`. */
function withDefault<K extends keyof AxisValues>(
  path: K,
  value: unknown,
): Axis<K> {
  return (value ?? THEME_SEED_DEFAULTS[path as keyof typeof THEME_SEED_DEFAULTS]) as Axis<K>;
}

/**
 * Fill a seed out to every axis, mapping the 1.0 flags on the way in.
 *
 * Throws with a single actionable sentence on an unknown axis value, an unknown
 * key, or either of the two refusals above. Validation is `validateThemeSeed`'s
 * — the SAME function the manifest gate runs — so the generator and the
 * published schema cannot disagree about what a legal seed is.
 */
/**
 * A theme's name is not decoration: it becomes the infix of eleven custom
 * property names (`--palette-<name>-500`), so anything outside kebab-case
 * produces a stylesheet a browser silently discards — a `.` or a space ends
 * the identifier and the whole declaration is dropped. The CLI checks this
 * too; it is repeated here because `generateThemeBundle` is also the MCP
 * tool's and Night Shift's entry point.
 */
export const THEME_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function normalizeSeed(input: ThemeSeedInput): NormalizedSeed {
  if (!isPlainObject(input)) throw new Error("A theme seed must be an object.");
  if (typeof input.name !== "string" || !THEME_NAME_PATTERN.test(input.name)) {
    throw new Error(
      `Invalid theme name '${String(input.name)}'. A theme name must be lowercase kebab-case ` +
        `(e.g. 'my-brand'): it is spliced into every --palette-<name>-<step> custom property.`,
    );
  }

  // The legacy radius flag is not a seed field, so it is mapped (and removed)
  // before the shared validator ever sees it.
  const { radius, legacyBlocks, ...rest } = input;
  // An explicitly-`undefined` key is an ABSENT key: `{ ...options, controls:
  // maybe }` is how a caller spreads an optional axis, and the validator
  // rightly refuses `controls: undefined` as "must be an object".
  const seed = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  ) as unknown as ThemeSeedInput;
  if (radius !== undefined) {
    if (!(radius in LEGACY_RADIUS_SHAPE)) {
      throw new Error(`Invalid --radius '${radius}'. Choose: sm, md, or lg.`);
    }
    if (seed.shape?.radius === undefined) {
      seed.shape = { ...seed.shape, radius: LEGACY_RADIUS_SHAPE[radius] };
    }
  }

  const errors: ThemeManifestValidationError[] = validateThemeSeed(seed);
  if (errors.length > 0) {
    throw new Error(
      `Invalid theme seed: ${errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`,
    );
  }

  const type = group(seed, "type");
  const voice = isPlainObject(type.voice) ? type.voice : {};
  const shape = group(seed, "shape");
  const decoration = group(seed, "decoration");
  const controls = group(seed, "controls");

  const pairing = withDefault("type.pairing", type.pairing);
  if (pairing === "custom") throw new Error(CUSTOM_PAIRING_REFUSAL);

  const shapeRadius = withDefault("shape.radius", shape.radius);
  // An unstated button silhouette follows the ramp (BUTTON_FOLLOWS_SHAPE); a
  // stated one that contradicts a pill shape is the error PILL_COUPLING names,
  // because those two are one statement rather than two.
  const statedButton = controls.button as Axis<"controls.button"> | undefined;
  const button: Axis<"controls.button"> =
    statedButton ?? BUTTON_FOLLOWS_SHAPE[shapeRadius] ?? withDefault("controls.button", undefined);
  if ((shapeRadius === "pill") !== (button === "pill")) throw new Error(PILL_COUPLING);

  return {
    name: seed.name,
    accent: seed.accent,
    neutral: withDefault("neutral", seed.neutral),
    scheme: withDefault("scheme", seed.scheme),
    type: {
      pairing: pairing as Exclude<Axis<"type.pairing">, "custom">,
      scale: withDefault("type.scale", type.scale),
      base: withDefault("type.base", type.base),
      voice: {
        weight: withDefault("type.voice.weight", voice.weight),
        tracking: withDefault("type.voice.tracking", voice.tracking),
        transform: withDefault("type.voice.transform", voice.transform),
      },
    },
    shape: {
      radius: shapeRadius,
      border: withDefault("shape.border", shape.border),
      corner: withDefault("shape.corner", shape.corner),
    },
    depth: withDefault("depth", seed.depth),
    material: withDefault("material", seed.material),
    motion: withDefault("motion", seed.motion),
    density: withDefault("density", seed.density),
    focus: withDefault("focus", seed.focus),
    decoration: {
      link: withDefault("decoration.link", decoration.link),
      divider: withDefault("decoration.divider", decoration.divider),
    },
    controls: {
      button,
      input: withDefault("controls.input", controls.input),
      checkbox: withDefault("controls.checkbox", controls.checkbox),
      switch: withDefault("controls.switch", controls.switch),
    },
    contrast: withDefault("contrast", seed.contrast),
    document: seed.document ?? THEME_SEED_DEFAULTS.document,
    legacyBlocks: legacyBlocks === true,
  };
}

/** Round to `places` decimals without trailing float noise — `axesFromCss`'s. */
function round(n: number, places: number): number {
  return Number(n.toFixed(places));
}

/**
 * What `axesFromCss` MUST report for the stylesheet this seed produces.
 *
 * Every enumerated axis is the seed's own value: a family renderer that emits
 * something the classifier reads differently is a bug, and the closed loop in
 * `generateThemeBundle` is where it surfaces. Two axes are passed in rather
 * than read off the seed, both because they describe what the generator
 * LANDED on rather than what it was asked for:
 *
 *  - `accent_hue`/`accent_chroma` describe the ramp STEP the contrast
 *    selection picked, not the accent the seed named.
 *  - `neutral` is `seed.neutral` except for one documented collapse:
 *    `tinted` tints the neutral with the ACCENT's own hue (the only
 *    non-arbitrary choice, since the vocabulary carries no hue of its own),
 *    so an accent that already lives in the cool or the warm hue window
 *    produces a neutral the classifier — rightly — calls `cool` or `warm`.
 *    A neutral tinted blue IS a cool neutral; the axis reports the
 *    stylesheet, not the request. See `neutralAxisFor` in `families.ts`.
 */
export function expectedAxes(
  seed: NormalizedSeed,
  primary: OklchColor,
  neutral: Axis<"neutral">,
): ThemeAxes {
  return {
    accent_hue: round(primary.h, 1),
    accent_chroma: round(primary.c, 4),
    neutral,
    scheme: seed.scheme,
    type: {
      pairing: seed.type.pairing,
      scale: seed.type.scale,
      base: seed.type.base,
      voice: { ...seed.type.voice },
    },
    shape: { ...seed.shape },
    depth: seed.depth,
    material: seed.material,
    motion: seed.motion,
    density: seed.density,
    focus: seed.focus,
    decoration: { ...seed.decoration },
    controls: { ...seed.controls },
    contrast: seed.contrast,
  };
}

/** The seed, as it is written into the manifest and the `<name>.seed.json`. */
export function seedRecord(seed: NormalizedSeed): ThemeSeed {
  return {
    name: seed.name,
    accent: seed.accent,
    neutral: seed.neutral,
    scheme: seed.scheme,
    type: {
      pairing: seed.type.pairing,
      scale: seed.type.scale,
      base: seed.type.base,
      voice: { ...seed.type.voice },
    },
    shape: { ...seed.shape },
    depth: seed.depth,
    material: seed.material,
    motion: seed.motion,
    density: seed.density,
    focus: seed.focus,
    decoration: { ...seed.decoration },
    controls: { ...seed.controls },
    contrast: seed.contrast,
    document: seed.document,
  };
}
