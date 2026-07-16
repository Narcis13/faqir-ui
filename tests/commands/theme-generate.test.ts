// faqir theme generate — deterministic parametric themes [task 0.6-11 · §C4]

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Glob } from "bun";
import {
  ACCENT_STEPS,
  generateThemeBundle,
  type ThemeGenerateInput,
} from "../../src/commands/theme-generate";
import { checkThemeContrast, CONTRAST_AA } from "../../src/audit/contrast-tokens";
import {
  inheritedTokens,
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
  .filter((file) => file !== "index.css")
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
    const result = spawnSync(process.execPath, [SRC_INDEX, "theme", "generate", ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }

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
    expect(report.generated).toEqual([
      {
        kind: "theme",
        name: "cli-brand",
        css: "themes/cli-brand.css",
        manifest: "themes/cli-brand.theme.json",
      },
      {
        kind: "document",
        name: "cli-brand-document",
        css: "themes/cli-brand-document.css",
        manifest: "themes/cli-brand-document.theme.json",
      },
    ]);
    expect(report.contrast.length).toBe(24);
    expect(report.contrast.every((pair: { passes: boolean }) => pair.passes)).toBe(true);
    for (const file of report.generated) {
      expect(existsSync(join(tempDir, file.css))).toBe(true);
      expect(existsSync(join(tempDir, file.manifest))).toBe(true);
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
