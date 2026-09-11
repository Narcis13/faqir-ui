// ═══════════════════════════════════════════════════════════════════════════
// The generated themes — a stylesheet is a pure function of its seed [1.1A-16/17]
// ═══════════════════════════════════════════════════════════════════════════
//
// 1.0's twelve themes were WRITTEN. 1.1A-16 shipped the first six that were not
// — `editorial`, `swiss`, `neo`, `luxe`, `candy`, `organic` — and 1.1A-17 the
// second six: `clinical`, `fintech`, `nordic`, `sunset`, `ink` and `neumorph`.
// Each is the output of `faqir theme generate <name> --seed
// registry/themes/<name>.seed.json`, and three of them (`editorial`, `swiss`,
// `ink`) bring the print companion a seed with `document: true` produces.
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
//   3. **The set.** The twelve are present, named, and each occupies a region
//      of the axis space that was empty before it.
//   4. **The population gate [1.1A-17].** Every value of the four STRUCTURAL
//      axes — `depth`, `controls.input`, `material`, `motion` — is rendered by
//      some shipped theme, and the values that hang on a single theme are named.
//   5. **The corner-shape gate.** A measured refusal, in the shape 1.1A-15 used
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
  THEME_AXIS_VALUES,
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

/** The six 1.1A-16 shipped, named — so a deletion is a failure, not a smaller run. */
const BATCH_ONE = ["candy", "editorial", "luxe", "neo", "organic", "swiss"];
/** The six 1.1A-17 shipped, on the same terms. */
const BATCH_TWO = ["clinical", "fintech", "ink", "neumorph", "nordic", "sunset"];
/** Both batches, in the order `SEEDED` discovers them (sorted). */
const GENERATED = [...BATCH_ONE, ...BATCH_TWO].sort();

describe("the shipped generated themes", () => {
  it("is both batches — twelve themes, each with a seed on disk", () => {
    expect(SEEDED).toEqual(GENERATED);
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
    const companions = ["editorial-document", "ink-document", "swiss-document"];
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

describe("batch 2 fills the four axes the vocabulary had only defined [1.1A-17]", () => {
  const axes = (name: string) => manifestOf(name).axes!;

  it("ships the first `depth: inset` theme and the first `material: dots` one", () => {
    // `inset` was the last unshipped depth and the reason `neumorph` is in the
    // batch at all: a pressed surface is a look nothing in the registry had.
    expect(axes("neumorph").depth).toBe("inset");
    // `dots` was the last unshipped material. The plan's brief for `clinical`
    // said `material: none`; it takes the dot field instead, because this
    // task's own test asks the axis space to be POPULATED and `none` would have
    // left one value of seven with no example anywhere in the registry.
    expect(axes("clinical").material).toBe("dots");
  });

  it("`ink` is the first generated theme with an underline silhouette", () => {
    // The plan calls this the proof of 1.1A-05's control tokens: `document-serif`
    // authored the same silhouette by hand, and this is a SEED asking for it.
    expect(axes("ink").controls.input).toBe("underline");
    expect(manifestOf("ink").seed!.controls!.input).toBe("underline");
    // …and the first light-only generated theme, measured rather than chosen:
    // a warm near-monochrome dark page is `luxe`'s dark page (0.0192 ΔE at its
    // closest), which no seed axis moves — see the distinctiveness suite.
    expect(axes("ink").scheme).toBe("light");
    expect(manifestOf("ink").dark_mode).toBe("none");
  });

  it("adds the two type pairings and the type voice nobody had shipped", () => {
    // `sans-geometric` and `slab` were the last two text pairings with no
    // example; `custom` is derived-only and `normalizeSeed` refuses it, so the
    // vocabulary is now fully populated as far as a seed can populate it.
    expect(axes("fintech").type.pairing).toBe("sans-geometric");
    expect(axes("nordic").type.pairing).toBe("sans-geometric");
    expect(axes("ink").type.pairing).toBe("slab");
    // And `medium`, the one heading weight no theme had ever set — `clinical`
    // and `neumorph` both want a heading that states itself without shouting.
    // `nordic` reads at `regular`, which is what "geometric light" asks for.
    expect(axes("clinical").type.voice!.weight).toBe("medium");
    expect(axes("neumorph").type.voice!.weight).toBe("medium");
    expect(axes("nordic").type.voice!.weight).toBe("regular");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The axis space is POPULATED, not just defined                    [1.1A-17]
// ═══════════════════════════════════════════════════════════════════════════
//
// The task's Tests block asks for this in as many words: "at least one shipped
// theme per value of `depth`, `controls.input`, `material` and `motion`". These
// are the four axes whose values are STRUCTURAL rather than a matter of taste —
// each one changes what a component draws — so a value nobody ships is a value
// nobody has ever seen rendered, which is how a dead axis survives a review.
//
// The assertion has two halves. The first is the requirement itself. The second
// pins the values with exactly ONE example: those are the fragile ones, and a
// theme edit that moves the only `inset` depth in the registry should be a
// visible diff here rather than a silent loss of coverage.

describe("every value of the four structural axes has a shipped example", () => {
  const PEERS = [...new Glob("*.theme.json").scanSync(THEMES_DIR)]
    .map((f) => f.replace(/\.theme\.json$/, ""))
    .sort()
    .filter((name) => manifestOf(name).axes != null);

  /** `axis value → the themes that ship it`, for one dotted axis path. */
  function examples(path: string): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const name of PEERS) {
      const value = String(
        path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], manifestOf(name).axes!),
      );
      (out[value] ??= []).push(name);
    }
    return out;
  }

  for (const path of ["depth", "controls.input", "material", "motion"] as const) {
    it(`${path} — every value in the vocabulary is rendered by some theme`, () => {
      const shipped = examples(path);
      const vocabulary = THEME_AXIS_VALUES[path] as readonly string[];
      const missing = vocabulary.filter((value) => (shipped[value] ?? []).length === 0);
      expect({ [path]: missing }).toEqual({ [path]: [] });
      // Not vacuous: the sweep must have read the whole shipped set.
      expect(PEERS.length).toBe(24);
      expect(Object.values(shipped).flat().length).toBe(PEERS.length);
    });
  }

  it("names the values that hang on a single theme", () => {
    const sole: Record<string, string> = {};
    for (const path of ["depth", "controls.input", "material", "motion"] as const) {
      for (const [value, themes] of Object.entries(examples(path))) {
        if (themes.length === 1) sole[`${path}=${value}`] = themes[0];
      }
    }
    expect(sole).toEqual({
      // Three depths, each the whole argument for the theme that carries it.
      "depth=hard": "neo",
      "depth=glass": "glass",
      "depth=inset": "neumorph",
      // Three materials. `grid`, `paper` and `mesh` have two or three each.
      "material=grain": "organic",
      "material=dots": "clinical",
      "material=stripes": "terminal",
      // A theme that does not animate, and one that animates the most.
      "motion=none": "document",
      "motion=playful": "neo",
    });
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
