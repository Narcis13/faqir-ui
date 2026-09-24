// Generator v2: seed → declarations, and the round trip back  [task 1.1A-10]
//
// `axesFromCss` (1.1A-08) reads a theme's axes OUT of its CSS. `families.ts`
// writes the CSS a seed asks for. This file holds the two against each other:
//
//   1. Each family in isolation — the declarations it emits, and the fact that
//      they name only tokens the base layer defines.
//   2. The ROUND TRIP, over a matrix of seeds: `axesFromCss(generate(seed))`
//      must equal the seed's own axes. The generator enforces this on every
//      theme it builds (`assertAxesRoundTrip`), so a matrix run here is a
//      breadth check on that gate rather than a re-implementation of it.
//
// The thresholds every renderer is aiming at live in `axes.ts` and are imported
// by name: a test that restated `2px` would go green against a classifier that
// had moved.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import {
  axesFromCss,
  BORDER_HAIRLINE_MAX_PX,
  BORDER_REGULAR_MAX_PX,
  DEPTH_LAYERED_MIN_BLUR_PX,
  durationMs,
  expandSides,
  familyClass,
  FOCUS_BOLD_MIN_WIDTH_PX,
  HEADING_TRACKING_EM,
  HEADING_WEIGHT_MAX,
  isSpringEasing,
  lengthEm,
  lengthPx,
  LINK_OFFSET_MIN_EM,
  LINK_THICK_MIN_PX,
  MOTION_MINIMAL_MAX_MS,
  MOTION_PLAYFUL_LIFT_MAX_PX,
  MOTION_SNAPPY_MAX_MS,
  NEUTRAL_GRAY_MAX_CHROMA,
  PILL_MIN_PX,
  RADIUS_CRISP_MAX_PX,
  RADIUS_SOFT_MAX_PX,
  resolveValue,
  shadowLayer,
  splitTopLevel,
  TEXT_STEPS,
} from "../../src/theme/axes";
import {
  AXIS_FAMILY,
  axisDeclarations,
  controlsFamily,
  decorationFamily,
  densityDirective,
  DIVIDER_DOUBLE_MIN_PX,
  depthFamily,
  DURATION_RAMPS,
  FAMILY_ORDER,
  focusFamily,
  GLASS_BACKDROP,
  HEADING_TRACKINGS,
  HEADING_WEIGHTS,
  materialFamily,
  motionFamily,
  neutralAxisFor,
  neutralTint,
  NEUTRAL_TINT_MIN_CHROMA,
  PAIRING_STACKS,
  RADIUS_RAMPS,
  SHADOW_COLOR_DEFAULT,
  SHADOW_RAMPS,
  shapeFamily,
  SYSTEM_UI_PAIRINGS,
  THEME_FAMILIES,
  typeFamily,
  typeRamp,
  type Declaration,
} from "../../src/theme/families";
import {
  CUSTOM_PAIRING_REFUSAL,
  SHARP_CORNER_REFUSAL,
  radiusConflict,
  LEGACY_RADIUS_SHAPE,
  normalizeSeed,
  PILL_COUPLING,
  seedRecord,
  type NormalizedSeed,
  type ThemeSeedInput,
} from "../../src/theme/seed";
import { assertAxesRoundTrip, generateThemeBundle } from "../../src/commands/theme-generate";
import {
  isSurfaceTokenFile,
  surfaceTokens,
  THEME_AXIS_VALUES,
  THEME_SEED_AXES,
  THEME_SEED_DEFAULTS,
  validateThemeAxes,
} from "../../src/theme-manifest";
import { cssColorToOklch } from "../../src/utils/oklch";

const ROOT = join(import.meta.dir, "../..");
const TOKENS_DIR = join(ROOT, "registry/tokens");
const TOKEN_FILES = [...new Glob("*.css").scanSync(TOKENS_DIR)].filter(isSurfaceTokenFile).sort();
const BASE_SOURCES = TOKEN_FILES.map((file) => readFileSync(join(TOKENS_DIR, file), "utf8"));
const SURFACE = new Set(surfaceTokens(BASE_SOURCES));
/** The full token layer, including the non-surface palettes a value may name. */
const ALL_TOKEN_SOURCES = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .filter((file) => file !== "index.css")
  .sort()
  .map((file) => readFileSync(join(TOKENS_DIR, file), "utf8"));

const ACCENT = "oklch(0.55 0.2 150)";

function seedFor(overrides: Partial<ThemeSeedInput> = {}): NormalizedSeed {
  return normalizeSeed({ name: "probe", accent: ACCENT, ...overrides } as ThemeSeedInput);
}

/** A family's output as a lookup, for asserting one declaration at a time. */
function byName(declarations: Declaration[]): Map<string, string> {
  return new Map(declarations);
}

/**
 * Resolve a declaration the way a browser would, through the base token layer
 * — so a test reads what the CLASSIFIER reads rather than the `var()` chain
 * the renderer happened to write.
 */
const BASE_LOOKUP = (() => {
  const lookup = new Map<string, string>();
  for (const source of ALL_TOKEN_SOURCES) {
    for (const m of source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
      lookup.set(m[1], m[2].trim());
    }
  }
  return lookup;
})();

