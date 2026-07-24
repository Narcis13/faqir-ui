#!/usr/bin/env node
/**
 * Assemble the shipped single-file engine `registry/core/faqir-core.js` from
 * the engine source plus every recipe controller.  [task 0.3-03]
 *
 * Two builds come out of the SAME source (task 0.7-12):
 *   - `registry/core/faqir-core.js`      production — dev-marked lines stripped
 *   - `registry/core/faqir-core.dev.js`  development — dev-marked lines kept and
 *                                        `src/core-src/dev-diagnostics.js` injected
 * See `applyDevMarkers` below for the three markers.
 *
 * Inputs:
 *   - `src/core-src/engine.js`               — directives, reactivity, plugin API
 *                                              (no controllers). Carries a lone
 *                                              marker for shared menu navigation
 *                                              and `// @faqir:controllers` where
 *                                              controllers are injected.
 *   - `registry/core/menu-navigation.js`     — shared menu focus/key navigation,
 *                                              injected once into the UMD scope.
 *   - `src/core-src/dev-diagnostics.js`      — dev-build-only warning reporters,
 *                                              injected at `// @faqir:dev-diagnostics`.
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
const MENU_NAV_SRC = join(ROOT, "registry", "core", "menu-navigation.js");
const DEV_DIAGNOSTICS_SRC = join(ROOT, "src", "core-src", "dev-diagnostics.js");
const OUT = join(ROOT, "registry", "core", "faqir-core.js");
const DEV_OUT = join(ROOT, "registry", "core", "faqir-core.dev.js");

// The injection point in the engine source: a lone comment line, matched by its
// trimmed text so the engine's surrounding indentation is irrelevant.
const MARKER = "// @faqir:controllers";
const MENU_NAV_MARKER = "// @faqir:menu-navigation";
const DEV_DIAGNOSTICS_MARKER = "// @faqir:dev-diagnostics";

// Dev-build markers (task 0.7-12). `DEV_LINE` marks a single line; the
// start/end pair marks a region. Exported for the tests that assert the
// production engine carries neither.
export const DEV_LINE = "/* @faqir:dev */";
export const DEV_START = "// @faqir:dev-start";
export const DEV_END = "// @faqir:dev-end";

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

/**
 * Resolve the dev markers for one build.  [task 0.7-12]
 *
 * Production (`dev: false`) drops every marked line, so no dev-only message
 * string survives into `faqir-core.js`. The dev build keeps them and strips the
 * marker itself, leaving ordinary JavaScript.
 *
 *   `/* @faqir:dev *\/ if (devHooks) …`   one line
 *   `// @faqir:dev-start` … `// @faqir:dev-end`   a region (markers always removed)
 *
 * Applied to the assembled output, so a controller could use the markers too.
 *
 * @param {string} source
 * @param {boolean} dev  keep (true) or strip (false) the marked code
 */
export function applyDevMarkers(source, dev) {
  const out = [];
  let depth = 0;
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === DEV_START) {
      depth++;
      continue;
    }
    if (trimmed === DEV_END) {
      if (depth === 0) {
        throw new Error(`line ${i + 1}: "${DEV_END}" without a matching "${DEV_START}"`);
      }
      depth--;
      continue;
    }
    if (depth > 0) {
      if (dev) out.push(lines[i]);
      continue;
    }
    if (lines[i].includes(DEV_LINE)) {
      if (dev) out.push(lines[i].replace(`${DEV_LINE} `, "").replace(DEV_LINE, ""));
      continue;
    }
    out.push(lines[i]);
  }
  if (depth > 0) throw new Error(`unterminated "${DEV_START}" block (${depth} open)`);
  return out.join("\n");
}

/** Render an ESM core helper as engine-scoped source from its sole module. */
function renderCoreHelper(source, label, title) {
  const body = source
    .replace(/^\s*import\b[^\n]*?\bfrom\s+["'][^"']+["'];?[^\n]*\n/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?[^\n]*\n/gm, "")
    .replace(/^(\s*)export\s+(function|const|let|var|class)\b/gm, "$1$2")
    .trim();
  return `  // ── ${title} ── (${label})\n${body
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n")}`;
}

