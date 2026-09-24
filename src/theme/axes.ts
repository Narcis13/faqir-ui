// ═══════════════════════════════════════════════════════════════════════════
// axesFromCss — the fourteen axes, derived from a stylesheet    [task 1.1A-08]
// ═══════════════════════════════════════════════════════════════════════════
//
// A theme's axes are a FACT ABOUT ITS STYLESHEET, not a claim its author types.
// That is the same rule `tokens_overridden` has followed since 0.4: the manifest
// records what the CSS does, `gen:theme-manifests` writes it, and the manifest
// gate re-derives and compares, so a hand-edit is drift that fails rather than
// documentation that quietly goes stale.
//
// Every classifier below reads tokens through the SAME cascade model the
// contrast gate uses (`buildSchemeLookups`) — theme dark block, then theme
// `:root`, then the base token layer — so the axis gate and the contrast gate
// cannot disagree about what `--color-bg` resolves to in a given scheme.
//
// Every threshold is a named constant with its rule in a comment beside it.
// Two of them deviate from the sketch in FAQIR-PLAN-1.1 §1.1A-08 and say why at
// the constant: BUTTON_RECT_MAX_PX and the `--input-fill` comparison. Both
// deviations exist because the sketch predates the tokens 1.1A-05 actually
// shipped, and a derived axis that disagreed with `THEME_SEED_DEFAULTS` would
// make `{ name, accent }` an incomplete seed — see `defaultAxes` in
// `tests/themes/axes.test.ts`, which holds the two sides equal.

import { buildSchemeLookups } from "../audit/contrast-tokens";
import { cssColorToOklch, parseCssColor, contrastRatio, parseThemeValues } from "../utils/oklch";
import {
  THEME_AXIS_VALUES,
  type ThemeAxes,
  type ThemeAxisControls,
  type ThemeAxisDecoration,
  type ThemeAxisShape,
  type ThemeAxisType,
  type ThemeAxisVoice,
} from "../theme-manifest";

type AxisValues = typeof THEME_AXIS_VALUES;
type Axis<K extends keyof AxisValues> = AxisValues[K][number];

/** The two schemes a lookup can be built for. `auto` mirrors `dark` by construction. */
type Scheme = "light" | "dark";

// ── Units ───────────────────────────────────────────────────────────────────

/**
 * The CSS initial root font size. A browser-free gate has no layout to measure,
 * so `rem`/`em` are read against the initial 16px — which is what every shipped
 * token means by `1rem`, because nothing in the registry re-declares the root
 * font size.
 */
export const ROOT_FONT_PX = 16;

/** `pt` → `px`: CSS defines 1in as 96px and 72pt, which the document themes use. */
const PT_PER_PX = 96 / 72;

const LENGTH_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem|em|pt|q|cm|mm|in|pc)?$/i;

/**
 * A CSS length in px, or null when the value is not a length (`none`, `auto`,
 * a keyword, a colour). A unitless `0` is a length; any other unitless number is
 * not.
 */
export function lengthPx(value: string | null | undefined): number | null {
  if (value == null) return null;
  const m = LENGTH_RE.exec(value.trim().toLowerCase());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2];
  if (!unit) return n === 0 ? 0 : null;
  switch (unit) {
    case "px":
      return n;
    case "rem":
    case "em":
      return n * ROOT_FONT_PX;
    case "pt":
      return n * PT_PER_PX;
    case "pc":
      return n * 16;
    case "in":
      return n * 96;
    case "cm":
      return n * (96 / 2.54);
    case "mm":
      return n * (96 / 25.4);
    case "q":
      return n * (96 / 101.6);
    default:
      return null;
  }
}

/** A CSS length expressed in `em`, the unit the type voice is authored in. */
export function lengthEm(value: string | null | undefined): number | null {
  const px = lengthPx(value);
  return px == null ? null : px / ROOT_FONT_PX;
}

// ── var() resolution for values that are not colours ────────────────────────

/** Index of the `)` closing the `(` at `open`, or -1 when unbalanced. */
function matchParen(value: string, open: number): number {
  let depth = 0;
  for (let i = open; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** Split `--name, fallback` at the first TOP-LEVEL comma. */
function splitVarArgs(args: string): { name: string; fallback: string | null } {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      return { name: args.slice(0, i).trim(), fallback: args.slice(i + 1).trim() };
    }
  }
  return { name: args.trim(), fallback: null };
}