function resolved(declarations: Declaration[], token: string): string | null {
  const lookup = new Map(BASE_LOOKUP);
  for (const [name, value] of declarations) lookup.set(name, value);
  const raw = lookup.get(token);
  return raw == null ? null : resolveValue(raw, lookup, new Set([token]));
}

// ── 1 · The seed normalizer ─────────────────────────────────────────────────

describe("normalizeSeed · every axis present, the two 1.0 flags mapped", () => {
  it("fills a bare { name, accent } out to exactly the documented defaults", () => {
    const seed = seedFor();
    // THEME_SEED_DEFAULTS is the single table (1.1A-07); read it back out of
    // the normalized seed by its dotted paths so a new axis cannot be added to
    // one side only.
    const read = (path: string) =>
      path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], seed);
    for (const [path, expected] of Object.entries(THEME_SEED_DEFAULTS)) {
      expect(read(path), path).toBe(expected as never);
    }
  });

  it("maps every 1.0 --radius value onto the five-step vocabulary", () => {
    for (const [flag, axis] of Object.entries(LEGACY_RADIUS_SHAPE)) {
      expect(seedFor({ radius: flag as "sm" | "md" | "lg" }).shape.radius).toBe(axis);
    }
    // Both spellings stated and agreeing is one statement…
    expect(seedFor({ radius: "sm", shape: { radius: "crisp" } }).shape.radius).toBe("crisp");
    // …and disagreeing is an error naming both, not a silently dropped flag.
    expect(() => seedFor({ radius: "sm", shape: { radius: "round" } }))
      .toThrow(radiusConflict("sm", "round"));
  });

  it("refuses a shaped corner on a sharp shape, where there is no corner to shape", () => {
    for (const corner of THEME_AXIS_VALUES["shape.corner"]) {
      if (corner === "round") continue;
      expect(() => seedFor({ shape: { radius: "sharp", corner } })).toThrow(SHARP_CORNER_REFUSAL);
      expect(seedFor({ shape: { radius: "crisp", corner } }).shape.corner).toBe(corner);
    }
    expect(seedFor({ shape: { radius: "sharp", corner: "round" } }).shape.corner).toBe("round");
  });

  it("refuses type.pairing: custom, which is an observation and not an input", () => {
    expect(() => seedFor({ type: { pairing: "custom" } })).toThrow(CUSTOM_PAIRING_REFUSAL);
  });

  it("lets an unstated button silhouette follow the shape ramp", () => {
    // A theme that asked for square corners and said nothing about its buttons
    // wants square buttons; the flat default would leave one rounded control
    // in an otherwise sharp theme.
    expect(seedFor({ shape: { radius: "sharp" } }).controls.button).toBe("rect");
    expect(seedFor({ shape: { radius: "crisp" } }).controls.button).toBe("soft");
    // …and the DEFAULT shape still yields the table's own default, which is
    // what keeps `{ name, accent }` a description of the shipped theme.
    expect(seedFor().controls.button).toBe(THEME_SEED_DEFAULTS["controls.button"]);
    // A stated value always wins: sharp panels with soft buttons is a design.
    expect(seedFor({ shape: { radius: "sharp" }, controls: { button: "soft" } }).controls.button)
      .toBe("soft");
  });

  it("couples shape.radius: pill to controls.button: pill in both directions", () => {
    expect(seedFor({ shape: { radius: "pill" } }).controls.button).toBe("pill");
    expect(() => seedFor({ shape: { radius: "pill" }, controls: { button: "rect" } }))
      .toThrow(PILL_COUPLING);
    expect(() => seedFor({ shape: { radius: "soft" }, controls: { button: "pill" } }))
      .toThrow(PILL_COUPLING);
    // …and an unstated shape follows nothing: the default is still `soft`.
    expect(seedFor().shape.radius).toBe("soft");
  });

  it("rejects an unknown axis value with the field that carries it", () => {
    expect(() => seedFor({ depth: "fluffy" as never })).toThrow(/depth/);
    expect(() => seedFor({ shape: { corner: "wobble" as never } })).toThrow(/shape\.corner/);
  });

  it("seedRecord round-trips through the manifest validator", () => {
    const record = seedRecord(seedFor({ depth: "glass", motion: "playful" }));
    expect(normalizeSeed(record as ThemeSeedInput)).toEqual(seedFor({ depth: "glass", motion: "playful" }));
  });
});

// ── 2 · Every axis has an owner ─────────────────────────────────────────────

