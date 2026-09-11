// faqir theme generate — deterministic parametric themes [task 0.6-11 · §C4]

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { CONTRAST_PAIRS } from "../../src/audit/contrast-tokens";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Glob } from "bun";
import {
  ACCENT_STEPS,
  generateThemeBundle,
  type ThemeGenerateInput,
} from "../../src/commands/theme-generate";
import { checkThemeContrast, CONTRAST_AA } from "../../src/audit/contrast-tokens";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";
import {
  inheritedTokens,
  isSurfaceTokenFile,
  overriddenTokens,
  surfaceTokens,
  THEME_AXIS_VALUES,
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

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "faqir-theme-generate-"));
  });

  afterAll(() => {
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
    expect(report.theme_generate_schema_version).toBe(1);
    expect(report.command).toBe("theme generate");
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
