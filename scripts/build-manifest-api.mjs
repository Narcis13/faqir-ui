#!/usr/bin/env bun
/**
 * Write each recipe's controller API into its manifest (task W2-4).
 *
 * ── The gap this closes ─────────────────────────────────────────────────────
 * 29 recipes ship a controller. Every one of them declares what it exposes on a
 * `// @ui:provides` line, and every one of those lines is inlined verbatim into
 * the shipped `faqir-core.js`. No surface an agent reads ever showed it:
 * `faqir explain toast --json` returned ten keys and no `api`, and `$ui.`
 * appeared once in 228 KB of skill documentation. An agent that wanted to open a
 * drawer from a table row could not learn that `open()` exists without opening
 * the controller source — so it invented a global store and a fifteen-line
 * handshake instead.
 *
 * ── Why the manifest, and not a reader in each command ──────────────────────
 * The manifest is the contract. Putting the API there means every surface gets
 * it at once and none of them has to parse JavaScript: `faqir explain`, the
 * registry index, `faqir context`, the generated skill, the docs site, the MCP
 * tools and the typed bindings all read the same field. `api` is an OPTIONAL
 * field, which SPEC-1.0 §8 classifies as an additive amendment — the schema
 * freeze permits it, and a manifest written against 1.0 without it still
 * validates.
 *
 * ── The source of truth stays the controller ────────────────────────────────
 * Nothing here is authored. The names come from `@ui:provides`, the signatures
 * from the declarations themselves, the descriptions from their JSDoc — so a
 * method added to a controller documents itself everywhere, and `--check` fails
 * the build if a manifest and its controller have drifted apart.
 *
 * Run: `bun run build:manifest-api`, or `--check` in CI.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { delegatedControllers, readControllerApi } from "../src/utils/controller-api.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "registry");

/** Layers whose components can ship a controller. */
const LAYERS = ["primitives", "recipes", "patterns"];

/** Read one component's controller source, or null. */
function controllerSource(layer, name, file) {
  const path = join(REGISTRY, layer, name, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/**
 * Every component with a controller, and the API its controller declares.
 * A component whose controller advertises nothing is absent from the result —
 * its manifest must then carry no `api` either.
 */
export function collectControllerApis() {
  const apis = new Map(); // "<layer>/<name>" → { manifestPath, api }

  for (const layer of LAYERS) {
    const base = join(REGISTRY, layer);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const manifestPath = join(base, name, `${name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const jsFile = manifest.files?.js;
      if (!jsFile) continue;

      const source = controllerSource(layer, name, jsFile);
      if (source === null) continue;

      // A controller that delegates its surface (alert-dialog IS dialog with a
      // different role) declares none of its methods locally. Read them from
      // the controller it imports rather than leaving the manifest empty.
      const fallbacks = delegatedControllers(source)
        .map((dep) => controllerSource("recipes", dep, `${dep}.js`))
        .filter((src) => src !== null);

      const api = readControllerApi(source, fallbacks);
      if (api) apis.set(`${layer}/${name}`, { manifestPath, api });
    }
  }
  return apis;
}

/**
 * The manifest text with `api` written in, or unchanged when it already matches.
 *
 * `api` is placed directly after `states` — beside the other things a controller
 * owns, and before `a11y`, so a reader meets the behaviour surface next to the
 * states it drives. Serialisation matches every other manifest in the registry:
 * two-space JSON, one trailing newline.
 */
function withApi(manifestPath, api) {
  const original = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(original);

  const rebuilt = {};
  let placed = false;
  for (const [key, value] of Object.entries(manifest)) {
    if (key === "api") continue; // re-placed below, never carried through
    rebuilt[key] = value;
    if (key === "states") {
      rebuilt.api = api;
      placed = true;
    }
  }
  // A manifest with no `states` (none today) still gets the field, at the end of
  // the contract half rather than silently dropped.
  if (!placed) rebuilt.api = api;

  return `${JSON.stringify(rebuilt, null, 2)}\n`;
}

const checkOnly = process.argv.includes("--check");
const apis = collectControllerApis();

const stale = [];
let written = 0;

for (const [key, { manifestPath, api }] of apis) {
  const next = withApi(manifestPath, api);
  const current = readFileSync(manifestPath, "utf8");
  if (current === next) continue;
  if (checkOnly) stale.push(key);
  else {
    writeFileSync(manifestPath, next);
    written += 1;
  }
}

// A manifest carrying an `api` its controller no longer backs is drift too.
for (const layer of LAYERS) {
  const base = join(REGISTRY, layer);
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base).sort()) {
    const manifestPath = join(base, name, `${name}.manifest.json`);
    if (!existsSync(manifestPath)) continue;
    if (apis.has(`${layer}/${name}`)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.api === undefined) continue;
    if (checkOnly) {
      stale.push(`${layer}/${name} (declares api, controller advertises none)`);
    } else {
      delete manifest.api;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      written += 1;
    }
  }
}

const methodCount = [...apis.values()].reduce((n, { api }) => n + api.methods.length, 0);

if (checkOnly) {
  if (stale.length > 0) {
    console.error(
      `✗ ${stale.length} manifest(s) are out of date with their controller — ` +
        `run \`bun run build:manifest-api\` and commit:`,
    );
    for (const key of stale) console.error(`    ${key}`);
    process.exit(1);
  }
  console.log(`✓ Every manifest api matches its controller — ${apis.size} component(s), ${methodCount} method(s).`);
  process.exit(0);
}

console.log(
  `✓ Wrote api into ${written} manifest(s) — ${apis.size} component(s) with a controller, ${methodCount} method(s).`,
);