describe("the family table covers the vocabulary", () => {
  it("maps every seed axis to a family, and every family is real", () => {
    expect(Object.keys(AXIS_FAMILY).sort()).toEqual([...THEME_SEED_AXES].sort());
    for (const [axis, family] of Object.entries(AXIS_FAMILY)) {
      if (family === "color" || family === "density") continue;
      expect(THEME_FAMILIES[family], axis).toBeTypeOf("function");
    }
  });

  it("renders every token family into the one scheme-independent group", () => {
    // `depth` is the documented exception: scheme-bound, so it renders beside
    // the colours. Everything else in THEME_FAMILIES is in FAMILY_ORDER.
    expect([...FAMILY_ORDER].slice().sort().join(",")).toBe(
      Object.keys(THEME_FAMILIES).filter((f) => f !== "depth").sort().join(","),
    );
  });

  it("emits only tokens the base layer already defines, for every axis value", () => {
    for (const seed of MATRIX) {
      const emitted = [...axisDeclarations(seed), ...depthFamily(seed, "light"), ...depthFamily(seed, "dark")];
      const unknown = emitted.map(([token]) => token).filter((token) => !SURFACE.has(token));
      expect(unknown, seed.name).toEqual([]);
    }
  });

  it("never selects a component: a declaration name is a token, never a selector", () => {
    for (const seed of MATRIX) {
      for (const [name, value] of axisDeclarations(seed)) {
        expect(name, `${seed.name}/${name}`).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(value, `${seed.name}/${name}`).not.toContain("{");
      }
    }
  });

  it("is deterministic: the same seed renders identical declarations", () => {
    const seed = seedFor({ depth: "layered", motion: "springy", material: "grain" });
    expect(axisDeclarations(seed)).toEqual(axisDeclarations(seedFor({ depth: "layered", motion: "springy", material: "grain" })));
  });
});

// ── 3 · Type ────────────────────────────────────────────────────────────────

describe("type family", () => {
  it("gives every pairing a stack whose first recognised family is that class", () => {
    for (const [pairing, stack] of Object.entries(PAIRING_STACKS)) {
      expect(familyClass(stack), pairing).toBe(pairing as never);
    }
    // Every enumerated pairing but the derived one has a stack.
    expect(Object.keys(PAIRING_STACKS).sort()).toEqual(
      THEME_AXIS_VALUES["type.pairing"].filter((v) => v !== "custom").slice().sort(),
    );
  });

  it("points heading and body at the same class, and control text where it reads", () => {
    for (const pairing of Object.keys(PAIRING_STACKS) as Array<keyof typeof PAIRING_STACKS>) {
      const decls = byName(typeFamily(seedFor({ type: { pairing } })));
      expect(decls.get("font-heading"), pairing).toBe(PAIRING_STACKS[pairing]);
      expect(decls.get("font-body"), pairing).toBe(PAIRING_STACKS[pairing]);
      expect(decls.get("font-ui"), pairing).toBe(
        SYSTEM_UI_PAIRINGS.has(pairing) ? PAIRING_STACKS.system : PAIRING_STACKS[pairing],
      );
    }
  });

  it("derives the seed's own ratio and base size back out of the ramp it writes", () => {
    for (const scale of THEME_AXIS_VALUES["type.scale"]) {
      for (const base of THEME_AXIS_VALUES["type.base"]) {
        const ramp = typeRamp(base, scale);
        expect(ramp.map(([name]) => name)).toEqual([...TEXT_STEPS]);
        const px = ramp.map(([, value]) => lengthPx(value)!);
        expect(px[TEXT_STEPS.indexOf("text-base")], `${base}/${scale}`).toBeCloseTo(base, 2);
        for (let i = 1; i < px.length; i++) {
          expect(px[i] / px[i - 1], `${base}/${scale} step ${i}`).toBeCloseTo(scale, 2);
        }
      }
    }
  });

  it("places each voice weight inside its own HEADING_WEIGHT_MAX band", () => {
    const bands = { ...HEADING_WEIGHT_MAX, black: Infinity };
    const floors = { regular: 0, medium: HEADING_WEIGHT_MAX.regular, semibold: HEADING_WEIGHT_MAX.medium, bold: HEADING_WEIGHT_MAX.semibold, black: HEADING_WEIGHT_MAX.bold };
    for (const weight of THEME_AXIS_VALUES["type.voice.weight"]) {
      const value = Number(resolved([["heading-weight", HEADING_WEIGHTS[weight]]], "heading-weight"));
      expect(value, weight).toBeGreaterThanOrEqual(floors[weight]);
      expect(value, weight).toBeLessThan(bands[weight]);
    }
  });

  it("clears the tracking threshold by a margin rounding cannot cross", () => {
    expect(lengthEm(HEADING_TRACKINGS.tight)!).toBeLessThan(-HEADING_TRACKING_EM * 3);
    expect(lengthEm(HEADING_TRACKINGS.normal)).toBe(0);
    expect(lengthEm(HEADING_TRACKINGS.wide)!).toBeGreaterThan(HEADING_TRACKING_EM * 3);
  });

  it("spells none and uppercase on --heading-transform, and small-caps on --heading-caps [1.1A-25]", () => {
    for (const transform of ["none", "uppercase"] as const) {
      const decls = byName(typeFamily(seedFor({ type: { voice: { transform } } })));
      expect(decls.get("heading-transform")).toBe(transform);
      // Left at its `normal` default, so pre-1.1A-25 themes regenerate unchanged.
      expect(decls.has("heading-caps")).toBe(false);
    }
    // `small-caps` is not a text-transform value: the transform stays `none`
    // and the variant goes on the token `font-variant-caps` reads.
    const caps = byName(typeFamily(seedFor({ type: { voice: { transform: "small-caps" } } })));
    expect(caps.get("heading-transform")).toBe("none");
    expect(caps.get("heading-caps")).toBe("small-caps");
  });
});

// ── 4 · Shape and controls ──────────────────────────────────────────────────

