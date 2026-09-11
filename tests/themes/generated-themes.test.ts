// ═══════════════════════════════════════════════════════════════════════════
// The generated themes — a stylesheet is a pure function of its seed [1.1A-16]
// ═══════════════════════════════════════════════════════════════════════════
//
// 1.0's twelve themes were WRITTEN. 1.1A-16 ships the first six that were not:
// `editorial`, `swiss`, `neo`, `luxe`, `candy` and `organic` are each the output
// of `faqir theme generate <name> --seed registry/themes/<name>.seed.json`, and
// two of them (`editorial`, `swiss`) bring the print companion a seed with
// `document: true` produces.
//
// That makes them GENERATED ARTEFACTS, and this repository has one rule for
// those: the committed file must equal a fresh generation, byte for byte, or it
// is drift. `registry/core/faqir-core.js` has that rule, so do the theme
// manifests, the previews, the skill and the CDN package; these stylesheets now
// join them. The consequence worth stating plainly is that **a generated theme
// may not be hand-edited** — a tweak to `luxe.css` would survive exactly until
// the next regeneration, and the gate below is what turns that from a surprise
// into a failing test.
//
// Four things are pinned here:
//
//   1. **Reproducibility.** Every `<name>.seed.json` regenerates its own CSS —
//      and its companion's — byte for byte.
//   2. **Provenance.** The manifest's `seed` is the seed file, the manifest's
//      `axes` are what the seed asked for, and `visual_matrix` is `false`.
//   3. **The set.** The six are present, named, and each occupies a region of
//      the axis space that was empty before it.
//   4. **The corner-shape gate.** A measured refusal, in the shape 1.1A-15 used
//      for `divider: double` under 3px — see `corner-shape` below.

import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { generateThemeBundle } from "../../src/commands/theme-generate";
import { normalizeSeed } from "../../src/theme/seed";
import { themeBaseSources } from "../../src/theme/sources";
import { axesFromCss } from "../../src/theme/axes";
import {
  validateThemeSeed,
  type ThemeManifest,
  type ThemeSeed,
} from "../../src/theme-manifest";

const REGISTRY = join(import.meta.dir, "../../registry");
const THEMES_DIR = join(REGISTRY, "themes");
const TOKENS_DIR = join(REGISTRY, "tokens");

/** The base layer the generator reads — the same reader the CLI and MCP use. */
const BASE = themeBaseSources(REGISTRY);
/** The axis resolver reads the WHOLE token layer — see tests/themes/axes.test.ts. */
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .sort()
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));

const read = (file: string) => readFileSync(join(THEMES_DIR, file), "utf8");
const manifestOf = (name: string) =>
  JSON.parse(read(`${name}.theme.json`)) as ThemeManifest;

/**
 * Every theme with a seed file beside it. Discovered by globbing rather than
 * listed, so batch 2 (1.1A-17) joins this gate on the commit that adds it.
 */
const SEEDED = [...new Glob("*.seed.json").scanSync(THEMES_DIR)]
  .map((f) => f.replace(/\.seed\.json$/, ""))
  .sort();

/** The six this task shipped, named — so a deletion is a failure, not a smaller run. */
const BATCH_ONE = ["candy", "editorial", "luxe", "neo", "organic", "swiss"];

describe("the shipped generated themes", () => {
  it("is exactly batch 1 — six themes, each with a seed on disk", () => {
    expect(SEEDED).toEqual(BATCH_ONE);
    for (const name of SEEDED) {
      expect(existsSync(join(THEMES_DIR, `${name}.css`)), `${name}.css`).toBe(true);
      expect(existsSync(join(THEMES_DIR, `${name}.theme.json`)), `${name}.theme.json`).toBe(true);
      expect(existsSync(join(THEMES_DIR, `${name}.preview.html`)), `${name}.preview.html`).toBe(true);
    }
  });

  it("every seed file is a legal seed, complete, and names its own theme", () => {
    for (const name of SEEDED) {
      const seed = JSON.parse(read(`${name}.seed.json`)) as ThemeSeed;
      expect({ [name]: validateThemeSeed(seed) }).toEqual({ [name]: [] });
      expect(seed.name).toBe(name);
      // The CLI writes the NORMALISED seed, so every axis is present and a
      // reader never has to know the default table to know what was asked for.
      expect(normalizeSeed(seed as never)).toMatchObject({ name, accent: seed.accent });
    }
  });
});

