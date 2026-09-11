// faqir theme generate — deterministic parametric themes [task 0.6-11 · §C4]

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { CONTRAST_PAIRS } from "../../src/audit/contrast-tokens";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  validateThemeManifest,
} from "../../src/theme-manifest";
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
