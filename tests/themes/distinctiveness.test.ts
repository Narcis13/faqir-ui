// ═══════════════════════════════════════════════════════════════════════════
// Distinctiveness — the gate against the sameness problem          [1.1A-12]
// ═══════════════════════════════════════════════════════════════════════════
//
// 1.0 shipped twelve themes that read as one. FAQIR-VISION §5.2 names the rule
// that stops it recurring — two shipped themes must differ on at least four of
// the fourteen axes — and this file is where that rule, and the colour measure
// beside it, are pinned.
//
// Four things happen here:
//
//   1. **The two measures, in isolation.** Axis distance over synthetic axes
//      (identical, partially different, wholly different) and token distance
//      over synthetic stylesheets, where identity and symmetry are properties
//      that must hold rather than numbers someone typed.
//   2. **The 276 shipped pairs, pinned.** Every pair of the twenty-four shipped
//      themes, with the numbers MEASURED in this task's session. A theme CSS
//      edit that moves a pair shows up here as a diff, which is the difference
//      between a deliberate change and drift. A generated theme's PRINT
//      COMPANION is not among them — see `PEER_NAMES`, and the describe that
//      measures why it cannot be.
//   3. **The obligations.** Empty since 1.1A-15, and asserted to be: the
//      sameness problem went 21 failing pairs (1.1A-12) → 8 (1.1A-14) → 0, and
//      `armed` in that describe is the assertion rather than a note.
//   4. **The refusal.** The generator declines to write a look-alike, names the
//      collision, and writes it anyway under `--allow-similar` — with the
//      scorecard recording that it did.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Glob } from "bun";
import {
  ACCENT_CHROMA_BUCKET,
  ACCENT_HUE_BUCKET_DEG,
  AXIS_MIN,
  TOKEN_MIN,
  axisDistance,
  collisionMessage,
  collisions,
  colorSurfaceTokens,
  distinctiveness,
  distinctivenessContext,
  hueDistance,
  nearest,
  prepareTheme,
  sharedSchemes,
  type DistinctivenessTheme,
} from "../../src/theme/distinctiveness";
import { ELEVATION_MIN_DELTA } from "../../src/audit/contrast-tokens";
import { axesFromCss } from "../../src/theme/axes";
import { generateThemeBundle, themeScorecard } from "../../src/commands/theme-generate";
import { theme } from "../../src/commands/theme";
import { readPeerThemes, themeBaseSources } from "../../src/theme/sources";
import {
  isSurfaceTokenFile,
  THEME_DERIVED_AXES,
  validateThemeManifest,
  type ThemeAxes,
  type ThemeManifest,
} from "../../src/theme-manifest";

const REGISTRY = join(import.meta.dir, "../../registry");
const THEMES_DIR = join(REGISTRY, "themes");
const TOKENS_DIR = join(REGISTRY, "tokens");

const BASE_SOURCES = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .filter(isSurfaceTokenFile)
  .sort()
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));
// The axis resolver reads the WHOLE token layer — see tests/themes/axes.test.ts.
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .sort()
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));

const CONTEXT = distinctivenessContext(BASE_SOURCES);

// Sorted by NAME, not by filename: `document-serif.css` sorts before
// `document.css` (a hyphen is below a dot), and the pinned table below reads in
// theme order.
const THEME_NAMES = [...new Glob("*.css").scanSync(THEMES_DIR)].map((f) => f.replace(/\.css$/, "")).sort();

const manifestOf = (name: string) =>
  JSON.parse(readFileSync(join(THEMES_DIR, `${name}.theme.json`), "utf8")) as ThemeManifest;

/**
 * Which shipped stylesheets this gate judges.
 *
 * A theme with an `axes` block is a theme in its own right; one without is the
 * print companion a seed with `document: true` emits (1.1A-16). That is not a
 * carve-out invented here — it is the rule `readPeerThemes` has stated since
 * 1.1A-12 ("a theme with no `axes` block is SKIPPED rather than guessed at"),
 * read off the manifests the registry generator writes. `companionExclusion`
 * below measures WHY it cannot be otherwise.
 */
const PEER_NAMES = THEME_NAMES.filter((name) => manifestOf(name).axes != null);
const COMPANION_NAMES = THEME_NAMES.filter((name) => manifestOf(name).axes == null);

/**
 * The shipped set as the gate reads it. The axes are DERIVED here rather than
 * read from the manifest, so this file measures the stylesheets and never
 * checks a stored block against itself.
 */
const SHIPPED = PEER_NAMES.map((name) => {
  const css = readFileSync(join(THEMES_DIR, `${name}.css`), "utf8");
  return prepareTheme(
    { name, css, scheme: manifestOf(name).scheme, axes: axesFromCss(css, AXIS_BASE) },
    CONTEXT,
  );
});

// ── Synthetic axes, for the arithmetic ──────────────────────────────────────

/** A complete derived block — every one of the fourteen present, as the schema requires. */
function axes(overrides: Partial<ThemeAxes> = {}): ThemeAxes {
  return {
    accent_hue: 264,
    accent_chroma: 0.22,
    neutral: "gray",
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
    ...overrides,
  };
}

describe("axis distance · the vision's four-axis rule, counted", () => {
  it("is zero on identity, and the fourteen are the manifest's fourteen", () => {
    const result = axisDistance(axes(), axes());
    expect(result).toEqual({ distance: 0, differing: [] });
    expect(THEME_DERIVED_AXES.length).toBe(14);
  });

  it("is fourteen when every axis moves", () => {
    const other = axes({
      accent_hue: 120,
      accent_chroma: 0.05,
      neutral: "warm",
      scheme: "light",
      type: { pairing: "mono", scale: 1.333, base: 18, voice: { weight: "regular", tracking: "wide", transform: "uppercase" } },
      shape: { radius: "pill", border: "heavy", corner: "bevel" },
      depth: "glass",
      material: "grain",
      motion: "playful",
      density: "compact",
      focus: "glow",
      decoration: { link: "thick", divider: "dashed" },
      controls: { button: "pill", input: "underline", checkbox: "round", switch: "square" },
      contrast: "high",
    });
    const result = axisDistance(axes(), other);
    expect(result.distance).toBe(THEME_DERIVED_AXES.length);
    expect(result.differing).toEqual([...THEME_DERIVED_AXES]);
  });

  it("counts partial difference, and names which axes moved", () => {
    const result = axisDistance(axes(), axes({ depth: "hard", motion: "snappy", focus: "inset" }));
    expect(result).toEqual({ distance: 3, differing: ["depth", "motion", "focus"] });
  });

  it("is symmetric", () => {
    const a = axes();
    const b = axes({ material: "paper", contrast: "high" });
    expect(axisDistance(a, b)).toEqual(axisDistance(b, a));
  });

  it("counts a COMPOUND axis once, however many of its leaves moved", () => {
    // The vision counts `shape` as ONE axis whose value is a radius, a border
    // weight and a corner shape together — so a theme that changes all three
    // has moved one axis, not three. Otherwise `controls` (four leaves) would
    // be worth four times `depth`, and the four-axis rule would mean something
    // different depending on which axes a theme chose to state.
    const oneLeaf = axisDistance(axes(), axes({ shape: { radius: "pill", border: "hairline", corner: "round" } }));
    const everyLeaf = axisDistance(axes(), axes({ shape: { radius: "pill", border: "heavy", corner: "notch" } }));
    expect(oneLeaf).toEqual({ distance: 1, differing: ["shape"] });
    expect(everyLeaf).toEqual({ distance: 1, differing: ["shape"] });
  });

  it("compares the two continuous accent axes as buckets", () => {
    const near = axes({ accent_hue: 264 + ACCENT_HUE_BUCKET_DEG - 1 });
    const far = axes({ accent_hue: 264 + ACCENT_HUE_BUCKET_DEG });
    expect(axisDistance(axes(), near).differing).toEqual([]);
    expect(axisDistance(axes(), far).differing).toEqual(["accent_hue"]);

    const sameChroma = axes({ accent_chroma: 0.22 - ACCENT_CHROMA_BUCKET + 0.001 });
    const otherChroma = axes({ accent_chroma: 0.22 - ACCENT_CHROMA_BUCKET });
    expect(axisDistance(axes(), sameChroma).differing).toEqual([]);
    expect(axisDistance(axes(), otherChroma).differing).toEqual(["accent_chroma"]);
  });

  it("measures hue the short way round the wheel", () => {
    // The deviation from the plan's "30° bucket": fixed buckets would put 359°
    // and 1° — the same red — on opposite sides of a boundary, and report a
    // difference nobody can see.
    expect(hueDistance(359, 1)).toBe(2);
    expect(hueDistance(1, 359)).toBe(2);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(10, 200)).toBe(170);
    expect(axisDistance(axes({ accent_hue: 359 }), axes({ accent_hue: 1 })).differing).toEqual([]);
  });
});

