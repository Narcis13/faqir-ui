// faqir theme generate — deterministic parametric themes [task 0.6-11 · §C4]

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CONTRAST_PAIRS } from "../../src/audit/contrast-tokens";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Glob } from "bun";
import {
  ACCENT_STEPS,
  densityControlHeights,
  generateThemeBundle,
  TAP_TARGET_MIN_PX,
  themeScorecard,
  THEME_SCORECARD_VERSION,
  type ThemeGenerateInput,
} from "../../src/commands/theme-generate";
import { theme } from "../../src/commands/theme";
import { runAudit } from "../../src/audit/checker";
import {
  coerceSeedValue,
  LEGACY_NEUTRAL_DEFAULT,
  mergeSeeds,
  SEED_FLAGS,
  setSeedPath,
  SHARP_CORNER_REFUSAL,
} from "../../src/theme/seed";
import {
  checkThemeContrast,
  checkThemeElevation,
  CONTRAST_AA,
  CONTRAST_NON_TEXT,
  ELEVATION_MIN_DELTA,
  ELEVATION_PAIRS,
  NON_TEXT_PAIRS,
} from "../../src/audit/contrast-tokens";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";
import {
  inheritedTokens,
  isSurfaceTokenFile,
  overriddenTokens,
  surfaceTokens,
  THEME_AXIS_VALUES,
  THEME_SEED_AXES,
  validateThemeAxes,
  validateThemeManifest,
  validateThemeSeed,
} from "../../src/theme-manifest";
import { axesFromCss } from "../../src/theme/axes";
import { NEUTRAL_TINT_MIN_CHROMA } from "../../src/theme/families";
import {
  computeCoverage,
  parseThemeSchemes,
  requiredTokens,
  schemesFromManifest,
} from "../themes/theme-coverage";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const TOKENS_DIR = join(REGISTRY, "tokens");
const SRC_INDEX = join(ROOT, "src/index.ts");

const TOKEN_FILES = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .filter(isSurfaceTokenFile)
  .sort();
const BASE_SOURCES = TOKEN_FILES.map((file) => readFileSync(join(TOKENS_DIR, file), "utf8"));
const BASE_CSS = BASE_SOURCES.join("\n");
const SURFACE = surfaceTokens(BASE_SOURCES);
const SEMANTIC = readFileSync(join(TOKENS_DIR, "semantic.css"), "utf8");
const EFFECTS = readFileSync(join(TOKENS_DIR, "effects.css"), "utf8");
const REQUIRED = requiredTokens(SEMANTIC, EFFECTS);
const BASE = new Set([
  ...parseThemeSchemes(SEMANTIC).light,
  ...parseThemeSchemes(EFFECTS).light,
]);

const DEFAULT_INPUT: ThemeGenerateInput = {
  name: "sample-brand",
  accent: "oklch(0.55 0.2 150)",
  neutral: "cool",
  radius: "md",
  scheme: "both",
  document: false,
};

function expectFullGauntlet(input: ThemeGenerateInput): void {
  const bundle = generateThemeBundle(input, BASE_SOURCES);
  for (const file of bundle.generated) {
    expect(validateThemeManifest(file.manifest)).toEqual([]);
    expect(file.manifest.tokens_overridden).toEqual(overriddenTokens(file.css));
    expect(file.manifest.tokens_inherited).toEqual(inheritedTokens(file.css, SURFACE));

    const coverage = computeCoverage(
      file.css,
      REQUIRED.all,
      BASE,
      schemesFromManifest(file.manifest.scheme),
    );
    expect(coverage.filter((cell) => !cell.covered)).toEqual([]);
    expect(checkThemeContrast({
      themeName: file.name,
      themeCss: file.css,
      baseCss: BASE_CSS,
    })).toEqual([]);
    expect(file.contrast.length).toBeGreaterThan(0);
    expect(file.contrast.every((pair) => pair.passes && pair.ratio >= CONTRAST_AA)).toBe(true);
  }
}

