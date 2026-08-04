#!/usr/bin/env bun
/**
 * Registry self-audit — permanent CI gate (task 0.3-12; rule shipped in 0.3-09,
 * registry remediated in 0.3-10; theme-manifest gate added in 0.4-12;
 * document-rule gate added in 0.4-15). See FAQIR-PLAN §10.4.
 *
 * Six gates, all fatal on a single finding:
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
 *  3. **document-rules** — runs the framework's document-level a11y rules
 *     (`duplicate-id`, `heading-order`, `landmark`; task 0.4-15) over the
 *     canonical component markup in `registry/{primitives,recipes,patterns}/`.
 *     These are the HTML contracts that ship and that projects clone, so a
 *     duplicate id, a skipped heading level, or a landmark slip must be zero.
 *     Scope note: the `registry/themes/*.preview.html` dev harnesses are
 *     deliberately excluded — they build their DOM at runtime (the gallery is a
 *     `<template>` a `<script>` clones into a `<main>`), so a *static* scan can't
 *     see their main landmark and would false-positive. They ship to no project.
 *
 *  4. **var() resolution** (task 0.8-07) — every `var(--x)` in `registry/**`
 *     outside `tokens/` must provably resolve: `--x` is a design token, or a
 *     knob the same stylesheet declares, or an author/runtime knob with a
 *     fallback whose name sits outside the token vocabulary. This is the sweep
 *     `token-exists` never performed — that rule is project-scoped, driven by
 *     `.faqir/config.json`, and the registry itself was never its input.
 *
 *  5. **undeclared-attribute** (task 0.8-10) — every `data-*` attribute a
 *     component's CSS selects on is declared in its manifest as a variant attr,
 *     a prop or a state. Manifests are the source of truth (FAQIR-NEXT §3): an
 *     attribute the manifest never names is invisible to the docs site, the
 *     skill, `faqir context` and the vue/react bindings, so it cannot be
 *     discovered or typed — the drift follow-up 0.7-20 found on `stack` and
 *     0.8-03/0.8-04 found ten more of in layout.
 *
 *  6. **breakpoint-canon** (task 0.8-10) — every `@media`/`@container` width
 *     prelude is one canon `min-width` floor (40/48/64/80rem). Promotes the
 *     sweep tests of 0.8-08/0.8-09 from convention to enforcement; preludes with
 *     no width at all (reduced motion, colour scheme, forced colours, print) are
 *     exempt by construction.
 *
 * Bun-only: imports the TypeScript rule engine from `src/`. Run via
 * `bun run audit:registry` (or `bun scripts/registry-audit.mjs`).
 */
