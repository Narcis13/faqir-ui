#!/usr/bin/env bun
/**
 * Generate `registry/themes/{name}.theme.json` for every shipped theme  [task 0.4-12].
 *
 * Editorial metadata (mood, scheme, dark_mode, pairs_with, preview, version) is
 * seeded per theme below — that is the hand-authored part. The three derived
 * fields (`tokens_overridden`, `tokens_inherited`, `axes`) come from the
 * stylesheet and are never hand-written: `overriddenTokens` parses what the
 * theme's CSS defines, `inheritedTokens` is the surface minus that, and
 * `axesFromCss` (task 1.1A-08) classifies the fourteen axes of FAQIR-VISION
 * §5.2 out of the tokens the theme resolves to. The manifest consistency test
 * re-derives all three and asserts they still match, so any drift (a hand-edit,
 * a new override, a CSS change that moves an axis) fails CI until this script is
 * re-run.
 *
 * Run: `bun run gen:theme-manifests` (or `bun scripts/gen-theme-manifests.mjs`).
 * Every theme stylesheet must have a seed entry here or the script fails — that
 * is how a new theme is forced to declare its manifest metadata.
 */
import { Glob } from "bun";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  overriddenTokens,
  inheritedTokens,
  surfaceTokens,
  isSurfaceTokenFile,
} from "../src/theme-manifest";
import { axesFromCss } from "../src/theme/axes";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_DIR = join(ROOT, "registry", "themes");
const TOKENS_DIR = join(ROOT, "registry", "tokens");

// ── Editorial metadata seed (hand-authored; tokens are NOT here) ─────────────
// One entry per registry/themes/*.css. `scheme: "light"` pairs with
// `dark_mode: "none"`; every other theme ships an explicit dark block ("native").
const SEED = {
  aurora: {
    version: "1.0.0",
    mood: ["dark", "vibrant", "modern", "saas", "gradient"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["midnight"],
  },
  slate: {
    version: "1.0.0",
    mood: ["conservative", "enterprise", "professional", "cool"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["default", "document"],
  },
  contrast: {
    version: "1.0.0",
    // "accessible" + "wcag-aaa" are the tags agents select on for an a11y-first theme.
    mood: ["accessible", "wcag-aaa", "high-contrast", "neutral"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["default", "document"],
  },
  default: {
    version: "1.0.0",
    mood: ["neutral", "professional", "versatile"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: [],
  },
  midnight: {
    version: "1.0.0",
    mood: ["dark", "technical", "vibrant", "cool"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["brutalist"],
  },
  paper: {
    version: "1.0.0",
    mood: ["warm", "natural", "editorial", "print"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["document"],
  },
  brutalist: {
    version: "1.0.0",
    mood: ["high-contrast", "raw", "minimal", "bold"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["midnight"],
  },
  document: {
    version: "1.0.0",
    mood: ["print", "professional", "business", "minimal"],
    scheme: "light",
    dark_mode: "none",
    pairs_with: ["paper"],
  },
  "document-serif": {
    version: "1.0.0",
    mood: ["print", "legal", "formal", "serif", "traditional"],
    scheme: "light",
    dark_mode: "none",
    pairs_with: ["document", "paper"],
  },
  terminal: {
    version: "1.0.0",
    // Dark-primary CRT: "dark" + "terminal"/"mono" are the selection tags;
    // deliberately disjoint from soft's consumer/pastel vocabulary.
    mood: ["dark", "terminal", "technical", "mono", "retro"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["brutalist", "midnight"],
  },
  glass: {
    version: "1.0.0",
    mood: ["translucent", "glass", "modern", "layered", "airy"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["aurora", "slate"],
  },
  soft: {
    version: "1.0.0",
    mood: ["pastel", "friendly", "consumer", "health", "calm", "rounded"],
    scheme: "both",
    dark_mode: "native",
    pairs_with: ["default", "paper"],
  },
};

// The base token layer, read twice for two different questions.
//
// `SURFACE` is what a theme may re-declare: surface-bearing stylesheets only,
// minus raw palette primitives (see `isSurfaceTokenFile` for what is excluded
// and why).
//
// `AXIS_BASE` is what a theme's values RESOLVE through, which is every token
// file there is — including the three the surface excludes. A token a theme
// cannot re-declare is still a token its `var()` chains terminate at, so
// narrowing the resolver to the surface would make an inherited axis read as a
// blank rather than as what the registry actually renders.
const tokenFiles = [...new Glob("*.css").scanSync(TOKENS_DIR)].sort();
const AXIS_BASE = tokenFiles.map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));
const SURFACE = surfaceTokens(
  tokenFiles.filter(isSurfaceTokenFile).map((f) => readFileSync(join(TOKENS_DIR, f), "utf8")),
);

const themeFiles = [...new Glob("*.css").scanSync(THEMES_DIR)].sort();

const missingSeed = themeFiles
  .map((f) => basename(f, ".css"))
  .filter((name) => !(name in SEED));
if (missingSeed.length > 0) {
  console.error(`✗ No manifest metadata seed for theme(s): ${missingSeed.join(", ")}`);
  console.error(`  Add an entry to SEED in scripts/gen-theme-manifests.mjs.`);
  process.exit(1);
}

// A manifest declares `preview`, and the schema makes it required — so the file
// it names must be on disk. Five themes declared one that was never written
// (task 1.0R-10); rather than let the field point at nothing, the missing file
// is now a build error. Generated previews come from `gen:theme-previews`.
const missingPreview = themeFiles
  .map((f) => basename(f, ".css"))
  .filter((name) => !existsSync(join(THEMES_DIR, `${name}.preview.html`)));
if (missingPreview.length > 0) {
  console.error(`✗ No preview harness for theme(s): ${missingPreview.join(", ")}`);
  console.error(`  Run 'bun run gen:theme-previews', or hand-author the file.`);
  process.exit(1);
}

let written = 0;
for (const file of themeFiles) {
  const name = basename(file, ".css");
  const meta = SEED[name];
  const css = readFileSync(join(THEMES_DIR, file), "utf8");

  const manifest = {
    // Same rule as `add-schema-refs.mjs` and `faqir create`: the reference is
    // relative from the manifest's own directory to the published schema. It is
    // written here so a regeneration cannot silently strip it (task 1.0R-10).
    $schema: relative(THEMES_DIR, join(ROOT, "manifest.schema.json")),
    name,
    version: meta.version,
    mood: meta.mood,
    scheme: meta.scheme,
    dark_mode: meta.dark_mode,
    tokens_overridden: overriddenTokens(css),
    tokens_inherited: inheritedTokens(css, SURFACE),
    pairs_with: meta.pairs_with,
    // Checked above: the file exists, so the field cannot dangle.
    preview: `${name}.preview.html`,
    // DERIVED, exactly like the two token fields above (task 1.1A-08): the
    // fourteen axes of FAQIR-VISION §5.2 read straight out of the stylesheet.
    // `tests/themes/manifest.test.ts` re-derives and compares, so a hand-edited
    // axis is drift that fails rather than a claim nobody checks.
    axes: axesFromCss(css, AXIS_BASE),
  };

  const out = join(THEMES_DIR, `${name}.theme.json`);
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  const a = manifest.axes;
  console.log(
    `✓ ${name}.theme.json — ${manifest.tokens_overridden.length} overridden, ` +
      `${manifest.tokens_inherited.length} inherited · ${a.neutral}/${a.type.pairing}/` +
      `${a.shape.radius}/${a.depth}/${a.motion}/${a.contrast}`,
  );
  written++;
}

console.log(`\nWrote ${written} theme manifest(s) to registry/themes/.`);