/**
 * Resolve a CSS value through the token graph to whatever literal text a browser
 * would substitute — the non-colour twin of `resolveColorString`, which stops at
 * the first thing that parses as a colour and so can never report `0.375rem` or
 * `cubic-bezier(…)`.
 *
 * Both shapes are handled, because themes author both: a value that IS one
 * `var()` (`--heading-weight: var(--weight-bold)`) is followed to its terminal
 * literal, and `var()`s EMBEDDED in a longer value (`0 0 var(--border-width) 0`)
 * are substituted in place so the surrounding value still reads as CSS.
 *
 * Cycle-safe: a token already on the current path is not re-entered, and an
 * undefined token with no fallback is left verbatim — that is the value a
 * browser drops, and a classifier seeing `var(--x)` reports "not a length"
 * rather than inventing one.
 */
export function resolveValue(
  value: string,
  lookup: Map<string, string>,
  seen: ReadonlySet<string> = new Set(),
): string {
  const v = value.trim();
  const start = v.toLowerCase().indexOf("var(");
  if (start === -1) return v;

  const close = matchParen(v, v.indexOf("(", start));
  if (close === -1) return v;

  // The whole value is one var(): follow the chain, honouring the fallback.
  if (start === 0 && close === v.length - 1) {
    const { name, fallback } = splitVarArgs(v.slice(4, close));
    const key = name.replace(/^--/, "");
    if (!seen.has(key) && lookup.has(key)) {
      const next = new Set(seen);
      next.add(key);
      return resolveValue(lookup.get(key)!, lookup, next);
    }
    if (fallback != null) return resolveValue(fallback, lookup, seen);
    return v;
  }

  // An embedded var(): substitute it, then keep scanning what FOLLOWS it. The
  // tail is resolved separately rather than by re-scanning the whole value, so a
  // reference that cannot be substituted is stepped over instead of looping.
  const { name, fallback } = splitVarArgs(v.slice(start + 4, close));
  const key = name.replace(/^--/, "");
  let substituted: string;
  if (!seen.has(key) && lookup.has(key)) {
    const next = new Set(seen);
    next.add(key);
    substituted = resolveValue(lookup.get(key)!, lookup, next);
  } else if (fallback != null) {
    substituted = resolveValue(fallback, lookup, seen);
  } else {
    substituted = v.slice(start, close + 1);
  }
  // The tail keeps its leading whitespace: `resolveValue` trims, and a lost
  // space turns `0 0 var(--x) 0` into three words instead of four, which is a
  // different box shorthand.
  const tail = v.slice(close + 1);
  const lead = /^\s*/.exec(tail)![0];
  return v.slice(0, start) + substituted + lead + resolveValue(tail, lookup, seen);
}

/** Split a comma-separated CSS list at TOP-LEVEL commas (shadow layers, font stacks). */
export function splitTopLevel(value: string, separator = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  let quote: string | null = null;
  for (const c of value) {
    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      buf += c;
    } else if (c === "(") {
      depth++;
      buf += c;
    } else if (c === ")") {
      depth--;
      buf += c;
    } else if (c === separator && depth === 0) {
      out.push(buf.trim());
      buf = "";
    } else {
      buf += c;
    }
  }
  out.push(buf.trim());
  return out.filter((s) => s.length > 0);
}

/** Split a value on top-level whitespace, keeping function calls intact. */
function words(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const c of value) {
    if (c === "(") {
      depth++;
      buf += c;
    } else if (c === ")") {
      depth--;
      buf += c;
    } else if (/\s/.test(c) && depth === 0) {
      if (buf) out.push(buf);
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf) out.push(buf);
  return out;
}

