import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, type Manifest } from "../manifest";
import type { FaqirConfig } from "./config";

export type Layer = "primitives" | "recipes" | "patterns";

/**
 * A compact, discovery-oriented view of a registry component — the fields an
 * agent needs to browse the inventory without loading every full manifest.
 * Produced by {@link listRegistryComponentsWithMeta}.
 */
export interface ComponentSummary {
  name: string;
  kind: Manifest["kind"];
  category: string;
  description: string;
  layer: Layer;
  aliases: string[];
}

/**
 * Build a map of `alias → canonical component name` by scanning registry
 * manifests for the optional `aliases` field (see manifest.ts schema notes).
 *
 * Synchronous (mirrors listRegistryComponents) so it can be used inside the
 * existing sync resolution paths. A real component directory always wins, so
 * an alias colliding with a real name is ignored by resolveAlias().
 */
export function getRegistryAliases(registryPath: string): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    const layerPath = join(registryPath, layer);
    if (!existsSync(layerPath)) continue;

    const glob = new Bun.Glob("*/");
    for (const dir of glob.scanSync({ cwd: layerPath, onlyFiles: false })) {
      const name = dir.replace(/\/$/, "");
      const manifestPath = join(layerPath, name, `${name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      let manifest: { aliases?: unknown };
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        continue;
      }

      if (Array.isArray(manifest.aliases)) {
        for (const alias of manifest.aliases) {
          if (typeof alias === "string" && alias.length > 0 && !aliases.has(alias)) {
            aliases.set(alias, name);
          }
        }
      }
    }
  }

  return aliases;
}

/**
 * Resolve a possibly-aliased name to its canonical registry component name.
 * Returns the input unchanged when it is already a real component, or when no
 * alias matches.
 */
export function resolveAlias(name: string, registryPath: string): string {
  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    if (existsSync(join(registryPath, layer, name))) return name;
  }
  return getRegistryAliases(registryPath).get(name) ?? name;
}

export function findComponentInRegistry(
  name: string,
  registryPath: string
): { name: string; layer: Layer; path: string } | null {
  // Direct hit: a real component directory always wins over an alias.
  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    const compPath = join(registryPath, layer, name);
    if (existsSync(compPath)) {
      return { name, layer, path: compPath };
    }
  }

  // Alias hit: resolve to the canonical component and locate it.
  const canonical = getRegistryAliases(registryPath).get(name);
  if (canonical) {
    for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
      const compPath = join(registryPath, layer, canonical);
      if (existsSync(compPath)) {
        return { name: canonical, layer, path: compPath };
      }
    }
  }

  return null;
}

export function listRegistryComponents(registryPath: string, layer?: Layer): string[] {
  const layers: Layer[] = layer ? [layer] : ["primitives", "recipes", "patterns"];
  const components: string[] = [];

  for (const l of layers) {
    const layerPath = join(registryPath, l);
    if (!existsSync(layerPath)) continue;

    const glob = new Bun.Glob("*/");
    for (const dir of glob.scanSync({ cwd: layerPath, onlyFiles: false })) {
      const name = dir.replace(/\/$/, "");
      if (existsSync(join(layerPath, name, `${name}.manifest.json`))) {
        components.push(name);
      }
    }
  }

  return components;
}

/**
 * Registry inventory with per-component metadata (kind, category, description,
 * layer, aliases), optionally filtered by `kind` and/or `category`. Loads each
 * component's manifest, so it is async and heavier than {@link listRegistryComponents};
 * use it when the metadata is needed (discovery surfaces, the MCP server), and
 * the name-only variant otherwise.
 *
 * Results are sorted by name within their natural layer order (primitives,
 * recipes, patterns). Components whose manifest fails to parse are skipped.
 */
export async function listRegistryComponentsWithMeta(
  registryPath: string,
  filter?: { kind?: string; category?: string }
): Promise<ComponentSummary[]> {
  const summaries: ComponentSummary[] = [];

  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    const layerPath = join(registryPath, layer);
    if (!existsSync(layerPath)) continue;

    const names: string[] = [];
    const glob = new Bun.Glob("*/");
    for (const dir of glob.scanSync({ cwd: layerPath, onlyFiles: false })) {
      const name = dir.replace(/\/$/, "");
      if (existsSync(join(layerPath, name, `${name}.manifest.json`))) {
        names.push(name);
      }
    }
    names.sort();

    for (const name of names) {
      let manifest: Manifest;
      try {
        manifest = await loadManifest(join(layerPath, name, `${name}.manifest.json`));
      } catch {
        continue;
      }
      if (filter?.kind && manifest.kind !== filter.kind) continue;
      if (filter?.category && manifest.category !== filter.category) continue;

      summaries.push({
        name,
        kind: manifest.kind,
        category: manifest.category,
        description: manifest.description,
        layer,
        aliases: Array.isArray(manifest.aliases) ? manifest.aliases : [],
      });
    }
  }

  return summaries;
}

/**
 * Load a single component's manifest from the registry, resolving aliases to
 * their canonical component. Returns `null` when no component (or alias) with
 * that name exists — callers turn that into a clean "unknown component" error
 * rather than a thrown exception.
 */
export async function loadRegistryManifest(
  name: string,
  registryPath: string
): Promise<Manifest | null> {
  const found = findComponentInRegistry(name, registryPath);
  if (!found) return null;
  return loadManifest(join(found.path, `${found.name}.manifest.json`));
}

/**
 * Load every registry component manifest into a single map, keyed by both its
 * canonical `data-ui` name and each alias (an alias points at the same manifest
 * object). This is the manifest source the filesystem-free audit engine
 * ({@link auditHtmlSource}) indexes `data-ui` names into — it backs
 * `faqir audit --stdin`, mirroring how the MCP server pre-loads its manifest map.
 */
export async function loadRegistryManifestMap(registryPath: string): Promise<Map<string, Manifest>> {
  const map = new Map<string, Manifest>();

  for (const name of listRegistryComponents(registryPath)) {
    const manifest = await loadRegistryManifest(name, registryPath);
    if (manifest) map.set(name, manifest);
  }

  for (const [alias, canonical] of getRegistryAliases(registryPath)) {
    const manifest = map.get(canonical);
    if (manifest && !map.has(alias)) map.set(alias, manifest);
  }

  return map;
}

export function controllerName(recipe: string): string {
  return "create" + recipe.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

export function findInstalledLayer(name: string, config: FaqirConfig): Layer | null {
  if (config.installed.primitives.includes(name)) return "primitives";
  if (config.installed.recipes.includes(name)) return "recipes";
  if (config.installed.patterns.includes(name)) return "patterns";
  return null;
}

export async function getInstalledDependents(
  name: string,
  config: FaqirConfig,
  outputDir: string
): Promise<string[]> {
  const dependents: string[] = [];

  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    for (const comp of config.installed[layer]) {
      if (comp === name) continue;
      const manifestPath = join(outputDir, layer, comp, `${comp}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      const manifest = await loadManifest(manifestPath);
      if (manifest.composition?.contains?.includes(name)) {
        dependents.push(comp);
      }
    }
  }

  return dependents;
}