describe("a generated stylesheet equals a fresh generation, byte for byte", () => {
  for (const name of SEEDED) {
    it(`${name}.css reproduces from ${name}.seed.json`, () => {
      const seed = JSON.parse(read(`${name}.seed.json`)) as ThemeSeed;
      const bundle = generateThemeBundle(seed as never, BASE);
      for (const file of bundle.generated) {
        expect(
          read(`${file.name}.css`),
          `${file.name}.css drifted — regenerate with ` +
            `'bun run dev theme generate ${name} --seed registry/themes/${name}.seed.json --out registry/themes'`,
        ).toBe(file.css);
      }
    });
  }

  it("is not vacuous: one changed axis produces a different stylesheet", () => {
    // The gate is only worth having if a seed edit actually moves the bytes.
    const seed = JSON.parse(read("neo.seed.json")) as ThemeSeed;
    const tampered = { ...seed, depth: seed.depth === "hard" ? "flat" : "hard" } as ThemeSeed;
    const before = generateThemeBundle(seed as never, BASE).generated[0].css;
    const after = generateThemeBundle(tampered as never, BASE).generated[0].css;
    expect(before).toBe(read("neo.css"));
    expect(after).not.toBe(before);
  });

  it("the print companions are reproduced by their PARENT's seed, not one of their own", () => {
    // A companion has no seed file: it is a second output of the parent's, which
    // is why `document: true` lives on the parent seed and why the companion
    // carries neither `seed` nor `axes` in its manifest [see distinctiveness].
    const companions = ["editorial-document", "swiss-document"];
    for (const companion of companions) {
      const parent = companion.replace(/-document$/, "");
      expect(existsSync(join(THEMES_DIR, `${companion}.seed.json`))).toBe(false);
      const seed = JSON.parse(read(`${parent}.seed.json`)) as ThemeSeed;
      expect(seed.document).toBe(true);
      const bundle = generateThemeBundle(seed as never, BASE);
      const file = bundle.generated.find((f) => f.name === companion)!;
      expect(read(`${companion}.css`)).toBe(file.css);
    }
    // And a seed without `document: true` produces no companion at all.
    for (const name of SEEDED.filter((n) => !companions.some((c) => c.startsWith(`${n}-`)))) {
      const seed = JSON.parse(read(`${name}.seed.json`)) as ThemeSeed;
      expect({ [name]: seed.document }).toEqual({ [name]: false });
      expect(generateThemeBundle(seed as never, BASE).generated.length).toBe(1);
    }
  });

  it("a generated theme's CSS is the generator's, not a hand-edit that happens to compile", () => {
    // The banner every generated stylesheet carries. It is what a reader who
    // opens `luxe.css` sees before the first declaration, and it names the one
    // thing they must not do.
    for (const name of SEEDED) {
      const css = read(`${name}.css`);
      expect(css.startsWith(`/* @ui:theme ${name} — generated from `)).toBe(true);
      expect(css).toContain("Regenerate instead of editing the accent ramp by hand.");
    }
  });
});

describe("provenance · what a generated manifest says about where it came from", () => {
  for (const name of SEEDED) {
    it(`${name}.theme.json carries the seed, the derived axes and visual_matrix: false`, () => {
      const manifest = manifestOf(name);
      const seed = JSON.parse(read(`${name}.seed.json`)) as ThemeSeed;

      // The seed block IS the seed file — one fact, not two that agree today.
      expect(manifest.seed).toEqual(seed);

      // The axes are DERIVED from the stylesheet, and the stylesheet derives
      // back to what the seed asked for. `generateThemeBundle` already refuses
      // to write a theme that does not (`assertAxesRoundTrip`); this is the
      // same property asserted against the file that actually shipped.
      const derived = axesFromCss(read(`${name}.css`), AXIS_BASE);
      expect(manifest.axes).toEqual(derived);
      const normalized = normalizeSeed(seed as never);
      expect({
        neutral: derived.neutral,
        scheme: derived.scheme,
        type: derived.type,
        shape: derived.shape,
        depth: derived.depth,
        material: derived.material,
        motion: derived.motion,
        density: derived.density,
        focus: derived.focus,
        decoration: derived.decoration,
        controls: derived.controls,
        contrast: derived.contrast,
      }).toEqual({
        // `neutral` is the one axis the seed does not always get verbatim: a
        // `tinted` neutral takes the ACCENT's hue, so an accent already inside
        // the warm or cool window produces a neutral the classifier rightly
        // calls warm or cool. `organic` and `candy` are both `tinted` seeds;
        // organic's olive lands in the warm window, candy's pink does not.
        neutral: derived.neutral,
        scheme: normalized.scheme,
        type: normalized.type,
        shape: normalized.shape,
        depth: normalized.depth,
        material: normalized.material,
        motion: normalized.motion,
        density: normalized.density,
        focus: normalized.focus,
        decoration: normalized.decoration,
        controls: normalized.controls,
        contrast: normalized.contrast,
      });

      // The matrix policy of 1.1A-13, applied by provenance.
      expect(manifest.visual_matrix).toBe(false);
    });
  }

  it("records the one documented place a derived axis differs from its seed", () => {
    // Stated as a measurement rather than left implicit in the loop above:
    // `tinted` borrows the accent's hue, so the axis reports the STYLESHEET.
    expect(manifestOf("organic").seed!.neutral).toBe("tinted");
    expect(manifestOf("organic").axes!.neutral).toBe("warm");
    expect(manifestOf("candy").seed!.neutral).toBe("tinted");
    expect(manifestOf("candy").axes!.neutral).toBe("tinted");
  });
});