// ── The family → class table (`type.pairing`) ───────────────────────────────
//
// A pairing is named by the CLASS of face a theme uses, not by the face itself,
// so the table maps family names (and the CSS generic keywords, which are the
// only portable way to ask for a class) onto the ten vocabulary values. The
// first family in a stack that the table recognises decides the class — that
// mirrors what a browser does, which is to use the first face it can load.
//
// The table is deliberately small: it names the faces the registry, the shipped
// themes and FAQIR-VISION §5.5's curated list actually use. Anything else is
// `custom`, which is an honest answer rather than a guess. 1.1A-18 ships the OFL
// catalog; each family it adds gets a row here.
const FAMILY_CLASSES: Array<[Axis<"type.pairing">, string[]]> = [
  // The platform UI face. `system-ui` and its vendor spellings.
  ["system", ["system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui variable"]],
  // Monospace: the generic, the platform faces, and the coding families.
  [
    "mono",
    [
      "ui-monospace",
      "monospace",
      "sfmono-regular",
      "sf mono",
      "menlo",
      "monaco",
      "consolas",
      "cascadia code",
      "courier new",
      "courier",
      "jetbrains mono",
      "ibm plex mono",
      "fira code",
      "source code pro",
    ],
  ],
  // Rounded sans — a distinct silhouette, so it outranks the sans classes.
  ["rounded", ["ui-rounded", "sf pro rounded", "nunito", "quicksand", "varela round", "comfortaa"]],
  // Slab serifs: serif skeleton, rectangular brackets.
  ["slab", ["roboto slab", "zilla slab", "rockwell", "museo slab", "bitter"]],
  // Old-style / transitional text serifs — made to be read at body size.
  [
    "serif-editorial",
    ["ui-serif", "serif", "georgia", "charter", "iowan old style", "palatino", "lora", "newsreader", "source serif 4", "literata", "fraunces", "ibm plex serif"],
  ],
  // Didone / modern serifs — high contrast, vertical stress, display-leaning.
  ["serif-modern", ["times new roman", "times", "playfair display", "didot", "bodoni moda", "instrument serif"]],
  // Humanist sans — calligraphic skeleton, open apertures.
  [
    "sans-humanist",
    ["segoe ui", "frutiger", "myriad", "lato", "open sans", "source sans 3", "pt sans", "verdana", "tahoma", "trebuchet ms", "optima"],
  ],
  // Geometric sans — circular bowls, single-storey a.
  ["sans-geometric", ["futura", "avenir", "avenir next", "poppins", "montserrat", "century gothic", "dm sans", "jost"]],
  // Grotesque / neo-grotesque sans — the default class for a plain sans.
  [
    "sans-grotesque",
    ["helvetica neue", "helvetica", "arial", "inter", "roboto", "neue haas grotesk", "space grotesk", "manrope", "geist", "bricolage grotesque", "ibm plex sans", "sans-serif"],
  ],
];

