// ═══════════════════════════════════════════════════════════════════════════
// Theme manifest gate — every theme has a valid, CSS-consistent manifest  [0.4-12]
// ═══════════════════════════════════════════════════════════════════════════
//
// Every shipped theme ships `registry/themes/{name}.theme.json` next to its
// stylesheet. The two token fields are DERIVED from the CSS (never hand-written):
// this suite re-derives them and asserts the stored manifest still matches, so a
// hand-edit that drifts from the CSS — or a new override added to the CSS without
// regenerating — fails CI. Regenerate with `bun run gen:theme-manifests`.
//
// Fully data-driven: themes are globbed, the base surface is parsed from
// registry/tokens/*.css. Adding a sixth theme needs no edits here — only a seed
// entry in the generator and a fresh run.

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import {
  validateThemeManifest,
  validateThemeAxes,
  overriddenTokens,
  inheritedTokens,
  surfaceTokens,
  isSurfaceTokenFile,
  THEME_AXIS_VALUES,
  THEME_DERIVED_AXES,
  THEME_SEED_DEFAULTS,
  type ThemeAxes,
  type ThemeManifest,
} from "../../src/theme-manifest";
import { axesFromCss } from "../../src/theme/axes";

const REGISTRY = join(import.meta.dir, "../../registry");
const THEMES_DIR = join(REGISTRY, "themes");
const TOKENS_DIR = join(REGISTRY, "tokens");

// The base token surface — every base stylesheet minus raw palette primitives.
const BASE_SOURCES = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .filter(isSurfaceTokenFile)
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));
const SURFACE = surfaceTokens(BASE_SOURCES);

// The axis resolver reads the WHOLE token layer, not just the themeable surface:
// a token a theme may not re-declare is still a token its `var()` chains
// terminate at. Same list `gen:theme-manifests` passes to `axesFromCss`.
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .sort()
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));

// Themes discovered by globbing (no hand-maintained list).
const THEME_FILES = [...new Glob("*.css").scanSync(THEMES_DIR)].sort();

function readManifestRaw(cssFile: string): { path: string; json: unknown } {
  const path = join(THEMES_DIR, cssFile.replace(/\.css$/, ".theme.json"));
  return { path, json: JSON.parse(readFileSync(path, "utf8")) };
}