describe("the six occupy regions of the axis space that were empty", () => {
  const axes = (name: string) => manifestOf(name).axes!;

  it("gives four axis values their first shipped example", () => {
    // Before this task no shipped theme rescaled its type, read at anything but
    // 16px, or laid itself out spaciously — three of §5.2's axes had exactly one
    // value between twelve themes, which is the sameness problem seen from the
    // vocabulary's side rather than from the palette's.
    expect(axes("editorial").type.scale).toBe(1.333);
    expect(axes("candy").type.scale).toBe(1.125);
    expect(axes("swiss").type.scale).toBe(1.25);
    expect(axes("editorial").type.base).toBe(17);
    expect(axes("neo").type.base).toBe(18);
    expect(new Set(BATCH_ONE.map((n) => axes(n).density))).toContain("spacious");
    // And four type pairings, a depth and a material nobody had shipped.
    const pairings = new Set(BATCH_ONE.map((n) => axes(n).type.pairing));
    expect(pairings).toEqual(
      new Set(["serif-editorial", "sans-grotesque", "serif-modern", "rounded", "sans-humanist"]),
    );
    expect(axes("neo").depth).toBe("hard");
    expect(axes("organic").material).toBe("grain");
  });

  it("ships the first dark-only theme with a light-capable registry around it", () => {
    // `luxe` is `scheme: "dark"`, which no 1.0 theme was: `terminal` and
    // `midnight` are dark-PRIMARY but honestly ship both. A dark-only theme
    // shares a scheme with fewer peers, so its colour distance is measured over
    // half as many readings — which is why it also takes `contrast: high`, and
    // reaches its nearest neighbour on colour rather than on axes alone.
    expect(axes("luxe").scheme).toBe("dark");
    expect(manifestOf("luxe").dark_mode).toBe("native");
    expect(manifestOf("luxe").distinctiveness!.token_distance).toBeGreaterThan(0.03);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// corner-shape — the axis a `sharp` theme cannot state            [1.1A-16]
// ═══════════════════════════════════════════════════════════════════════════
//
// Two of this task's seeds carried a corner shape and neither shipped it, and
// the reason is a MEASUREMENT rather than a preference. Rendered in Chrome 149,
// a filled box is pixel-identical under `corner-shape: round`, `bevel`, `scoop`
// and `notch` when its `border-radius` is `0` — there is no corner to shape —
// while at 4px and at 12px all three differ from `round`.
//
// So `shape.corner` is an axis only a ROUNDED theme can state. `neo`, whose
// brief is a sharp silhouette, would have declared a `bevel` that nothing draws:
// a new feature failing silently, which §3's invariants forbid, and the same
// class of dead axis that 1.1A-21 and 1.1A-24 track. (`organic` dropped its
// `scoop` for a different reason — it fought the round radius the theme asked
// for — and is not what this gate is about.)
//
// The gate has the shape 1.1A-15 gave `divider: double` under a 3px rule: refuse
// the combination that renders as nothing, and prove the refusal is not vacuous
// by planting it.

describe("no shipped theme declares a corner shape it cannot draw", () => {
  const THEME_FILES = [...new Glob("*.css").scanSync(THEMES_DIR)].sort();

  it("a non-round corner requires a non-zero radius", () => {
    const offenders: string[] = [];
    for (const file of THEME_FILES) {
      const name = file.replace(/\.css$/, "");
      const derived = axesFromCss(read(file), AXIS_BASE);
      if (derived.shape.corner !== "round" && derived.shape.radius === "sharp") {
        offenders.push(`${name}: ${derived.shape.corner} at radius 0`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is not vacuous: the combination neo was about to ship is refused", () => {
    // Planted on the real seed, so the gate is proven against the exact thing
    // it exists to stop rather than against a fixture that resembles it.
    const seed = JSON.parse(read("neo.seed.json")) as ThemeSeed;
    expect(seed.shape!.radius).toBe("sharp");
    expect(seed.shape!.corner).toBe("round");
    const planted = { ...seed, shape: { ...seed.shape, corner: "bevel" } } as ThemeSeed;
    const css = generateThemeBundle(planted as never, BASE).generated[0].css;
    const derived = axesFromCss(css, AXIS_BASE);
    expect(derived.shape).toEqual({ radius: "sharp", border: "heavy", corner: "bevel" });
    expect(derived.shape.corner !== "round" && derived.shape.radius === "sharp").toBe(true);
  });

  it("a rounded theme may still state one — the axis is not banned, only the no-op", () => {
    const seed = JSON.parse(read("organic.seed.json")) as ThemeSeed;
    expect(seed.shape!.radius).toBe("round");
    const scooped = { ...seed, shape: { ...seed.shape, corner: "scoop" } } as ThemeSeed;
    const derived = axesFromCss(
      generateThemeBundle(scooped as never, BASE).generated[0].css,
      AXIS_BASE,
    );
    expect(derived.shape).toEqual({ radius: "round", border: "hairline", corner: "scoop" });
    expect(derived.shape.corner !== "round" && derived.shape.radius === "sharp").toBe(false);
  });
});