/** The class of the first family in a stack that {@link FAMILY_CLASSES} names. */
export function familyClass(stack: string): Axis<"type.pairing"> | null {
  for (const family of splitTopLevel(stack)) {
    const name = family.trim().replace(/^["']|["']$/g, "").toLowerCase();
    if (!name) continue;
    for (const [cls, members] of FAMILY_CLASSES) {
      if (members.includes(name)) return cls;
    }
  }
  return null;
}

// ── Thresholds ──────────────────────────────────────────────────────────────

/** Below this OKLCH chroma a neutral ramp reads as achromatic at any lightness. */
export const NEUTRAL_GRAY_MAX_CHROMA = 0.005;
/** OKLCH hue window (inclusive) for a cool neutral — the blues and violets. */
export const NEUTRAL_COOL_HUE = { min: 200, max: 280 } as const;
/** OKLCH hue window (inclusive) for a warm neutral — the ambers and creams. */
export const NEUTRAL_WARM_HUE = { min: 40, max: 100 } as const;

/** The four modular-scale ratios the vocabulary names; a ramp snaps to the nearest. */
export const TYPE_SCALE_RATIOS = THEME_AXIS_VALUES["type.scale"];
/** The four base sizes the vocabulary names, in px; `--text-base` snaps to the nearest. */
export const TYPE_BASE_SIZES = THEME_AXIS_VALUES["type.base"];
/** The `--text-*` ramp, in ascending order — the steps the scale ratio is measured across. */
export const TEXT_STEPS = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
] as const;

/** Upper bound of each heading-weight class; anything heavier is `black`. */
export const HEADING_WEIGHT_MAX = { regular: 450, medium: 550, semibold: 650, bold: 750 } as const;
/** `letter-spacing` narrower than this (in em) is `tight`; wider than its negation is `wide`. */
export const HEADING_TRACKING_EM = 0.005;

/**
 * A radius at or above this reads as fully round at every control size the
 * registry ships. `--radius-full` is `9999px`, so this is a floor under it that
 * a theme cannot reach by accident with a real corner radius.
 */
export const PILL_MIN_PX = 999;
/** `--radius-md` bands for `shape.radius`: 0 is sharp, then 0.25rem and 0.5rem. */
export const RADIUS_CRISP_MAX_PX = 4;
export const RADIUS_SOFT_MAX_PX = 8;
/** `--border-width` bands: 1px is a hairline, 2px is regular, thicker is heavy. */
export const BORDER_HAIRLINE_MAX_PX = 1;
export const BORDER_REGULAR_MAX_PX = 2;

/**
 * A mid shadow blurred past this is reaching for the next step of the ramp,
 * which is what `layered` names. Halfway between the base ramp's own
 * `--shadow-md` blur (6px) and its `--shadow-lg` blur (15px).
 */
export const DEPTH_LAYERED_MIN_BLUR_PX = 10;

/** `--duration-normal` bands for `motion`, in ms. */
export const MOTION_MINIMAL_MAX_MS = 120;
export const MOTION_SNAPPY_MAX_MS = 160;
/**
 * A hover lift this deep (or deeper) alongside a spring is `playful` rather than
 * `springy`: the theme is moving the surface, not just the easing curve.
 */
export const MOTION_PLAYFUL_LIFT_MAX_PX = -2;

/** A focus ring this wide is `bold` — the 1.1A-02 ladder's `--border-width-lg`. */
export const FOCUS_BOLD_MIN_WIDTH_PX = 3;

/**
 * The narrowest rule a browser splits into two lines under `border-style:
 * double` — measured in Chrome 149: 1px paints one row, 2px two ADJACENT rows,
 * and only 3px paints line / gap / line. A theme's `double` divider therefore
 * reads as `double` only when `--divider-width` clears this; below it the rule
 * renders as one line and the axis says `solid`, which is what a reader sees
 * [1.1A-26].
 */
export const DIVIDER_DOUBLE_MIN_PX = 3;

/** A link rule this thick is `thick`, whatever its offset. */
export const LINK_THICK_MIN_PX = 2;
/** An underline lifted at least this far off the baseline (em) is `offset`. */
export const LINK_OFFSET_MIN_EM = 0.05;

/**
 * `controls.button` deviates from the plan's sketch ("≥ `--radius-lg` soft, else
 * rect"). Under that rule the shipped `default` theme — `--button-radius` is
 * `var(--radius-md)`, 6px, against a `--radius-lg` of 8px — derives `rect`,
 * while `THEME_SEED_DEFAULTS` (1.1A-07) records `soft`. A derived axis that
 * contradicts the seed defaults would mean `{ name, accent }` is no longer the
 * complete seed 1.1A-07 asserts it is, so the band is stated the way the three
 * vocabulary values actually partition a radius: `rect` is a square corner,
 * `pill` is a fully round one, and everything between is `soft`.
 */
export const BUTTON_RECT_MAX_PX = 0;

/** `contrast: high` — body text this far above AA, on every shipped scheme. */
export const CONTRAST_HIGH_TEXT_MIN = 15;
/** …and a border that still clears WCAG 2.2 SC 1.4.11's non-text minimum. */
export const CONTRAST_HIGH_BORDER_MIN = 3;

// ── Small helpers over a resolved lookup ────────────────────────────────────

/** Resolve one token to its terminal literal, or null when it is undefined. */
function token(lookup: Map<string, string>, name: string): string | null {
  const raw = lookup.get(name);
  if (raw == null) return null;
  const resolved = resolveValue(raw, lookup, new Set([name]));
  return resolved.length > 0 ? resolved : null;
}

/** A token's resolved length in px, or null. */
function tokenPx(lookup: Map<string, string>, name: string): number | null {
  return lengthPx(token(lookup, name));
}

/** The nearest member of `options` to `n`. */
function nearest<T extends number>(n: number, options: readonly T[]): T {
  let best = options[0];
  for (const option of options) {
    if (Math.abs(option - n) < Math.abs(best - n)) best = option;
  }
  return best;
}

/** A vocabulary value when the token says one, else the documented fallback. */
function keyword<K extends keyof AxisValues>(
  axis: K,
  value: string | null,
  fallback: Axis<K>,
): Axis<K> {
  const v = value?.trim().toLowerCase();
  const values = THEME_AXIS_VALUES[axis] as readonly (string | number)[];
  return v != null && values.includes(v) ? (v as Axis<K>) : fallback;
}

/** The four sides a 1–4 value box shorthand expands to: `[top, right, bottom, left]`. */
export function expandSides(value: string): [string, string, string, string] | null {
  const parts = words(value);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  if (parts.length === 4) return [parts[0], parts[1], parts[2], parts[3]];
  return null;
}

/** `[offset-x, offset-y, blur, spread]` of a shadow layer, in px, and whether it is inset. */
export function shadowLayer(layer: string): { lengths: number[]; inset: boolean } {
  const parts = words(layer);
  const inset = parts.some((p) => p.toLowerCase() === "inset");
  const lengths: number[] = [];
  for (const part of parts) {
    const px = lengthPx(part);
    if (px != null) lengths.push(px);
  }
  return { lengths, inset };
}

/** Whether an easing value overshoots — a `linear()` spring or a cubic-bezier above 1. */
export function isSpringEasing(easing: string | null): boolean {
  if (!easing) return false;
  const v = easing.trim().toLowerCase();
  if (v.startsWith("linear(")) return true;
  const m = /^cubic-bezier\(([^)]*)\)$/.exec(v);
  if (!m) return false;
  const n = m[1].split(",").map((s) => parseFloat(s.trim()));
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return false;
  // The two y values are the output; above 1 the curve overshoots its target.
  return n[1] > 1 || n[3] > 1;
}