import { Glob } from "bun";
import { readFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLogicalPropertyResults, findDanglingTokenReferences } from "../src/audit/checker";
import { collectDefinedTokens } from "../src/parser/css-parser";
import { parseDocument } from "../src/parser/html-parser";
import { DOCUMENT_RULES } from "../src/audit/rules";
import { auditHtmlSource } from "../src/audit/html-audit";
import { loadRegistryManifestMap } from "../src/utils/components";
import {
  buildBreakpointCanonResults,
  buildUndeclaredAttributeResults,
} from "../src/audit/css-rules";
import {
  validateThemeManifest,
  overriddenTokens,
  inheritedTokens,
  surfaceTokens,
  isSurfaceTokenFile,
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
  .filter(isSurfaceTokenFile)
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

// ── Gate 3: document a11y rules over canonical component markup ───────────────
// duplicate-id / heading-order / landmark over the shipped component HTML.
const htmlFiles = ["primitives", "recipes", "patterns"].flatMap((dir) =>
  [...new Glob(`${dir}/**/*.html`).scanSync(REGISTRY)].sort(),
);

const docOffenders = [];
for (const rel of htmlFiles) {
  const src = readFileSync(join(REGISTRY, rel), "utf8");
  const doc = parseDocument(src, rel);
  for (const rule of DOCUMENT_RULES) {
    for (const r of rule.check(doc)) {
      docOffenders.push(`  ${rel}:${r.line}:${r.column} — [${r.rule_id}] ${r.message}`);
    }
  }
}

console.log(`\n▶ Registry self-audit — document rules over registry/{primitives,recipes,patterns}/**/*.html`);
console.log(`  scanned ${htmlFiles.length} component page(s)`);

if (docOffenders.length > 0) {
  console.error(`\n✗ ${docOffenders.length} finding(s) — document a11y problems in registry markup:`);
  console.error(docOffenders.join("\n"));
  failed = true;
} else {
  console.log(`✓ Zero findings — registry markup has unique ids, ordered headings, and clean landmarks.`);
}

// ── Gate 4: every var() in registry CSS resolves (task 0.8-07) ───────────────
// The gap this closes: `token-exists` is a PROJECT rule — `faqir audit` runs it
// over `<project>/ui/**` from the installed list — so nothing ever pointed it at
// `registry/`, and `settings-page.css` shipped `var(--space-48, 12rem)` against
// a token that did not exist. A reference is fine if it names a design token, or
// a knob the same stylesheet declares, or an author/runtime knob that carries a
// fallback and sits outside the token vocabulary. Anything else is dangling.
const tokenDefSources = [...new Glob("*.css").scanSync(TOKENS_DIR)].map((f) =>
  readFileSync(join(TOKENS_DIR, f), "utf8"),
);
const DEFINED_TOKENS = collectDefinedTokens(tokenDefSources);

const sweptCss = cssFiles.filter((rel) => !rel.startsWith("tokens/"));
const danglingOffenders = [];
for (const rel of sweptCss) {
  const css = readFileSync(join(REGISTRY, rel), "utf8");
  for (const f of findDanglingTokenReferences(css, DEFINED_TOKENS)) {
    danglingOffenders.push(`  ${rel}:${f.line} — [${f.kind}] ${f.message}`);
  }
}

console.log(`\n▶ Registry self-audit — var() resolution over registry/**/*.css (tokens/ excluded)`);
console.log(`  scanned ${sweptCss.length} stylesheet(s) against ${DEFINED_TOKENS.size} defined token(s)`);

if (danglingOffenders.length > 0) {
  console.error(`\n✗ ${danglingOffenders.length} finding(s) — dangling var() references:`);
  console.error(danglingOffenders.join("\n"));
  failed = true;
} else {
  console.log(`✓ Zero findings — every var() in the registry provably resolves.`);
}

// ── Gates 5 & 6: the stylesheet contract rules (task 0.8-10) ─────────────────
// `undeclared-attribute` — every data-* attribute a component's CSS selects on
// is declared in its manifest as a variant attr, a prop or a state. This is the
// class of drift follow-up 0.7-20 found by hand on `stack` (one attribute), that
// 0.8-03/0.8-04 found ten of in layout, and that no value rule can see: rules
// like `valid-variant` validate the values of attributes the manifest already
// declares, so one it never declares is invisible to all of them.
//
// `breakpoint-canon` — every `@media`/`@container` width prelude in the registry
// is one canon min-width floor. The sweeps of 0.8-08/0.8-09 proved that as a
// test over this tree; as a rule it also travels into user projects and the docs
// playground. Preludes with no width (reduced motion, colour scheme, print) are
// exempt by construction.
//
// The unit is a *component*: manifest + the stylesheet its `files.css` names, so
// `icon`, whose sheet is `icons.css`, is paired correctly rather than skipped.
const componentDirs = ["primitives", "recipes", "patterns"].flatMap((layer) =>
  [...new Glob(`${layer}/*/*.manifest.json`).scanSync(REGISTRY)].sort().map((rel) => ({ layer, rel })),
);

const cssRuleOffenders = { "undeclared-attribute": [], "breakpoint-canon": [] };
let componentsChecked = 0;
let sheetsMissing = 0;

for (const { rel } of componentDirs) {
  const manifest = JSON.parse(readFileSync(join(REGISTRY, rel), "utf8"));
  const cssRel = join(dirname(rel), manifest.files?.css ?? `${manifest.name}.css`);
  if (!existsSync(join(REGISTRY, cssRel))) {
    sheetsMissing++;
    continue;
  }
  const css = readFileSync(join(REGISTRY, cssRel), "utf8");
  componentsChecked++;
  for (const r of buildUndeclaredAttributeResults(css, manifest, cssRel)) {
    cssRuleOffenders["undeclared-attribute"].push(`  ${cssRel}:${r.line} — ${r.message}`);
  }
  for (const r of buildBreakpointCanonResults(css, manifest.name, cssRel)) {
    cssRuleOffenders["breakpoint-canon"].push(`  ${cssRel}:${r.line} — ${r.message}`);
  }
}

console.log(
  `\n▶ Registry self-audit — undeclared-attribute + breakpoint-canon over registry component CSS`,
);
console.log(
  `  scanned ${componentsChecked} component(s) (${sheetsMissing} manifest(s) declare no stylesheet)`,
);

for (const [ruleId, offenders] of Object.entries(cssRuleOffenders)) {
  if (offenders.length > 0) {
    console.error(`\n✗ ${offenders.length} finding(s) — [${ruleId}]:`);
    console.error(offenders.join("\n"));
    failed = true;
  }
}
if (cssRuleOffenders["undeclared-attribute"].length === 0 && cssRuleOffenders["breakpoint-canon"].length === 0) {
  console.log(
    `✓ Zero findings — every selected data-* attribute is declared, every width prelude is canon.`,
  );
}

// ── Gate 7: the FULL rule set over the reference markup (task 0.9-04) ────────
// Resolves follow-up 0.7-17. Gate 3 above runs only the *document* rules, which
// is why 367 per-component findings sat in this tree unseen — and they were not
// only a docs problem: `faqir audit` scans a project's `ui/**`, which includes
// every reference fragment `faqir add` copied in, so a fresh `init` + `add
// crud-table` reported a wall of findings from Faqir's own markup.
//
// The contract this gate enforces (see FAQIR-PLAN 0.9-04 / 0.7-17):
//
//  1. Reference fragments are held to EVERY rule a fragment can satisfy, at
//     zero. No path allow-list, no per-file suppression, no severity filter.
//  2. `controller-loaded` and `focus-trap` assert a runtime in the same file,
//     which a fragment by construction never carries. `auditHtmlSource` scopes
//     them out from the CONTENT (`isFullDocument`), so they still apply — and
//     still have to pass — the moment this markup is emitted as a page, which
//     is what the docs example pages and the copy-for-agents payloads are.
//
// Everything else was fixed rather than excused: real markup defects, real
// manifest drift, and five rules that were reporting correct markup.
const fullRuleManifests = await loadRegistryManifestMap(REGISTRY);
const fullRuleOffenders = [];
for (const rel of htmlFiles) {
  const src = readFileSync(join(REGISTRY, rel), "utf8");
  for (const r of auditHtmlSource({ source: src, file: rel, manifests: fullRuleManifests })) {
    fullRuleOffenders.push(`  ${rel}:${r.line} — [${r.rule_id}] ${r.message}`);
  }
}

console.log(`\n▶ Registry self-audit — the full rule set over registry/{primitives,recipes,patterns}/**/*.html`);
console.log(`  scanned ${htmlFiles.length} fragment(s) against ${fullRuleManifests.size} manifest(s)`);

if (fullRuleOffenders.length > 0) {
  console.error(`\n✗ ${fullRuleOffenders.length} finding(s) — the reference markup does not satisfy its own rules:`);
  console.error(fullRuleOffenders.join("\n"));
  console.error(
    `\nFix the markup, declare the slot in the manifest, or — if the rule is asking a fragment` +
    `\nfor something only a page can have — say so in RUNTIME_PRESENCE_RULES. Never by path.`,
  );
  failed = true;
} else {
  console.log(`✓ Zero findings — every reference fragment satisfies every rule it can.`);
}

process.exit(failed ? 1 : 0);
