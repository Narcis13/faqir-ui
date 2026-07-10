#!/usr/bin/env node
/**
 * Assemble the shipped single-file engine `registry/core/faqir-core.js` from
 * the engine source plus every recipe controller.  [task 0.3-03]
 *
 * Inputs:
 *   - `src/core-src/engine.js`               — directives, reactivity, plugin API
 *                                              (no controllers). Carries a lone
 *                                              `// @faqir:controllers` marker line
 *                                              where controllers are injected.
 *   - `registry/recipes/<name>/<name>.js`    — one ES-module controller factory per
 *                                              recipe (`export function create…`),
 *                                              tagged `// @ui:controller <name>`.
 *
 * Each controller is inlined into the engine's UMD closure as a self-contained
 * IIFE that returns its factory and registers it on `controllerRegistry`:
 *
 *     controllerRegistry['dialog'] = (function() {
 *       <recipe source, imports + `export ` stripped, verbatim otherwise>
 *       return createDialog;
 *     })();
 *
 * The IIFE wrapper matters: recipe files are module-scoped, and some (e.g.
 * `qr-code`) declare ~30 local helpers with generic names (`penalty`, `encodeQR`,
 * `createMatrix`). Wrapping keeps those private, so controllers cannot collide
 * with each other or with the engine. The `import { … } from "../../core/…"`
 * lines are stripped because those helpers (`trapFocus`, `onOutsideClick`,
 * `debounce`, `uid`) already live in the engine's closure scope — the IIFE
 * resolves them lexically.
 *
 * Determinism: controllers are discovered from disk, then sorted by controller
 * name; the provenance header carries no timestamp. Same inputs → identical
 * bytes, every build.
 *
 * Runnable via `bun run build:core` or `node scripts/build-core.mjs`.
 * Also exports `buildCore(opts)` for tests.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_SRC = join(ROOT, "src", "core-src", "engine.js");
const RECIPES_DIR = join(ROOT, "registry", "recipes");
const OUT = join(ROOT, "registry", "core", "faqir-core.js");

// The injection point in the engine source: a lone comment line, matched by its
// trimmed text so the engine's surrounding indentation is irrelevant.
const MARKER = "// @faqir:controllers";

function pkgVersion() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** A repo-relative label, or the bare tail for paths outside the repo (fixtures). */
function labelFor(absPath) {
  const rel = relative(ROOT, absPath);
  return rel.startsWith("..") ? absPath.split(/[/\\]/).slice(-2).join("/") : rel;
}

/**
 * Parse one recipe `.js` file. Returns `null` if it is not a controller
 * (no `@ui:controller` tag) — such files are ignored, not an error.
 * Throws if it is tagged a controller but has no exported factory.
 */