/** A duration in ms, or null. */
export function durationMs(value: string | null): number | null {
  if (value == null) return null;
  const m = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(ms|s)$/i.exec(value.trim().toLowerCase());
  if (!m) return null;
  return m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
}

// ── Scheme and density: the two axes a stylesheet states in a comment ───────

/**
 * Which schemes the stylesheet ships. A theme narrows the default (`both`) with
 * the same `@ui:schemes` header directive the coverage gate reads; with no
 * directive, a theme ships dark iff parsing it yields dark declarations — which
 * covers both authoring forms, since 1.1A-06's `parseThemeValues` derives dark
 * from a one-block `light-dark()` theme too.
 */
export function schemeFromCss(themeCss: string, values: { light: Map<string, string>; dark: Map<string, string> }): Axis<"scheme"> {
  const m = /@ui:schemes\s+([a-z ,]+)/i.exec(themeCss);
  if (m) {
    const declared = new Set(m[1].toLowerCase().split(/[\s,]+/).filter(Boolean));
    const light = declared.has("light");
    const dark = declared.has("dark");
    if (light && dark) return "both";
    if (dark) return "dark";
    if (light) return "light";
  }
  const hasDark = values.dark.size > 0;
  const hasLight = values.light.size > 0;
  if (hasLight && hasDark) return "both";
  if (hasDark) return "dark";
  return "light";
}

/**
 * The density a theme asks the page to start at. There is no token to read —
 * `data-density` is a subtree MODIFIER, and `density.css` deliberately declares
 * nothing at `:root` (see `NON_SURFACE_TOKEN_FILES`) — so a theme states it in a
 * header directive, exactly as it narrows its schemes:
 *
 *     /* @ui:density spacious *\/
 */
export function densityFromCss(themeCss: string): Axis<"density"> {
  const m = /@ui:density\s+([a-z]+)/i.exec(themeCss);
  return keyword("density", m ? m[1] : null, "comfortable");
}

// ── The classifiers ─────────────────────────────────────────────────────────

function neutralAxis(lookup: Map<string, string>): Axis<"neutral"> {
  const bg = token(lookup, "color-bg");
  const color = bg ? cssColorToOklch(bg) : null;
  if (!color) return "gray";
  if (color.c < NEUTRAL_GRAY_MAX_CHROMA) return "gray";
  if (color.h >= NEUTRAL_COOL_HUE.min && color.h <= NEUTRAL_COOL_HUE.max) return "cool";
  if (color.h >= NEUTRAL_WARM_HUE.min && color.h <= NEUTRAL_WARM_HUE.max) return "warm";
  return "tinted";
}

