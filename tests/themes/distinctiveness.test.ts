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
//   2. **The 66 shipped pairs, pinned.** Every pair of the twelve shipped
//      themes, with the numbers MEASURED in this task's session. A theme CSS
//      edit that moves a pair shows up here as a diff, which is the difference
//      between a deliberate change and drift.
//   3. **The obligations.** Twenty-one of those 66 pairs are below threshold
//      TODAY — the sameness problem, finally quantified. They are enumerated,
//      not tolerated: 1.1A-14/15 is the work that empties this list, and
//      `armed` in the last describe flips when it is empty.
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

/**
 * The shipped set as the gate reads it. The axes are DERIVED here rather than
 * read from the manifest, so this file measures the stylesheets and never
 * checks a stored block against itself.
 */
const SHIPPED = THEME_NAMES.map((name) => {
  const css = readFileSync(join(THEMES_DIR, `${name}.css`), "utf8");
  const manifest = JSON.parse(readFileSync(join(THEMES_DIR, `${name}.theme.json`), "utf8")) as ThemeManifest;
  return prepareTheme({ name, css, scheme: manifest.scheme, axes: axesFromCss(css, AXIS_BASE) }, CONTEXT);
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
// The thresholds, and the 66 shipped pairs they judge
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
 * The 66 shipped pairs, MEASURED in this task's session and pinned here. The
 * same table is in the commit body. A theme CSS change that moves a pair fails
 * this test, which is what makes such a change deliberate rather than drift.
 */
const SHIPPED_PAIRS: Array<[string, string, number, number]> = [
  ["aurora", "brutalist", 6, 0.1961],
  ["aurora", "contrast", 3, 0.0888],
  ["aurora", "default", 1, 0.0515],
  ["aurora", "document", 8, 0.1238],
  ["aurora", "document-serif", 8, 0.1459],
  ["aurora", "glass", 2, 0.0305],
  ["aurora", "midnight", 1, 0.0416],
  ["aurora", "paper", 3, 0.0724],
  ["aurora", "slate", 2, 0.0482],
  ["aurora", "soft", 6, 0.0882],
  ["aurora", "terminal", 6, 0.1035],
  ["brutalist", "contrast", 5, 0.1811],
  ["brutalist", "default", 6, 0.2047],
  ["brutalist", "document", 4, 0.1184],
  ["brutalist", "document-serif", 3, 0.1245],
  ["brutalist", "glass", 7, 0.1995],
  ["brutalist", "midnight", 7, 0.1942],
  ["brutalist", "paper", 7, 0.1999],
  ["brutalist", "slate", 6, 0.1951],
  ["brutalist", "soft", 7, 0.2092],
  ["brutalist", "terminal", 6, 0.1988],
  ["contrast", "default", 2, 0.0731],
  ["contrast", "document", 6, 0.0768],
  ["contrast", "document-serif", 7, 0.0971],
  ["contrast", "glass", 3, 0.0691],
  ["contrast", "midnight", 4, 0.0925],
  ["contrast", "paper", 3, 0.107],
  ["contrast", "slate", 2, 0.0662],
  ["contrast", "soft", 7, 0.0741],
  ["contrast", "terminal", 6, 0.0998],
  ["default", "document", 7, 0.1221],
  ["default", "document-serif", 8, 0.1516],
  ["default", "glass", 2, 0.0415],
  ["default", "midnight", 1, 0.0588],
  ["default", "paper", 3, 0.0856],
  ["default", "slate", 1, 0.0498],
  ["default", "soft", 6, 0.0794],
  ["default", "terminal", 6, 0.1057],
  ["document", "document-serif", 1, 0.0482],
  ["document", "glass", 8, 0.1176],
  ["document", "midnight", 9, 0.122],
  ["document", "paper", 9, 0.1314],
  ["document", "slate", 6, 0.1028],
  ["document", "soft", 8, 0.1246],
  ["document", "terminal", 7, 0.1125],
  ["document-serif", "glass", 9, 0.1464],
  ["document-serif", "midnight", 9, 0.1507],
  ["document-serif", "paper", 8, 0.1299],
  ["document-serif", "slate", 7, 0.1309],
  ["document-serif", "soft", 8, 0.1436],
  ["document-serif", "terminal", 6, 0.1239],
  ["glass", "midnight", 1, 0.0443],
  ["glass", "paper", 4, 0.0781],
  ["glass", "slate", 4, 0.0282],
  ["glass", "soft", 5, 0.0701],
  ["glass", "terminal", 7, 0.0962],
  ["midnight", "paper", 3, 0.0867],
  ["midnight", "slate", 3, 0.052],
  ["midnight", "soft", 6, 0.0848],
  ["midnight", "terminal", 6, 0.0966],
  ["paper", "slate", 3, 0.0666],
  ["paper", "soft", 4, 0.072],
  ["paper", "terminal", 5, 0.0846],
  ["slate", "soft", 5, 0.0548],
  ["slate", "terminal", 5, 0.0809],
  ["soft", "terminal", 6, 0.0771],
];

/**
 * The pairs that do NOT meet the rule today, as `name/name: reason`.
 *
 * This is the sameness problem, finally a number: twenty of the twenty-one are
 * twelve themes that differ only in hue, and the twenty-first (`glass`/`slate`)
 * is two themes whose colours are closer together than one theme's own card is
 * to its own page. 1.1A-14 and 1.1A-15 are the tasks that empty this list; the
 * gate is ARMED (the list required to be empty) when they land.
 */
const OBLIGATIONS: Record<string, "axis" | "token" | "axis+token"> = {
  "aurora/contrast": "axis",
  "aurora/default": "axis",
  "aurora/glass": "axis",
  "aurora/midnight": "axis",
  "aurora/paper": "axis",
  "aurora/slate": "axis",
  "brutalist/document-serif": "axis",
  "contrast/default": "axis",
  "contrast/glass": "axis",
  "contrast/paper": "axis",
  "contrast/slate": "axis",
  "default/glass": "axis",
  "default/midnight": "axis",
  "default/paper": "axis",
  "default/slate": "axis",
  "document/document-serif": "axis",
  "glass/midnight": "axis",
  "glass/slate": "token",
  "midnight/paper": "axis",
  "midnight/slate": "axis",
  "paper/slate": "axis",
};

describe("the 66 shipped pairs, measured and pinned", () => {
  const measured = new Map<string, ReturnType<typeof distinctiveness>>();
  for (let i = 0; i < SHIPPED.length; i++) {
    for (let j = i + 1; j < SHIPPED.length; j++) {
      measured.set(`${SHIPPED[i].name}/${SHIPPED[j].name}`, distinctiveness(SHIPPED[i], SHIPPED[j], CONTEXT));
    }
  }

  it("covers every pair exactly once — 12 themes is 66 pairs", () => {
    expect(SHIPPED.length).toBe(12);
    expect(measured.size).toBe((12 * 11) / 2);
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

  it("enumerates the pairs that do not meet the rule yet — the 1.1A-14/15 obligation", () => {
    const failing: Record<string, "axis" | "token" | "axis+token"> = {};
    for (const [pair, result] of measured) {
      const reasons: string[] = [];
      if (result.axis_distance < AXIS_MIN) reasons.push("axis");
      if (result.token_distance != null && result.token_distance < TOKEN_MIN) reasons.push("token");
      if (reasons.length > 0) failing[pair] = reasons.join("+") as "axis" | "token" | "axis+token";
    }
    expect(failing).toEqual(OBLIGATIONS);
  });

  it("is not armed yet, and says so in one place", () => {
    // 1.1A-15 arms the gate by emptying OBLIGATIONS. This assertion is what
    // turns that into a single visible edit rather than a test nobody notices
    // has stopped meaning anything.
    const armed = Object.keys(OBLIGATIONS).length === 0;
    expect(armed).toBe(false);
    expect(Object.keys(OBLIGATIONS).length).toBe(21);
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
      contrast: "slate",
      default: "glass",
      document: "document-serif",
      "document-serif": "document",
      glass: "slate",
      midnight: "aurora",
      paper: "slate",
      slate: "glass",
      soft: "slate",
      terminal: "soft",
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
// The refusal
// ═══════════════════════════════════════════════════════════════════════════

describe("collisions · what the generator refuses, and what it says", () => {
  it("reports every collision, worst first, and nothing that clears both bars", () => {
    const subject = SHIPPED.find((t) => t.name === "default")!;
    const found = collisions(subject, SHIPPED, CONTEXT);
    expect(found.map((result) => result.nearest)).toEqual([
      "glass",
      "slate",
      "aurora",
      "midnight",
      "contrast",
      "paper",
    ]);
    expect(found.every((result) => !result.passes)).toBe(true);
    // Sorted by closeness, so the first sentence a user reads is the worst one.
    const distances = found.map((result) => result.token_distance!);
    expect([...distances].sort((x, y) => x - y)).toEqual(distances);
  });

  it("names the theme, the count and the axes that are identical", () => {
    const subject = SHIPPED.find((t) => t.name === "default")!;
    const slate = distinctiveness(subject, SHIPPED.find((t) => t.name === "slate")!, CONTEXT);
    const message = collisionMessage("default", slate);
    expect(message).toContain("'default' is too close to 'slate'");
    expect(message).toContain(`1 of the ${THEME_DERIVED_AXES.length} axes`);
    expect(message).toContain(`${AXIS_MIN} required`);
    expect(message).toContain("accent_chroma");
  });

  it("states the colour measure when THAT is what failed", () => {
    const glass = SHIPPED.find((t) => t.name === "glass")!;
    const slate = SHIPPED.find((t) => t.name === "slate")!;
    const result = distinctiveness(glass, slate, CONTEXT);
    // The one shipped pair that clears the axis rule and fails on colour.
    expect(result.axis_distance).toBeGreaterThanOrEqual(AXIS_MIN);
    expect(result.token_distance).toBeLessThan(TOKEN_MIN);
    const message = collisionMessage("glass", result);
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
