#!/usr/bin/env bun
/**
 * Registry self-audit — permanent CI gate (task 0.3-12; rule shipped in 0.3-09,
 * registry remediated in 0.3-10; theme-manifest gate added in 0.4-12). See
 * FAQIR-PLAN §10.4.
 *
 * Two gates, both fatal on a single finding:
 *
 *  1. **logical-properties** — runs the framework's own audit rule engine
 *     (`buildLogicalPropertyResults`, the same one `faqir audit` runs per
 *     component) over every stylesheet in `registry/**`. Any physical,
 *     direction-bound property (margin-left, padding-right, left/right offsets,
 *     border-*-left/right*, physical corner radii, text-align: left|right)
 *     reintroduced outside an explicit `[dir=…]` escape hatch breaks RTL locales,
 *     so it must be zero. Fix with `faqir repair`, or scope under `[dir="ltr"|"rtl"]`.
 *
 *  2. **theme-manifests** — every `registry/themes/*.css` must have a valid,
 *     CSS-consistent `{name}.theme.json`. A theme without a manifest, with a
 *     schema-invalid manifest, or whose derived token fields drift from the CSS
 *     fails the build. Regenerate with `bun run gen:theme-manifests`.
 *
 * Bun-only: imports the TypeScript rule engine from `src/`. Run via
 * `bun run audit:registry` (or `bun scripts/registry-audit.mjs`).
 */
import { Glob } from "bun";
import { readFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLogicalPropertyResults } from "../src/audit/checker";
import {
  validateThemeManifest,
  overriddenTokens,
  inheritedTokens,
  surfaceTokens,
} from "../src/theme-manifest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "registry");
const THEMES_DIR = join(REGISTRY, "themes");
const TOKENS_DIR = join(REGISTRY, "tokens");

let failed = false;

// ── Gate 1: logical-properties over registry/**/*.css ────────────────────────
const cssFiles = [...new Glob("**/*.css").scanSync(REGISTRY)].sort();

const logicalOffenders = [];
for (const rel of cssFiles) {
  const css = readFileSync(join(REGISTRY, rel), "utf8");
  for (const r of buildLogicalPropertyResults(css, basename(rel, ".css"), rel)) {
    logicalOffenders.push(`  ${rel}:${r.line} — ${r.message}`);
  }
}

console.log(`▶ Registry self-audit — logical-properties over registry/**/*.css`);
console.log(`  scanned ${cssFiles.length} stylesheet(s)`);

if (logicalOffenders.length > 0) {
  console.error(`\n✗ ${logicalOffenders.length} finding(s) — physical, direction-bound CSS in the registry:`);
  console.error(logicalOffenders.join("\n"));
  console.error(
    `\nFix with \`faqir repair\`, or scope under an explicit [dir="ltr"|"rtl"] block.`,
  );
  failed = true;
} else {
  console.log(`✓ Zero findings — registry CSS is fully logical (RTL-safe).`);
}

// ── Gate 2: theme manifests — valid, present, and CSS-consistent ─────────────
const BASE_SOURCES = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .filter((f) => f !== "index.css")
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));
const SURFACE = surfaceTokens(BASE_SOURCES);

const themeFiles = [...new Glob("*.css").scanSync(THEMES_DIR)].sort();
const themeOffenders = [];

for (const file of themeFiles) {
  const name = basename(file, ".css");
  const manifestRel = `themes/${name}.theme.json`;
  const manifestPath = join(THEMES_DIR, `${name}.theme.json`);
  const css = readFileSync(join(THEMES_DIR, file), "utf8");

  if (!existsSync(manifestPath)) {
    themeOffenders.push(`  ${manifestRel} — MISSING (every theme must ship a manifest)`);
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    themeOffenders.push(`  ${manifestRel} — invalid JSON: ${e.message}`);
    continue;
  }

  for (const err of validateThemeManifest(manifest)) {
    themeOffenders.push(`  ${manifestRel} — schema: ${err.field}: ${err.message}`);
  }

  const expectedOverridden = overriddenTokens(css);
  if (JSON.stringify(manifest.tokens_overridden) !== JSON.stringify(expectedOverridden)) {
    themeOffenders.push(
      `  ${manifestRel} — tokens_overridden drifted from ${name}.css (run: bun run gen:theme-manifests)`,
    );
  }
  const expectedInherited = inheritedTokens(css, SURFACE);
  if (JSON.stringify(manifest.tokens_inherited) !== JSON.stringify(expectedInherited)) {
    themeOffenders.push(
      `  ${manifestRel} — tokens_inherited drifted from ${name}.css (run: bun run gen:theme-manifests)`,
    );
  }
}

console.log(`\n▶ Registry self-audit — theme manifests over registry/themes/*.css`);
console.log(`  scanned ${themeFiles.length} theme(s)`);

if (themeOffenders.length > 0) {
  console.error(`\n✗ ${themeOffenders.length} finding(s) — theme manifest problems:`);
  console.error(themeOffenders.join("\n"));
  failed = true;
} else {
  console.log(`✓ Every theme has a valid, CSS-consistent manifest.`);
}

process.exit(failed ? 1 : 0);