function typeAxis(lookup: Map<string, string>): Required<ThemeAxisType> & { voice: Required<ThemeAxisVoice> } {
  // pairing — the vocabulary names ONE class, so a theme whose heading and body
  // classify differently is a pairing the enum cannot name: `custom`. That is
  // also the exact inverse of the generator, which turns one pairing value into
  // both role tokens.
  const heading = familyClass(token(lookup, "font-heading") ?? "");
  const body = familyClass(token(lookup, "font-body") ?? "");
  const pairing: Axis<"type.pairing"> = heading != null && heading === body ? heading : "custom";

  // scale — the median ratio between consecutive steps of the shipped ramp,
  // snapped to the nearest vocabulary ratio. A median, not a mean, so one
  // deliberately outsized display step cannot drag the whole ramp.
  const sizes = TEXT_STEPS.map((step) => tokenPx(lookup, step));
  const ratios: number[] = [];
  for (let i = 1; i < sizes.length; i++) {
    const a = sizes[i - 1];
    const b = sizes[i];
    if (a != null && b != null && a > 0 && b > 0) ratios.push(b / a);
  }
  ratios.sort((x, y) => x - y);
  const median =
    ratios.length === 0
      ? null
      : ratios.length % 2 === 1
        ? ratios[(ratios.length - 1) / 2]
        : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2;
  const scale = median == null ? (1.2 as Axis<"type.scale">) : nearest(median, TYPE_SCALE_RATIOS);

  const basePx = tokenPx(lookup, "text-base");
  const base = basePx == null ? (16 as Axis<"type.base">) : nearest(basePx, TYPE_BASE_SIZES);

  // voice — the three knobs 1.1A-01 published, each bucketed.
  const rawWeight = token(lookup, "heading-weight");
  const weightNumber =
    rawWeight == null
      ? null
      : rawWeight.toLowerCase() === "normal"
        ? 400
        : rawWeight.toLowerCase() === "bold"
          ? 700
          : Number.parseFloat(rawWeight);
  let weight: Axis<"type.voice.weight"> = "bold";
  if (weightNumber != null && Number.isFinite(weightNumber)) {
    weight =
      weightNumber < HEADING_WEIGHT_MAX.regular
        ? "regular"
        : weightNumber < HEADING_WEIGHT_MAX.medium
          ? "medium"
          : weightNumber < HEADING_WEIGHT_MAX.semibold
            ? "semibold"
            : weightNumber < HEADING_WEIGHT_MAX.bold
              ? "bold"
              : "black";
  }

  const trackingEm = lengthEm(token(lookup, "heading-tracking"));
  const tracking: Axis<"type.voice.tracking"> =
    trackingEm == null
      ? "normal"
      : trackingEm < -HEADING_TRACKING_EM
        ? "tight"
        : trackingEm > HEADING_TRACKING_EM
          ? "wide"
          : "normal";

  // A `text-transform` the vocabulary does not name (`capitalize`, `lowercase`)
  // is reported as `none`: the axis has three values, and `none` is the one that
  // means "no heading case the model names".
  //
  // `small-caps` is read off `--heading-caps` (`font-variant-caps`), never off
  // `--heading-transform`: it is not a `text-transform` value, so a transform
  // spelled `small-caps` is a declaration the browser drops and headings that
  // render unchanged — reported as `none`, which is what a reader sees
  // [1.1A-25]. `uppercase` wins over small caps because it renders over them:
  // small caps only restyle LOWERCASE letters, and an uppercased heading has none.
  const rawTransform = token(lookup, "heading-transform")?.trim().toLowerCase() ?? null;
  const caps = token(lookup, "heading-caps")?.trim().toLowerCase() ?? null;
  const transform: Axis<"type.voice.transform"> =
    rawTransform === "uppercase"
      ? "uppercase"
      : caps === "small-caps" || caps === "all-small-caps"
        ? "small-caps"
        : "none";

  return { pairing, scale, base, voice: { weight, tracking, transform } };
}

function shapeAxis(lookup: Map<string, string>): Required<ThemeAxisShape> {
  const buttonRadius = tokenPx(lookup, "button-radius");
  const radiusMd = tokenPx(lookup, "radius-md");

  let radius: Axis<"shape.radius">;
  if (buttonRadius != null && buttonRadius >= PILL_MIN_PX) radius = "pill";
  else if (radiusMd == null) radius = "soft";
  else if (radiusMd === 0) radius = "sharp";
  else if (radiusMd <= RADIUS_CRISP_MAX_PX) radius = "crisp";
  else if (radiusMd <= RADIUS_SOFT_MAX_PX) radius = "soft";
  else radius = "round";

  const width = tokenPx(lookup, "border-width");
  const border: Axis<"shape.border"> =
    width == null
      ? "hairline"
      : width <= BORDER_HAIRLINE_MAX_PX
        ? "hairline"
        : width <= BORDER_REGULAR_MAX_PX
          ? "regular"
          : "heavy";

  return { radius, border, corner: keyword("shape.corner", token(lookup, "corner-shape"), "round") };
}

/**
 * The order here is the plan's, and it matters: `flat` is checked before
 * `glass` because a theme that has removed every shadow has said something
 * about its depth that a backdrop filter does not undo.
 */
function depthAxis(lookup: Map<string, string>): Axis<"depth"> {
  const ramp = ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"].map((t) => token(lookup, t));
  if (ramp.every((v) => v != null && v.trim().toLowerCase() === "none")) return "flat";

  const backdrop = token(lookup, "surface-backdrop");
  if (backdrop != null && backdrop.trim().toLowerCase() !== "none") return "glass";

  const md = token(lookup, "shadow-md");
  if (md == null || md.trim().toLowerCase() === "none") return "soft";

  const first = shadowLayer(splitTopLevel(md)[0] ?? md);
  if (first.inset || /\binset\b/i.test(md)) return "inset";

  const [offsetX = 0, offsetY = 0, blur = 0] = first.lengths;
  if (blur === 0 && (offsetX !== 0 || offsetY !== 0)) return "hard";
  return blur >= DEPTH_LAYERED_MIN_BLUR_PX ? "layered" : "soft";
}

