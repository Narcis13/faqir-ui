// ═══════════════════════════════════════════════════════════════════════════
// The axis gate — fourteen axes DERIVED from CSS, never declared   [1.1A-08]
// ═══════════════════════════════════════════════════════════════════════════
//
// `axesFromCss()` is the inverse of the generator 1.1A-10 will ship: a seed
// becomes declarations, and declarations become a seed's worth of axes again.
// That round trip is only worth anything if the classifiers are pinned, so this
// file does three things:
//
//   1. **One fixture per axis VALUE.** Ninety-four minimal stylesheets, built
//      in-test from one template, each asserting that the CSS a theme would
//      write for that value is classified as that value. Every vocabulary entry
//      in `THEME_AXIS_VALUES` is covered, and a meta-test proves the coverage is
//      complete rather than merely large.
//   2. **A boundary case at every threshold.** Each named constant in `axes.ts`
//      is probed on both sides, so a threshold cannot be nudged without a test
//      naming the value that moved.
//   3. **The twelve shipped themes, as a table.** The axes each theme lands on
//      today are asserted here, which turns a later CSS edit that moves an axis
//      into a deliberate act with a visible diff.
//
// The fixtures are minimal on purpose: they state only the tokens the axis
// reads and inherit everything else from `registry/tokens/*.css`, so a fixture
// that passes is evidence about the real base layer rather than about a
// hand-built sandbox.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import {
  axesFromCss,
  familyClass,
  lengthPx,
  lengthEm,
  resolveValue,
  splitTopLevel,
  expandSides,
  shadowLayer,
  isSpringEasing,
  durationMs,
  densityFromCss,
  BORDER_HAIRLINE_MAX_PX,
  BORDER_REGULAR_MAX_PX,
  BUTTON_RECT_MAX_PX,
  CONTRAST_HIGH_TEXT_MIN,
  DEPTH_LAYERED_MIN_BLUR_PX,
  FOCUS_BOLD_MIN_WIDTH_PX,
  HEADING_TRACKING_EM,
  HEADING_WEIGHT_MAX,
  LINK_OFFSET_MIN_EM,
  LINK_THICK_MIN_PX,
  MOTION_MINIMAL_MAX_MS,
  MOTION_PLAYFUL_LIFT_MAX_PX,
  MOTION_SNAPPY_MAX_MS,
  NEUTRAL_COOL_HUE,
  NEUTRAL_GRAY_MAX_CHROMA,
  NEUTRAL_WARM_HUE,
  PILL_MIN_PX,
  RADIUS_CRISP_MAX_PX,
  RADIUS_SOFT_MAX_PX,
  ROOT_FONT_PX,
  TEXT_STEPS,
} from "../../src/theme/axes";
import { THEME_AXIS_VALUES, THEME_SEED_DEFAULTS, type ThemeAxes } from "../../src/theme-manifest";

const REGISTRY = join(import.meta.dir, "../../registry");
const TOKENS_DIR = join(REGISTRY, "tokens");
const THEMES_DIR = join(REGISTRY, "themes");

/**
 * The whole base token layer — including the three files the themeable SURFACE
 * excludes (`index.css`, `density.css`, `textures.css`). A token a theme may not
 * re-declare is still a token its `var()` chains terminate at, which is exactly
 * the list `gen:theme-manifests` passes.
 */
const BASE = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .sort()
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));

type Decls = Record<string, string>;

/** A minimal theme stylesheet: a `:root` block, optionally a dark one and a header. */
function theme(decls: Decls, opts: { header?: string; dark?: Decls } = {}): string {
  const block = (d: Decls) =>
    Object.entries(d)
      .map(([k, v]) => `  --${k}: ${v};`)
      .join("\n");
  let css = opts.header ? `/* ${opts.header} */\n` : "";
  css += `:root {\n${block(decls)}\n}\n`;
  if (opts.dark) css += `[data-theme="dark"] {\n${block(opts.dark)}\n}\n`;
  return css;
}

/** Derive the axes of a fixture stylesheet against the real base token layer. */
function axes(decls: Decls, opts?: { header?: string; dark?: Decls }): ThemeAxes {
  return axesFromCss(theme(decls, opts), BASE);
}