describe("shape family", () => {
  it("puts --radius-md in the band its own axis value names", () => {
    const md = (radius: keyof typeof RADIUS_RAMPS) =>
      lengthPx(byName(shapeFamily(seedFor(
        radius === "pill"
          ? { shape: { radius }, controls: { button: "pill" } }
          : { shape: { radius } },
      ))).get("radius-md")!)!;
    expect(md("sharp")).toBe(0);
    expect(md("crisp")).toBeGreaterThan(0);
    expect(md("crisp")).toBeLessThanOrEqual(RADIUS_CRISP_MAX_PX);
    expect(md("soft")).toBeGreaterThan(RADIUS_CRISP_MAX_PX);
    expect(md("soft")).toBeLessThanOrEqual(RADIUS_SOFT_MAX_PX);
    expect(md("round")).toBeGreaterThan(RADIUS_SOFT_MAX_PX);
  });

  it("leaves --radius-full alone, so a sharp theme can still have a pill switch", () => {
    const names = shapeFamily(seedFor({ shape: { radius: "sharp" } })).map(([name]) => name);
    expect(names).not.toContain("radius-full");
    const decls = [...shapeFamily(seedFor({ shape: { radius: "sharp" } })), ...controlsFamily(seedFor({ shape: { radius: "sharp" } }))];
    expect(lengthPx(resolved(decls, "switch-radius"))!).toBeGreaterThanOrEqual(PILL_MIN_PX);
  });

  it("moves the emphasis edge with the default one, in every band", () => {
    const widths = (border: "hairline" | "regular" | "heavy"): [number, string] => {
      const decls = shapeFamily(seedFor({ shape: { border } }));
      return [lengthPx(resolved(decls, "border-width"))!, resolved(decls, "border-width-strong")!];
    };
    const [hairline, hairlineStrong] = widths("hairline");
    expect(hairline).toBeLessThanOrEqual(BORDER_HAIRLINE_MAX_PX);
    expect(lengthPx(hairlineStrong)!).toBeGreaterThan(hairline);
    const [regular] = widths("regular");
    expect(regular).toBeGreaterThan(BORDER_HAIRLINE_MAX_PX);
    expect(regular).toBeLessThanOrEqual(BORDER_REGULAR_MAX_PX);
    const [heavy, heavyStrong] = widths("heavy");
    expect(heavy).toBeGreaterThan(BORDER_REGULAR_MAX_PX);
    // The ladder stops at `lg`, so emphasis is stated as one more step of it.
    expect(heavyStrong).toContain("calc(");
  });

  it("states the corner shape verbatim", () => {
    for (const corner of THEME_AXIS_VALUES["shape.corner"]) {
      expect(byName(shapeFamily(seedFor({ shape: { corner } }))).get("corner-shape")).toBe(corner);
    }
  });
});

describe("controls family", () => {
  it("gives a soft button a real radius even inside a sharp theme", () => {
    // Only when it is ASKED for: an unstated button follows the ramp into
    // `rect` (see BUTTON_FOLLOWS_SHAPE). Stated, it needs a radius of its own,
    // because the ramp it would otherwise read is zero.
    const sharp = seedFor({ shape: { radius: "sharp" }, controls: { button: "soft" } });
    const decls = [...shapeFamily(sharp), ...controlsFamily(sharp)];
    const radius = lengthPx(resolved(decls, "button-radius"))!;
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThan(PILL_MIN_PX);
  });

  it("states the underline silhouette as a four-value box with only a bottom rule", () => {
    const decls = controlsFamily(seedFor({ controls: { input: "underline" } }));
    const sides = expandSides(resolved(decls, "input-border-width")!)!.map((s) => lengthPx(s));
    expect(sides[0]).toBe(0);
    expect(sides[1]).toBe(0);
    expect(sides[3]).toBe(0);
    expect(sides[2]).toBeGreaterThan(0);
  });

  it("fills a filled input with something other than the plain background", () => {
    const filled = controlsFamily(seedFor({ controls: { input: "filled" } }));
    expect(resolved(filled, "input-fill")).not.toBe(resolved(filled, "input-bg"));
    const box = controlsFamily(seedFor({ controls: { input: "box" } }));
    expect(resolved(box, "input-fill")).toBe(resolved(box, "input-bg"));
  });

  it("rounds a checkbox and squares a switch only when asked", () => {
    const round = controlsFamily(seedFor({ controls: { checkbox: "round", switch: "square" } }));
    expect(lengthPx(resolved(round, "checkbox-radius"))!).toBeGreaterThanOrEqual(PILL_MIN_PX);
    expect(lengthPx(resolved(round, "switch-radius"))!).toBeLessThan(PILL_MIN_PX);
    const plain = controlsFamily(seedFor());
    expect(lengthPx(resolved(plain, "checkbox-radius"))!).toBeLessThan(PILL_MIN_PX);
    expect(lengthPx(resolved(plain, "switch-radius"))!).toBeGreaterThanOrEqual(PILL_MIN_PX);
  });

  it("is what the three input controls can actually consume", () => {
    // The four-value silhouette only renders because input/textarea/select
    // declare `border-width` as a longhand — a `border:` shorthand's width slot
    // takes one value and the whole declaration would be dropped.
    for (const control of ["input", "textarea", "select"]) {
      const css = readFileSync(join(ROOT, `registry/primitives/${control}/${control}.css`), "utf8");
      expect(css, control).toContain("border-width: var(--input-border-width);");
      expect(css, control).not.toMatch(/border:\s*var\(--input-border-width\)/);
    }
  });
});