/**
 * The material a theme dresses its surfaces in. Read from the RAW value of the
 * two role tokens rather than the resolved one: a texture resolves to a data
 * URI, and the name — which is the axis — only survives as the `var()` the theme
 * wrote. The page is asked first: dressing the page is the larger statement.
 */
function materialAxis(lookup: Map<string, string>): Axis<"material"> {
  for (const role of ["texture-page", "texture-surface"]) {
    const raw = lookup.get(role);
    if (raw == null) continue;
    const m = /var\(\s*--texture-([a-z]+)/i.exec(raw);
    if (m) {
      const name = m[1].toLowerCase();
      if ((THEME_AXIS_VALUES.material as readonly string[]).includes(name) && name !== "none") {
        return name as Axis<"material">;
      }
    }
  }
  return "none";
}

/**
 * `playful` is checked before `springy` because it is a refinement of it, and
 * both are checked before the duration bands: a theme that has put a spring in
 * `--ease-default` has chosen its motion personality, however short its
 * durations are.
 */
function motionAxis(lookup: Map<string, string>): Axis<"motion"> {
  const duration = durationMs(token(lookup, "duration-normal"));
  if (duration === 0) return "none";

  const easing = token(lookup, "ease-default");
  if (isSpringEasing(easing)) {
    const lift = token(lookup, "motion-hover-lift");
    const parts = lift == null ? [] : words(lift);
    // `translate` is `<x> [y]`; with one value the y is 0, so a lift needs two.
    const y = parts.length >= 2 ? lengthPx(parts[1]) : null;
    if (y != null && y <= MOTION_PLAYFUL_LIFT_MAX_PX) return "playful";
    return "springy";
  }

  if (duration == null) return "smooth";
  if (duration <= MOTION_MINIMAL_MAX_MS) return "minimal";
  // `snappy` is a short duration ON an ease-out curve — compared to the theme's
  // OWN `--ease-out`, so a theme that re-points its easing palette is read in
  // its own terms rather than against a literal this file would have to repeat.
  const easeOut = token(lookup, "ease-out");
  const same = easing != null && easeOut != null && easing.replace(/\s+/g, "") === easeOut.replace(/\s+/g, "");
  if (duration <= MOTION_SNAPPY_MAX_MS && same) return "snappy";
  return "smooth";
}

function focusAxis(lookup: Map<string, string>): Axis<"focus"> {
  const shadow = token(lookup, "focus-shadow");
  if (shadow != null && shadow.trim().toLowerCase() !== "none") return "glow";
  const offset = tokenPx(lookup, "focus-ring-offset");
  if (offset != null && offset < 0) return "inset";
  const width = tokenPx(lookup, "focus-ring-width");
  if (width != null && width >= FOCUS_BOLD_MIN_WIDTH_PX) return "bold";
  return "ring";
}

function decorationAxis(lookup: Map<string, string>): Required<ThemeAxisDecoration> {
  const decoration = token(lookup, "link-decoration");
  let link: Axis<"decoration.link">;
  if (decoration != null && decoration.trim().toLowerCase() === "none") {
    link = "none";
  } else {
    const thickness = tokenPx(lookup, "link-thickness");
    const offset = lengthEm(token(lookup, "link-underline-offset"));
    if (thickness != null && thickness >= LINK_THICK_MIN_PX) link = "thick";
    else if (offset != null && offset >= LINK_OFFSET_MIN_EM) link = "offset";
    else link = "plain";
  }
  // `double` needs a rule wide enough to split (DIVIDER_DOUBLE_MIN_PX); under it
  // the browser paints one line, so the axis reports the `solid` a reader sees.
  let divider = keyword("decoration.divider", token(lookup, "divider-style"), "solid");
  if (divider === "double") {
    const width = tokenPx(lookup, "divider-width") ?? tokenPx(lookup, "border-width");
    if (width == null || width < DIVIDER_DOUBLE_MIN_PX) divider = "solid";
  }
  return { link, divider };
}

function controlsAxis(lookup: Map<string, string>): Required<ThemeAxisControls> {
  const buttonRadius = tokenPx(lookup, "button-radius");
  const button: Axis<"controls.button"> =
    buttonRadius == null
      ? "soft"
      : buttonRadius >= PILL_MIN_PX
        ? "pill"
        : buttonRadius <= BUTTON_RECT_MAX_PX
          ? "rect"
          : "soft";

  // `underline` first: an input whose edge is only its bottom rule is that
  // silhouette whatever it is filled with.
  let input: Axis<"controls.input"> = "box";
  const edge = token(lookup, "input-border-width");
  const sides = edge == null ? null : expandSides(edge);
  const px = sides?.map((s) => lengthPx(s)) ?? null;
  if (px && px.every((n) => n != null)) {
    const [top, right, bottom, left] = px as number[];
    if (top === 0 && right === 0 && left === 0 && bottom > 0) input = "underline";
  }
  if (input === "box") {
    // `--input-fill` deviates from the plan's "≠ none → filled": 1.1A-05 shipped
    // it as `var(--input-bg)`, not `none`, because var() only takes a fallback
    // for an UNDEFINED property. So "filled" is the fill DIFFERING from the plain
    // input background — which is what the word meant all along.
    const fill = token(lookup, "input-fill");
    const bg = token(lookup, "input-bg");
    if (fill != null && bg != null && fill.replace(/\s+/g, "") !== bg.replace(/\s+/g, "")) input = "filled";
  }

  const checkboxRadius = tokenPx(lookup, "checkbox-radius");
  const checkbox: Axis<"controls.checkbox"> =
    checkboxRadius != null && checkboxRadius >= PILL_MIN_PX ? "round" : "square";

  const switchRadius = tokenPx(lookup, "switch-radius");
  const switchAxis: Axis<"controls.switch"> =
    switchRadius != null && switchRadius >= PILL_MIN_PX ? "pill" : "square";

  return { button, input, checkbox, switch: switchAxis };
}

/** WCAG ratio between two resolved token colours, or null when either is not one. */
function ratio(lookup: Map<string, string>, fg: string, bg: string): number | null {
  const a = parseCssColor(token(lookup, fg) ?? "");
  const b = parseCssColor(token(lookup, bg) ?? "");
  return a && b ? contrastRatio(a, b) : null;
}

function contrastAxis(lookups: Record<Scheme, Map<string, string>>, schemes: Scheme[]): Axis<"contrast"> {
  for (const scheme of schemes) {
    const text = ratio(lookups[scheme], "color-fg", "color-bg");
    const border = ratio(lookups[scheme], "color-border-strong", "color-bg");
    if (text == null || border == null) return "standard";
    if (text < CONTRAST_HIGH_TEXT_MIN || border < CONTRAST_HIGH_BORDER_MIN) return "standard";
  }
  return "high";
}

// ── The entry point ─────────────────────────────────────────────────────────

/** Round to `places` decimals without trailing float noise. */
function round(n: number, places: number): number {
  return Number(n.toFixed(places));
}

/**
 * Derive the fourteen axes of FAQIR-VISION §5.2 from a theme stylesheet.
 *
 * `baseSources` is the base token layer (`registry/tokens/*.css`) — every token
 * the theme does not override resolves through it, so an axis a theme never
 * mentions is reported as what the registry actually renders rather than as a
 * blank.
 *
 * Deterministic and pure: the same CSS always produces the same block, which is
 * what lets `gen:theme-manifests` write it and the manifest gate re-derive it.
 */
export function axesFromCss(themeCss: string, baseSources: string[]): ThemeAxes {
  const baseCss = baseSources.join("\n");
  const lookups = buildSchemeLookups(themeCss, baseCss);

  // The theme's own blocks, unflattened: the cascade lookups fold `:root` into
  // dark, which would make every light theme look like it ships one.
  const scheme = schemeFromCss(themeCss, parseThemeValues(themeCss));
  // The scheme a theme's `:root` block states — light unless it ships only dark.
  const primary: Scheme = scheme === "dark" ? "dark" : "light";
  const lookup = lookups[primary];

  const accent = cssColorToOklch(token(lookup, "color-primary") ?? "");

  return {
    accent_hue: accent ? round(accent.h, 1) : 0,
    accent_chroma: accent ? round(accent.c, 4) : 0,
    neutral: neutralAxis(lookup),
    scheme,
    type: typeAxis(lookup),
    shape: shapeAxis(lookup),
    depth: depthAxis(lookup),
    material: materialAxis(lookup),
    motion: motionAxis(lookup),
    density: densityFromCss(themeCss),
    focus: focusAxis(lookup),
    decoration: decorationAxis(lookup),
    controls: controlsAxis(lookup),
    contrast: contrastAxis(lookups, scheme === "both" ? ["light", "dark"] : [primary]),
  };
}
