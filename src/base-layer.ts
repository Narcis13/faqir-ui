/**
 * The base layer — `data-ui` values that are styling, not components (1.0R-10).
 *
 * `registry/base/*.css` is loaded by every project and styles two different
 * kinds of thing. Most of it targets components that have manifests of their
 * own (`rhythm.css` spaces `[data-ui="card"]`, and `card` documents itself).
 * But `prose.css` DEFINES `[data-ui="prose"]` — a `data-ui` value with no
 * manifest, no catalogue entry, no `llms.txt` line and, until this task, no
 * mention in the skill. The framework's own documentation site is built out of
 * it on a dozen pages, so an agent asked to write a Faqir docs page could not
 * discover the thing Faqir's docs are made of.
 *
 * The resolution is the one the plan defaults to: document the base layer
 * explicitly rather than give `prose` a manifest, because it is not a component
 * — it has no parts, no variants, no states, and styles the elements below it
 * rather than a structure it owns.
 *
 * Nothing here is a list. A base-layer value is DERIVED: a `data-ui` value some
 * `registry/base/*.css` selects on, for which no component of that name exists
 * in the registry. Add a base stylesheet that defines a new one and it appears
 * in the skill, in `llms.txt` and on the site with no edit here.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One `registry/base/*.css` stylesheet and the base-layer values it defines. */
export interface BaseLayerFile {
  /** File name, e.g. `prose.css`. */
  file: string;
  /** The name in its `@ui:base <name>` header. */
  name: string;
  /** The header's own one-line blurb, verbatim. */
  blurb: string;
  /** `data-ui` values this file styles that no registry component declares, sorted. */
  defines: string[];
}

/** The layers a `data-ui` value can be a component in. */
const COMPONENT_LAYERS = ["primitives", "recipes", "patterns"] as const;

const HEADER_RE = /\/\*\s*@ui:base\s+([a-z][a-z0-9-]*)\s*(?:—|--)\s*([^\n*]+)/;
const UI_VALUE_RE = /data-ui\s*=\s*"([a-z][a-z0-9-]*)"/g;

/** Every component name the registry ships, across all three layers. */
export function registryComponentNames(registryPath: string): Set<string> {
  const names = new Set<string>();
  for (const layer of COMPONENT_LAYERS) {
    const dir = join(registryPath, layer);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) names.add(entry.name);
    }
  }
  return names;
}

/**
 * Read `registry/base/*.css` and return, per stylesheet, the `data-ui` values it
 * defines that are not components. Files that define none (a reset, a rhythm
 * layer, a motion preset sheet) come back with an empty `defines` — they are
 * still part of the base layer and are still worth naming.
 */
export function loadBaseLayer(registryPath: string): BaseLayerFile[] {
  const dir = join(registryPath, "base");
  if (!existsSync(dir)) return [];
  const components = registryComponentNames(registryPath);
  const files: BaseLayerFile[] = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".css")).sort()) {
    const source = readFileSync(join(dir, file), "utf8");
    const header = HEADER_RE.exec(source);
    if (!header) {
      throw new Error(
        `registry/base/${file} has no '@ui:base <name> — <blurb>' header comment; ` +
          `the base layer is documented from those headers.`,
      );
    }
    const defines = new Set<string>();
    UI_VALUE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = UI_VALUE_RE.exec(source)) !== null) {
      if (!components.has(match[1])) defines.add(match[1]);
    }
    files.push({
      file,
      name: header[1],
      blurb: header[2].trim().replace(/\s*\*\/\s*$/, "").trim(),
      defines: [...defines].sort(),
    });
  }
  return files;
}

/** Every base-layer `data-ui` value in the registry, sorted. The set that must be documented. */
export function baseLayerUiValues(files: BaseLayerFile[]): string[] {
  return [...new Set(files.flatMap((f) => f.defines))].sort();
}

/**
 * The sentence that says what a base-layer value IS, shared by every surface
 * that documents one so the skill, `llms.txt` and the site cannot drift apart.
 */
export const BASE_LAYER_BLURB =
  "The base layer is loaded by every project and is not a component: these `data-ui` values " +
  "are styling — they take no `data-part`, no `data-variant` and no `data-state`, and they " +
  "style the plain HTML elements written inside them.";
