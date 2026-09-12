#!/usr/bin/env bun
/**
 * Regenerate the theme tables in README.md from the theme manifests
 * (task 1.1A-20). Two blocks, each between `<!-- @faqir:<name> start -->` and
 * `<!-- @faqir:<name> end -->` markers:
 *
 *   theme-axes   the axis vocabulary — every leaf, its flag, its values, its default
 *   theme-table  one row per theme with its fourteen axes, as its manifest derives them
 *
 * The prose around the blocks is hand-written; the blocks are facts about
 * `registry/themes/*.theme.json` and are rendered by `src/theme/describe.ts`,
 * the same module the skill, `faqir context` and the docs gallery use, so no
 * two surfaces can describe a theme differently. Deterministic (sorted, no
 * timestamps). `--check` fails when a committed block is stale.
 *
 * Run via `bun run gen:theme-docs` (or `check:theme-docs`). Bun-only.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyDocBlocks, docBlockDrift, renderThemeDocBlocks } from "../src/theme/describe";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_DIR = join(ROOT, "registry", "themes");
const README = join(ROOT, "README.md");
const checkOnly = process.argv.includes("--check");

const manifests = readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith(".theme.json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(THEMES_DIR, f), "utf8")));

const blocks = renderThemeDocBlocks(manifests);
const current = readFileSync(README, "utf8");

if (checkOnly) {
  const stale = docBlockDrift(current, blocks);
  if (stale.length > 0) {
    console.error("✗ README.md's theme blocks are stale — run `bun run gen:theme-docs` and commit.");
    for (const name of stale) console.error(`   - ${name}`);
    process.exit(1);
  }
  console.log(`✓ README.md theme blocks are current (${manifests.length} manifests)`);
  process.exit(0);
}

const { markdown, missing } = applyDocBlocks(current, blocks);
if (missing.length > 0) {
  console.error(`✗ README.md has no markers for: ${missing.join(", ")}`);
  process.exit(1);
}
if (markdown !== current) {
  writeFileSync(README, markdown);
  console.log(`✓ README.md theme blocks regenerated (${manifests.length} manifests)`);
} else {
  console.log("✓ README.md theme blocks unchanged");
}
