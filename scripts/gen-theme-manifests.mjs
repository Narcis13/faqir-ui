#!/usr/bin/env bun
/**
 * Generate `registry/themes/{name}.theme.json` for every shipped theme  [task 0.4-12].
 *
 * Editorial metadata (mood, scheme, dark_mode, pairs_with, preview, version) is
 * seeded per theme below — that is the hand-authored part. The two token fields
 * (`tokens_overridden`, `tokens_inherited`) are DERIVED from the stylesheet and
 * the base token surface, never hand-written: `overriddenTokens` parses what the
 * theme's CSS defines, `inheritedTokens` is the surface minus that. The manifest
 * consistency test re-derives both and asserts they still match, so any drift
 * (a hand-edit, a new override) fails CI until this script is re-run.
 *
 * Run: `bun run gen:theme-manifests` (or `bun scripts/gen-theme-manifests.mjs`).
 * Every theme stylesheet must have a seed entry here or the script fails — that
 * is how a new theme is forced to declare its manifest metadata.
 */
import { Glob } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { overriddenTokens, inheritedTokens, surfaceTokens } from "../src/theme-manifest";

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
};

// Base token surface — every base stylesheet minus raw palette primitives.
const baseSources = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .filter((f) => f !== "index.css")
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));
const SURFACE = surfaceTokens(baseSources);

const themeFiles = [...new Glob("*.css").scanSync(THEMES_DIR)].sort();

const missingSeed = themeFiles
  .map((f) => basename(f, ".css"))
  .filter((name) => !(name in SEED));
if (missingSeed.length > 0) {
  console.error(`✗ No manifest metadata seed for theme(s): ${missingSeed.join(", ")}`);
  console.error(`  Add an entry to SEED in scripts/gen-theme-manifests.mjs.`);
  process.exit(1);
}

let written = 0;
for (const file of themeFiles) {
  const name = basename(file, ".css");
  const meta = SEED[name];
  const css = readFileSync(join(THEMES_DIR, file), "utf8");

  const manifest = {
    name,
    version: meta.version,
    mood: meta.mood,
    scheme: meta.scheme,
    dark_mode: meta.dark_mode,
    tokens_overridden: overriddenTokens(css),
    tokens_inherited: inheritedTokens(css, SURFACE),
    pairs_with: meta.pairs_with,
    preview: `${name}.preview.html`,
  };

  const out = join(THEMES_DIR, `${name}.theme.json`);
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `✓ ${name}.theme.json — ${manifest.tokens_overridden.length} overridden, ${manifest.tokens_inherited.length} inherited`,
  );
  written++;
}

console.log(`\nWrote ${written} theme manifest(s) to registry/themes/.`);
