import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "../manifest";
import type { FaqirConfig } from "./config";

export type Layer = "primitives" | "recipes" | "patterns";

export function findComponentInRegistry(
  name: string,
  registryPath: string
): { layer: Layer; path: string } | null {
  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    const compPath = join(registryPath, layer, name);
    if (existsSync(compPath)) {
      return { layer, path: compPath };
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