describe("theme generate · pure deterministic generator", () => {
  it("returns byte-identical output for identical inputs", () => {
    const first = generateThemeBundle(DEFAULT_INPUT, BASE_SOURCES);
    const second = generateThemeBundle(DEFAULT_INPUT, BASE_SOURCES);
    expect(second).toEqual(first);
  });

  it("emits the fixed 11-step accent ramp and semantic state mappings", () => {
    const [file] = generateThemeBundle(DEFAULT_INPUT, BASE_SOURCES).generated;
    for (const step of ACCENT_STEPS) {
      expect(file.css).toContain(`--palette-sample-brand-${step}`);
    }
    const paletteTokens = overriddenTokens(file.css)
      .filter((token) => token.startsWith("palette-sample-brand-"));
    expect(paletteTokens.length).toBe(11);
    expect(file.css).toContain("--color-primary-hover");
    expect(file.css).toContain("--color-primary-active");
    expect(file.css).toContain("--color-primary-subtle");
    // A dual-scheme theme states both ramp steps in one declaration [1.1A-06];
    // the mapping asserted here is that each side still points at the ramp.
    expect(file.css).toMatch(
      /--color-primary\s*: light-dark\(var\(--palette-sample-brand-\d+\), var\(--palette-sample-brand-\d+\)\);/,
    );
  });

  const HUE_SAMPLES = [
    ["coral", "oklch(0.62 0.2 25)"],
    ["amber", "oklch(0.78 0.16 85)"],
    ["green", "oklch(0.6 0.18 150)"],
    ["blue", "oklch(0.58 0.2 245)"],
    ["violet", "oklch(0.6 0.2 310)"],
  ] as const;

  for (const [name, accent] of HUE_SAMPLES) {
    it(`${name} passes coverage, manifest consistency, and contrast gates`, () => {
      expectFullGauntlet({ ...DEFAULT_INPUT, name: `brand-${name}`, accent });
    });
  }

  it("auto-selects a darker primary step for a low-contrast light accent", () => {
    const bundle = generateThemeBundle({
      ...DEFAULT_INPUT,
      accent: "oklch(0.96 0.16 95)",
    }, BASE_SOURCES);
    const primary = bundle.generated[0].contrast.find(
      (pair) => pair.scheme === "light" &&
        pair.foreground === "color-primary-fg" &&
        pair.background === "color-primary",
    );
    expect(primary).toBeDefined();
    expect(primary!.auto_adjusted).toBe(true);
    expect(primary!.ratio).toBeGreaterThanOrEqual(CONTRAST_AA);
  });

  it("accepts both oklch CSS and short/full hex accents", () => {
    for (const accent of ["oklch(55% 0.2 -30deg)", "#0af", "#0ea5e9"]) {
      const bundle = generateThemeBundle({ ...DEFAULT_INPUT, accent }, BASE_SOURCES);
      expect(bundle.generated[0].contrast.every((pair) => pair.passes)).toBe(true);
      expect(bundle.accent.hue).toBeGreaterThanOrEqual(0);
      expect(bundle.accent.hue).toBeLessThan(360);
    }
  });

  it("rejects garbage and translucent accents with actionable examples", () => {
    for (const accent of ["definitely-not-a-color", "oklch(0.5 0.2 20 / 0.5)", "#abcd"]) {
      expect(() => generateThemeBundle({ ...DEFAULT_INPUT, accent }, BASE_SOURCES))
        .toThrow(/Invalid accent.*oklch.*#rrggbb/s);
    }
  });

  // ── The one-block default, and the flag that restores the old shape [1.1A-06] ──
  describe("dual themes collapse to one light-dark() block", () => {
    const oneBlock = generateThemeBundle(DEFAULT_INPUT, BASE_SOURCES).generated[0];
    const legacy = generateThemeBundle(
      { ...DEFAULT_INPUT, legacyBlocks: true },
      BASE_SOURCES,
    ).generated[0];

    /** The declarations inside every `[data-theme=...]` block of a stylesheet. */
    const inDarkBlocks = (css: string) =>
      [...css.matchAll(/\[data-theme="(?:dark|auto)"\]\s*\{([^}]*)\}/g)]
        .flatMap((m) => [...m[1].matchAll(/--([\w-]+)\s*:/g)].map((d) => d[1]));

    it("writes no colour into a dark block by default", () => {
      const colours = inDarkBlocks(oneBlock.css).filter((t) => t.startsWith("color-"));
      expect(colours).toEqual([]);
      // The shadow ramp is the deliberate exception: `light-dark()` is a <color>
      // function and a shadow list is not a colour, so the ramp keeps its blocks
      // in BOTH forms rather than being faked with alpha-0 layers.
      expect(new Set(inDarkBlocks(oneBlock.css))).toEqual(
        new Set(["shadow-color", "shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"]),
      );
    });

    it("--legacy-blocks restores the three-block colour form", () => {
      const colours = new Set(inDarkBlocks(legacy.css).filter((t) => t.startsWith("color-")));
      expect([...colours].sort()).toEqual([...REQUIRED.colors].sort());
      expect(legacy.css).not.toContain("light-dark(");
    });

    it("the two forms are the same theme: identical manifest and scheme values", () => {
      // The manifest is derived from the CSS, so a shape change that lost or
      // gained a token would show up here before any renderer saw it.
      expect(oneBlock.manifest).toEqual(legacy.manifest);
      expect(oneBlock.contrast).toEqual(legacy.contrast);
      for (const scheme of ["light", "dark", "auto"] as const) {
        const one = parseThemeSchemes(oneBlock.css)[scheme];
        const three = parseThemeSchemes(legacy.css)[scheme];
        expect([...one].sort(), scheme).toEqual([...three].sort());
      }
    });

    it("both forms pass the full gauntlet", () => {
      expectFullGauntlet(DEFAULT_INPUT);
      expectFullGauntlet({ ...DEFAULT_INPUT, legacyBlocks: true });
    });

    it("single-scheme themes are untouched by the flag", () => {
      for (const scheme of ["light", "dark"] as const) {
        const plain = generateThemeBundle({ ...DEFAULT_INPUT, scheme }, BASE_SOURCES).generated[0];
        const flagged = generateThemeBundle(
          { ...DEFAULT_INPUT, scheme, legacyBlocks: true },
          BASE_SOURCES,
        ).generated[0];
        expect(flagged.css, scheme).toBe(plain.css);
        expect(plain.css, scheme).not.toContain("light-dark(");
      }
    });
  });

  it("honors light-only output without stray dark declarations", () => {
    const [file] = generateThemeBundle({
      ...DEFAULT_INPUT,
      scheme: "light",
    }, BASE_SOURCES).generated;
    const schemes = parseThemeSchemes(file.css);
    expect(file.manifest.scheme).toBe("light");
    expect(file.manifest.dark_mode).toBe("none");
    expect(schemes.dark.size).toBe(0);
    expect(schemes.auto.size).toBe(0);
    expectFullGauntlet({ ...DEFAULT_INPUT, scheme: "light" });
  });

  it("honors dark-only output with complete explicit and automatic dark blocks", () => {
    const input: ThemeGenerateInput = {
      ...DEFAULT_INPUT,
      neutral: "gray",
      radius: "sm",
      scheme: "dark",
    };
    const [file] = generateThemeBundle(input, BASE_SOURCES).generated;
    const schemes = parseThemeSchemes(file.css);
    expect(file.manifest.scheme).toBe("dark");
    expect(file.manifest.dark_mode).toBe("native");
    // Every required token, plus one: the generator also writes --shadow-color
    // [1.1A-04], the channel its own ramp is cast in. It is deliberately not in
    // REQUIRED (a theme that omits it inherits `0 0 0`, which is what an
    // untinted theme wants), but a theme the generator WRITES states it, or the
    // five steps it emits would read a channel from somewhere else.
    for (const scheme of [schemes.dark, schemes.auto]) {
      expect([...REQUIRED.all].filter((token) => !scheme.has(token))).toEqual([]);
      expect(scheme.has("shadow-color")).toBe(true);
      expect(scheme.size).toBe(REQUIRED.all.length + 1);
    }
    expect(file.contrast.map((pair) => pair.scheme)).toEqual(
      Array(file.contrast.length).fill("dark"),
    );
    expectFullGauntlet(input);
  });

  // ── The seed matrix, and the gauntlet over it [1.1A-10] ──────────────────
  //
  // The gauntlet is the same one the five hue samples above run — coverage,
  // manifest consistency, every contrast pair, the elevation ramp. What is new
  // is the breadth: one seed per value of every enumerated axis, so a family
  // that emitted a colour the gate rejects fails here rather than on the day
  // somebody generates that theme.
  describe("the full seed matrix passes the gauntlet", () => {
    const cases: Array<[string, ThemeGenerateInput]> = [];
    for (const [path, values] of Object.entries(THEME_AXIS_VALUES)) {
      for (const value of values) {
        if (path === "type.pairing" && value === "custom") continue;
        const slug = `${path.replace(/\./g, "-")}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`.toLowerCase();
        const input: Record<string, unknown> = { name: `seed-${slug}`, accent: DEFAULT_INPUT.accent };
        const set = (p: string, v: unknown) => {
          const parts = p.split(".");
          let cursor = input;
          for (const key of parts.slice(0, -1)) cursor = (cursor[key] ??= {}) as Record<string, unknown>;
          cursor[parts[parts.length - 1]] = v;
        };
        set(path, value);
        // The one coupling the classifier forces (see PILL_COUPLING).
        if (path === "shape.radius" && value === "pill") set("controls.button", "pill");
        if (path === "controls.button" && value === "pill") set("shape.radius", "pill");
        cases.push([`${path} = ${value}`, input as unknown as ThemeGenerateInput]);
      }
    }

    it(`covers every enumerated axis value (${cases.length} seeds)`, () => {
      const covered = Object.values(THEME_AXIS_VALUES).reduce((n, values) => n + values.length, 0) - 1;
      expect(cases.length).toBe(covered);
    });

    for (const [label, input] of cases) {
      it(`${label} passes coverage, manifest consistency, contrast and elevation`, () => {
        expectFullGauntlet(input);
      });
    }
  });

  it("carries the filled-out seed and the derived axes on the bundle", () => {
    const bundle = generateThemeBundle({
      ...DEFAULT_INPUT,
      depth: "glass",
      motion: "springy",
      material: "grain",
    }, BASE_SOURCES);
    // The seed is complete — every axis, defaults filled in — because that is
    // what 1.1A-11 writes to `<name>.seed.json` beside the stylesheet.
    expect(validateThemeSeed(bundle.seed)).toEqual([]);
    expect(bundle.seed.depth).toBe("glass");
    expect(bundle.seed.shape).toEqual({ radius: "soft", border: "hairline", corner: "round" });
    // …and the axes are what the CSS derives, not a copy of the seed: the
    // generator refuses to return them otherwise.
    expect(validateThemeAxes(bundle.axes)).toEqual([]);
    expect(bundle.axes).toEqual(axesFromCss(bundle.generated[0].css, BASE_SOURCES));
  });

  it("refuses a theme name that would produce invalid custom properties", () => {
    for (const name of ["My Brand", "brand.1", "1brand", ""]) {
      expect(() => generateThemeBundle({ ...DEFAULT_INPUT, name }, BASE_SOURCES))
        .toThrow(/Invalid theme name/);
    }
  });

  it("stays pure: generating writes nothing to disk", () => {
    // The MCP tool and Night Shift both call this function directly, with no
    // output directory in sight, so a filesystem write here would be a
    // behaviour change neither of them could see coming.
    const before = readdirSync(ROOT).sort();
    generateThemeBundle({ ...DEFAULT_INPUT, document: true, depth: "glass" }, BASE_SOURCES);
    expect(readdirSync(ROOT).sort()).toEqual(before);
    expect(existsSync(join(ROOT, "themes"))).toBe(false);
  });

  it("emits a light-only, flat, print-ready brand document variant", () => {
    const bundle = generateThemeBundle({ ...DEFAULT_INPUT, document: true }, BASE_SOURCES);
    const document = bundle.generated.find((file) => file.kind === "document");
    expect(document).toBeDefined();
    expect(document!.name).toBe("sample-brand-document");
    expect(document!.manifest.scheme).toBe("light");
    expect(document!.css).toContain("@page");
    expect(document!.css).toContain('@media print');
    expect(document!.css).toMatch(/--shadow-xl\s*: none;/);
    expect(document!.css).toContain('--radius-2xl');
    expectFullGauntlet({ ...DEFAULT_INPUT, document: true });
  });
});