/** A `--text-*` ramp built from a base size and a ratio, as a theme would write it. */
function ramp(basePx: number, ratio: number): Decls {
  const baseIndex = TEXT_STEPS.indexOf("text-base");
  const out: Decls = {};
  TEXT_STEPS.forEach((step, i) => {
    out[step] = `${(basePx * ratio ** (i - baseIndex)).toFixed(4)}px`;
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 · One fixture per axis value
// ═══════════════════════════════════════════════════════════════════════════
//
// Each entry is `[axis path, expected value, the declarations a theme writes]`.
// The list is walked twice: once to run the cases, once to prove it names every
// value in `THEME_AXIS_VALUES`.

type Fixture = {
  path: string;
  value: string | number;
  decls: Decls;
  opts?: { header?: string; dark?: Decls };
};

/** Read a dotted axis path out of a derived block. */
function at(block: ThemeAxes, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], block);
}

const FIXTURES: Fixture[] = [
  // ── neutral — the chroma and hue of `--color-bg` ──
  { path: "neutral", value: "gray", decls: { "color-bg": "oklch(1 0 0)" } },
  { path: "neutral", value: "cool", decls: { "color-bg": "oklch(0.97 0.02 240)" } },
  { path: "neutral", value: "warm", decls: { "color-bg": "oklch(0.97 0.02 70)" } },
  { path: "neutral", value: "tinted", decls: { "color-bg": "oklch(0.97 0.02 145)" } },

  // ── scheme — the `@ui:schemes` directive, else what the CSS actually ships ──
  { path: "scheme", value: "both", decls: { "color-bg": "oklch(1 0 0)" }, opts: { dark: { "color-bg": "oklch(0.15 0 0)" } } },
  { path: "scheme", value: "light", decls: { "color-bg": "oklch(1 0 0)" }, opts: { header: "@ui:schemes light" } },
  { path: "scheme", value: "dark", decls: { "color-bg": "oklch(0.15 0 0)" }, opts: { header: "@ui:schemes dark" } },

  // ── type.pairing — the class of the first family the table names ──
  { path: "type.pairing", value: "system", decls: {} },
  { path: "type.pairing", value: "sans-humanist", decls: { "font-sans": "'Lato', sans-serif" } },
  { path: "type.pairing", value: "sans-grotesque", decls: { "font-sans": "'Inter', sans-serif" } },
  { path: "type.pairing", value: "sans-geometric", decls: { "font-sans": "'Poppins', sans-serif" } },
  { path: "type.pairing", value: "rounded", decls: { "font-sans": "'Nunito', sans-serif" } },
  { path: "type.pairing", value: "serif-editorial", decls: { "font-sans": "'Georgia', serif" } },
  { path: "type.pairing", value: "serif-modern", decls: { "font-sans": "'Times New Roman', serif" } },
  { path: "type.pairing", value: "slab", decls: { "font-sans": "'Roboto Slab', serif" } },
  { path: "type.pairing", value: "mono", decls: { "font-sans": "var(--font-mono)" } },
  // A pairing the ten-value vocabulary cannot name: two different classes.
  {
    path: "type.pairing",
    value: "custom",
    decls: { "font-heading": "'Georgia', serif", "font-body": "'Inter', sans-serif" },
  },

  // ── type.scale — the median ratio between consecutive `--text-*` steps ──
  ...THEME_AXIS_VALUES["type.scale"].map((ratio) => ({
    path: "type.scale",
    value: ratio,
    decls: ramp(16, ratio),
  })),

  // ── type.base — `--text-base`, snapped to the nearest of the four ──
  ...THEME_AXIS_VALUES["type.base"].map((base) => ({
    path: "type.base",
    value: base,
    decls: { "text-base": `${base}px` },
  })),

  // ── type.voice ──
  { path: "type.voice.weight", value: "regular", decls: { "heading-weight": "400" } },
  { path: "type.voice.weight", value: "medium", decls: { "heading-weight": "500" } },
  { path: "type.voice.weight", value: "semibold", decls: { "heading-weight": "600" } },
  { path: "type.voice.weight", value: "bold", decls: { "heading-weight": "700" } },
  { path: "type.voice.weight", value: "black", decls: { "heading-weight": "900" } },
  { path: "type.voice.tracking", value: "tight", decls: { "heading-tracking": "-0.02em" } },
  { path: "type.voice.tracking", value: "normal", decls: { "heading-tracking": "0em" } },
  { path: "type.voice.tracking", value: "wide", decls: { "heading-tracking": "0.05em" } },
  { path: "type.voice.transform", value: "none", decls: { "heading-transform": "none" } },
  { path: "type.voice.transform", value: "uppercase", decls: { "heading-transform": "uppercase" } },
  { path: "type.voice.transform", value: "small-caps", decls: { "heading-transform": "small-caps" } },

  // ── shape ──
  { path: "shape.radius", value: "sharp", decls: { "radius-md": "0" } },
  { path: "shape.radius", value: "crisp", decls: { "radius-md": "0.25rem" } },
  { path: "shape.radius", value: "soft", decls: { "radius-md": "0.375rem" } },
  { path: "shape.radius", value: "round", decls: { "radius-md": "0.75rem" } },
  { path: "shape.radius", value: "pill", decls: { "button-radius": "var(--radius-full)" } },
  { path: "shape.border", value: "hairline", decls: { "border-width": "1px" } },
  { path: "shape.border", value: "regular", decls: { "border-width": "2px" } },
  { path: "shape.border", value: "heavy", decls: { "border-width": "4px" } },
  ...THEME_AXIS_VALUES["shape.corner"].map((corner) => ({
    path: "shape.corner",
    value: corner,
    decls: { "corner-shape": corner },
  })),

  // ── depth ──
  {
    path: "depth",
    value: "flat",
    decls: { "shadow-xs": "none", "shadow-sm": "none", "shadow-md": "none", "shadow-lg": "none", "shadow-xl": "none" },
  },
  { path: "depth", value: "soft", decls: { "shadow-md": "0 4px 6px oklch(0 0 0 / 0.05)" } },
  { path: "depth", value: "layered", decls: { "shadow-md": "0 6px 16px oklch(0 0 0 / 0.12), 0 2px 4px oklch(0 0 0 / 0.06)" } },
  { path: "depth", value: "hard", decls: { "shadow-md": "4px 4px 0 oklch(0 0 0)" } },
  { path: "depth", value: "glass", decls: { "surface-backdrop": "blur(16px) saturate(1.4)" } },
  { path: "depth", value: "inset", decls: { "shadow-md": "inset 0 2px 4px oklch(0 0 0 / 0.2)" } },

  // ── material — the NAME survives only in the var() the theme wrote ──
  { path: "material", value: "none", decls: {} },
  ...THEME_AXIS_VALUES.material
    .filter((m) => m !== "none")
    .map((m) => ({ path: "material", value: m, decls: { "texture-page": `var(--texture-${m})` } })),

  // ── motion ──
  { path: "motion", value: "none", decls: { "duration-normal": "0ms" } },
  { path: "motion", value: "minimal", decls: { "duration-normal": "100ms" } },
  { path: "motion", value: "smooth", decls: { "duration-normal": "200ms" } },
  { path: "motion", value: "snappy", decls: { "duration-normal": "150ms", "ease-default": "var(--ease-out)" } },
  { path: "motion", value: "springy", decls: { "ease-default": "var(--ease-spring)" } },
  {
    path: "motion",
    value: "playful",
    decls: { "ease-default": "var(--ease-spring)", "motion-hover-lift": "0 -2px" },
  },

  // ── density — a header directive, because `data-density` is a subtree modifier ──
  ...THEME_AXIS_VALUES.density.map((d) => ({
    path: "density",
    value: d,
    decls: {},
    opts: { header: `@ui:density ${d}` },
  })),

  // ── focus ──
  { path: "focus", value: "ring", decls: {} },
  { path: "focus", value: "glow", decls: { "focus-shadow": "0 0 0 4px oklch(0.6 0.2 260 / 0.35)" } },
  { path: "focus", value: "inset", decls: { "focus-ring-offset": "-2px" } },
  { path: "focus", value: "bold", decls: { "focus-ring-width": "3px" } },

  // ── decoration ──
  { path: "decoration.link", value: "none", decls: { "link-decoration": "none" } },
  { path: "decoration.link", value: "plain", decls: { "link-underline-offset": "0" } },
  { path: "decoration.link", value: "offset", decls: { "link-underline-offset": "0.2em" } },
  { path: "decoration.link", value: "thick", decls: { "link-thickness": "2px" } },
  ...THEME_AXIS_VALUES["decoration.divider"].map((style) => ({
    path: "decoration.divider",
    value: style,
    decls: { "divider-style": style },
  })),

  // ── controls ──
  { path: "controls.button", value: "rect", decls: { "button-radius": "0" } },
  { path: "controls.button", value: "soft", decls: { "button-radius": "0.375rem" } },
  { path: "controls.button", value: "pill", decls: { "button-radius": "var(--radius-full)" } },
  { path: "controls.input", value: "box", decls: {} },
  { path: "controls.input", value: "filled", decls: { "input-fill": "var(--input-bg-filled)" } },
  { path: "controls.input", value: "underline", decls: { "input-border-width": "0 0 2px 0" } },
  { path: "controls.checkbox", value: "square", decls: { "checkbox-radius": "var(--radius-sm)" } },
  { path: "controls.checkbox", value: "round", decls: { "checkbox-radius": "var(--radius-full)" } },
  { path: "controls.switch", value: "pill", decls: { "switch-radius": "var(--radius-full)" } },
  { path: "controls.switch", value: "square", decls: { "switch-radius": "0.25rem" } },

  // ── contrast — both gates, in every shipped scheme ──
  { path: "contrast", value: "standard", decls: {} },
  {
    path: "contrast",
    value: "high",
    decls: { "color-bg": "oklch(1 0 0)", "color-fg": "oklch(0.15 0 0)", "color-border-strong": "oklch(0.55 0 0)" },
    opts: { header: "@ui:schemes light" },
  },
];

describe("axesFromCss · one fixture per axis value", () => {
  for (const { path, value, decls, opts } of FIXTURES) {
    it(`${path} = ${value}`, () => {
      expect({ [path]: at(axes(decls, opts), path) }).toEqual({ [path]: value });
    });
  }

  it("names every value in the axis vocabulary — the coverage is complete, not merely large", () => {
    const covered = new Map<string, Set<string | number>>();
    for (const { path, value } of FIXTURES) {
      if (!covered.has(path)) covered.set(path, new Set());
      covered.get(path)!.add(value);
    }
    const missing: Record<string, (string | number)[]> = {};
    for (const [path, values] of Object.entries(THEME_AXIS_VALUES)) {
      const seen = covered.get(path) ?? new Set();
      const gap = (values as readonly (string | number)[]).filter((v) => !seen.has(v));
      if (gap.length > 0) missing[path] = gap;
    }
    expect(missing).toEqual({});
    expect(FIXTURES.length).toBeGreaterThanOrEqual(40);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · A boundary case at every threshold
// ═══════════════════════════════════════════════════════════════════════════
//
// Each constant is probed on both sides. The constants are IMPORTED rather than
// spelled, so a retune moves the fixture with the rule and the test still says
// which side of the line a value falls on.

describe("axesFromCss · thresholds, from both sides", () => {
  it("NEUTRAL_GRAY_MAX_CHROMA separates gray from a tint", () => {
    const under = NEUTRAL_GRAY_MAX_CHROMA - 0.001;
    const over = NEUTRAL_GRAY_MAX_CHROMA + 0.001;
    expect(axes({ "color-bg": `oklch(0.97 ${under} 240)` }).neutral).toBe("gray");
    expect(axes({ "color-bg": `oklch(0.97 ${over} 240)` }).neutral).toBe("cool");
    // Exactly at the threshold is NOT gray: the rule is `< 0.005`.
    expect(axes({ "color-bg": `oklch(0.97 ${NEUTRAL_GRAY_MAX_CHROMA} 240)` }).neutral).toBe("cool");
  });

  it("the cool and warm hue windows are inclusive, and everything else is tinted", () => {
    const bg = (h: number) => axes({ "color-bg": `oklch(0.97 0.02 ${h})` }).neutral;
    expect(bg(NEUTRAL_COOL_HUE.min)).toBe("cool");
    expect(bg(NEUTRAL_COOL_HUE.max)).toBe("cool");
    expect(bg(NEUTRAL_COOL_HUE.min - 1)).toBe("tinted");
    expect(bg(NEUTRAL_COOL_HUE.max + 1)).toBe("tinted");
    expect(bg(NEUTRAL_WARM_HUE.min)).toBe("warm");
    expect(bg(NEUTRAL_WARM_HUE.max)).toBe("warm");
    expect(bg(NEUTRAL_WARM_HUE.min - 1)).toBe("tinted");
    expect(bg(NEUTRAL_WARM_HUE.max + 1)).toBe("tinted");
  });

  it("the heading-weight bands close on their upper bound", () => {
    const weight = (w: number) => axes({ "heading-weight": String(w) }).type.voice!.weight;
    expect(weight(HEADING_WEIGHT_MAX.regular - 1)).toBe("regular");
    expect(weight(HEADING_WEIGHT_MAX.regular)).toBe("medium");
    expect(weight(HEADING_WEIGHT_MAX.medium - 1)).toBe("medium");
    expect(weight(HEADING_WEIGHT_MAX.medium)).toBe("semibold");
    expect(weight(HEADING_WEIGHT_MAX.semibold - 1)).toBe("semibold");
    expect(weight(HEADING_WEIGHT_MAX.semibold)).toBe("bold");
    expect(weight(HEADING_WEIGHT_MAX.bold - 1)).toBe("bold");
    expect(weight(HEADING_WEIGHT_MAX.bold)).toBe("black");
  });

  it("HEADING_TRACKING_EM is a dead band around zero, in em", () => {
    const tracking = (em: number) => axes({ "heading-tracking": `${em}em` }).type.voice!.tracking;
    expect(tracking(-HEADING_TRACKING_EM)).toBe("normal");
    expect(tracking(-HEADING_TRACKING_EM - 0.001)).toBe("tight");
    expect(tracking(HEADING_TRACKING_EM)).toBe("normal");
    expect(tracking(HEADING_TRACKING_EM + 0.001)).toBe("wide");
  });

  it("the radius bands run 0 · crisp · soft · round, with pill above them all", () => {
    const radius = (px: number) => axes({ "radius-md": `${px}px` }).shape.radius;
    expect(radius(0)).toBe("sharp");
    expect(radius(0.5)).toBe("crisp");
    expect(radius(RADIUS_CRISP_MAX_PX)).toBe("crisp");
    expect(radius(RADIUS_CRISP_MAX_PX + 0.5)).toBe("soft");
    expect(radius(RADIUS_SOFT_MAX_PX)).toBe("soft");
    expect(radius(RADIUS_SOFT_MAX_PX + 0.5)).toBe("round");
    // A pill button outranks the radius ramp — it is the silhouette you SEE.
    expect(axes({ "radius-md": "0", "button-radius": `${PILL_MIN_PX}px` }).shape.radius).toBe("pill");
    expect(axes({ "radius-md": "0", "button-radius": `${PILL_MIN_PX - 1}px` }).shape.radius).toBe("sharp");
  });

  it("the border bands close on 1px and 2px", () => {
    const border = (px: number) => axes({ "border-width": `${px}px` }).shape.border;
    expect(border(BORDER_HAIRLINE_MAX_PX)).toBe("hairline");
    expect(border(BORDER_HAIRLINE_MAX_PX + 0.5)).toBe("regular");
    expect(border(BORDER_REGULAR_MAX_PX)).toBe("regular");
    expect(border(BORDER_REGULAR_MAX_PX + 0.5)).toBe("heavy");
  });

  it("DEPTH_LAYERED_MIN_BLUR_PX separates a soft shadow from a layered one", () => {
    const depth = (blur: number) => axes({ "shadow-md": `0 4px ${blur}px oklch(0 0 0 / 0.1)` }).depth;
    expect(depth(DEPTH_LAYERED_MIN_BLUR_PX - 0.5)).toBe("soft");
    expect(depth(DEPTH_LAYERED_MIN_BLUR_PX)).toBe("layered");
  });

  it("a zero-blur shadow is hard only when it is actually offset", () => {
    expect(axes({ "shadow-md": "4px 4px 0 oklch(0 0 0)" }).depth).toBe("hard");
    // No offset and no blur draws nothing; it is not a hard shadow, it is a soft
    // ramp with a degenerate mid step.
    expect(axes({ "shadow-md": "0 0 0 oklch(0 0 0)" }).depth).toBe("soft");
  });

  it("the motion bands run none · minimal · snappy · smooth", () => {
    const motion = (ms: number, easeOut = false) =>
      axes({ "duration-normal": `${ms}ms`, ...(easeOut ? { "ease-default": "var(--ease-out)" } : {}) }).motion;
    expect(motion(0)).toBe("none");
    expect(motion(1)).toBe("minimal");
    expect(motion(MOTION_MINIMAL_MAX_MS)).toBe("minimal");
    // Past `minimal`, `snappy` needs the ease-out curve as well as the duration.
    expect(motion(MOTION_MINIMAL_MAX_MS + 1)).toBe("smooth");
    expect(motion(MOTION_MINIMAL_MAX_MS + 1, true)).toBe("snappy");
    expect(motion(MOTION_SNAPPY_MAX_MS, true)).toBe("snappy");
    expect(motion(MOTION_SNAPPY_MAX_MS + 1, true)).toBe("smooth");
  });

  it("MOTION_PLAYFUL_LIFT_MAX_PX is what separates playful from springy", () => {
    const spring = { "ease-default": "var(--ease-spring)" };
    expect(axes({ ...spring, "motion-hover-lift": `0 ${MOTION_PLAYFUL_LIFT_MAX_PX}px` }).motion).toBe("playful");
    expect(axes({ ...spring, "motion-hover-lift": `0 ${MOTION_PLAYFUL_LIFT_MAX_PX + 1}px` }).motion).toBe("springy");
    // A one-value `translate` is an x offset, so it lifts nothing.
    expect(axes({ ...spring, "motion-hover-lift": "-4px" }).motion).toBe("springy");
    // A spring beats the duration bands: the theme has chosen its personality.
    expect(axes({ ...spring, "duration-normal": "60ms" }).motion).toBe("springy");
  });

  it("FOCUS_BOLD_MIN_WIDTH_PX, and the order glow · inset · bold · ring", () => {
    expect(axes({ "focus-ring-width": `${FOCUS_BOLD_MIN_WIDTH_PX - 0.5}px` }).focus).toBe("ring");
    expect(axes({ "focus-ring-width": `${FOCUS_BOLD_MIN_WIDTH_PX}px` }).focus).toBe("bold");
    // A glow outranks a bold ring; an inset offset outranks a bold ring.
    expect(axes({ "focus-ring-width": "4px", "focus-shadow": "0 0 0 4px oklch(0.6 0.2 260 / 0.4)" }).focus).toBe("glow");
    expect(axes({ "focus-ring-width": "4px", "focus-ring-offset": "-2px" }).focus).toBe("inset");
    expect(axes({ "focus-ring-offset": "0" }).focus).toBe("ring");
  });

  it("the link bands: none outranks thick outranks offset", () => {
    expect(axes({ "link-thickness": `${LINK_THICK_MIN_PX}px` }).decoration.link).toBe("thick");
    expect(axes({ "link-thickness": `${LINK_THICK_MIN_PX - 0.5}px` }).decoration.link).toBe("offset");
    expect(axes({ "link-underline-offset": `${LINK_OFFSET_MIN_EM}em` }).decoration.link).toBe("offset");
    expect(axes({ "link-underline-offset": `${LINK_OFFSET_MIN_EM - 0.01}em` }).decoration.link).toBe("plain");
    expect(axes({ "link-decoration": "none", "link-thickness": "4px" }).decoration.link).toBe("none");
  });

  it("BUTTON_RECT_MAX_PX: only a square corner is rect", () => {
    expect(axes({ "button-radius": `${BUTTON_RECT_MAX_PX}px` }).controls.button).toBe("rect");
    expect(axes({ "button-radius": "1px" }).controls.button).toBe("soft");
    expect(axes({ "button-radius": `${PILL_MIN_PX}px` }).controls.button).toBe("pill");
  });

  it("an underline input is one whose ONLY edge is its bottom rule", () => {
    expect(axes({ "input-border-width": "0 0 2px 0" }).controls.input).toBe("underline");
    expect(axes({ "input-border-width": "0 0 0 0" }).controls.input).toBe("box");
    expect(axes({ "input-border-width": "1px 0 2px 0" }).controls.input).toBe("box");
    // The silhouette outranks the fill.
    expect(
      axes({ "input-border-width": "0 0 2px 0", "input-fill": "var(--input-bg-filled)" }).controls.input,
    ).toBe("underline");
  });

  it("a filled input is one whose fill DIFFERS from the plain input background", () => {
    // The deviation from the plan's sketch, asserted: `--input-fill` ships as
    // `var(--input-bg)`, so "≠ none" would call every theme filled.
    expect(axes({}).controls.input).toBe("box");
    expect(axes({ "input-fill": "var(--input-bg)" }).controls.input).toBe("box");
    expect(axes({ "input-fill": "oklch(0.96 0 0)" }).controls.input).toBe("filled");
  });

  it("contrast: high needs BOTH gates, in EVERY shipped scheme", () => {
    const light = { "color-bg": "oklch(1 0 0)", "color-fg": "oklch(0.15 0 0)", "color-border-strong": "oklch(0.55 0 0)" };
    const dark = { "color-bg": "oklch(0.12 0 0)", "color-fg": "oklch(0.98 0 0)", "color-border-strong": "oklch(0.62 0 0)" };
    expect(axes(light, { dark }).contrast).toBe("high");
    // Text clears 15:1 but the border does not clear 3:1.
    expect(axes({ ...light, "color-border-strong": "oklch(0.92 0 0)" }, { dark }).contrast).toBe("standard");
    // Light is high, dark is not — a theme that ships both must clear both.
    expect(axes(light, { dark: { ...dark, "color-fg": "oklch(0.45 0 0)" } }).contrast).toBe("standard");
    // …and the same theme narrowed to light only IS high.
    expect(axes(light, { header: "@ui:schemes light" }).contrast).toBe("high");
    expect(CONTRAST_HIGH_TEXT_MIN).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · Both authoring forms read as one theme
// ═══════════════════════════════════════════════════════════════════════════

describe("axesFromCss · the two authoring forms agree", () => {
  const LIGHT = { bg: "oklch(0.97 0.02 240)", fg: "oklch(0.15 0 0)", border: "oklch(0.55 0 0)" };
  const DARK = { bg: "oklch(0.15 0.02 240)", fg: "oklch(0.98 0 0)", border: "oklch(0.62 0 0)" };

  const blocks = theme(
    { "color-bg": LIGHT.bg, "color-fg": LIGHT.fg, "color-border-strong": LIGHT.border },
    { dark: { "color-bg": DARK.bg, "color-fg": DARK.fg, "color-border-strong": DARK.border } },
  );
  const oneBlock = theme({
    "color-bg": `light-dark(${LIGHT.bg}, ${DARK.bg})`,
    "color-fg": `light-dark(${LIGHT.fg}, ${DARK.fg})`,
    "color-border-strong": `light-dark(${LIGHT.border}, ${DARK.border})`,
  });

  it("derives the same fourteen axes from blocks and from light-dark()", () => {
    expect(axesFromCss(oneBlock, BASE)).toEqual(axesFromCss(blocks, BASE));
  });

  it("both forms are read as shipping both schemes", () => {
    expect(axesFromCss(blocks, BASE).scheme).toBe("both");
    expect(axesFromCss(oneBlock, BASE).scheme).toBe("both");
  });

  it("both forms see the dark scheme when the contrast gate needs it", () => {
    // The dark side is deliberately below 15:1 in both spellings, so a parser
    // that only ever read `:root` would report `high` for each of them.
    const dimDark = { ...DARK, fg: "oklch(0.45 0 0)" };
    const asBlocks = theme(
      { "color-bg": LIGHT.bg, "color-fg": LIGHT.fg, "color-border-strong": LIGHT.border },
      { dark: { "color-bg": dimDark.bg, "color-fg": dimDark.fg, "color-border-strong": dimDark.border } },
    );
    const asOne = theme({
      "color-bg": `light-dark(${LIGHT.bg}, ${dimDark.bg})`,
      "color-fg": `light-dark(${LIGHT.fg}, ${dimDark.fg})`,
      "color-border-strong": `light-dark(${LIGHT.border}, ${dimDark.border})`,
    });
    expect(axesFromCss(asBlocks, BASE).contrast).toBe("standard");
    expect(axesFromCss(asOne, BASE).contrast).toBe("standard");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · The twenty shipped stylesheets, as a table
// ═══════════════════════════════════════════════════════════════════════════
//
// The table this task's commit body records. Asserted here so that a later CSS
// edit which moves an axis is a deliberate act with a visible diff, rather than
// a manifest that quietly changes under `gen:theme-manifests`.
//
// Read it as: neutral · pairing · radius/border · depth · motion · focus ·
// button/input · contrast.

type Row = [string, string, string, string, string, string, string, string, string, string];

const THEME_TABLE: Row[] = [
  // theme            neutral   pairing           radius   border      depth      motion    focus   button  input
  ["aurora", "gray", "system", "soft", "hairline", "layered", "smooth", "ring", "soft", "standard"],
  ["brutalist", "gray", "system", "sharp", "heavy", "flat", "minimal", "bold", "rect", "high"],
  ["candy", "tinted", "rounded", "pill", "hairline", "soft", "springy", "ring", "pill", "standard"],
  ["contrast", "gray", "system", "soft", "regular", "soft", "smooth", "bold", "soft", "high"],
  ["default", "gray", "system", "soft", "hairline", "soft", "smooth", "ring", "soft", "standard"],
  ["document", "gray", "sans-grotesque", "sharp", "hairline", "flat", "none", "ring", "rect", "high"],
  ["document-serif", "gray", "serif-editorial", "sharp", "hairline", "flat", "smooth", "ring", "rect", "high"],
  ["editorial", "gray", "serif-editorial", "soft", "hairline", "flat", "minimal", "ring", "soft", "standard"],
  ["editorial-document", "gray", "sans-grotesque", "sharp", "hairline", "flat", "smooth", "ring", "rect", "standard"],
  ["glass", "cool", "system", "round", "hairline", "glass", "smooth", "ring", "soft", "standard"],
  ["luxe", "warm", "serif-modern", "soft", "hairline", "soft", "smooth", "ring", "soft", "high"],
  ["midnight", "cool", "system", "soft", "hairline", "layered", "smooth", "glow", "soft", "standard"],
  ["neo", "gray", "sans-grotesque", "sharp", "heavy", "hard", "playful", "bold", "rect", "standard"],
  ["organic", "warm", "sans-humanist", "round", "hairline", "soft", "smooth", "ring", "soft", "standard"],
  ["paper", "warm", "serif-editorial", "soft", "hairline", "flat", "smooth", "ring", "soft", "standard"],
  ["slate", "cool", "sans-grotesque", "crisp", "hairline", "flat", "snappy", "ring", "soft", "standard"],
  ["soft", "warm", "system", "pill", "hairline", "layered", "springy", "glow", "pill", "standard"],
  ["swiss", "gray", "sans-grotesque", "sharp", "regular", "flat", "snappy", "ring", "rect", "high"],
  ["swiss-document", "gray", "sans-grotesque", "sharp", "hairline", "flat", "smooth", "ring", "rect", "high"],
  ["terminal", "tinted", "mono", "sharp", "hairline", "soft", "snappy", "inset", "rect", "standard"],
];

/** The accent and scheme each theme lands on — the rest of the pinned table. */
const THEME_ACCENTS: Record<string, { hue: number; chroma: number; scheme: string; switch: string }> = {
  aurora: { hue: 300, chroma: 0.24, scheme: "both", switch: "pill" },
  brutalist: { hue: 0, chroma: 0, scheme: "both", switch: "square" },
  candy: { hue: 351.5, chroma: 0.1788, scheme: "both", switch: "pill" },
  contrast: { hue: 250, chroma: 0.16, scheme: "both", switch: "pill" },
  default: { hue: 264, chroma: 0.22, scheme: "both", switch: "pill" },
  document: { hue: 250, chroma: 0.06, scheme: "light", switch: "square" },
  "document-serif": { hue: 25, chroma: 0.07, scheme: "light", switch: "square" },
  editorial: { hue: 256, chroma: 0.0736, scheme: "both", switch: "pill" },
  "editorial-document": { hue: 256, chroma: 0.0736, scheme: "light", switch: "square" },
  glass: { hue: 275, chroma: 0.2, scheme: "both", switch: "pill" },
  luxe: { hue: 84, chroma: 0.0988, scheme: "dark", switch: "pill" },
  midnight: { hue: 280, chroma: 0.24, scheme: "both", switch: "pill" },
  neo: { hue: 121.1, chroma: 0.1676, scheme: "both", switch: "square" },
  organic: { hue: 90, chroma: 0.0757, scheme: "both", switch: "pill" },
  paper: { hue: 45, chroma: 0.14, scheme: "both", switch: "pill" },
  slate: { hue: 245, chroma: 0.09, scheme: "both", switch: "pill" },
  soft: { hue: 185, chroma: 0.1, scheme: "both", switch: "pill" },
  swiss: { hue: 29.6, chroma: 0.2126, scheme: "both", switch: "pill" },
  "swiss-document": { hue: 29.6, chroma: 0.2126, scheme: "light", switch: "square" },
  terminal: { hue: 145, chroma: 0.12, scheme: "both", switch: "square" },
};

function shippedAxes(name: string): ThemeAxes {
  return axesFromCss(readFileSync(join(THEMES_DIR, `${name}.css`), "utf8"), BASE);
}

describe("axesFromCss · the twenty shipped stylesheets", () => {
  it("covers every theme in the registry — no row may go missing", () => {
    const shipped = [...new Glob("*.css").scanSync(THEMES_DIR)].map((f) => f.replace(/\.css$/, "")).sort();
    expect(THEME_TABLE.map((r) => r[0]).sort()).toEqual(shipped);
    expect(Object.keys(THEME_ACCENTS).sort()).toEqual(shipped);
  });

  for (const [name, neutral, pairing, radius, border, depth, motion, focus, button, contrast] of THEME_TABLE) {
    it(`${name} — ${neutral} · ${pairing} · ${radius} · ${depth} · ${motion} · ${contrast}`, () => {
      const a = shippedAxes(name);
      const accent = THEME_ACCENTS[name];
      const derived: Record<string, string | number | undefined> = {
        neutral: a.neutral,
        pairing: a.type.pairing,
        radius: a.shape.radius,
        border: a.shape.border,
        depth: a.depth,
        motion: a.motion,
        focus: a.focus,
        button: a.controls.button,
        contrast: a.contrast,
        scheme: a.scheme,
        switch: a.controls.switch,
        accent_hue: a.accent_hue,
        accent_chroma: a.accent_chroma,
      };
      expect(derived).toEqual({
        neutral,
        pairing,
        radius,
        border,
        depth,
        motion,
        focus,
        button,
        contrast,
        scheme: accent.scheme,
        switch: accent.switch,
        accent_hue: accent.hue,
        accent_chroma: accent.chroma,
      });
    });
  }

  it("says which themes have adopted a material or a heading case, and which have not", () => {
    // Nothing in 1.0 declared a material, a corner shape, a heading case or a
    // density, so until 1.1A-14 every shipped theme derived the base layer's
    // answer for all four. Four of the six 1.1A-14 adopted say something now,
    // and 1.1A-15 adds two more: `midnight` takes the grid, `slate` takes the
    // density it was designed at. Pinned per theme rather than as a blanket, so
    // an adoption is a visible edit here and a drift is a failure.
    const ADOPTED: Record<string, string> = {
      aurora: "mesh/round/none/comfortable",
      paper: "paper/round/none/comfortable",
      terminal: "stripes/round/none/comfortable",
      brutalist: "none/round/uppercase/comfortable",
      midnight: "grid/round/none/comfortable",
      slate: "none/round/none/compact",
      // 1.1A-16's generated six. `density: spacious` had no shipped example at
      // all before them, and `grain` had none either.
      editorial: "paper/round/none/spacious",
      swiss: "grid/round/uppercase/comfortable",
      luxe: "mesh/round/uppercase/spacious",
      organic: "grain/round/none/spacious",
    };
    for (const [name] of THEME_TABLE) {
      const a = shippedAxes(name);
      const derived = [a.material, a.shape.corner, a.type.voice!.transform, a.density].join("/");
      expect({ [name]: derived }).toEqual({ [name]: ADOPTED[name] ?? "none/round/none/comfortable" });
    }
    // `corner` is still nobody's, and 1.1A-16 measured a second reason why.
    // Two of that task's seeds carried one (`neo` a bevel, `organic` a scoop)
    // and both were dropped after rendering them: MEASURED in Chrome 149, a box
    // at `border-radius: 0` is pixel-identical under `round`, `bevel`, `scoop`
    // and `notch` — there is no corner to shape — so `neo`, whose brief is a
    // SHARP silhouette, would have declared an axis nothing draws, which is the
    // quiet failure §3 forbids. At 4px and 12px all three differ from `round`,
    // so a corner shape is only ever a statement a ROUNDED theme can make.
    // `tests/themes/generated-themes.test.ts` keeps that as a gate.
    // `density` stopped being nobody's with `slate` [1.1A-15], and 1.1A-16
    // gives `spacious` its first three themes.
    for (const [name] of THEME_TABLE) {
      expect({ [name]: shippedAxes(name).shape.corner }).toEqual({ [name]: "round" });
    }
    expect(shippedAxes("slate").density).toBe("compact");
    // And it is a FACT about the stylesheet, not a line in this table: remove
    // the header directive and the axis follows.
    const slateCss = readFileSync(join(THEMES_DIR, "slate.css"), "utf8");
    expect(axesFromCss(slateCss.replace("@ui:density compact", "@ui:densely compact"), BASE).density)
      .toBe("comfortable");
  });

  it("the derived scheme agrees with the manifest's hand-authored one", () => {
    // Two independent statements about the same fact: the editorial `scheme`
    // field in `gen-theme-manifests.mjs`, and the axis read out of the CSS.
    for (const [name] of THEME_TABLE) {
      const manifest = JSON.parse(readFileSync(join(THEMES_DIR, `${name}.theme.json`), "utf8"));
      // A print companion publishes no axes block [1.1A-16] — there is nothing
      // to agree with, and the table above still derives its axes from the CSS.
      if (!manifest.axes) continue;
      expect({ [name]: manifest.axes.scheme }).toEqual({ [name]: manifest.scheme });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 · `default` IS the defaults
// ═══════════════════════════════════════════════════════════════════════════

describe("axesFromCss · the shipped default theme is THEME_SEED_DEFAULTS", () => {
  it("derives exactly the seed defaults, which is what makes { name, accent } complete", () => {
    // 1.1A-07 recorded the defaults as "together they describe the shipped
    // `default` theme". This is the first task that can check that claim
    // mechanically, and it is what pins two of this file's thresholds.
    const a = shippedAxes("default");
    const derived: Record<string, string | number> = {
      neutral: a.neutral,
      scheme: a.scheme,
      "type.pairing": a.type.pairing!,
      "type.scale": a.type.scale!,
      "type.base": a.type.base!,
      "type.voice.weight": a.type.voice!.weight!,
      "type.voice.tracking": a.type.voice!.tracking!,
      "type.voice.transform": a.type.voice!.transform!,
      "shape.radius": a.shape.radius!,
      "shape.border": a.shape.border!,
      "shape.corner": a.shape.corner!,
      depth: a.depth,
      material: a.material,
      motion: a.motion,
      density: a.density,
      focus: a.focus,
      "decoration.link": a.decoration.link!,
      "decoration.divider": a.decoration.divider!,
      "controls.button": a.controls.button!,
      "controls.input": a.controls.input!,
      "controls.checkbox": a.controls.checkbox!,
      "controls.switch": a.controls.switch!,
      contrast: a.contrast,
    };
    const { document: _document, ...expected } = THEME_SEED_DEFAULTS;
    expect(derived).toEqual(expected as Record<string, string | number>);
  });

  it("states none of the 1.1 families — it IS the token layer, not a theme resembling it", () => {
    // FAQIR-PLAN-1.1's 1.1A-15 adoption table asks `default` to "declare" its
    // axes "so they are explicit, not inherited by accident". It deliberately
    // does not, and this is the assertion that makes the deviation a decision
    // rather than an omission.
    //
    // Two reasons. First, the axes ARE explicit: `axesFromCss` resolves every
    // token through the base layer (`axesFromCss(":root {}")` reports the
    // registry's own answers, never blanks), so `default.theme.json` carries a
    // complete derived block either way. Second, restating a base value here
    // would FORK the two: `tokens/*.css` is what `default` renders as, and a
    // later change to the token layer would then stop reaching the theme that
    // is supposed to be its reference — silently, and only for this one theme.
    //
    // The one thing `default` did adopt is not a restated value: its dark
    // shadow ramp is cast through `--shadow-color`, which replaces ten literal
    // blacks with the channel every other theme tints. Asserted below.
    const css = readFileSync(join(THEMES_DIR, "default.css"), "utf8");
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, " ");
    const FAMILIES_1_1 = [
      "font-heading", "font-body", "font-ui",
      "heading-weight", "heading-tracking", "heading-transform", "heading-leading",
      "border-width", "corner-shape",
      "focus-ring-width", "focus-ring-offset", "focus-ring-style", "focus-ring-color", "focus-shadow",
      "surface-backdrop", "texture-page", "texture-surface",
      "ease-spring", "motion-hover-lift",
      "link-decoration", "link-underline-offset", "link-thickness", "divider-style",
      "selection-bg", "selection-fg", "marker-color", "disabled-opacity",
      "input-fill", "checkbox-radius", "switch-radius", "button-text-transform",
    ];
    const declared = FAMILIES_1_1.filter((token) => new RegExp(`--${token}\\s*:`).test(bare));
    expect(declared).toEqual([]);
    // …and the one adoption, in both dark blocks.
    expect(bare).toContain("oklch(var(--shadow-color) / 0.3)");
    expect(bare).not.toMatch(/--shadow-(sm|md|lg|xl):[^;]*oklch\(\s*0\s+0\s+0/);
    expect([...bare.matchAll(/oklch\(var\(--shadow-color\)/g)].length).toBe(8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6 · The classification is not vacuous
// ═══════════════════════════════════════════════════════════════════════════

describe("axesFromCss · a CSS edit moves the axis it belongs to", () => {
  it("re-pointing one token in a shipped theme moves exactly one axis", () => {
    const css = readFileSync(join(THEMES_DIR, "default.css"), "utf8");
    const before = axesFromCss(css, BASE);
    const after = axesFromCss(`${css}\n:root { --corner-shape: bevel; }\n`, BASE);
    expect(before.shape.corner).toBe("round");
    expect(after.shape.corner).toBe("bevel");
    // Put the one axis back and nothing else has moved.
    const restored: ThemeAxes = { ...after, shape: { ...after.shape, corner: before.shape.corner } };
    expect(restored).toEqual(before);
  });

  it("is deterministic — the same CSS always derives the same block", () => {
    const css = readFileSync(join(THEMES_DIR, "soft.css"), "utf8");
    expect(axesFromCss(css, BASE)).toEqual(axesFromCss(css, BASE));
  });

  it("reports an axis it cannot read as the registry's value, not as a blank", () => {
    // A stylesheet with nothing in it is still a theme: every axis resolves
    // through the base layer, which is what a page with that theme renders.
    expect(axesFromCss(":root {}", BASE)).toEqual(axesFromCss("", BASE));
    expect(axesFromCss(":root {}", BASE).shape.radius).toBe("soft");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7 · The value plumbing the classifiers stand on
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveValue · the non-colour twin of resolveColorString", () => {
  const lookup = new Map([
    ["a", "var(--b)"],
    ["b", "var(--c)"],
    ["c", "0.375rem"],
    ["cycle", "var(--cycle)"],
    ["edge", "0 0 var(--c) 0"],
    ["fb", "var(--missing, 4px)"],
    ["deep", "calc(var(--c) * 2)"],
  ]);

  it("follows a whole-value var() chain to its literal", () => {
    expect(resolveValue("var(--a)", lookup)).toBe("0.375rem");
  });

  it("substitutes var()s embedded in a longer value", () => {
    expect(resolveValue("var(--edge)", lookup)).toBe("0 0 0.375rem 0");
    expect(resolveValue("var(--deep)", lookup)).toBe("calc(0.375rem * 2)");
  });

  it("honours a fallback when the token is undefined", () => {
    expect(resolveValue("var(--fb)", lookup)).toBe("4px");
    expect(resolveValue("var(--nope, 1px)", lookup)).toBe("1px");
  });

  it("leaves an unresolvable reference verbatim — the value a browser drops", () => {
    expect(resolveValue("var(--nope)", lookup)).toBe("var(--nope)");
    expect(resolveValue("0 0 var(--nope) 0", lookup)).toBe("0 0 var(--nope) 0");
  });

  it("is cycle-safe", () => {
    expect(resolveValue("var(--cycle)", lookup)).toBe("var(--cycle)");
  });
});

describe("lengths, lists and shadows", () => {
  it("reads every unit the registry authors, against the initial root size", () => {
    expect(lengthPx("2px")).toBe(2);
    expect(lengthPx("0.5rem")).toBe(ROOT_FONT_PX / 2);
    expect(lengthPx("0.25em")).toBe(ROOT_FONT_PX / 4);
    expect(lengthPx("12pt")).toBeCloseTo(16, 6);
    expect(lengthPx("0")).toBe(0);
    expect(lengthEm("0.2em")).toBeCloseTo(0.2, 6);
  });

  it("refuses anything that is not a length", () => {
    for (const v of ["none", "auto", "solid", "1.5", "oklch(1 0 0)", "var(--x)", ""]) {
      expect({ [v]: lengthPx(v) }).toEqual({ [v]: null });
    }
  });

  it("splits a list at top-level commas only", () => {
    expect(splitTopLevel("0 1px 2px oklch(0 0 0 / 0.1), 0 2px 4px oklch(0 0 0 / 0.2)")).toEqual([
      "0 1px 2px oklch(0 0 0 / 0.1)",
      "0 2px 4px oklch(0 0 0 / 0.2)",
    ]);
    expect(splitTopLevel("'Segoe UI', system-ui, sans-serif")).toEqual(["'Segoe UI'", "system-ui", "sans-serif"]);
  });

  it("expands a 1–4 value box shorthand", () => {
    expect(expandSides("1px")).toEqual(["1px", "1px", "1px", "1px"]);
    expect(expandSides("1px 2px")).toEqual(["1px", "2px", "1px", "2px"]);
    expect(expandSides("1px 2px 3px")).toEqual(["1px", "2px", "3px", "2px"]);
    expect(expandSides("1px 2px 3px 4px")).toEqual(["1px", "2px", "3px", "4px"]);
    expect(expandSides("1px 2px 3px 4px 5px")).toBeNull();
  });

  it("reads a shadow layer's lengths past its colour function", () => {
    expect(shadowLayer("0 4px 6px oklch(0 0 0 / 0.05)")).toEqual({ lengths: [0, 4, 6], inset: false });
    expect(shadowLayer("inset 0 2px 4px oklch(0 0 0 / 0.2)")).toEqual({ lengths: [0, 2, 4], inset: true });
  });

  it("knows a spring from a plain curve", () => {
    expect(isSpringEasing("linear(0, 0.3 6%, 1)")).toBe(true);
    expect(isSpringEasing("cubic-bezier(0.34, 1.56, 0.64, 1)")).toBe(true);
    expect(isSpringEasing("cubic-bezier(0.4, 0, 0.2, 1)")).toBe(false);
    expect(isSpringEasing("ease-out")).toBe(false);
    expect(isSpringEasing(null)).toBe(false);
  });

  it("reads both duration units", () => {
    expect(durationMs("200ms")).toBe(200);
    expect(durationMs("0.3s")).toBe(300);
    expect(durationMs("fast")).toBeNull();
  });

  it("classifies a family stack by the first face the table names", () => {
    expect(familyClass("system-ui, -apple-system, 'Segoe UI', sans-serif")).toBe("system");
    // 'Segoe UI' is humanist, but `system-ui` comes first — which is the face a
    // browser actually uses.
    expect(familyClass("'Segoe UI', system-ui")).toBe("sans-humanist");
    expect(familyClass("'Comic Unknown', 'Inter'")).toBe("sans-grotesque");
    expect(familyClass("'Comic Unknown'")).toBeNull();
    expect(familyClass("")).toBeNull();
  });

  it("reads the density directive, and defaults when it says something else", () => {
    expect(densityFromCss("/* @ui:density spacious */")).toBe("spacious");
    expect(densityFromCss("/* @ui:density compact */")).toBe("compact");
    expect(densityFromCss("/* @ui:density roomy */")).toBe("comfortable");
    expect(densityFromCss(":root {}")).toBe("comfortable");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8 · The sameness problem, measured
// ═══════════════════════════════════════════════════════════════════════════
//
// FAQIR-VISION §5.1 diagnoses twelve themes that read as one, and §5.2 answers
// it with a rule: two shipped themes must differ on at least FOUR axes. Until
// 1.1A-08 that rule had nothing to count. When it first did, the count WAS the
// diagnosis restated as a number: FIFTEEN of the twenty-three enumerated axis
// leaves identical across all twelve themes, four pairs identical on every one
// of them, 26 of the 66 pairs below the minimum.
//
// 1.1A-14 is the first task to move it, and the same three numbers now read
// four, two and ten — six themes saying in tokens what they had only ever said
// in colour. This is pinned rather than merely observed because 1.1A-15 moves it
// again and 1.1A-12 arms the gate that forbids the low end. A theme edit that
// makes the registry more varied must come here and say so.

describe("axesFromCss · how alike the twenty shipped stylesheets are [feeds 1.1A-12]", () => {
  const LEAVES = Object.keys(THEME_AXIS_VALUES);
  const NAMES = THEME_TABLE.map(([name]) => name);
  const DERIVED = new Map(NAMES.map((name) => [name, shippedAxes(name)]));

  /** How many enumerated axis leaves two themes disagree on. */
  function axisDistance(a: string, b: string): number {
    return LEAVES.filter(
      (leaf) => JSON.stringify(at(DERIVED.get(a)!, leaf)) !== JSON.stringify(at(DERIVED.get(b)!, leaf)),
    ).length;
  }

  it("ONE of the twenty-three leaves is the same in every shipped theme", () => {
    // Fifteen when 1.1A-08 first counted them, four after 1.1A-14, three after
    // 1.1A-15, one now. 1.1A-14 moved eleven by giving six themes the families
    // to say what they had always meant; 1.1A-15 moved the twelfth — `slate`
    // carries the `@ui:density compact` header it was designed at. 1.1A-16
    // moved the two RAMP shapes, which is the thing only a generated theme was
    // ever going to move: `editorial` and `luxe` set a 1.333 scale, `candy` a
    // 1.125 one, and `editorial`/`organic` read at a 17px base.
    //
    // What remains is the corner shape, and it stays constant for a reason this
    // task MEASURED rather than assumed — see the note in §4 above: at
    // `border-radius: 0` every corner shape is pixel-identical to `round`, so
    // the axis is only available to a theme that is already rounded, and none
    // of the rounded ones wants a cut corner yet.
    const constant = LEAVES.filter(
      (leaf) => new Set(NAMES.map((n) => JSON.stringify(at(DERIVED.get(n)!, leaf)))).size === 1,
    );
    expect(LEAVES.length).toBe(23);
    expect(constant).toEqual(["shape.corner"]);
  });

  it("NO pair is axis-identical any more [1.1A-15]", () => {
    const identical: string[] = [];
    for (let i = 0; i < NAMES.length; i++) {
      for (let j = i + 1; j < NAMES.length; j++) {
        if (axisDistance(NAMES[i], NAMES[j]) === 0) identical.push(`${NAMES[i]} ↔ ${NAMES[j]}`);
      }
    }
    // Four pairs when 1.1A-08 counted them, two after 1.1A-14 (`default ↔
    // slate` and `document ↔ document-serif`), none after this batch — and
    // `default` never moved for either, because §5 below holds it equal to
    // THEME_SEED_DEFAULTS.
    expect(identical).toEqual([]);
  });

  it("4 of the 190 pairs sit below four DIFFERING LEAVES — and none is a gate failure", () => {
    // This count is deliberately NOT the distinctiveness gate's. It compares the
    // twenty-three enumerated leaves one by one, and the two ACCENT axes are
    // continuous, so they are not in `THEME_AXIS_VALUES` and not counted here.
    // `aurora`/`default` differ on three leaves (tracking, depth, material) plus
    // an accent 36° apart, which is four of the fourteen axes §5.2 actually
    // rules on — so the pair clears the gate in
    // tests/themes/distinctiveness.test.ts while showing up in this stricter
    // count. Ten pairs sat here after 1.1A-14; one after 1.1A-15.
    //
    // The three added by 1.1A-16 are ALL print companions, and that is the
    // whole argument for excluding them from the gate rather than a coincidence
    // this test tolerates: `renderDocumentCss` emits none of the axis families,
    // so a companion says almost nothing about type, shape, motion or controls
    // and lands on top of every other companion — and of `document`, the
    // authored theme that occupies the same corner. Nothing a seed could say
    // would move them, which is why the rule is "a companion carries no axes"
    // rather than "these pairs are exempt". The six generated THEMES add none.
    const below: string[] = [];
    for (let i = 0; i < NAMES.length; i++) {
      for (let j = i + 1; j < NAMES.length; j++) {
        if (axisDistance(NAMES[i], NAMES[j]) < 4) below.push(`${NAMES[i]}/${NAMES[j]}`);
      }
    }
    expect(NAMES.length).toBe(20);
    expect(below.sort()).toEqual([
      "aurora/default",
      "document/editorial-document",
      "document/swiss-document",
      "editorial-document/swiss-document",
    ]);
    // Every pair the GATE judges — the eighteen with an axes block — clears it.
    const companions = new Set(["editorial-document", "swiss-document"]);
    expect(below.filter((pair) => !pair.split("/").some((n) => companions.has(n)))).toEqual([
      "aurora/default",
    ]);
  });
});
