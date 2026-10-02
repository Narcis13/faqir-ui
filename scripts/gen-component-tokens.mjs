#!/usr/bin/env bun
/**
 * Derive every component's `tokens_used` and `@ui:tokens` header from its CSS
 * [task 1.1F-15].
 *
 * `tokens_used` is "the tokens the component's CSS references directly"
 * (CONTRIBUTING, decision D5): every `var(--x)` the token layer defines. An entry
 * the CSS only reaches through an alias (`color-ring` via `--focus-ring-color`)
 * may stay; anything else no reference reaches is removed. The stylesheet's
 * `@ui:tokens` header is then written from the result, verbatim. The rules live
 * in `src/component-tokens.ts`, shared with gate 8 of `registry-audit.mjs`.
 *
 * Manifests are edited by text substitution — only the `tokens_used` array is
 * rewritten, and only when its contents change — never by a JSON round trip.
 *
 * Run: `bun run gen:component-tokens`; `--check` (`bun run
 * check:component-tokens`) writes nothing and exits 1 if any file would change.
 */
import { Glob } from "bun";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveTokensUsed,
  directTokenRefs,
  readCssTokensHeader,
  readTokenLayer,
  writeCssTokensHeader,
  writeManifestTokensUsed,
} from "../src/component-tokens";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "registry");
const TOKENS_DIR = join(REGISTRY, "tokens");
const CHECK = process.argv.includes("--check");

const layer = readTokenLayer(
  [...new Glob("*.css").scanSync(TOKENS_DIR)].sort().map((f) => readFileSync(join(TOKENS_DIR, f), "utf8")),
);

const manifests = ["primitives", "recipes", "patterns"].flatMap((dir) =>
  [...new Glob(`${dir}/*/*.manifest.json`).scanSync(REGISTRY)].sort(),
);

const changed = [];
for (const rel of manifests) {
  const manifestPath = join(REGISTRY, rel);
  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const cssRel = join(dirname(rel), manifest.files?.css ?? `${manifest.name}.css`);
  const cssPath = join(REGISTRY, cssRel);
  if (!existsSync(cssPath)) continue;
  const css = readFileSync(cssPath, "utf8");

  const current = manifest.tokens_used ?? [];
  const tokens = deriveTokensUsed(current, directTokenRefs(css, layer.defined), layer);

  if (tokens.join(" ") !== current.join(" ")) {
    changed.push(`registry/${rel}`);
    if (!CHECK) writeFileSync(manifestPath, writeManifestTokensUsed(manifestText, tokens));
  }
  const header = readCssTokensHeader(css);
  if (header === null || header.join(" ") !== tokens.join(" ")) {
    changed.push(`registry/${cssRel}`);
    if (!CHECK) writeFileSync(cssPath, writeCssTokensHeader(css, manifest.name, tokens));
  }
}

if (CHECK) {
  if (changed.length > 0) {
    console.error(`✗ ${changed.length} file(s) out of date with their CSS (run: bun run gen:component-tokens):`);
    for (const f of changed) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`✓ tokens_used and @ui:tokens agree with the CSS in ${manifests.length} component(s).`);
} else {
  console.log(`Wrote ${changed.length} file(s) across ${manifests.length} component(s).`);
}