function renderHeader(controllers, engineRel, dev) {
  const names = controllers.map((c) => c.name);
  const rule = "// " + "=".repeat(76);
  return (
    [
      rule,
      `// registry/core/faqir-core${dev ? ".dev" : ""}.js`,
      "//",
      "// GENERATED FILE — DO NOT EDIT BY HAND.",
      "// Assembled by scripts/build-core.mjs (task 0.3-03) from:",
      `//   engine:      ${engineRel}`,
      "//   core helper: registry/core/menu-navigation.js",
      ...(dev ? ["//   dev build:   src/core-src/dev-diagnostics.js (task 0.7-12)"] : []),
      `//   controllers: ${controllers.length} recipe ${controllers.length === 1 ? "factory" : "factories"}` +
        ` → ${names.length ? names.join(", ") : "(none)"}`,
      "//",
      dev
        ? "// DEVELOPMENT BUILD — verbose diagnostics, no size budget. Never ship this;"
        : "// PRODUCTION BUILD — dev-only diagnostics stripped at assembly time.",
      dev
        ? "// point <script src> at faqir-core.js for production."
        : "// Load faqir-core.dev.js instead while developing for full warnings.",
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
 * @param {string} [opts.menuNavigationPath] Shared menu helper module.
 * @param {string} [opts.devDiagnosticsPath] Dev-build diagnostics module.
 * @param {boolean} [opts.dev]         Assemble the development build: keep the
 *                                     dev-marked lines and inject the
 *                                     diagnostics module. Default false
 *                                     (production — everything marked is dropped).
 * @param {string} [opts.outPath]      Where to write (default registry/core/faqir-core.js,
 *                                     or faqir-core.dev.js when `dev`).
 * @param {boolean} [opts.write]       Set false to assemble without writing.
 * @returns {{ code: string, controllers: {name,factory,label}[], outPath: string, dev: boolean }}
 */
export function buildCore(opts = {}) {
  const enginePath = opts.enginePath || ENGINE_SRC;
  const recipeDirs = opts.recipeDirs || [RECIPES_DIR];
  const menuNavigationPath = opts.menuNavigationPath || MENU_NAV_SRC;
  const devDiagnosticsPath = opts.devDiagnosticsPath || DEV_DIAGNOSTICS_SRC;
  const dev = opts.dev === true;
  const outPath = opts.outPath || (dev ? DEV_OUT : OUT);
  const write = opts.write !== false;

  const engine = readFileSync(enginePath, "utf8");
  const lines = engine.split("\n");
  const markerIdx = lines.findIndex((l) => l.trim() === MARKER);
  if (markerIdx === -1) {
    throw new Error(`engine source ${relative(ROOT, enginePath)} is missing the "${MARKER}" marker`);
  }
  const menuNavMarkerIdx = lines.findIndex((l) => l.trim() === MENU_NAV_MARKER);
  if (menuNavMarkerIdx === -1) {
    throw new Error(
      `engine source ${relative(ROOT, enginePath)} is missing the "${MENU_NAV_MARKER}" marker`,
    );
  }
  const devMarkerIdx = lines.findIndex((l) => l.trim() === DEV_DIAGNOSTICS_MARKER);
  if (devMarkerIdx === -1) {
    throw new Error(
      `engine source ${relative(ROOT, enginePath)} is missing the "${DEV_DIAGNOSTICS_MARKER}" marker`,
    );
  }

  const menuNavigationSource = readFileSync(menuNavigationPath, "utf8");
  lines[menuNavMarkerIdx] = renderCoreHelper(
    menuNavigationSource,
    labelFor(menuNavigationPath),
    "shared menu navigation",
  );

  // The diagnostics module is injected only into the dev build; production
  // replaces the marker with nothing at all, so not one of its strings ships.
  lines[devMarkerIdx] = dev
    ? renderCoreHelper(
        readFileSync(devDiagnosticsPath, "utf8"),
        labelFor(devDiagnosticsPath),
        "dev diagnostics",
      )
    : "";

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
  const code =
    renderHeader(found, relative(ROOT, enginePath), dev) +
    applyDevMarkers(lines.join("\n"), dev);

  if (write) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, code);
  }

  return {
    code,
    controllers: found.map((c) => ({ name: c.name, factory: c.factory, label: c.label })),
    outPath,
    dev,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (invokedDirectly) {
  const res = buildCore();
  const devRes = buildCore({ dev: true });
  const names = res.controllers.map((c) => c.name);
  console.log(`✓ Assembled ${relative(ROOT, res.outPath)}`);
  console.log(`  engine       ${relative(ROOT, ENGINE_SRC)}`);
  console.log(`  controllers  ${res.controllers.length} → ${names.join(", ")}`);
  // The dev build carries no budget (task 0.7-12) — its raw size is reported
  // here and its gzip size by `bun run size`.
  const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
  console.log(`✓ Assembled ${relative(ROOT, devRes.outPath)} (development build)`);
  console.log(`  diagnostics  ${relative(ROOT, DEV_DIAGNOSTICS_SRC)}`);
  console.log(
    `  size         ${kb(Buffer.byteLength(devRes.code))} raw` +
      ` · production ${kb(Buffer.byteLength(res.code))} raw`,
  );
}