// ── The 1.0 golden: a legacy input still gets 1.0's colours [1.1A-10] ───────
//
// `tests/fixtures/theme-generate/v1/` holds output captured from the v1.0.0
// generator itself (see the README beside it). A project that has been running
// `faqir theme generate` since 1.0 passes exactly those inputs, and 1.1's
// seed-driven generator must not quietly restyle its brand.
//
// The comparison is COLOUR ONLY (`--palette-*`, `--color-*`), per scheme block.
// Everything else moved on purpose: the type ramp, the silhouette tokens and
// the axis families are new, and a 1.0 theme did not state them.
describe("legacy inputs keep 1.0's colours", () => {
  const GOLDEN_DIR = join(ROOT, "tests/fixtures/theme-generate/v1");
  const CASES: Array<{ id: string; input: ThemeGenerateInput }> =
    JSON.parse(readFileSync(join(GOLDEN_DIR, "cases.json"), "utf8"));

  /** `<scope>/<token>` → value, where scope is the block the declaration is in. */
  function colourDeclarations(css: string): Map<string, string> {
    const out = new Map<string, string>();
    let scope = "root";
    for (const line of css.split("\n")) {
      const text = line.trim();
      if (/^\[data-theme="dark"\]/.test(text)) scope = "dark";
      else if (/^\[data-theme="auto"\]/.test(text)) scope = "auto";
      else if (/^:root/.test(text) && scope !== "auto") scope = "root";
      const declaration = /^--([\w-]+)\s*:\s*(.+?);$/.exec(text);
      if (declaration && /^(palette|color)-/.test(declaration[1])) {
        out.set(`${scope}/${declaration[1]}`, declaration[2].trim());
      }
    }
    return out;
  }

  /**
   * The ONE deliberate colour change, enumerated so the gate fails in both
   * directions: a tinted neutral's chroma is floored at
   * `NEUTRAL_TINT_MIN_CHROMA`. At 1.0's per-step scale factors a `cool`/`warm`
   * page landed at 0.0015 chroma — below `axesFromCss`'s own
   * `NEUTRAL_GRAY_MAX_CHROMA` line — so `--neutral cool` produced a page the
   * classifier called gray, and was right to. Six declarations move per
   * cool/warm theme; a `gray` theme is untouched.
   */
  const FLOORED = new Set([
    "root/color-bg",
    "root/color-bg-subtle",
    "root/color-bg-muted",
    "root/color-secondary",
    "root/color-fg",
    "root/color-secondary-fg",
    "dark/color-fg",
    "dark/color-secondary-fg",
    "auto/color-fg",
    "auto/color-secondary-fg",
  ]);

  const chromaOf = (value: string) => Number(/^oklch\(\s*[\d.]+\s+([\d.]+)/.exec(value)?.[1] ?? NaN);

  for (const { id, input } of CASES) {
    it(`${id} reproduces v1.0.0's colours`, () => {
      // `--legacy-blocks` is how the 1.1 generator spells 1.0's three-block
      // shape; the one-block form is proven the same theme elsewhere in this file.
      const bundle = generateThemeBundle({ ...input, legacyBlocks: true }, BASE_SOURCES);
      for (const file of bundle.generated) {
        const golden = colourDeclarations(readFileSync(join(GOLDEN_DIR, `${id}.${file.kind}.css`), "utf8"));
        const now = colourDeclarations(file.css);
        expect([...now.keys()].sort(), `${id}.${file.kind} token set`).toEqual([...golden.keys()].sort());
        const moved: string[] = [];
        for (const [key, value] of golden) {
          if (now.get(key) === value) continue;
          moved.push(key);
          // A moved declaration is only allowed if it is a floored tint: same
          // lightness and hue, chroma raised to exactly the floor.
          expect(FLOORED.has(key), `${id}.${file.kind} ${key} moved`).toBe(true);
          expect(chromaOf(value), `${id} ${key} was already above the floor`)
            .toBeLessThan(NEUTRAL_TINT_MIN_CHROMA);
          expect(chromaOf(now.get(key)!), `${id} ${key}`).toBe(NEUTRAL_TINT_MIN_CHROMA);
          expect(now.get(key)!.replace(/\s[\d.]+\s/, " C "), `${id} ${key} lightness/hue`)
            .toBe(value.replace(/\s[\d.]+\s/, " C "));
        }
        // …and the converse: a gray theme moves nothing at all.
        if (input.neutral === "gray") expect(moved, `${id}.${file.kind}`).toEqual([]);
      }
    });
  }

  it("covers all three 1.0 neutrals, all three radii and all three schemes", () => {
    const seen = (key: keyof ThemeGenerateInput) => new Set(CASES.map(({ input }) => input[key]));
    expect([...seen("neutral")].sort()).toEqual(["cool", "gray", "warm"]);
    expect([...seen("radius")].sort()).toEqual(["lg", "md", "sm"]);
    expect([...seen("scheme")].sort()).toEqual(["both", "dark", "light"]);
    expect(CASES.some(({ input }) => input.document)).toBe(true);
  });

  it("is not vacuous: the golden really does pin the accent ramp", () => {
    // Prove the comparison has teeth by generating the same case with a
    // different accent and watching the palette diverge.
    const { id, input } = CASES[0];
    const golden = readFileSync(join(GOLDEN_DIR, `${id}.theme.css`), "utf8");
    const other = generateThemeBundle(
      { ...input, accent: "oklch(0.55 0.2 20)", legacyBlocks: true },
      BASE_SOURCES,
    ).generated[0].css;
    expect(other).not.toBe(golden);
    expect(other).not.toContain("--palette-golden-500      : oklch(0.55 0.2 150)");
  });
});

describe("faqir theme generate · CLI", () => {
  let tempDir: string;

  // One directory PER TEST, not per file. These cases never meant to share a
  // `themes/` folder — they only happened to, and 1.1A-12's distinctiveness
  // gate made that accidental sharing visible: a second theme generated into
  // the first one's directory is now measured against it and refused when it is
  // a recolour. That refusal is tested on purpose in
  // tests/themes/distinctiveness.test.ts; here it would be a fixture artefact.
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "faqir-theme-generate-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function run(args: string[], cwd = tempDir) {
    // `process.execPath` is the Bun binary under `bun test`, so this exercises
    // the source on Bun and nothing else. The compiled bundle on Node is covered
    // by tests/build/dist-cli.test.ts and the shape loop in
    // tests/commands/json-output.test.ts. [W3-5]
    const result = runSync(process.execPath, [SRC_INDEX, "theme", "generate", ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: SPAWN_TIMEOUT.CLI,
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }

  it("--legacy-blocks reaches the renderer and is reported back", () => {
    // The flag is only a flag if it survives parsing: without the arm in
    // parseThemeGenerateArgs it would be rejected as an unknown option, and
    // without the field on the bundle the JSON hook would claim one shape while
    // the CSS on disk had the other.
    const result = run(["legacy-brand", "--accent", "#0ea5e9", "--legacy-blocks", "--json"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.options.legacy_blocks).toBe(true);
    const css = readFileSync(join(tempDir, "themes/legacy-brand.css"), "utf8");
    expect(css).not.toContain("light-dark(");
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("--color-bg");

    // The unflagged shape is proven in-process above; spawning a second CLI for
    // it would only widen this file's exposure to the bun-spawns-bun hang that
    // tests/helpers/spawn.ts documents.
  });

  it("lists --legacy-blocks in its own help", () => {
    const help = run(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--legacy-blocks");
  });

  it("writes web + document artifacts and returns the automation JSON hook", () => {
    const result = run([
      "cli-brand",
      "--accent", "#d97706",
      "--neutral", "warm",
      "--radius", "lg",
      "--scheme", "both",
      "--document",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.theme_generate_schema_version).toBe(2);
    expect(report.scorecard_version).toBe(2);
    expect(report.command).toBe("theme generate");
    // Scorecard v2, through the real CLI on the real runtime: the shape an
    // agent parsing `--json` receives, asserted as a key set so a block that
    // stops being emitted fails here rather than going quietly missing.
    expect(Object.keys(report).sort()).toEqual([
      "accent",
      "axes",
      "command",
      "contrast",
      "distinctiveness",
      "elevation",
      "focus_ring",
      "generated",
      "name",
      "options",
      "scorecard_version",
      "seed",
      "tap_targets",
      "theme_generate_schema_version",
    ]);
    expect(validateThemeSeed(report.seed)).toEqual([]);
    expect(validateThemeAxes(report.axes)).toEqual([]);
    expect(report.elevation.every((row: { passes: boolean }) => row.passes)).toBe(true);
    expect(report.focus_ring.every((row: { passes: boolean }) => row.passes)).toBe(true);
    expect(report.tap_targets.every((row: { passes: boolean }) => row.passes)).toBe(true);
    expect(report.distinctiveness).toBeNull();
    // `preview` is a REQUIRED field of every theme manifest, so the command that
    // writes the manifest writes the harness too — a shipped manifest must not
    // name a file that is not there (task 1.0R-10).
    expect(report.generated).toEqual([
      {
        kind: "theme",
        name: "cli-brand",
        css: "themes/cli-brand.css",
        manifest: "themes/cli-brand.theme.json",
        preview: "themes/cli-brand.preview.html",
        seed: "themes/cli-brand.seed.json",
      },
      {
        kind: "document",
        name: "cli-brand-document",
        css: "themes/cli-brand-document.css",
        manifest: "themes/cli-brand-document.theme.json",
        preview: "themes/cli-brand-document.preview.html",
      },
    ]);
    // One entry per declared pair per scheme (light, dark, auto). Derived
    // rather than hardcoded: the pair list grew in W3-3 and a literal 39 made
    // that read as a regression instead of as coverage.
    expect(report.contrast.length).toBe(CONTRAST_PAIRS.length * 3);
    expect(report.contrast.every((pair: { passes: boolean }) => pair.passes)).toBe(true);
    for (const file of report.generated) {
      expect(existsSync(join(tempDir, file.css))).toBe(true);
      expect(existsSync(join(tempDir, file.manifest))).toBe(true);
      expect(existsSync(join(tempDir, file.preview))).toBe(true);
      // The manifest's own `preview` resolves relative to the manifest, which is
      // the path the report names.
      const manifest = JSON.parse(readFileSync(join(tempDir, file.manifest), "utf8"));
      expect(join("themes", manifest.preview)).toBe(file.preview);
    }
  });

  it("overwrites deterministically on repeat generation", () => {
    const args = ["stable-brand", "--accent", "#2563eb", "--json"];
    expect(run(args).status).toBe(0);
    const firstCss = readFileSync(join(tempDir, "themes/stable-brand.css"), "utf8");
    const firstManifest = readFileSync(join(tempDir, "themes/stable-brand.theme.json"), "utf8");
    expect(run(args).status).toBe(0);
    expect(readFileSync(join(tempDir, "themes/stable-brand.css"), "utf8")).toBe(firstCss);
    expect(readFileSync(join(tempDir, "themes/stable-brand.theme.json"), "utf8")).toBe(firstManifest);
  });

  it("fails helpfully before writing for garbage input", () => {
    const invalidDir = mkdtempSync(join(tmpdir(), "faqir-theme-invalid-"));
    try {
      const result = run(["bad-brand", "--accent", "garbage", "--json"], invalidDir);
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.ok).toBe(false);
      expect(report.error.message).toMatch(/Invalid accent.*oklch.*#rrggbb/s);
      expect(existsSync(join(invalidDir, "themes"))).toBe(false);
    } finally {
      rmSync(invalidDir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The seed reaches the command line, and the scorecard reports it  [1.1A-11]
// ═══════════════════════════════════════════════════════════════════════════

describe("theme generate · one flag per axis", () => {
  it("names every enumerated axis exactly once, and nothing else", () => {
    // The flag table is the CLI's half of the axis vocabulary. Derived
    // completeness rather than a written-down list: an axis added to
    // THEME_AXIS_VALUES that nobody gives a flag would silently be reachable
    // only through a hand-written seed file.
    const paths = Object.values(SEED_FLAGS);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter((path) => path !== "accent").sort())
      .toEqual(Object.keys(THEME_AXIS_VALUES).sort());
    // `accent` is the one seed field with no vocabulary — it is a colour.
    expect(SEED_FLAGS.accent).toBe("accent");
    // `document` is a boolean and takes no value, so it is a flag rather than
    // an axis flag; `radius` is the 1.0 compatibility spelling of `--shape`.
    expect(SEED_FLAGS.document).toBeUndefined();
    expect(SEED_FLAGS.radius).toBeUndefined();
    expect(SEED_FLAGS.shape).toBe("shape.radius");
  });

  it("coerces the two numeric axes and leaves every other value a string", () => {
    expect(coerceSeedValue("type.scale", "1.25")).toBe(1.25);
    expect(coerceSeedValue("type.base", "18")).toBe(18);
    // A value that is not a number stays a string, so the vocabulary — not a
    // NaN — is what the error names.
    expect(coerceSeedValue("type.scale", "huge")).toBe("huge");
    expect(coerceSeedValue("depth", "glass")).toBe("glass");
    for (const [path, values] of Object.entries(THEME_AXIS_VALUES)) {
      const numeric = typeof values[0] === "number";
      expect(typeof coerceSeedValue(path, String(values[0]))).toBe(numeric ? "number" : "string");
    }
  });

  it("writes a dotted path into a nested seed, creating the groups", () => {
    const seed: Record<string, unknown> = {};
    setSeedPath(seed, "type.voice.weight", "black");
    setSeedPath(seed, "type.pairing", "slab");
    expect(seed).toEqual({ type: { voice: { weight: "black" }, pairing: "slab" } });
  });

  it("merges a seed file with flags, deeply, flags winning", () => {
    const file = {
      name: "from-file",
      accent: "#123456",
      type: { pairing: "slab", voice: { weight: "black", tracking: "wide" } },
      shape: { radius: "sharp" },
      depth: "hard",
    };
    const flags = { type: { voice: { weight: "regular" } }, depth: "glass" };
    expect(mergeSeeds(file, flags)).toEqual({
      name: "from-file",
      accent: "#123456",
      // The flag replaced one leaf and left its siblings alone…
      type: { pairing: "slab", voice: { weight: "regular", tracking: "wide" } },
      shape: { radius: "sharp" },
      // …and replaced the scalar outright.
      depth: "glass",
    });
    // Neither input is mutated: the CLI reuses the file object for its report.
    expect(file.depth).toBe("hard");
  });
});

describe("theme generate · scorecard v2", () => {
  const DENSITY_CSS = readFileSync(join(TOKENS_DIR, "density.css"), "utf8");

  function scorecardFor(input: ThemeGenerateInput, outDir?: string) {
    const bundle = generateThemeBundle(input, BASE_SOURCES);
    return themeScorecard(bundle, BASE_SOURCES, { outDir, densityCss: DENSITY_CSS });
  }

  it("is versioned, and the 1.0 key moves with it", () => {
    const card = scorecardFor(DEFAULT_INPUT);
    expect(card.scorecard_version).toBe(2);
    // The 1.0 payload's own version key, kept so an automation reading v1 sees
    // the number move rather than a field vanish. Derived from one constant.
    expect(card.theme_generate_schema_version).toBe(THEME_SCORECARD_VERSION);
    expect(card.command).toBe("theme generate");
  });

  it("carries the resolved seed and the derived axes, not a copy of the request", () => {
    const card = scorecardFor({ ...DEFAULT_INPUT, depth: "glass", density: "compact" });
    expect(validateThemeSeed(card.seed)).toEqual([]);
    expect(validateThemeAxes(card.axes)).toEqual([]);
    expect(card.seed.depth).toBe("glass");
    expect(card.axes.depth).toBe("glass");
    expect(card.axes.density).toBe("compact");
    // Every absent axis is filled in — this object IS `<name>.seed.json`.
    expect(Object.keys(card.seed).sort()).toEqual([...THEME_SEED_AXES, "name"].sort());
  });

  it("reports one elevation ΔE per ramp pair per scheme per file", () => {
    const card = scorecardFor({ ...DEFAULT_INPUT, document: true });
    // both (2 schemes) + the light-only document companion = 3 scheme-files.
    expect(card.elevation.length).toBe(ELEVATION_PAIRS.length * 3);
    expect(card.elevation.every((row) => row.passes)).toBe(true);
    expect(card.elevation.every((row) => row.threshold === ELEVATION_MIN_DELTA)).toBe(true);
    // The numbers are real measurements, not a pass flag with a shape.
    for (const row of card.elevation) {
      expect(row.delta).toBeGreaterThanOrEqual(ELEVATION_MIN_DELTA);
    }
    // …and the same deltas the elevation gate computes: the scorecard reads
    // through `buildSchemeLookups`, which is the gate's own cascade model.
    expect(checkThemeElevation({
      themeName: card.name,
      themeCss: generateThemeBundle({ ...DEFAULT_INPUT, document: true }, BASE_SOURCES).generated[0].css,
      baseCss: BASE_CSS,
    })).toEqual([]);
  });

  it("reports the focus ring against every surface it lands on", () => {
    const card = scorecardFor(DEFAULT_INPUT);
    expect(card.focus_ring.length).toBe(NON_TEXT_PAIRS.length * 2);
    expect(card.focus_ring.every((row) => row.threshold === CONTRAST_NON_TEXT)).toBe(true);
    expect(card.focus_ring.every((row) => row.ring === "color-ring")).toBe(true);
    expect(card.focus_ring.every((row) => row.passes && !row.translucent)).toBe(true);
    for (const row of card.focus_ring) expect(row.ratio).toBeGreaterThanOrEqual(CONTRAST_NON_TEXT);
  });

  it("a translucent ring is reported as a finding, not skipped", () => {
    // The 1.0 default shipped `oklch(… / 0.4)` and passed the gate in 19 of 24
    // theme × mode combinations because "we cannot compute it" read as a skip.
    // The scorecard says so out loud instead of omitting the row.
    const bundle = generateThemeBundle(DEFAULT_INPUT, BASE_SOURCES);
    const translucent = {
      ...bundle,
      generated: bundle.generated.map((file) => ({
        ...file,
        css: file.css.replace(/--color-ring\s*:[^;]+;/g, "--color-ring: oklch(0.55 0.22 264 / 0.4);"),
      })),
    };
    const card = themeScorecard(translucent, BASE_SOURCES, { densityCss: DENSITY_CSS });
    expect(card.focus_ring.length).toBe(NON_TEXT_PAIRS.length * 2);
    expect(card.focus_ring.every((row) => row.translucent)).toBe(true);
    expect(card.focus_ring.every((row) => row.ratio === null && !row.passes)).toBe(true);
  });

  it("reports the tap targets the seed's density lands on", () => {
    for (const density of THEME_AXIS_VALUES.density) {
      const card = scorecardFor({ ...DEFAULT_INPUT, density });
      expect(card.tap_targets.length).toBe(4);
      expect(card.tap_targets.every((target) => target.density === density)).toBe(true);
      expect(card.tap_targets.every((target) => target.threshold_px === TAP_TARGET_MIN_PX)).toBe(true);
      // Every ramp the registry ships clears SC 2.5.8 — asserted rather than
      // assumed, because a density axis whose controls are 20px tall is a
      // personality that fails an accessibility criterion.
      expect(card.tap_targets.every((target) => target.passes)).toBe(true);
      // The heights are read out of density.css, not restated here.
      const expected = densityControlHeights(DENSITY_CSS, density);
      expect(Object.fromEntries(card.tap_targets.map((t) => [t.control, t.height_px])))
        .toEqual(expected);
      expect(expected["input-height"]).toBe(expected["control-height-md"]);
    }
  });

  it("reads each density block's own ramp, and nothing when there is none", () => {
    const compact = densityControlHeights(DENSITY_CSS, "compact");
    const spacious = densityControlHeights(DENSITY_CSS, "spacious");
    expect(compact["control-height-md"]).toBeLessThan(spacious["control-height-md"]!);
    // A commented-out declaration is not a ramp, and an unknown density has no
    // block at all — both come back null rather than as a wrong number.
    expect(densityControlHeights("/* --control-height-md: 99px; */", "compact")["control-height-md"])
      .toBeNull();
    expect(densityControlHeights(DENSITY_CSS, "roomy")["control-height-md"]).toBeNull();
    // …and with no density stylesheet at all the scorecard simply has no tap
    // targets, rather than inventing a ramp.
    const bundle = generateThemeBundle(DEFAULT_INPUT, BASE_SOURCES);
    expect(themeScorecard(bundle, BASE_SOURCES).tap_targets).toEqual([]);
  });

  it("names every artefact under --out, and one seed per generation", () => {
    const card = scorecardFor({ ...DEFAULT_INPUT, document: true }, "registry/themes");
    expect(card.generated.map((file) => file.css)).toEqual([
      "registry/themes/sample-brand.css",
      "registry/themes/sample-brand-document.css",
    ]);
    expect(card.generated[0].seed).toBe("registry/themes/sample-brand.seed.json");
    // The document companion is a print variant of the same seed rather than a
    // theme with a seed of its own, so it gets no `.seed.json`.
    expect(card.generated[1].seed).toBeUndefined();
    expect(card.generated.every((file) => file.preview.endsWith(".preview.html"))).toBe(true);
    // The default is `themes/`, which is where 1.0 wrote.
    expect(scorecardFor(DEFAULT_INPUT).generated[0].css).toBe("themes/sample-brand.css");
  });

  it("flattens the contrast report the 1.0 payload already carried", () => {
    const bundle = generateThemeBundle({ ...DEFAULT_INPUT, document: true }, BASE_SOURCES);
    const card = themeScorecard(bundle, BASE_SOURCES, { densityCss: DENSITY_CSS });
    expect(card.contrast).toEqual(bundle.generated.flatMap((file) => file.contrast));
    expect(card.contrast.length).toBe(CONTRAST_PAIRS.length * 3);
    expect(card.options).toEqual({
      neutral: "cool",
      radius: "md",
      scheme: "both",
      document: true,
      legacy_blocks: false,
    });
    // 1.1A-12's number, and it says so rather than being absent.
    expect(card.distinctiveness).toBeNull();
  });

  it("is pure — assembling a scorecard writes nothing", () => {
    const before = readdirSync(ROOT).sort();
    scorecardFor({ ...DEFAULT_INPUT, document: true });
    expect(readdirSync(ROOT).sort()).toEqual(before);
  });
});

describe("theme generate · the manifest carries its provenance", () => {
  it("puts the seed and the axes on the generated theme, and neither on its document companion", () => {
    const bundle = generateThemeBundle({ ...DEFAULT_INPUT, document: true, depth: "hard" }, BASE_SOURCES);
    const [theme, document] = bundle.generated;
    expect(theme.manifest.seed).toEqual(bundle.seed);
    expect(theme.manifest.axes).toEqual(bundle.axes);
    expect(validateThemeManifest(theme.manifest)).toEqual([]);
    // The companion's CSS was never run through `axesFromCss`, so writing the
    // parent's axes onto it would be a claim rather than a derivation.
    expect(document.manifest.seed).toBeUndefined();
    expect(document.manifest.axes).toBeUndefined();
    expect(validateThemeManifest(document.manifest)).toEqual([]);
  });
});

describe("theme generate · the CLI surface", () => {
  let cwd: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = mkdtempSync(join(tmpdir(), "faqir-theme-cli-"));
    process.chdir(cwd);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(cwd, { recursive: true, force: true });
  });

  const read = (rel: string) => readFileSync(join(cwd, rel), "utf8");
  const readJson = (rel: string) => JSON.parse(read(rel));

  it("writes css, manifest, seed and preview, and the seed re-generates the theme", async () => {
    await theme(["generate", "ember", "--accent", "#d97706", "--depth", "hard", "--motion", "springy"]);
    expect(readdirSync(join(cwd, "themes")).sort()).toEqual([
      "ember.css",
      "ember.preview.html",
      "ember.seed.json",
      "ember.theme.json",
    ]);

    const seed = readJson("themes/ember.seed.json");
    // The written seed is schema-valid — this is the file a user edits and
    // hands back, so `definitions.themeSeed` is the contract it must meet.
    expect(validateThemeSeed(seed)).toEqual([]);
    expect(seed.depth).toBe("hard");
    expect(seed.motion).toBe("springy");
    expect(readJson("themes/ember.theme.json").seed).toEqual(seed);

    // The round trip that makes a seed file worth writing: regenerating FROM it
    // reproduces the stylesheet byte for byte.
    const first = read("themes/ember.css");
    await theme(["generate", "--seed", "themes/ember.seed.json", "--out", "again"]);
    expect(read("again/ember.css")).toBe(first);
  });

  it("accepts every axis as its own flag", async () => {
    // One generation stating a NON-DEFAULT value on every enumerated axis the
    // generator can render, proving each flag reaches the seed and each seed
    // value reaches the CSS — the manifest's `axes` block is derived from the
    // stylesheet, so this is measured rather than echoed back.
    const stated: Record<string, string> = {
      neutral: "warm",
      scheme: "both",
      type: "serif-editorial",
      scale: "1.25",
      base: "18",
      weight: "black",
      tracking: "wide",
      // The two values 1.1A-25/26 gave a real consumer: small caps on
      // --heading-caps, and a double rule on a raised --divider-width.
      transform: "small-caps",
      // Not `sharp`: a corner shape needs a radius to shape, and sharp + bevel
      // is refused (see "refuses a corner shape…" below).
      shape: "crisp",
      border: "heavy",
      corner: "bevel",
      depth: "layered",
      material: "grain",
      motion: "snappy",
      density: "spacious",
      focus: "glow",
      link: "thick",
      divider: "double",
      button: "rect",
      input: "underline",
      checkbox: "round",
      switch: "square",
      contrast: "high",
    };
    // Every axis flag is exercised: the table is what the CLI parses, so a new
    // one shows up here as a missing key rather than as untested code.
    expect(Object.keys(stated).sort())
      .toEqual(Object.keys(SEED_FLAGS).filter((flag) => flag !== "accent").sort());

    const args = Object.entries(stated).flatMap(([flag, value]) => [`--${flag}`, value]);
    await theme(["generate", "full-axis", "--accent", "oklch(0.55 0.2 150)", ...args]);

    const manifest = readJson("themes/full-axis.theme.json");
    expect(manifest.axes).toEqual({
      accent_hue: manifest.axes.accent_hue,
      accent_chroma: manifest.axes.accent_chroma,
      neutral: "warm",
      scheme: "both",
      type: {
        pairing: "serif-editorial",
        scale: 1.25,
        base: 18,
        voice: { weight: "black", tracking: "wide", transform: "small-caps" },
      },
      shape: { radius: "crisp", border: "heavy", corner: "bevel" },
      depth: "layered",
      material: "grain",
      motion: "snappy",
      density: "spacious",
      focus: "glow",
      decoration: { link: "thick", divider: "double" },
      controls: { button: "rect", input: "underline", checkbox: "round", switch: "square" },
      contrast: "high",
    });
    // …measured off the stylesheet, which spells each on the token that renders it.
    const css = read("themes/full-axis.css");
    expect(css).toMatch(/--heading-caps\s*:\s*small-caps/);
    expect(css).toMatch(/--heading-transform\s*:\s*none/);
    expect(css).toMatch(/--divider-width\s*:\s*3px/);
    // The numeric axes arrived as numbers, not as the strings a shell hands over.
    expect(manifest.seed.type.scale).toBe(1.25);
    expect(manifest.seed.type.base).toBe(18);
  });

  it("lets a flag override the seed file it was given", async () => {
    writeFileSync(join(cwd, "base.seed.json"), JSON.stringify({
      name: "from-file",
      accent: "#0ea5e9",
      depth: "hard",
      shape: { radius: "round", border: "heavy" },
    }));
    await theme(["generate", "--seed", "base.seed.json", "--depth", "glass"]);

    const seed = readJson("themes/from-file.seed.json");
    expect(seed.name).toBe("from-file");      // the file may name the theme…
    expect(seed.depth).toBe("glass");          // …the flag wins on what both state…
    expect(seed.shape.border).toBe("heavy");   // …and an untouched leaf survives.
    expect(seed.shape.radius).toBe("round");

    // A positional name overrides the file's, so one seed can be re-generated
    // under another name without editing it. That is by definition a
    // look-alike — same seed, same colours, a different name — so it is also
    // the case `--allow-similar` exists for [1.1A-12].
    await theme(["generate", "renamed", "--seed", "base.seed.json", "--allow-similar"]);
    expect(readJson("themes/renamed.seed.json").name).toBe("renamed");
  });

  it("writes where --out says, and nowhere else", async () => {
    await theme(["generate", "outdir", "--accent", "#2563eb", "--out", "registry/themes"]);
    expect(existsSync(join(cwd, "themes"))).toBe(false);
    expect(readdirSync(join(cwd, "registry/themes")).sort()).toEqual([
      "outdir.css",
      "outdir.preview.html",
      "outdir.seed.json",
      "outdir.theme.json",
    ]);
    // A trailing slash is the natural thing to type and must not double up.
    await theme(["generate", "slashed", "--accent", "#2563eb", "--out", "out/"]);
    expect(existsSync(join(cwd, "out/slashed.css"))).toBe(true);
  });

  it("rejects an invalid axis by naming its vocabulary, and writes nothing", async () => {
    // The vocabulary is quoted from the table rather than retyped: the error a
    // user reads is the axis list, so a value added to `depth` must show up in
    // the message without anyone remembering to update it here.
    await expect(theme(["generate", "bad", "--accent", "#2563eb", "--depth", "fluffy"]))
      .rejects.toThrow(`seed.depth: 'seed.depth' must be one of: ${THEME_AXIS_VALUES.depth.join(", ")}`);
    await expect(theme(["generate", "bad", "--accent", "#2563eb", "--scale", "1.4"]))
      .rejects.toThrow(/seed\.type\.scale.*must be one of: 1\.125, 1\.2, 1\.25, 1\.333/s);
    await expect(theme(["generate", "bad", "--accent", "#2563eb", "--type", "custom"]))
      .rejects.toThrow(/type\.pairing: "custom" is a DERIVED value/);
    expect(existsSync(join(cwd, "themes"))).toBe(false);
  });

  it("reports a missing, malformed or unusable seed file by name", async () => {
    await expect(theme(["generate", "x", "--seed", "nope.seed.json"]))
      .rejects.toThrow(/Seed file 'nope.seed.json' not found/);
    writeFileSync(join(cwd, "broken.seed.json"), "{ not json");
    await expect(theme(["generate", "x", "--seed", "broken.seed.json"]))
      .rejects.toThrow(/Seed file 'broken.seed.json' is not valid JSON/);
    writeFileSync(join(cwd, "array.seed.json"), "[]");
    await expect(theme(["generate", "x", "--seed", "array.seed.json"]))
      .rejects.toThrow(/must contain a JSON object/);
    // An unknown KEY in an otherwise fine file is the seed validator's error,
    // which is the same sentence a bad flag produces.
    writeFileSync(join(cwd, "odd.seed.json"), JSON.stringify({ name: "x", accent: "#000", mood: "calm" }));
    await expect(theme(["generate", "--seed", "odd.seed.json"]))
      .rejects.toThrow(/Unknown seed axis 'mood'/);
  });

  it("still needs a name and an accent, from wherever they come", async () => {
    await expect(theme(["generate", "--accent", "#2563eb"])).rejects.toThrow(/Theme name required/);
    await expect(theme(["generate", "nameless"])).rejects.toThrow(/--accent is required/);
    await expect(theme(["generate", "x", "--accent", "#2563eb", "--unknown"]))
      .rejects.toThrow(/Unknown option '--unknown'/);
    // …and a flag with no value is a flag with no value, not a swallowed name.
    await expect(theme(["generate", "x", "--accent"])).rejects.toThrow(/--accent requires a value/);
  });

  it("keeps the 1.0 flags working, mapped onto the axes that replaced them", async () => {
    await theme(["generate", "legacy", "--accent", "#168c5b", "--neutral", "warm", "--radius", "lg", "--scheme", "light"]);
    const manifest = readJson("themes/legacy.theme.json");
    expect(manifest.scheme).toBe("light");
    expect(manifest.axes.shape.radius).toBe("round");
    expect(manifest.axes.neutral).toBe("warm");
    expect(manifest.seed.shape.radius).toBe("round");
  });

  it("defaults --neutral to the 1.0 cool without a seed file, and to the seed table's gray with one", async () => {
    // 1.0's `theme generate x --accent y` produced a COOL neutral; a script
    // written against 1.0 must keep getting the theme it got.
    await theme(["generate", "plain", "--accent", "#2563eb"]);
    expect(readJson("themes/plain.seed.json").neutral).toBe(LEGACY_NEUTRAL_DEFAULT);
    expect(LEGACY_NEUTRAL_DEFAULT).toBe("cool");
    // A seed file is the 1.1 form: an unstated neutral is THEME_SEED_DEFAULTS'.
    writeFileSync(join(cwd, "bare.seed.json"), JSON.stringify({ name: "bare", accent: "#2563eb" }));
    await theme(["generate", "--seed", "bare.seed.json", "--allow-similar"]);
    expect(readJson("themes/bare.seed.json").neutral).toBe("gray");
    // …and a stated one always wins.
    await theme(["generate", "warm", "--accent", "#2563eb", "--neutral", "warm", "--allow-similar"]);
    expect(readJson("themes/warm.seed.json").neutral).toBe("warm");
  });

  it("maps --radius as a flag that beats the seed file, and refuses it against a different --shape", async () => {
    writeFileSync(join(cwd, "round.seed.json"), JSON.stringify({
      name: "round-file", accent: "#0ea5e9", shape: { radius: "round" },
    }));
    await theme(["generate", "--seed", "round.seed.json", "--radius", "sm"]);
    expect(readJson("themes/round-file.seed.json").shape.radius).toBe("crisp");

    // Used to drop --radius without a word whenever --shape was present.
    await expect(theme(["generate", "both", "--accent", "#2563eb", "--shape", "round", "--radius", "sm"]))
      .rejects.toThrow(/--radius sm \(shape\.radius "crisp"\) contradicts shape\.radius "round"/);
    // Agreeing spellings are one statement.
    await theme(["generate", "agree", "--accent", "#2563eb", "--shape", "crisp", "--radius", "sm", "--allow-similar"]);
    expect(readJson("themes/agree.seed.json").shape.radius).toBe("crisp");
    await expect(theme(["generate", "bad", "--accent", "#2563eb", "--radius", "xl"]))
      .rejects.toThrow(/Invalid --radius 'xl'/);
    expect(existsSync(join(cwd, "themes/both.css"))).toBe(false);
  });

  it("refuses a corner shape on a sharp theme instead of writing a bevel nothing draws", async () => {
    await expect(theme(["generate", "bevelled", "--accent", "#2563eb", "--shape", "sharp", "--corner", "bevel"]))
      .rejects.toThrow(SHARP_CORNER_REFUSAL);
    expect(existsSync(join(cwd, "themes"))).toBe(false);
  });

  it("writes a preview that passes `faqir audit` in the project it lands in", async () => {
    writeFileSync(join(cwd, "faqir.config.json"), JSON.stringify({
      version: "1.0.0",
      output_dir: "ui",
      theme: "default",
      installed: { primitives: [], recipes: [], patterns: [] },
    }));
    await theme(["generate", "audited", "--accent", "#2563eb"]);
    const summary = await runAudit({ cwd, file: "themes/audited.preview.html" });
    const blocking = summary.results.filter((r) => r.severity === "error" || r.severity === "critical");
    expect(blocking.map((r) => r.message)).toEqual([]);
    expect(summary.results.filter((r) => /main landmark/i.test(r.message))).toEqual([]);
  });

  it("stamps the seed's density on the preview it writes", async () => {
    await theme(["generate", "dense", "--accent", "#2563eb", "--density", "compact"]);
    const preview = read("themes/dense.preview.html");
    // Without the attribute the harness would render a compact theme at the
    // comfortable ramp: `density.css` states each ramp inside a
    // `[data-density]` subtree scope that a theme's `:root` cannot reach.
    expect(preview).toContain('data-density="compact"');
    // …and the attribute is inert without the stylesheet that answers it, so
    // the inlined CSS carries it.
    expect(preview).toContain('[data-density="compact"]');
    expect(preview).toContain("--control-height-md");
  });
});
