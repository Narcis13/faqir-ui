import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "../manifest";
import type { FaqirConfig } from "./config";

export type Layer = "primitives" | "recipes" | "patterns";

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