// ── Token distance ──────────────────────────────────────────────────────────

/** A minimal theme stylesheet stating whatever colour tokens the case needs. */
function themeCss(declarations: Record<string, string>): string {
  const body = Object.entries(declarations)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join("\n");
  return `/* @ui:theme fixture */\n:root {\n${body}\n}\n`;
}

function fixture(name: string, declarations: Record<string, string>, scheme: ThemeManifest["scheme"] = "both") {
  const css = themeCss(declarations);
  const input: DistinctivenessTheme = { name, css, scheme, axes: axesFromCss(css, AXIS_BASE) };
  return prepareTheme(input, CONTEXT);
}

describe("token distance · the colour surface, compared", () => {
  it("reads the colour half of the themeable surface, derived", () => {
    // Derived from `surfaceTokens`, not a list typed here: a `--color-*` token
    // added to the base layer joins the comparison on the same commit.
    expect(CONTEXT.colorTokens.length).toBeGreaterThan(20);
    expect(CONTEXT.colorTokens.every((token) => token.startsWith("color-"))).toBe(true);
    expect(CONTEXT.colorTokens).toEqual(colorSurfaceTokens(BASE_SOURCES));
    expect(CONTEXT.colorTokens).toEqual([...CONTEXT.colorTokens].sort());
    expect(CONTEXT.colorTokens).toContain("color-bg");
    expect(CONTEXT.colorTokens).toContain("color-primary");
    // The raw palette is the substrate, not the surface — no theme owns it.
    expect(CONTEXT.colorTokens.some((token) => token.startsWith("palette-"))).toBe(false);
  });

  it("is zero on identity, whichever theme is asked", () => {
    for (const subject of SHIPPED) {
      const self = distinctiveness(subject, subject, CONTEXT);
      expect({ [subject.name]: self.token_distance }).toEqual({ [subject.name]: 0 });
      expect(self.axis_distance).toBe(0);
    }
  });

  it("is symmetric", () => {
    for (const a of SHIPPED) {
      for (const b of SHIPPED) {
        expect(distinctiveness(a, b, CONTEXT).token_distance).toBe(
          distinctiveness(b, a, CONTEXT).token_distance,
        );
      }
    }
  });

  it("grows with the distance it is measuring", () => {
    const base = fixture("base", { "color-bg": "oklch(1 0 0)" });
    const near = fixture("near", { "color-bg": "oklch(0.98 0 0)" });
    const far = fixture("far", { "color-bg": "oklch(0.2 0 0)" });
    const d = (x: ReturnType<typeof fixture>) => distinctiveness(base, x, CONTEXT).token_distance!;
    expect(d(near)).toBeGreaterThan(0);
    expect(d(far)).toBeGreaterThan(d(near));
  });

  it("measures every shared scheme, and only the shared ones", () => {
    expect(sharedSchemes("both", "both")).toEqual(["light", "dark"]);
    expect(sharedSchemes("both", "light")).toEqual(["light"]);
    expect(sharedSchemes("dark", "both")).toEqual(["dark"]);
    expect(sharedSchemes("light", "dark")).toEqual([]);

    const dual = distinctiveness(
      SHIPPED.find((t) => t.name === "default")!,
      SHIPPED.find((t) => t.name === "slate")!,
      CONTEXT,
    );
    expect(dual.schemes).toEqual(["light", "dark"]);
    expect(dual.samples).toBe(CONTEXT.colorTokens.length * 2);

    const single = distinctiveness(
      SHIPPED.find((t) => t.name === "default")!,
      SHIPPED.find((t) => t.name === "document")!,
      CONTEXT,
    );
    expect(single.schemes).toEqual(["light"]);
    expect(single.samples).toBe(CONTEXT.colorTokens.length);
  });

  it("says so rather than guessing when two themes share no scheme", () => {
    // A light-only theme and a dark-only one are never on screen in the same
    // mode: there is no shared rendering to compare, and a number here would be
    // an invention. The pair is then judged on the AXIS rule alone — the colour
    // measure abstains rather than voting either way.
    const lightOnly = fixture("light-only", { "color-bg": "oklch(1 0 0)" }, "light");
    const darkOnly = fixture("dark-only", { "color-bg": "oklch(1 0 0)" }, "dark");
    const result = distinctiveness(lightOnly, darkOnly, CONTEXT);
    expect(result.token_distance).toBeNull();
    expect(result.schemes).toEqual([]);
    expect(result.samples).toBe(0);
    // These two fixtures are the same stylesheet, so the axis rule refuses them
    // on its own — abstaining is not the same as passing.
    expect(result.axis_distance).toBe(0);
    expect(result.passes).toBe(false);
    // Give them four real axes apart and the pair clears with no colour reading
    // at all, which is the property this case exists to pin.
    const apart = distinctiveness(
      lightOnly,
      { ...darkOnly, axes: { ...darkOnly.axes, depth: "hard", motion: "playful", focus: "glow", material: "grain" } },
      CONTEXT,
    );
    expect(apart.token_distance).toBeNull();
    expect(apart.axis_distance).toBe(4);
    expect(apart.passes).toBe(true);
  });

  it("skips a token it cannot place in OKLab, and counts the skip", () => {
    // A translucent value has no position in OKLab without a backdrop. The
    // reading is dropped and REPORTED, because a mean over sixty-one tokens and
    // a mean over sixty-two are not the same claim.
    const opaque = fixture("opaque", { "color-bg": "oklch(1 0 0)" });
    const translucent = fixture("translucent", { "color-bg": "oklch(1 0 0 / 0.5)" });
    const result = distinctiveness(opaque, translucent, CONTEXT);
    expect(result.samples).toBe(CONTEXT.colorTokens.length * 2 - 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The thresholds, and the 276 shipped pairs they judge
// ═══════════════════════════════════════════════════════════════════════════

describe("thresholds · named, and argued for", () => {
  it("AXIS_MIN is the vision's own rule", () => {
    // §5.2: "Two shipped themes must differ on at least four of them." Not a
    // measurement — the stated contract.
    expect(AXIS_MIN).toBe(4);
  });

  it("TOKEN_MIN is the separation the framework already demands between two surfaces", () => {
    // Deliberately not a fresh number. If the average colour of theme A sits
    // closer to theme B's than a card sits to the page it is lying on, the two
    // themes are a colourway of each other — whatever their axes say.
    expect(TOKEN_MIN).toBe(ELEVATION_MIN_DELTA);
    expect(TOKEN_MIN).toBe(0.03);
  });
});

/**
 * The 276 shipped pairs, MEASURED and pinned here. The same table is in the
 * commit body. A theme CSS change that moves a pair fails this test, which is
 * what makes such a change deliberate rather than drift.
 *
 * Re-measured in 1.1A-14, when `glass`, `brutalist`, `terminal`, `paper`, `soft`
 * and `aurora` adopted the 1.1 token families; again in 1.1A-15, when `default`,
 * `slate`, `midnight`, `contrast`, `document` and `document-serif` did (and the
 * gate was armed); again in 1.1A-16, when six GENERATED themes — `editorial`,
 * `swiss`, `neo`, `luxe`, `candy`, `organic` — joined them; and again here, in
 * 1.1A-17, for the second generated six: `clinical`, `fintech`, `nordic`,
 * `sunset`, `ink` and `neumorph`. Twelve themes were 66 pairs; eighteen were
 * 153; twenty-four are 276, and every one of the 123 new pairs cleared both
 * bars on the first generation: the CLI refuses a look-alike before it writes,
 * so a seed that collided never reached the registry. (Four seeds were retuned
 * BECAUSE it refused — see the acceptance note in FAQIR-PLAN-1.1.md.)
 *
 * The margins did not move, which is the interesting part: the closest pair on
 * axes is still four apart (`aurora`/`default`, `aurora`/`midnight`,
 * `default`/`glass` — exactly §5.2's minimum, all three between 1.0 themes) and
 * the closest on colour is still `aurora`/`glass` at 0.0305. The tightest NEW
 * pair is `fintech`/`neo` at 0.0318 and ten axes — two green-accented themes
 * whose greens are a mint and a lime, and whose pages are a green-tinted white
 * against a true gray.
 *
 * THREE rows carry `null` where a ΔE would be, and they all have `luxe` on one
 * side: it is the only DARK-ONLY theme, and `document`, `document-serif` and
 * now `ink` are light-only, so those pairs are never on screen in the same
 * mode. `distinctiveness()` abstains rather than inventing a number, and the
 * pairs are judged on the axis rule alone — 11, 10 and 10 axes apart, so they
 * clear it comfortably. `ink` is light-only for exactly this reason seen from
 * the other side: measured while tuning it, a warm near-monochrome theme's DARK
 * page IS luxe's dark page (0.0192 ΔE at its best), and no seed axis could move
 * it, so the theme ships the one scheme its subject — ink on paper — is about.
 *
 * One pair moved on COLOUR rather than on axes, and deliberately:
 * `glass`/`slate` was the single token failure at 0.0282 — slate's neutrals
 * were a colourway of glass's — so slate's surfaces took the theme's own claim
 * ("cool blue-gray", a dense console rather than a luminous page) and landed at
 * 0.0397. Every other movement in this table is structural.
 */
const SHIPPED_PAIRS: Array<[string, string, number, number | null]> = [
  ["aurora", "brutalist", 11, 0.1961],
  ["aurora", "candy", 9, 0.063],
  ["aurora", "clinical", 8, 0.0901],
  ["aurora", "contrast", 9, 0.0888],
  ["aurora", "default", 4, 0.0515],
  ["aurora", "document", 11, 0.1238],
  ["aurora", "document-serif", 10, 0.1459],
  ["aurora", "editorial", 7, 0.0582],
  ["aurora", "fintech", 8, 0.083],
  ["aurora", "glass", 6, 0.0305],
  ["aurora", "ink", 13, 0.1072],
  ["aurora", "luxe", 8, 0.0997],
  ["aurora", "midnight", 4, 0.0416],
  ["aurora", "neo", 9, 0.0927],
  ["aurora", "neumorph", 7, 0.0398],
  ["aurora", "nordic", 8, 0.0718],
  ["aurora", "organic", 8, 0.0808],
  ["aurora", "paper", 6, 0.0724],
  ["aurora", "slate", 9, 0.0482],
  ["aurora", "soft", 9, 0.0882],
  ["aurora", "sunset", 7, 0.086],
  ["aurora", "swiss", 9, 0.1039],
  ["aurora", "terminal", 11, 0.1035],
  ["brutalist", "candy", 10, 0.1924],
  ["brutalist", "clinical", 9, 0.165],
  ["brutalist", "contrast", 7, 0.1811],
  ["brutalist", "default", 10, 0.2047],
  ["brutalist", "document", 8, 0.1184],
  ["brutalist", "document-serif", 8, 0.1245],
  ["brutalist", "editorial", 10, 0.179],
  ["brutalist", "fintech", 12, 0.1815],
  ["brutalist", "glass", 11, 0.1995],
  ["brutalist", "ink", 9, 0.1643],
  ["brutalist", "luxe", 13, 0.1671],
  ["brutalist", "midnight", 12, 0.1942],
  ["brutalist", "neo", 7, 0.1892],
  ["brutalist", "neumorph", 11, 0.1922],
  ["brutalist", "nordic", 11, 0.1843],
  ["brutalist", "organic", 13, 0.1873],
  ["brutalist", "paper", 11, 0.1999],
  ["brutalist", "slate", 11, 0.1926],
  ["brutalist", "soft", 11, 0.2092],
  ["brutalist", "sunset", 12, 0.1957],
  ["brutalist", "swiss", 8, 0.1808],
  ["brutalist", "terminal", 11, 0.1988],
  ["candy", "clinical", 10, 0.0777],
  ["candy", "contrast", 9, 0.0874],
  ["candy", "default", 6, 0.0798],
  ["candy", "document", 11, 0.1005],
  ["candy", "document-serif", 11, 0.103],
  ["candy", "editorial", 10, 0.0431],
  ["candy", "fintech", 8, 0.067],
  ["candy", "glass", 7, 0.0723],
  ["candy", "ink", 13, 0.0586],
  ["candy", "luxe", 11, 0.0738],
  ["candy", "midnight", 10, 0.0857],
  ["candy", "neo", 8, 0.0618],
  ["candy", "neumorph", 7, 0.0356],
  ["candy", "nordic", 8, 0.0717],
  ["candy", "organic", 9, 0.0492],
  ["candy", "paper", 8, 0.0672],
  ["candy", "slate", 9, 0.0746],
  ["candy", "soft", 6, 0.091],
  ["candy", "sunset", 8, 0.0344],
  ["candy", "swiss", 10, 0.0571],
  ["candy", "terminal", 9, 0.1026],
  ["clinical", "contrast", 10, 0.0474],
  ["clinical", "default", 8, 0.0808],
  ["clinical", "document", 9, 0.0728],
  ["clinical", "document-serif", 9, 0.0911],
  ["clinical", "editorial", 6, 0.0461],
  ["clinical", "fintech", 9, 0.0556],
  ["clinical", "glass", 9, 0.0833],
  ["clinical", "ink", 9, 0.0388],
  ["clinical", "luxe", 8, 0.0448],
  ["clinical", "midnight", 8, 0.0872],
  ["clinical", "neo", 11, 0.0693],
  ["clinical", "neumorph", 11, 0.0681],
  ["clinical", "nordic", 7, 0.0508],
  ["clinical", "organic", 9, 0.0602],
  ["clinical", "paper", 7, 0.0944],
  ["clinical", "slate", 7, 0.0656],
  ["clinical", "soft", 9, 0.082],
  ["clinical", "sunset", 10, 0.0822],
  ["clinical", "swiss", 9, 0.0526],
  ["clinical", "terminal", 11, 0.0865],
  ["contrast", "default", 5, 0.0731],
  ["contrast", "document", 9, 0.0768],
  ["contrast", "document-serif", 9, 0.0971],
  ["contrast", "editorial", 10, 0.0597],
  ["contrast", "fintech", 12, 0.0757],
  ["contrast", "glass", 7, 0.0691],
  ["contrast", "ink", 11, 0.0537],
  ["contrast", "luxe", 10, 0.0794],
  ["contrast", "midnight", 10, 0.0925],
  ["contrast", "neo", 8, 0.092],
  ["contrast", "neumorph", 9, 0.072],
  ["contrast", "nordic", 9, 0.0635],
  ["contrast", "organic", 10, 0.0835],
  ["contrast", "paper", 9, 0.107],
  ["contrast", "slate", 10, 0.0727],
  ["contrast", "soft", 10, 0.0741],
  ["contrast", "sunset", 9, 0.0988],
  ["contrast", "swiss", 10, 0.08],
  ["contrast", "terminal", 10, 0.0998],
  ["default", "document", 9, 0.1221],
  ["default", "document-serif", 9, 0.1516],
  ["default", "editorial", 6, 0.0558],
  ["default", "fintech", 8, 0.0759],
  ["default", "glass", 4, 0.0415],
  ["default", "ink", 13, 0.1131],
  ["default", "luxe", 8, 0.0972],
  ["default", "midnight", 5, 0.0588],
  ["default", "neo", 8, 0.0905],
  ["default", "neumorph", 7, 0.0543],
  ["default", "nordic", 6, 0.0569],
  ["default", "organic", 7, 0.0812],
  ["default", "paper", 6, 0.0856],
  ["default", "slate", 7, 0.0576],
  ["default", "soft", 8, 0.0794],
  ["default", "sunset", 6, 0.0961],
  ["default", "swiss", 9, 0.1133],
  ["default", "terminal", 10, 0.1057],
  ["document", "document-serif", 5, 0.0482],
  ["document", "editorial", 9, 0.0723],
  ["document", "fintech", 11, 0.0838],
  ["document", "glass", 10, 0.1176],
  ["document", "ink", 7, 0.084],
  ["document", "luxe", 11, null],
  ["document", "midnight", 13, 0.122],
  ["document", "neo", 10, 0.0964],
  ["document", "neumorph", 12, 0.095],
  ["document", "nordic", 11, 0.0787],
  ["document", "organic", 12, 0.0937],
  ["document", "paper", 11, 0.1314],
  ["document", "slate", 8, 0.1063],
  ["document", "soft", 11, 0.1246],
  ["document", "sunset", 13, 0.1093],
  ["document", "swiss", 8, 0.1046],
  ["document", "terminal", 11, 0.1125],
  ["document-serif", "editorial", 10, 0.0955],
  ["document-serif", "fintech", 11, 0.1019],
  ["document-serif", "glass", 10, 0.1464],
  ["document-serif", "ink", 7, 0.0764],
  ["document-serif", "luxe", 10, null],
  ["document-serif", "midnight", 12, 0.1507],
  ["document-serif", "neo", 11, 0.1048],
  ["document-serif", "neumorph", 11, 0.117],
  ["document-serif", "nordic", 10, 0.1126],
  ["document-serif", "organic", 11, 0.0977],
  ["document-serif", "paper", 9, 0.1299],
  ["document-serif", "slate", 10, 0.1324],
  ["document-serif", "soft", 11, 0.1436],
  ["document-serif", "sunset", 11, 0.1029],
  ["document-serif", "swiss", 8, 0.0918],
  ["document-serif", "terminal", 11, 0.1239],
  ["editorial", "fintech", 8, 0.0337],
  ["editorial", "glass", 9, 0.0542],
  ["editorial", "ink", 10, 0.0513],
  ["editorial", "luxe", 8, 0.0654],
  ["editorial", "midnight", 8, 0.0654],
  ["editorial", "neo", 10, 0.039],
  ["editorial", "neumorph", 11, 0.0367],
  ["editorial", "nordic", 7, 0.0324],
  ["editorial", "organic", 7, 0.0334],
  ["editorial", "paper", 6, 0.0659],
  ["editorial", "slate", 6, 0.0434],
  ["editorial", "soft", 10, 0.0675],
  ["editorial", "sunset", 10, 0.0503],
  ["editorial", "swiss", 10, 0.0734],
  ["editorial", "terminal", 11, 0.0744],
  ["fintech", "glass", 8, 0.0754],
  ["fintech", "ink", 13, 0.0578],
  ["fintech", "luxe", 10, 0.0668],
  ["fintech", "midnight", 9, 0.0754],
  ["fintech", "neo", 10, 0.0318],
  ["fintech", "neumorph", 9, 0.0653],
  ["fintech", "nordic", 9, 0.0325],
  ["fintech", "organic", 9, 0.0394],
  ["fintech", "paper", 8, 0.0789],
  ["fintech", "slate", 6, 0.0607],
  ["fintech", "soft", 7, 0.069],
  ["fintech", "sunset", 10, 0.0616],
  ["fintech", "swiss", 11, 0.0857],
  ["fintech", "terminal", 8, 0.0568],
  ["glass", "ink", 13, 0.1049],
  ["glass", "luxe", 11, 0.1023],
  ["glass", "midnight", 6, 0.0443],
  ["glass", "neo", 8, 0.0901],
  ["glass", "neumorph", 5, 0.0452],
  ["glass", "nordic", 5, 0.0595],
  ["glass", "organic", 8, 0.0798],
  ["glass", "paper", 8, 0.0781],
  ["glass", "slate", 8, 0.0397],
  ["glass", "soft", 8, 0.0701],
  ["glass", "sunset", 8, 0.0916],
  ["glass", "swiss", 10, 0.1098],
  ["glass", "terminal", 11, 0.0962],
  ["ink", "luxe", 10, null],
  ["ink", "midnight", 13, 0.1122],
  ["ink", "neo", 12, 0.0554],
  ["ink", "neumorph", 13, 0.0743],
  ["ink", "nordic", 13, 0.0729],
  ["ink", "organic", 12, 0.0374],
  ["ink", "paper", 9, 0.0831],
  ["ink", "slate", 12, 0.0862],
  ["ink", "soft", 11, 0.0927],
  ["ink", "sunset", 11, 0.0503],
  ["ink", "swiss", 10, 0.0377],
  ["ink", "terminal", 12, 0.0741],
  ["luxe", "midnight", 10, 0.1063],
  ["luxe", "neo", 13, 0.0597],
  ["luxe", "neumorph", 12, 0.087],
  ["luxe", "nordic", 9, 0.0878],
  ["luxe", "organic", 5, 0.0545],
  ["luxe", "paper", 7, 0.0819],
  ["luxe", "slate", 10, 0.099],
  ["luxe", "soft", 11, 0.0924],
  ["luxe", "sunset", 8, 0.0578],
  ["luxe", "swiss", 12, 0.0344],
  ["luxe", "terminal", 12, 0.1003],
  ["midnight", "neo", 10, 0.0912],
  ["midnight", "neumorph", 7, 0.062],
  ["midnight", "nordic", 8, 0.0635],
  ["midnight", "organic", 9, 0.0891],
  ["midnight", "paper", 7, 0.0867],
  ["midnight", "slate", 9, 0.0486],
  ["midnight", "soft", 8, 0.0848],
  ["midnight", "sunset", 7, 0.1016],
  ["midnight", "swiss", 10, 0.1207],
  ["midnight", "terminal", 11, 0.0966],
  ["neo", "neumorph", 8, 0.0714],
  ["neo", "nordic", 9, 0.0551],
  ["neo", "organic", 11, 0.0361],
  ["neo", "paper", 9, 0.0762],
  ["neo", "slate", 10, 0.0767],
  ["neo", "soft", 9, 0.0809],
  ["neo", "sunset", 9, 0.047],
  ["neo", "swiss", 10, 0.079],
  ["neo", "terminal", 8, 0.0637],
  ["neumorph", "nordic", 7, 0.0537],
  ["neumorph", "organic", 9, 0.061],
  ["neumorph", "paper", 9, 0.0805],
  ["neumorph", "slate", 10, 0.0562],
  ["neumorph", "soft", 9, 0.0884],
  ["neumorph", "sunset", 8, 0.0635],
  ["neumorph", "swiss", 11, 0.0792],
  ["neumorph", "terminal", 9, 0.1042],
  ["nordic", "organic", 6, 0.0562],
  ["nordic", "paper", 6, 0.0872],
  ["nordic", "slate", 5, 0.0462],
  ["nordic", "soft", 10, 0.0753],
  ["nordic", "sunset", 9, 0.0793],
  ["nordic", "swiss", 10, 0.0968],
  ["nordic", "terminal", 12, 0.0774],
  ["organic", "paper", 7, 0.0529],
  ["organic", "slate", 8, 0.0684],
  ["organic", "soft", 9, 0.0718],
  ["organic", "sunset", 8, 0.0333],
  ["organic", "swiss", 12, 0.0638],
  ["organic", "terminal", 10, 0.069],
  ["paper", "slate", 8, 0.0697],
  ["paper", "soft", 8, 0.072],
  ["paper", "sunset", 5, 0.0546],
  ["paper", "swiss", 9, 0.0844],
  ["paper", "terminal", 10, 0.0846],
  ["slate", "soft", 9, 0.0693],
  ["slate", "sunset", 11, 0.0866],
  ["slate", "swiss", 10, 0.1043],
  ["slate", "terminal", 10, 0.0786],
  ["soft", "sunset", 8, 0.0893],
  ["soft", "swiss", 12, 0.1146],
  ["soft", "terminal", 10, 0.0771],
  ["sunset", "swiss", 10, 0.0483],
  ["sunset", "terminal", 10, 0.0905],
  ["swiss", "terminal", 11, 0.1119],
];

/**
 * The pairs that do NOT meet the rule, as `name/name: reason`. **Empty since
 * 1.1A-15**, and required to be: the gate below is ARMED, so this object being
 * empty is the assertion rather than a note.
 *
 * The sameness problem, as a number that came down: 1.1A-12 counted twenty-one
 * failing pairs, 1.1A-14 left eight, 1.1A-15 leaves none. Every one of the
 * eight had a batch-2 theme on at least one side, which is what made them
 * clearable: `default` cannot move at all (`tests/themes/axes.test.ts` holds it
 * equal to `THEME_SEED_DEFAULTS`, which is what makes `{ name, accent }` a
 * complete seed), so each pair involving it was cleared from the other side —
 * `aurora` and `glass` each took an axis in 1.1A-14, and `slate`, `midnight`
 * and `contrast` took theirs here.
 *
 * The plan allowed up to two reasoned exemptions, "if a pair cannot honestly
 * reach the bar (the two `document` themes may share many axes by design)".
 * **None was needed, including for that pair**: `document` took `motion: none`
 * and a baseline underline, `document-serif` took the serif roles it had only
 * ever applied inside a `data-ui="document"`, a tight heading tracking, a
 * dotted rule and ruled input fields — five axes apart, on two themes that are
 * now distinguishable on a printed page rather than only in their accent.
 * A future exemption belongs here with its reason string; the type is kept
 * exactly so that adding one is a visible, argued edit.
 */
const OBLIGATIONS: Record<string, "axis" | "token" | "axis+token"> = {};

describe("the 276 shipped pairs, measured and pinned", () => {
  const measured = new Map<string, ReturnType<typeof distinctiveness>>();
  for (let i = 0; i < SHIPPED.length; i++) {
    for (let j = i + 1; j < SHIPPED.length; j++) {
      measured.set(`${SHIPPED[i].name}/${SHIPPED[j].name}`, distinctiveness(SHIPPED[i], SHIPPED[j], CONTEXT));
    }
  }

  it("covers every pair exactly once — 24 themes is 276 pairs", () => {
    expect(SHIPPED.length).toBe(24);
    expect(measured.size).toBe((24 * 23) / 2);
    expect(SHIPPED_PAIRS.length).toBe(measured.size);
    expect(SHIPPED_PAIRS.map(([a, b]) => `${a}/${b}`).sort()).toEqual([...measured.keys()].sort());
  });

  for (const [a, b, axisExpected, tokenExpected] of SHIPPED_PAIRS) {
    it(`${a} / ${b} — ${axisExpected} axes, ΔE ${tokenExpected}`, () => {
      const result = measured.get(`${a}/${b}`)!;
      expect({ axis: result.axis_distance, token: result.token_distance }).toEqual({
        axis: axisExpected,
        token: tokenExpected,
      });
    });
  }

  /** Every pair that fails either bar, with which bar it failed. */
  function failingPairs(): Record<string, "axis" | "token" | "axis+token"> {
    const failing: Record<string, "axis" | "token" | "axis+token"> = {};
    for (const [pair, result] of measured) {
      const reasons: string[] = [];
      if (result.axis_distance < AXIS_MIN) reasons.push("axis");
      if (result.token_distance != null && result.token_distance < TOKEN_MIN) reasons.push("token");
      if (reasons.length > 0) failing[pair] = reasons.join("+") as "axis" | "token" | "axis+token";
    }
    return failing;
  }

  it("EVERY pair meets the rule — the gate is armed [1.1A-15]", () => {
    // Named as an equality against OBLIGATIONS rather than as `toEqual({})` so
    // that a future exemption is a documented entry in that object with a
    // reason beside it, not a threshold somebody lowered.
    expect(failingPairs()).toEqual(OBLIGATIONS);
  });

  it("is armed, and says so in one place", () => {
    // 1.1A-12 wrote this assertion as `armed === false` with a count of 21;
    // 1.1A-14 brought the count to 8; this is the commit that flips it. The
    // plan allows at most two reasoned exemptions — asserted, so the allowance
    // cannot quietly become a habit.
    const armed = Object.keys(OBLIGATIONS).length === 0;
    expect(armed).toBe(true);
    expect(Object.keys(OBLIGATIONS).length).toBeLessThanOrEqual(2);
  });

  it("no pair clears by a hair it could lose to a rounding — the measured margins", () => {
    // What "armed" is worth depends on how close the closest pair is. Both
    // minima are recorded, so a later theme edit that eats the margin shows up
    // here as a number rather than as a pass that happens to still hold.
    const axisMin = Math.min(...[...measured.values()].map((r) => r.axis_distance));
    const tokenMin = Math.min(
      ...[...measured.values()].map((r) => r.token_distance).filter((d): d is number => d != null),
    );
    expect(axisMin).toBe(AXIS_MIN);
    expect(tokenMin).toBe(0.0305);
    expect(tokenMin).toBeGreaterThan(TOKEN_MIN);
    // The three pairs sitting exactly on §5.2's four-axis floor. Each is a
    // deliberate near-neighbour: `default` is the reference every theme departs
    // from and cannot itself move, and `aurora`/`midnight` are the two themes
    // whose subject is the same one (a lit surface in a dark room).
    const onTheFloor = [...measured]
      .filter(([, r]) => r.axis_distance === AXIS_MIN)
      .map(([pair]) => pair)
      .sort();
    expect(onTheFloor).toEqual(["aurora/default", "aurora/midnight", "default/glass"]);
    // Both minima STILL belong to 1.0 pairs after 1.1A-16 added 87 and
    // 1.1A-17 another 123: twelve generated themes went in without eating
    // anyone's margin. The closest NEW pair is recorded beside them so the
    // next batch has a number to beat — 1.1A-16 left 0.0334
    // (`editorial`/`organic`), and this batch's tightest is `fintech`/`neo`.
    const newest = new Set(["clinical", "fintech", "nordic", "sunset", "ink", "neumorph"]);
    const involvesNew = ([pair]: [string, unknown]) => pair.split("/").some((n) => newest.has(n));
    const newMin = [...measured]
      .filter(involvesNew)
      .map(([pair, r]) => [pair, r.token_distance] as const)
      .filter((row): row is readonly [string, number] => row[1] != null)
      .sort((x, y) => x[1] - y[1])[0];
    expect(newMin).toEqual(["fintech/neo", 0.0318]);
    const newAxisMin = Math.min(
      ...[...measured].filter(involvesNew).map(([, r]) => r.axis_distance),
    );
    expect(newAxisMin).toBe(5);
  });

  it("abstains rather than inventing a number when two themes share no scheme", () => {
    // The property `distinctiveness()` documents, now exercised by the SHIPPED
    // set rather than only by fixtures: `luxe` (dark only) against the three
    // light-only themes — the two document ones and, since 1.1A-17, `ink`.
    // All three pairs are judged on axes alone.
    const abstained = [...measured]
      .filter(([, r]) => r.token_distance == null)
      .map(([pair]) => pair)
      .sort();
    expect(abstained).toEqual(["document-serif/luxe", "document/luxe", "ink/luxe"]);
    for (const pair of abstained) {
      const result = measured.get(pair)!;
      expect(result.schemes).toEqual([]);
      expect(result.samples).toBe(0);
      expect(result.axis_distance).toBeGreaterThanOrEqual(AXIS_MIN);
      expect(result.passes).toBe(true);
    }
  });

  it("names each theme's nearest neighbour, deterministically", () => {
    // `nearest` is the smallest TOKEN distance: the axis count is a coarse
    // integer with many ties across a dozen themes, while the colour distance
    // is what "these two read the same" means to the person looking at them.
    const neighbours = Object.fromEntries(
      SHIPPED.map((subject) => [subject.name, nearest(subject, SHIPPED, CONTEXT)!.nearest]),
    );
    expect(neighbours).toEqual({
      aurora: "glass",
      brutalist: "document",
      candy: "sunset",
      clinical: "ink",
      contrast: "clinical",
      default: "glass",
      document: "document-serif",
      "document-serif": "document",
      editorial: "nordic",
      fintech: "neo",
      glass: "aurora",
      ink: "organic",
      luxe: "swiss",
      midnight: "aurora",
      neo: "fintech",
      neumorph: "candy",
      nordic: "editorial",
      organic: "sunset",
      paper: "organic",
      slate: "glass",
      soft: "editorial",
      sunset: "organic",
      swiss: "luxe",
      terminal: "fintech",
    });
    // A theme is never its own neighbour, however small the set.
    for (const subject of SHIPPED) {
      expect(nearest(subject, SHIPPED, CONTEXT)!.nearest).not.toBe(subject.name);
    }
    expect(nearest(SHIPPED[0], [SHIPPED[0]], CONTEXT)).toBeNull();
    expect(nearest(SHIPPED[0], [], CONTEXT)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The print companions, and why they are not peers                 [1.1A-16]
// ═══════════════════════════════════════════════════════════════════════════
//
// The gate above judges twenty-four themes, not the twenty-seven stylesheets in
// `registry/themes`. The three it leaves out are the `<name>-document` companions
// a seed with `document: true` produces — and the exclusion is not a threshold
// anybody lowered but a fact about the GENERATOR, measured here so that it stays
// a fact rather than becoming a habit.

describe("print companions are excluded, and the numbers say why [1.1A-16]", () => {
  /** The companions, with their own axes derived so the numbers can be taken. */
  const companions = COMPANION_NAMES.map((name) => {
    const css = readFileSync(join(THEMES_DIR, `${name}.css`), "utf8");
    return prepareTheme(
      { name, css, scheme: manifestOf(name).scheme, axes: axesFromCss(css, AXIS_BASE) },
      CONTEXT,
    );
  });

  it("is exactly the set of manifests with no axes block, and they are all `<parent>-document`", () => {
    expect(COMPANION_NAMES).toEqual(["editorial-document", "ink-document", "swiss-document"]);
    for (const name of COMPANION_NAMES) {
      const parent = name.replace(/-document$/, "");
      expect(manifestOf(parent).seed?.document).toBe(true);
      expect(manifestOf(name).seed).toBeUndefined();
      expect(manifestOf(name).distinctiveness).toBeUndefined();
    }
    // The CLI's own reader agrees, on the same directory: it has skipped a
    // manifest with no `axes` since 1.1A-12, so the registry and `faqir theme
    // generate` compare the same set rather than two sets that happen to match.
    expect(readPeerThemes(THEMES_DIR).map((peer) => peer.name).sort()).toEqual([...PEER_NAMES]);
  });

  it("a companion is its own PARENT's colour ramp — it can never clear the colour bar", () => {
    // `renderDocumentCss` re-uses the parent's accent ramp and neutral surfaces
    // and only whitens the page, so the two are the same theme in two media.
    // Measured, not asserted in the abstract:
    for (const companion of companions) {
      const parent = SHIPPED.find((t) => t.name === companion.name.replace(/-document$/, ""))!;
      const result = distinctiveness(parent, companion, CONTEXT);
      expect(result.token_distance).toBeLessThan(TOKEN_MIN / 10);
      expect(result.passes).toBe(false);
    }
  });

  it("two companions agree on eleven of the fourteen axes, whatever their seeds said", () => {
    // The deeper reason: `renderDocumentCss` emits NONE of the axis families —
    // no type ramp, no silhouette, no motion curve — so everything except the
    // accent and the contrast level comes from the base layer. Two companions
    // can therefore differ on at most three axes no matter how far apart the
    // themes that produced them are. `editorial` and `swiss` are 10 axes apart;
    // their companions are 3.
    const byName = (name: string) => companions.find((c) => c.name === name)!;
    const parents = distinctiveness(
      SHIPPED.find((t) => t.name === "editorial")!,
      SHIPPED.find((t) => t.name === "swiss")!,
      CONTEXT,
    );
    const children = distinctiveness(byName("editorial-document"), byName("swiss-document"), CONTEXT);
    expect(parents.axis_distance).toBe(10);
    expect(children.axis_distance).toBe(3);
    expect(children.axes_differing).toEqual(["accent_hue", "accent_chroma", "contrast"]);
    expect(children.passes).toBe(false);

    // 1.1A-17 supplies the limiting case the two-companion measurement could
    // only imply: `ink` and `swiss` are 10 axes apart — a sepia letterpress page
    // against an uppercase Swiss grid — and both take `contrast: high`, so their
    // companions differ on the ACCENT alone and agree on all twelve enumerated
    // axes. That is the floor: three axes was not the companion's worst case,
    // two is, and no seed can reach it, which is the whole argument for
    // `a companion carries no axes block`.
    const inkSwiss = distinctiveness(
      SHIPPED.find((t) => t.name === "ink")!,
      SHIPPED.find((t) => t.name === "swiss")!,
      CONTEXT,
    );
    const inkSwissChildren = distinctiveness(byName("ink-document"), byName("swiss-document"), CONTEXT);
    expect(inkSwiss.axis_distance).toBe(10);
    expect(inkSwissChildren.axis_distance).toBe(2);
    expect(inkSwissChildren.axes_differing).toEqual(["accent_hue", "accent_chroma"]);
    expect(inkSwissChildren.passes).toBe(false);
  });

  it("the exclusion buys nothing else — every companion still passes every other theme gate", () => {
    // What is waived is membership of the 276-pair table and nothing more: a
    // companion is still a valid, schema-clean manifest whose tokens match its
    // CSS, which `tests/themes/manifest.test.ts` checks for all twenty files.
    for (const name of COMPANION_NAMES) {
      expect({ [name]: validateThemeManifest(manifestOf(name)) }).toEqual({ [name]: [] });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The refusal
// ═══════════════════════════════════════════════════════════════════════════

describe("collisions · what the generator refuses, and what it says", () => {
  it("finds NO collision anywhere in the shipped set — the armed gate, from the generator's side", () => {
    // The same fact the 66-pair gate states, asked the way the CLI asks it:
    // every shipped theme, against all eleven others. `default` alone reported
    // six collisions when 1.1A-12 measured it, three after 1.1A-14, none now.
    for (const subject of SHIPPED) {
      expect({ [subject.name]: collisions(subject, SHIPPED, CONTEXT).map((r) => r.nearest) }).toEqual({
        [subject.name]: [],
      });
    }
  });

  it("reports every collision, worst first, and nothing that clears both bars", () => {
    // Synthetic, now that the shipped set has no collisions to read: three
    // near-clones of one subject, at three distances.
    const subject = fixture("subject", { "color-bg": "oklch(1 0 0)", "color-primary": "oklch(0.55 0.22 264)" });
    const near = fixture("near", { "color-bg": "oklch(0.995 0 0)", "color-primary": "oklch(0.55 0.22 264)" });
    const mid = fixture("mid", { "color-bg": "oklch(0.985 0 0)", "color-primary": "oklch(0.55 0.22 264)" });
    const apart = SHIPPED.find((t) => t.name === "terminal")!;
    const found = collisions(subject, [subject, near, mid, apart], CONTEXT);
    expect(found.map((result) => result.nearest)).toEqual(["near", "mid"]);
    expect(found.every((result) => !result.passes)).toBe(true);
    // Sorted by closeness, so the first sentence a user reads is the worst one.
    const distances = found.map((result) => result.token_distance!);
    expect([...distances].sort((x, y) => x - y)).toEqual(distances);
  });

  it("names the theme, the count and the axes that are identical", () => {
    // `aurora` and `default` sit exactly on the four-axis floor, so dropping
    // one of the four is the smallest honest way to make a failing pair out of
    // two shipped themes — and it keeps the message's numbers real.
    const aurora = SHIPPED.find((t) => t.name === "aurora")!;
    const defaultCss = readFileSync(join(THEMES_DIR, "default.css"), "utf8");
    const clone = prepareTheme(
      {
        name: "clone",
        css: defaultCss,
        scheme: "both",
        axes: { ...axesFromCss(defaultCss, AXIS_BASE), material: aurora.axes.material },
      },
      CONTEXT,
    );
    const result = distinctiveness(aurora, clone, CONTEXT);
    const message = collisionMessage("aurora", result);
    expect(result.axis_distance).toBe(AXIS_MIN - 1);
    expect(message).toContain("'aurora' is too close to 'clone'");
    expect(message).toContain(`3 of the ${THEME_DERIVED_AXES.length} axes`);
    expect(message).toContain(`${AXIS_MIN} required`);
    expect(message).toContain("accent_hue");
  });

  it("states the colour measure when THAT is what failed", () => {
    // No shipped pair fails on colour any more — `glass`/`slate` was the last
    // one and 1.1A-15 separated it — so the case is made out of two fixtures
    // that clear the axis rule on a stylesheet they share every colour with.
    const css = { "color-bg": "oklch(0.97 0.01 250)", "color-primary": "oklch(0.5 0.2 250)" };
    const a = fixture("twin-a", css);
    const b = {
      ...fixture("twin-b", css),
      axes: { ...a.axes, depth: "hard" as const, motion: "playful" as const, focus: "glow" as const, material: "grain" as const },
    };
    const result = distinctiveness(a, b, CONTEXT);
    expect(result.axis_distance).toBeGreaterThanOrEqual(AXIS_MIN);
    expect(result.token_distance).toBeLessThan(TOKEN_MIN);
    const message = collisionMessage("twin-a", result);
    expect(message).toContain("mean OKLab ΔE");
    expect(message).toContain(String(TOKEN_MIN));
    expect(message).not.toContain("axes (");
  });

  it("finds no collision among themes that clear both bars", () => {
    const subject = SHIPPED.find((t) => t.name === "terminal")!;
    expect(collisions(subject, SHIPPED, CONTEXT)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The generator, the scorecard and the CLI
// ═══════════════════════════════════════════════════════════════════════════

describe("the generator refuses a look-alike, and --allow-similar overrides it", () => {
  let cwd: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = mkdtempSync(join(tmpdir(), "faqir-distinct-"));
    process.chdir(cwd);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(cwd, { recursive: true, force: true });
  });

  const artefacts = () => (existsSync(join(cwd, "themes")) ? readdirSync(join(cwd, "themes")).sort() : []);

  it("writes the first theme into an empty directory without a word about distinctiveness", async () => {
    // The ordinary case: one brand theme, nothing to be distinct FROM. A gate
    // that fired here would make the common path the annoying one.
    await theme(["generate", "ember", "--accent", "#d97706"]);
    expect(artefacts()).toContain("ember.css");
  });

  it("refuses a clone of a theme already in the output directory, and writes nothing", async () => {
    await theme(["generate", "ember", "--accent", "#d97706"]);
    const before = artefacts();
    await expect(theme(["generate", "amber", "--accent", "#d97706"])).rejects.toThrow(
      /'amber' is too close to 'ember'/,
    );
    // Refused BEFORE writing: the directory is exactly as it was.
    expect(artefacts()).toEqual(before);
  });

  it("says how to proceed, in the sentence that refuses", async () => {
    await theme(["generate", "ember", "--accent", "#d97706"]);
    await expect(theme(["generate", "amber", "--accent", "#d97706"])).rejects.toThrow(/--allow-similar/);
  });

  it("writes it anyway under --allow-similar, and the scorecard records that it did", async () => {
    await theme(["generate", "ember", "--accent", "#d97706"]);
    await theme(["generate", "amber", "--accent", "#d97706", "--allow-similar"]);
    expect(artefacts()).toContain("amber.css");

    // The written theme is a full, valid theme — `--allow-similar` waives the
    // distinctiveness gate and nothing else.
    const manifest = JSON.parse(readFileSync(join(cwd, "themes/amber.theme.json"), "utf8")) as ThemeManifest;
    expect(validateThemeManifest(manifest)).toEqual([]);
  });

  it("does not collide with the copy of itself it is about to overwrite", async () => {
    await theme(["generate", "ember", "--accent", "#d97706"]);
    // Regeneration is not a collision: the peer being compared against IS the
    // file about to be replaced.
    await theme(["generate", "ember", "--accent", "#d97706"]);
    expect(artefacts()).toContain("ember.css");
  });

  it("compares against the output directory, not against the twelve the CLI ships", async () => {
    // A theme generated with default axes and an indigo accent is a near-clone
    // of the shipped `default` — and that is FINE in a user's own folder. The
    // set that matters is the set it would ship beside.
    await theme(["generate", "mine", "--accent", "oklch(0.55 0.22 264)"]);
    expect(artefacts()).toContain("mine.css");
  });

  it("ignores a document companion, which has no axes to compare", async () => {
    // `<name>-document` deliberately carries neither seed nor axes (1.1A-11),
    // so it is not a peer — otherwise generating a second theme into the same
    // folder would collide with the first one's print variant, on axes nobody
    // derived.
    await theme(["generate", "ember", "--accent", "#d97706", "--document"]);
    const peers = readPeerThemes(join(cwd, "themes"));
    expect(peers.map((peer) => peer.name)).toEqual(["ember"]);
  });
});

describe("scorecard v2 carries the numbers", () => {
  const BASE = themeBaseSources(REGISTRY);
  const peer = (name: string): DistinctivenessTheme => {
    const css = readFileSync(join(THEMES_DIR, `${name}.css`), "utf8");
    const manifest = JSON.parse(readFileSync(join(THEMES_DIR, `${name}.theme.json`), "utf8")) as ThemeManifest;
    return { name, css, scheme: manifest.scheme, axes: manifest.axes! };
  };

  it("is null when there was nothing to compare against", () => {
    const bundle = generateThemeBundle({ name: "lonely", accent: "#d97706" }, BASE);
    expect(themeScorecard(bundle, BASE).distinctiveness).toBeNull();
    expect(themeScorecard(bundle, BASE, { peers: [] }).distinctiveness).toBeNull();
  });

  it("reports the nearest peer, both measures, the thresholds and the verdict", () => {
    const bundle = generateThemeBundle({ name: "indigo-ish", accent: "oklch(0.55 0.22 264)" }, BASE);
    const report = themeScorecard(bundle, BASE, { peers: [peer("default"), peer("terminal")] });
    const distinct = report.distinctiveness!;
    expect(distinct.nearest).toBe("default");
    expect(distinct.thresholds).toEqual({ axis_distance: AXIS_MIN, token_distance: TOKEN_MIN });
    expect(distinct.axis_distance).toBeLessThan(AXIS_MIN);
    expect(distinct.token_distance).toBeGreaterThanOrEqual(0);
    expect(distinct.schemes).toEqual(["light", "dark"]);
    expect(distinct.samples).toBe(CONTEXT.colorTokens.length * 2);
    expect(distinct.passes).toBe(false);
    expect(distinct.allow_similar).toBe(false);
    // The working, which the manifest's three fields have no room for.
    expect(distinct.axes_differing.length).toBe(distinct.axis_distance);
  });

  it("records the override when one was used", () => {
    const bundle = generateThemeBundle({ name: "indigo-ish", accent: "oklch(0.55 0.22 264)" }, BASE);
    const report = themeScorecard(bundle, BASE, { peers: [peer("default")], allowSimilar: true });
    expect(report.distinctiveness!.allow_similar).toBe(true);
    expect(report.distinctiveness!.passes).toBe(false);
  });

  it("measures the primary theme, never its document companion", () => {
    const bundle = generateThemeBundle({ name: "printy", accent: "#d97706", document: true }, BASE);
    const report = themeScorecard(bundle, BASE, { peers: [peer("paper")] });
    expect(bundle.generated.length).toBe(2);
    expect(report.distinctiveness!.nearest).toBe("paper");
  });
});