// ── 5 · Depth, material, motion, focus, decoration ──────────────────────────

describe("depth family", () => {
  it("derives its own axis value back out of --shadow-md, in both schemes", () => {
    for (const depth of THEME_AXIS_VALUES.depth) {
      for (const scheme of ["light", "dark"] as const) {
        const md = SHADOW_RAMPS[depth][scheme][2];
        if (depth === "flat") {
          expect(md, `${depth}/${scheme}`).toBe("none");
          continue;
        }
        const first = shadowLayer(splitTopLevel(md)[0]);
        const [x = 0, y = 0, blur = 0] = first.lengths;
        if (depth === "inset") expect(first.inset, `${depth}/${scheme}`).toBe(true);
        if (depth === "hard") {
          expect(blur, `${depth}/${scheme}`).toBe(0);
          expect(x !== 0 || y !== 0, `${depth}/${scheme}`).toBe(true);
        }
        if (depth === "layered") expect(blur, `${depth}/${scheme}`).toBeGreaterThanOrEqual(DEPTH_LAYERED_MIN_BLUR_PX);
        if (depth === "soft") {
          // The one value the blur bands actually decide. `glass` is free to
          // blur as far as it likes: the classifier reaches it on
          // `--surface-backdrop`, several branches before the bands.
          expect(blur, `${depth}/${scheme}`).toBeLessThan(DEPTH_LAYERED_MIN_BLUR_PX);
          expect(first.inset, `${depth}/${scheme}`).toBe(false);
        }
        if (depth === "glass") expect(first.inset, `${depth}/${scheme}`).toBe(false);
      }
    }
  });

  it("keeps the two schemes the same silhouette at different alphas", () => {
    const strip = (value: string) => value.replace(/oklch\(var\(--shadow-color\) \/ [\d.]+\)/g, "C");
    for (const depth of THEME_AXIS_VALUES.depth) {
      // `soft` is exempt, and the exemption is the point: it is the 1.0
      // generator's own pair of ramps, kept declaration for declaration so a
      // legacy input still renders what it always did — and 1.0 drew a
      // two-layer light `sm` against a one-layer dark one, and no dark `xs` at
      // all. The five ramps 1.1A-10 authored do hold the property.
      if (depth === "soft") continue;
      const { light, dark } = SHADOW_RAMPS[depth];
      for (let i = 0; i < light.length; i++) {
        expect(strip(dark[i]), `${depth} step ${i}`).toBe(strip(light[i]));
      }
    }
    // …and the exemption is not vacuous: `soft` really does differ.
    expect(strip(SHADOW_RAMPS.soft.dark[0])).not.toBe(strip(SHADOW_RAMPS.soft.light[0]));
  });

  it("casts every layer in --shadow-color, never a literal", () => {
    for (const depth of THEME_AXIS_VALUES.depth) {
      for (const scheme of ["light", "dark"] as const) {
        for (const value of SHADOW_RAMPS[depth][scheme]) {
          if (value === "none") continue;
          expect(value, `${depth}/${scheme}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|\boklch\((?!var\()/i);
        }
      }
    }
  });

  it("frosts a glass theme without putting alpha on a contrast-pair surface", () => {
    const decls = byName(depthFamily(seedFor({ depth: "glass" }), "light"));
    expect(decls.get("surface-backdrop")).toBe(GLASS_BACKDROP);
    expect(decls.get("card-bg")).toContain("color-mix(");
    // The surface ramp itself stays opaque: a translucent one has no
    // context-free contrast ratio and the gate reports it rather than guess.
    expect(decls.has("color-surface-1")).toBe(false);
    expect(byName(depthFamily(seedFor({ depth: "soft" }), "light")).has("surface-backdrop")).toBe(false);
  });

  it("writes --shadow-color into both schemes, so a dark block owns its family", () => {
    for (const depth of THEME_AXIS_VALUES.depth) {
      for (const scheme of ["light", "dark"] as const) {
        expect(byName(depthFamily(seedFor({ depth }), scheme)).has("shadow-color"), `${depth}/${scheme}`)
          .toBe(true);
      }
    }
  });

  it("casts a hard shadow in something a dark page can show", () => {
    // A `hard` shadow is a graphic MARK, not a suggestion of lift, and a black
    // mark on a dark page is no mark at all — so that one depth, and only it,
    // inverts its channel. Every other depth is ambient: black in both
    // schemes, shown on a dark page by raising the alpha instead.
    expect(byName(depthFamily(seedFor({ depth: "hard" }), "dark")).get("shadow-color")).toBe("1 0 0");
    expect(byName(depthFamily(seedFor({ depth: "hard" }), "light")).get("shadow-color")).toBe(SHADOW_COLOR_DEFAULT);
    for (const depth of THEME_AXIS_VALUES.depth) {
      if (depth === "hard") continue;
      for (const scheme of ["light", "dark"] as const) {
        expect(byName(depthFamily(seedFor({ depth }), scheme)).get("shadow-color"), `${depth}/${scheme}`)
          .toBe(SHADOW_COLOR_DEFAULT);
      }
    }
  });
});

describe("material family", () => {
  it("dresses the page, and says nothing at all for `none`", () => {
    expect(materialFamily(seedFor())).toEqual([]);
    for (const material of THEME_AXIS_VALUES.material) {
      if (material === "none") continue;
      expect(byName(materialFamily(seedFor({ material }))).get("texture-page"))
        .toBe(`var(--texture-${material})`);
    }
  });

  it("names a texture the palette actually ships", () => {
    const textures = readFileSync(join(TOKENS_DIR, "textures.css"), "utf8");
    for (const material of THEME_AXIS_VALUES.material) {
      if (material === "none") continue;
      expect(textures, material).toContain(`--texture-${material}:`);
    }
  });
});

describe("motion family", () => {
  it("lands --duration-normal in the band its personality names", () => {
    const normal = (motion: keyof typeof DURATION_RAMPS) =>
      durationMs(byName(motionFamily(seedFor({ motion }))).get("duration-normal")!)!;
    expect(normal("none")).toBe(0);
    expect(normal("minimal")).toBeLessThanOrEqual(MOTION_MINIMAL_MAX_MS);
    expect(normal("snappy")).toBeGreaterThan(MOTION_MINIMAL_MAX_MS);
    expect(normal("snappy")).toBeLessThanOrEqual(MOTION_SNAPPY_MAX_MS);
    expect(normal("smooth")).toBeGreaterThan(MOTION_SNAPPY_MAX_MS);
  });

  it("keeps every ramp monotonic", () => {
    for (const [motion, ramp] of Object.entries(DURATION_RAMPS)) {
      for (let i = 1; i < ramp.length; i++) {
        expect(ramp[i], `${motion} step ${i}`).toBeGreaterThanOrEqual(ramp[i - 1]);
      }
    }
  });

  it("puts a spring in --ease-default for springy and playful, and only those", () => {
    for (const motion of THEME_AXIS_VALUES.motion) {
      const decls = motionFamily(seedFor({ motion }));
      const easing = resolved(decls, "ease-default");
      expect(isSpringEasing(easing), motion).toBe(motion === "springy" || motion === "playful");
    }
  });

  it("matches the theme's own --ease-out for snappy, which is what the band means", () => {
    const decls = motionFamily(seedFor({ motion: "snappy" }));
    expect(resolved(decls, "ease-default")).toBe(resolved(decls, "ease-out"));
    expect(resolved(motionFamily(seedFor({ motion: "smooth" })), "ease-default"))
      .not.toBe(resolved([], "ease-out"));
  });

  it("lifts the surface only for playful, deep enough to clear the band", () => {
    const lift = byName(motionFamily(seedFor({ motion: "playful" }))).get("motion-hover-lift")!;
    expect(lengthPx(lift.split(/\s+/)[1])!).toBeLessThanOrEqual(MOTION_PLAYFUL_LIFT_MAX_PX);
    expect(byName(motionFamily(seedFor({ motion: "springy" }))).has("motion-hover-lift")).toBe(false);
  });

  it("states density as a header directive, because it has no :root token", () => {
    for (const density of THEME_AXIS_VALUES.density) {
      expect(densityDirective(seedFor({ density }))).toBe(`/* @ui:density ${density} */`);
    }
  });
});

describe("focus family", () => {
  it("reaches each focus value through the property the classifier reads", () => {
    const ring = byName(focusFamily(seedFor({ focus: "ring" })));
    expect(lengthPx(ring.get("focus-ring-width")!)!).toBeLessThan(FOCUS_BOLD_MIN_WIDTH_PX);
    expect(lengthPx(ring.get("focus-ring-offset")!)!).toBeGreaterThanOrEqual(0);
    expect(ring.has("focus-shadow")).toBe(false);

    expect(lengthPx(byName(focusFamily(seedFor({ focus: "bold" }))).get("focus-ring-width")!)!)
      .toBeGreaterThanOrEqual(FOCUS_BOLD_MIN_WIDTH_PX);
    expect(lengthPx(byName(focusFamily(seedFor({ focus: "inset" }))).get("focus-ring-offset")!)!)
      .toBeLessThan(0);
    expect(byName(focusFamily(seedFor({ focus: "glow" }))).get("focus-shadow")).not.toBe("none");
  });

  it("states an inset offset as a plain length, never a calc() a gate cannot read", () => {
    const offset = byName(focusFamily(seedFor({ focus: "inset" }))).get("focus-ring-offset")!;
    expect(offset).not.toContain("calc(");
    expect(lengthPx(offset)).not.toBeNull();
  });
});

describe("decoration family", () => {
  it("reaches each link treatment through the properties the classifier reads", () => {
    const none = byName(decorationFamily(seedFor({ decoration: { link: "none" } })));
    expect(none.get("link-decoration")).toBe("none");

    const plain = decorationFamily(seedFor({ decoration: { link: "plain" } }));
    expect(lengthPx(resolved(plain, "link-thickness"))!).toBeLessThan(LINK_THICK_MIN_PX);
    expect(lengthEm(resolved(plain, "link-underline-offset"))!).toBeLessThan(LINK_OFFSET_MIN_EM);

    const offset = decorationFamily(seedFor({ decoration: { link: "offset" } }));
    expect(lengthPx(resolved(offset, "link-thickness"))!).toBeLessThan(LINK_THICK_MIN_PX);
    expect(lengthEm(resolved(offset, "link-underline-offset"))!).toBeGreaterThanOrEqual(LINK_OFFSET_MIN_EM);

    const thick = decorationFamily(seedFor({ decoration: { link: "thick" } }));
    expect(lengthPx(resolved(thick, "link-thickness"))!).toBeGreaterThanOrEqual(LINK_THICK_MIN_PX);
  });

  it("states the divider style verbatim", () => {
    for (const divider of THEME_AXIS_VALUES["decoration.divider"]) {
      expect(byName(decorationFamily(seedFor({ decoration: { divider } }))).get("divider-style"))
        .toBe(divider);
    }
  });

  it("raises --divider-width for a double rule, and only for one [1.1A-26]", () => {
    const double = byName(decorationFamily(seedFor({ decoration: { divider: "double" } })));
    expect(lengthPx(double.get("divider-width"))!).toBeGreaterThanOrEqual(DIVIDER_DOUBLE_MIN_PX);
    for (const divider of ["solid", "dashed", "dotted"] as const) {
      expect(byName(decorationFamily(seedFor({ decoration: { divider } }))).has("divider-width")).toBe(false);
    }
  });
});

// ── 6 · The neutral tint, and the one collapse it allows ────────────────────

describe("neutral tint", () => {
  it("floors a tint above the classifier's own line for achromatic", () => {
    expect(NEUTRAL_TINT_MIN_CHROMA).toBeGreaterThan(NEUTRAL_GRAY_MAX_CHROMA);
    for (const neutral of THEME_AXIS_VALUES.neutral) {
      const tint = neutralTint(neutral, 150);
      if (neutral === "gray") {
        expect(tint).toBeNull();
        continue;
      }
      expect(tint!.c, neutral).toBeGreaterThan(NEUTRAL_GRAY_MAX_CHROMA);
    }
  });

  it("tints with the accent's own hue, and reports the name that hue earns", () => {
    // 150° is neither a cool nor a warm window, so `tinted` stays `tinted`.
    expect(neutralAxisFor(neutralTint("tinted", 150))).toBe("tinted");
    // …and an accent that already lives in one lands there. A neutral tinted
    // blue IS a cool neutral; the axis reports the stylesheet, not the request.
    expect(neutralAxisFor(neutralTint("tinted", 245))).toBe("cool");
    expect(neutralAxisFor(neutralTint("tinted", 80))).toBe("warm");
    expect(neutralAxisFor(neutralTint("cool", 80))).toBe("cool");
    expect(neutralAxisFor(neutralTint("warm", 245))).toBe("warm");
    expect(neutralAxisFor(null)).toBe("gray");
  });
});

// ── 7 · The round trip, over a matrix ───────────────────────────────────────

/**
 * One seed per value of every enumerated axis, plus a Latin-hypercube sample
 * that varies all of them at once across five accents around the hue wheel.
 * The single-axis half is what makes a failure READABLE (one axis moved); the
 * hypercube half is what catches two families fighting over a token.
 */
const HYPERCUBE_ACCENTS = [
  "oklch(0.62 0.2 25)",
  "oklch(0.78 0.16 85)",
  "oklch(0.6 0.18 150)",
  "oklch(0.58 0.2 245)",
  "oklch(0.6 0.2 310)",
] as const;

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor = target;
  for (const key of parts.slice(0, -1)) {
    cursor = (cursor[key] ??= {}) as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

/**
 * The pill coupling and the sharp-corner refusal, applied so a matrix entry is
 * a legal seed by construction. A shaped corner keeps its shape and takes the
 * `crisp` ramp, so the corner values stay covered.
 */
function couple(input: Record<string, unknown>): void {
  const shape = (input.shape ?? {}) as Record<string, unknown>;
  const controls = (input.controls ?? {}) as Record<string, unknown>;
  if (shape.radius === "pill" || controls.button === "pill") {
    setPath(input, "shape.radius", "pill");
    setPath(input, "controls.button", "pill");
  }
  if (shape.radius === "sharp" && shape.corner !== undefined && shape.corner !== "round") {
    setPath(input, "shape.radius", "crisp");
  }
}

function buildMatrix(): NormalizedSeed[] {
  const seeds: NormalizedSeed[] = [];
  // (a) one seed per enumerated axis value.
  for (const [path, values] of Object.entries(THEME_AXIS_VALUES)) {
    for (const value of values) {
      if (path === "type.pairing" && value === "custom") continue;
      // A theme name is spliced into eleven custom properties, so it has to be
      // kebab-case: `1.125` and `1.2` would otherwise end the identifier.
      const slug = String(value).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const input: Record<string, unknown> = { name: `axis-${path.replace(/\./g, "-")}-${slug}`, accent: ACCENT };
      setPath(input, path, value);
      couple(input);
      seeds.push(normalizeSeed(input as unknown as ThemeSeedInput));
    }
  }
  // (b) a Latin hypercube: every axis's values cycle at a different stride, so
  // no two axes stay in lockstep, and five accents ride around the wheel.
  const axes = Object.entries(THEME_AXIS_VALUES);
  const samples = 60;
  for (let i = 0; i < samples; i++) {
    const input: Record<string, unknown> = {
      name: `cube-${i}`,
      accent: HYPERCUBE_ACCENTS[i % HYPERCUBE_ACCENTS.length],
    };
    axes.forEach(([path, values], axisIndex) => {
      const value = values[(i * (axisIndex + 1) + axisIndex) % values.length];
      if (path === "type.pairing" && value === "custom") return;
      setPath(input, path, value);
    });
    couple(input);
    seeds.push(normalizeSeed(input as unknown as ThemeSeedInput));
  }
  return seeds;
}

const MATRIX = buildMatrix();

describe("the round trip · axesFromCss(generate(seed)) === seed", () => {
  it("covers every enumerated axis value and at least 60 combined seeds", () => {
    const enumerated = Object.entries(THEME_AXIS_VALUES)
      .flatMap(([path, values]) => values.map((value) => `${path}=${value}`))
      .filter((key) => key !== "type.pairing=custom");
    const seen = new Set<string>();
    for (const seed of MATRIX) {
      for (const [path, values] of Object.entries(THEME_AXIS_VALUES)) {
        const value = path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], seed);
        if ((values as readonly unknown[]).includes(value)) seen.add(`${path}=${value}`);
      }
    }
    expect([...enumerated].filter((key) => !seen.has(key))).toEqual([]);
    expect(MATRIX.filter((seed) => seed.name.startsWith("cube-")).length).toBeGreaterThanOrEqual(60);
  });

  it("derives every seed in the matrix back to its own axes", () => {
    for (const seed of MATRIX) {
      // `generateThemeBundle` runs the closed loop itself and throws on a
      // mismatch. The comparison below is independent of it: it reads the axes
      // off the manifest-bound block and holds them against the seed directly,
      // so the two would have to be wrong in the same way to both pass.
      const bundle = generateThemeBundle(seedRecord(seed), BASE_SOURCES);
      expect(validateThemeAxes(bundle.axes), seed.name).toEqual([]);
      expect(bundle.axes.type, seed.name).toEqual(seed.type);
      expect(bundle.axes.shape, seed.name).toEqual(seed.shape);
      expect(bundle.axes.decoration, seed.name).toEqual(seed.decoration);
      expect(bundle.axes.controls, seed.name).toEqual(seed.controls);
      for (const axis of ["scheme", "depth", "material", "motion", "density", "focus", "contrast"] as const) {
        expect(bundle.axes[axis], `${seed.name}/${axis}`).toBe(seed[axis]);
      }
      // …and the one documented collapse, stated as its own expectation.
      expect(bundle.axes.neutral, `${seed.name}/neutral`).toBe(
        neutralAxisFor(neutralTint(seed.neutral, cssColorToOklch(seed.accent)!.h)),
      );
      expect(bundle.axes.accent_hue, seed.name).toBeGreaterThanOrEqual(0);
      expect(bundle.axes.accent_hue, seed.name).toBeLessThan(360);
      expect(bundle.axes.accent_chroma, seed.name).toBeGreaterThan(0);
    }
  }, 300_000);

  it("is not vacuous: the loop rejects a stylesheet that derives something else", () => {
    // The gate's teeth, proven by handing it a prediction the CSS does not
    // meet. A renderer bug looks exactly like this from the inside.
    const seed = seedFor({ shape: { border: "heavy" }, focus: "glow" });
    const css = generateThemeBundle(seedRecord(seed), BASE_SOURCES).generated[0].css;
    const honest = generateThemeBundle(seedRecord(seed), BASE_SOURCES).axes;
    expect(() => assertAxesRoundTrip(css, BASE_SOURCES, honest, "probe")).not.toThrow();
    expect(() =>
      assertAxesRoundTrip(
        css,
        BASE_SOURCES,
        { ...honest, shape: { ...honest.shape, border: "hairline" }, focus: "ring" },
        "probe",
      ),
    ).toThrow(/shape\.border: seed says "hairline", the CSS derives "heavy"[\s\S]*focus: seed says "ring"/);
  });
});

describe("axis declarations reach the stylesheet", () => {
  it("writes every family's tokens into the one :root block", () => {
    const seed = seedFor({
      type: { pairing: "serif-editorial", scale: 1.25, base: 18, voice: { weight: "black", tracking: "wide", transform: "uppercase" } },
      shape: { radius: "crisp", border: "heavy", corner: "bevel" },
      depth: "hard",
      material: "grain",
      motion: "playful",
      density: "spacious",
      focus: "glow",
      decoration: { link: "thick", divider: "dashed" },
      controls: { input: "underline", checkbox: "round", switch: "square" },
    });
    const css = generateThemeBundle(seedRecord(seed), BASE_SOURCES).generated[0].css;
    for (const [name] of axisDeclarations(seed)) {
      expect(css, name).toContain(`--${name}`);
    }
    expect(css).toContain("/* @ui:density spacious */");
    expect(axesFromCss(css, BASE_SOURCES).density).toBe("spacious");
  });
});