describe("theme manifest · every theme has one", () => {
  it("discovers the shipped themes by globbing", () => {
    expect(THEME_FILES.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of THEME_FILES) {
    it(`${file} has a sibling ${file.replace(/\.css$/, ".theme.json")}`, () => {
      const path = join(THEMES_DIR, file.replace(/\.css$/, ".theme.json"));
      expect(existsSync(path)).toBe(true);
    });
  }
});

describe("theme manifest · schema validation", () => {
  for (const file of THEME_FILES) {
    it(`${file} manifest passes schema validation`, () => {
      const { json } = readManifestRaw(file);
      expect(validateThemeManifest(json)).toEqual([]);
    });
  }

  it("manifest name matches the stylesheet filename", () => {
    for (const file of THEME_FILES) {
      const { json } = readManifestRaw(file);
      expect((json as ThemeManifest).name).toBe(file.replace(/\.css$/, ""));
    }
  });
});

describe("theme manifest · tokens are CSS-consistent (generated, then asserted)", () => {
  for (const file of THEME_FILES) {
    it(`${file} tokens_overridden exactly matches the parsed CSS`, () => {
      const css = readFileSync(join(THEMES_DIR, file), "utf8");
      const { json } = readManifestRaw(file);
      const manifest = json as ThemeManifest;
      // Re-derive from the CSS and compare to what's stored on disk.
      expect(manifest.tokens_overridden).toEqual(overriddenTokens(css));
    });

    it(`${file} tokens_inherited is exactly surface − overridden`, () => {
      const css = readFileSync(join(THEMES_DIR, file), "utf8");
      const { json } = readManifestRaw(file);
      const manifest = json as ThemeManifest;
      expect(manifest.tokens_inherited).toEqual(inheritedTokens(css, SURFACE));
    });

    it(`${file} axes exactly match a fresh derivation from the CSS [1.1A-08]`, () => {
      const css = readFileSync(join(THEMES_DIR, file), "utf8");
      const manifest = readManifestRaw(file).json as ThemeManifest;
      // The third derived field. A hand-edited axis is drift, exactly like a
      // hand-edited `tokens_overridden` — regenerate with gen:theme-manifests.
      expect(manifest.axes).toEqual(axesFromCss(css, AXIS_BASE));
    });

    it(`${file} overridden and inherited never overlap`, () => {
      const { json } = readManifestRaw(file);
      const manifest = json as ThemeManifest;
      const inherited = new Set(manifest.tokens_inherited);
      const overlap = manifest.tokens_overridden.filter((t) => inherited.has(t));
      expect(overlap).toEqual([]);
    });
  }
});

// ── Proof the derived-axes gate has teeth ──
describe("theme manifest · a hand-edited axis is drift [1.1A-08]", () => {
  const file = THEME_FILES[0];
  const css = readFileSync(join(THEMES_DIR, file), "utf8");
  const stored = (readManifestRaw(file).json as ThemeManifest).axes!;

  it("the stored block is what the CSS says, not what someone typed", () => {
    expect(stored).toEqual(axesFromCss(css, AXIS_BASE));
  });

  it("changing one leaf breaks the comparison", () => {
    // Every classifier the gate runs is only as good as this: edit a value the
    // stylesheet does not support, and the re-derivation no longer matches.
    const tampered = { ...stored, depth: stored.depth === "flat" ? "glass" : "flat" } as ThemeAxes;
    expect(tampered).not.toEqual(axesFromCss(css, AXIS_BASE));
    const nested = { ...stored, shape: { ...stored.shape, corner: "notch" } } as ThemeAxes;
    expect(nested).not.toEqual(axesFromCss(css, AXIS_BASE));
  });

  it("dropping an axis breaks it too — a derived block is complete or it is wrong", () => {
    const { contrast: _dropped, ...partial } = stored as unknown as Record<string, unknown>;
    expect(partial).not.toEqual(axesFromCss(css, AXIS_BASE) as unknown as Record<string, unknown>);
    expect(validateThemeAxes(partial).map((e) => e.field)).toContain("axes.contrast");
  });

  it("a CSS change the manifest has not caught up with fails the same way", () => {
    // The other direction: the stylesheet moves, the manifest does not.
    const edited = `${css}\n:root { --divider-style: dashed; }\n`;
    expect(stored).not.toEqual(axesFromCss(edited, AXIS_BASE));
    expect(axesFromCss(edited, AXIS_BASE).decoration.divider).toBe("dashed");
  });
});

// ── The surface itself: what a theme may re-declare ──
describe("theme manifest · the token surface", () => {
  // 1.1A-01 added the three type ROLES plus the four heading-voice knobs. Pinned
  // as a count so a token quietly added to (or dropped from) tokens/*.css shows
  // up here as a number that moved, and as names so the 1.1 type contract cannot
  // be renamed without this failing.
  const ROLE_TOKENS = [
    "font-heading",
    "font-body",
    "font-ui",
    "heading-weight",
    "heading-tracking",
    "heading-transform",
    "heading-leading",
  ];

  it("is 280 tokens — 241 plus shape, focus, depth, material, motion, decoration and controls [1.1A-02 … 1.1A-05]", () => {
    // 1.1A-02 added five border-width steps/roles, --corner-shape, the five
    // focus tokens, and the two component silhouette aliases: 241 + 13.
    // 1.1A-04 added four: --shadow-color and --surface-backdrop (depth), and
    // the two --texture-* ROLES (material). The six named textures in
    // tokens/textures.css are deliberately NOT here — that file is a palette no
    // component reads, excluded via NON_SURFACE_TOKEN_FILES, so a theme
    // re-points a role instead of inheriting six data URIs it cannot use.
    // 1.1A-05 added twenty-two: two motion (--ease-spring, --motion-hover-lift),
    // eight decoration (the three --link-*, --divider-style, --stripe-bg, the
    // two --selection-* and --marker-color) and twelve controls
    // (--button-text-transform, --input-fill, --input-bg-filled, and the
    // checkbox/switch geometry that naming --checkbox-radius obliged — see
    // tests/tokens/motion-decoration-controls.test.ts on why the zebra is
    // --stripe-bg and not --table-stripe).
    expect(SURFACE.length).toBe(280);
  });

  it("the depth and material tokens a theme can reach are exactly the four roles", () => {
    expect(SURFACE.filter((t) => t.startsWith("texture-"))).toEqual([
      "texture-page",
      "texture-surface",
    ]);
    expect(SURFACE).toContain("shadow-color");
    expect(SURFACE).toContain("surface-backdrop");
  });

  it("contains every type role and voice token", () => {
    expect(ROLE_TOKENS.filter((t) => !SURFACE.includes(t))).toEqual([]);
  });

  it("every theme accounts for them — inherited unless it overrides them", () => {
    for (const file of THEME_FILES) {
      const manifest = readManifestRaw(file).json as ThemeManifest;
      const known = new Set([...manifest.tokens_inherited, ...manifest.tokens_overridden]);
      expect({ [file]: ROLE_TOKENS.filter((t) => !known.has(t)) }).toEqual({ [file]: [] });
    }
  });

  // 1.1A-02: the two families a theme needs to state a silhouette and a ring.
  const SHAPE_FOCUS_TOKENS = [
    "border-width-sm",
    "border-width-md",
    "border-width-lg",
    "border-width",
    "border-width-strong",
    "corner-shape",
    "focus-ring-width",
    "focus-ring-offset",
    "focus-ring-style",
    "focus-ring-color",
    "focus-shadow",
    "card-border-width",
    "input-border-width",
  ];

  it("contains every shape and focus token [1.1A-02]", () => {
    expect(SHAPE_FOCUS_TOKENS.filter((t) => !SURFACE.includes(t))).toEqual([]);
  });

  it("every theme accounts for the shape and focus families too", () => {
    for (const file of THEME_FILES) {
      const manifest = readManifestRaw(file).json as ThemeManifest;
      const known = new Set([...manifest.tokens_inherited, ...manifest.tokens_overridden]);
      expect({ [file]: SHAPE_FOCUS_TOKENS.filter((t) => !known.has(t)) }).toEqual({ [file]: [] });
    }
  });
});

// ── Proof the schema gate has teeth ──
describe("theme manifest · validator rejects malformed manifests", () => {
  const valid: ThemeManifest = {
    name: "x",
    version: "1.0.0",
    mood: ["neutral"],
    scheme: "both",
    dark_mode: "native",
    tokens_overridden: ["color-bg"],
    tokens_inherited: ["space-4"],
    pairs_with: [],
    preview: "x.preview.html",
  };

  it("accepts a well-formed manifest", () => {
    expect(validateThemeManifest(valid)).toEqual([]);
  });

  it("rejects a non-object", () => {
    expect(validateThemeManifest("nope").length).toBe(1);
  });

  it("rejects an unknown scheme", () => {
    const errors = validateThemeManifest({ ...valid, scheme: "sepia" });
    expect(errors.some((e) => e.field === "scheme")).toBe(true);
  });

  it("rejects an empty mood array", () => {
    const errors = validateThemeManifest({ ...valid, mood: [] });
    expect(errors.some((e) => e.field === "mood")).toBe(true);
  });

  it("rejects empty tokens_overridden", () => {
    const errors = validateThemeManifest({ ...valid, tokens_overridden: [] });
    expect(errors.some((e) => e.field === "tokens_overridden")).toBe(true);
  });

  it("rejects scheme/dark_mode inconsistency", () => {
    // light-only scheme must pair with dark_mode: none
    const errors = validateThemeManifest({ ...valid, scheme: "light", dark_mode: "native" });
    expect(errors.some((e) => e.field === "dark_mode")).toBe(true);
  });

  it("accepts a consistent light-only manifest", () => {
    expect(validateThemeManifest({ ...valid, scheme: "light", dark_mode: "none" })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Schema 1.1 — the five optional theme fields                      [1.1A-07]
// ═══════════════════════════════════════════════════════════════════════════
//
// "Optional" is a statement about absence, not about contents. A manifest
// without any of them is exactly as valid as it was under 1.0 — that is the
// freeze — and a manifest WITH one has it validated in full, because a seed
// nobody checks is a theme that silently comes out wrong.

describe("theme manifest · the optional 1.1 fields", () => {
  const valid: ThemeManifest = {
    name: "x",
    version: "1.0.0",
    mood: ["neutral"],
    scheme: "both",
    dark_mode: "native",
    tokens_overridden: ["color-bg"],
    tokens_inherited: ["space-4"],
    pairs_with: [],
    preview: "x.preview.html",
  };

  /** A complete derived block — every one of the fourteen keys. */
  const axes: ThemeAxes = {
    accent_hue: 250,
    accent_chroma: 0.2,
    neutral: "cool",
    scheme: "both",
    type: { pairing: "system", scale: 1.2, base: 16, voice: { weight: "bold", tracking: "normal", transform: "none" } },
    shape: { radius: "soft", border: "hairline", corner: "round" },
    depth: "soft",
    material: "none",
    motion: "smooth",
    density: "comfortable",
    focus: "ring",
    decoration: { link: "offset", divider: "solid" },
    controls: { button: "soft", input: "box", checkbox: "square", switch: "pill" },
    contrast: "standard",
  };

  it("accepts a manifest with none of them — absence is the freeze", () => {
    expect(validateThemeManifest(valid)).toEqual([]);
  });

  it("every shipped theme declares `axes` and nothing else from 1.1", () => {
    // 1.1A-07 shipped the five fields and left every manifest without them.
    // 1.1A-08 fills in exactly ONE of them, and it is the derived one — a
    // shipped theme is authored, so it has no `seed`; `fonts` waits on the OFL
    // catalog (1.1A-18), `distinctiveness` on the pair gate (1.1A-12), and
    // `visual_matrix` on the matrix policy (1.1A-13).
    for (const file of THEME_FILES) {
      const manifest = readManifestRaw(file).json as ThemeManifest;
      expect(manifest.axes, `${file} has no derived axes`).toBeDefined();
      for (const field of ["seed", "fonts", "distinctiveness", "visual_matrix"] as const) {
        expect(manifest[field], `${file} already declares ${field}`).toBeUndefined();
      }
    }
  });

  it("holds every shipped theme's axes to the full derived-block rules", () => {
    // The validator, not just the equality check above: every one of the
    // fourteen keys present, every value inside its vocabulary, the accent
    // inside the OKLCH ranges.
    for (const file of THEME_FILES) {
      const manifest = readManifestRaw(file).json as ThemeManifest;
      expect({ [file]: validateThemeAxes(manifest.axes) }).toEqual({ [file]: [] });
    }
  });

  it("accepts a manifest with all five", () => {
    expect(
      validateThemeManifest({
        ...valid,
        seed: { name: "x", accent: "oklch(0.62 0.2 250)", neutral: "cool", shape: { radius: "round" } },
        axes,
        fonts: [{ family: "Fraunces", license: "OFL-1.1", role: "heading", source: "google-fonts" }],
        distinctiveness: { nearest: "paper", axis_distance: 6, token_distance: 0.41 },
        visual_matrix: false,
      }),
    ).toEqual([]);
  });

  it("takes `{ name, accent }` as a complete seed", () => {
    // The acceptance criterion, made mechanical: every other axis defaults, so
    // the shortest seed the generator can be handed is two fields.
    expect(validateThemeManifest({ ...valid, seed: { name: "x", accent: "#3b82f6" } })).toEqual([]);
    expect(new Set(Object.keys(THEME_SEED_DEFAULTS))).toEqual(
      new Set([
        ...Object.keys(THEME_AXIS_VALUES),
        "document",
      ]),
    );
  });

  it("rejects a seed with no accent", () => {
    const errors = validateThemeManifest({ ...valid, seed: { name: "x" } });
    expect(errors.map((e) => e.field)).toContain("seed.accent");
  });

  it("rejects a value outside an axis vocabulary, however deep", () => {
    const shallow = validateThemeManifest({ ...valid, seed: { name: "x", accent: "#333", depth: "fluffy" } });
    expect(shallow.map((e) => e.field)).toEqual(["seed.depth"]);
    expect(shallow[0].message).toContain("flat, soft, layered, hard, glass, inset");

    const deep = validateThemeManifest({
      ...valid,
      seed: { name: "x", accent: "#333", type: { voice: { transform: "shouty" } } },
    });
    expect(deep.map((e) => e.field)).toEqual(["seed.type.voice.transform"]);
  });

  it("rejects a misspelled axis rather than ignoring it", () => {
    // The failure mode this guards: a seed that generates a theme missing the
    // axis its author thought they had set.
    expect(
      validateThemeManifest({ ...valid, seed: { name: "x", accent: "#333", raduis: "soft" } }).map((e) => e.field),
    ).toEqual(["seed.raduis"]);
    expect(
      validateThemeManifest({ ...valid, seed: { name: "x", accent: "#333", shape: { rounding: "soft" } } }).map(
        (e) => e.field,
      ),
    ).toEqual(["seed.shape.rounding"]);
  });

  it("requires every one of the fourteen derived axes", () => {
    expect(validateThemeManifest({ ...valid, axes })).toEqual([]);
    expect(THEME_DERIVED_AXES.length).toBe(14);
    for (const axis of THEME_DERIVED_AXES) {
      const { [axis]: _dropped, ...partial } = axes as unknown as Record<string, unknown>;
      const errors = validateThemeManifest({ ...valid, axes: partial });
      expect(errors.map((e) => e.field), `dropping axes.${axis} was accepted`).toContain(`axes.${axis}`);
    }
  });

  it("holds the derived accent to the OKLCH ranges", () => {
    expect(validateThemeManifest({ ...valid, axes: { ...axes, accent_hue: 400 } }).map((e) => e.field)).toEqual([
      "axes.accent_hue",
    ]);
    expect(validateThemeManifest({ ...valid, axes: { ...axes, accent_chroma: -0.1 } }).map((e) => e.field)).toEqual([
      "axes.accent_chroma",
    ]);
    expect(validateThemeManifest({ ...valid, axes: { ...axes, accent_hue: 0 } })).toEqual([]);
  });

  it("checks a font's licence and role", () => {
    const bad = validateThemeManifest({ ...valid, fonts: [{ family: "Fraunces", role: "display" }] });
    expect(bad.map((e) => e.field).sort()).toEqual(["fonts[0].license", "fonts[0].role"]);
    expect(validateThemeManifest({ ...valid, fonts: [] })).toEqual([]);
  });

  it("counts axes in whole numbers", () => {
    const errors = validateThemeManifest({
      ...valid,
      distinctiveness: { nearest: "paper", axis_distance: 6.5, token_distance: 0.41 },
    });
    expect(errors.map((e) => e.field)).toEqual(["distinctiveness.axis_distance"]);
  });

  it("rejects a non-boolean visual_matrix — absence is how a theme opts in", () => {
    expect(validateThemeManifest({ ...valid, visual_matrix: "yes" }).map((e) => e.field)).toEqual(["visual_matrix"]);
    expect(validateThemeManifest({ ...valid, visual_matrix: true })).toEqual([]);
  });
});