function parseController(source, label) {
  const nameMatch = source.match(/@ui:controller\s+([A-Za-z0-9_-]+)/);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  const fnMatch = source.match(/export\s+function\s+([A-Za-z0-9_$]+)\s*\(/);
  if (!fnMatch) {
    throw new Error(`${label}: @ui:controller "${name}" has no exported factory (export function …)`);
  }
  const factory = fnMatch[1];

  // Strip ES-module import statements — the imported helpers are engine-scoped
  // after assembly. Handles `import { x } from "…"` and bare `import "…"`.
  let body = source
    .replace(/^\s*import\b[^\n]*?\bfrom\s+["'][^"']+["'];?[^\n]*\n/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?[^\n]*\n/gm, "");
  // Drop the `export ` keyword before any top-level declaration.
  body = body.replace(/^(\s*)export\s+(function|const|let|var|class)\b/gm, "$1$2");
  body = body.trim();

  return { name, factory, body, label };
}

/**
 * Drift guard (task 0.3-04): recipe controllers live ONLY in registry/recipes.
 * Fail the build if the engine source still carries an inline copy — an inline
 * factory definition, a static `controllerRegistry['name'] =` registration, or a
 * `.controller('name', …)` call — for any recipe we just discovered on disk.
 * Keeps the two from silently drifting apart; the marker is the sole seam.
 */
function assertSingleSourceOfTruth(engineSrc, engineRel, controllers) {
  const esc = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const offenders = [];
  for (const c of controllers) {
    if (new RegExp(`function\\s+${esc(c.factory)}\\s*\\(`).test(engineSrc)) {
      offenders.push(`inline factory function ${c.factory}() for "${c.name}"`);
    }
    if (new RegExp(`controllerRegistry\\s*\\[\\s*['"]${esc(c.name)}['"]\\s*\\]\\s*=`).test(engineSrc)) {
      offenders.push(`static controllerRegistry['${c.name}'] = … registration`);
    }
    if (new RegExp(`\\.controller\\s*\\(\\s*['"]${esc(c.name)}['"]`).test(engineSrc)) {
      offenders.push(`Faqir.controller('${c.name}', …) call`);
    }
  }
  if (offenders.length) {
    throw new Error(
      `single-source-of-truth violation (task 0.3-04): engine source ${engineRel} ` +
        `duplicates controllers that live in registry/recipes:\n  - ` +
        offenders.join("\n  - ") +
        `\nDelete these from the engine — recipes are the only home for controllers.`,
    );
  }
}

/**
 * Render one controller as a collision-safe, self-registering IIFE.
 *
 * The factory is also bound to its exported name (`var createCalendar = …`) in
 * the engine closure, so recipes that import another recipe's factory (e.g.
 * date-picker importing createCalendar) still resolve after their import lines
 * are stripped — the reference is only evaluated when the factory runs, well
 * after every controller has been assigned.
 */
function renderController(c) {
  return (
    `  // ── ${c.name} ── (${c.label})\n` +
    `  var ${c.factory} = controllerRegistry[${JSON.stringify(c.name)}] = (function() {\n` +
    `${c.body}\n` +
    `    return ${c.factory};\n` +
    `  })();`
  );
}

function renderHeader(controllers, engineRel) {
  const names = controllers.map((c) => c.name);
  const rule = "// " + "=".repeat(76);
  return (
    [
      rule,
      "// registry/core/faqir-core.js",
      "//",
      "// GENERATED FILE — DO NOT EDIT BY HAND.",
      "// Assembled by scripts/build-core.mjs (task 0.3-03) from:",
      `//   engine:      ${engineRel}`,
      `//   controllers: ${controllers.length} recipe ${controllers.length === 1 ? "factory" : "factories"}` +
        ` → ${names.length ? names.join(", ") : "(none)"}`,
      "// Regenerate with: bun run build:core",
      `// Package version: ${pkgVersion()}`,
      rule,
      "",
      "",
    ].join("\n")
  );
}

/**
 * Assemble the engine + recipe controllers into a single file.
 *
 * @param {object} [opts]
 * @param {string} [opts.enginePath]   Engine source (default src/core-src/engine.js).
 * @param {string[]} [opts.recipeDirs] Dirs holding `<name>/<name>.js` recipes
 *                                     (default [registry/recipes]). Multiple dirs
 *                                     are merged (used by tests to inject fixtures).
 * @param {string} [opts.outPath]      Where to write (default registry/core/faqir-core.js).
 * @param {boolean} [opts.write]       Set false to assemble without writing.
 * @returns {{ code: string, controllers: {name,factory,label}[], outPath: string }}
 */
export function buildCore(opts = {}) {
  const enginePath = opts.enginePath || ENGINE_SRC;
  const recipeDirs = opts.recipeDirs || [RECIPES_DIR];
  const outPath = opts.outPath || OUT;
  const write = opts.write !== false;

  const engine = readFileSync(enginePath, "utf8");
  const lines = engine.split("\n");
  const markerIdx = lines.findIndex((l) => l.trim() === MARKER);
  if (markerIdx === -1) {
    throw new Error(`engine source ${relative(ROOT, enginePath)} is missing the "${MARKER}" marker`);
  }

  // Discover controllers across every recipe dir, deterministically.
  const found = [];
  for (const base of recipeDirs) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base).sort()) {
      const abs = join(base, dir);
      if (!statSync(abs).isDirectory()) continue;
      for (const file of readdirSync(abs).sort()) {
        if (!file.endsWith(".js")) continue;
        const fp = join(abs, file);
        const parsed = parseController(readFileSync(fp, "utf8"), labelFor(fp));
        if (parsed) found.push(parsed);
      }
    }
  }

  // Stable order + duplicate detection, keyed by controller name AND factory
  // name (factories become closure-scoped `var` bindings — a duplicate would
  // silently alias one recipe to another).
  found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const seen = new Map();
  const seenFactories = new Map();
  for (const c of found) {
    if (seen.has(c.name)) {
      throw new Error(`duplicate controller "${c.name}": ${seen.get(c.name)} and ${c.label}`);
    }
    seen.set(c.name, c.label);
    if (seenFactories.has(c.factory)) {
      throw new Error(`duplicate factory "${c.factory}": ${seenFactories.get(c.factory)} and ${c.label}`);
    }
    seenFactories.set(c.factory, c.label);
  }

  // Controllers live only in registry/recipes — the engine must carry no inline copy.
  assertSingleSourceOfTruth(engine, relative(ROOT, enginePath), found);

  const block = found.length
    ? found.map(renderController).join("\n\n")
    : "  // (no recipe controllers discovered)";

  lines[markerIdx] = block;
  const code = renderHeader(found, relative(ROOT, enginePath)) + lines.join("\n");

  if (write) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, code);
  }

  return {
    code,
    controllers: found.map((c) => ({ name: c.name, factory: c.factory, label: c.label })),
    outPath,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (invokedDirectly) {
  const res = buildCore();
  const names = res.controllers.map((c) => c.name);
  console.log(`✓ Assembled ${relative(ROOT, res.outPath)}`);
  console.log(`  engine       ${relative(ROOT, ENGINE_SRC)}`);
  console.log(`  controllers  ${res.controllers.length} → ${names.join(", ")}`);
}
