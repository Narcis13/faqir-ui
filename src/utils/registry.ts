import { readdir } from "node:fs/promises";

import type { LoomConfig } from "./config";
import { fileExists } from "./fs";
import { type LoomManifest, readManifestFile } from "./manifest";
import { resolvePackagePath, resolveRegistryPath } from "./paths";

export const REGISTRY_LAYERS = ["primitives", "recipes", "patterns"] as const;

export type RegistryLayer = (typeof REGISTRY_LAYERS)[number];

export type RegistryComponent = {
  name: string;
  layer: RegistryLayer;
  dirPath: string;
  manifestPath: string;
  manifest: LoomManifest;
};

export async function listRegistryComponents(layer?: RegistryLayer): Promise<RegistryComponent[]> {
  const layers = layer ? [layer] : [...REGISTRY_LAYERS];
  const components: RegistryComponent[] = [];

  for (const currentLayer of layers) {
    const layerPath = resolveRegistryPath(currentLayer);

    if (!(await fileExists(layerPath))) {
      continue;
    }

    const entries = await readdir(layerPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const dirPath = resolveRegistryPath(currentLayer, entry.name);
      const manifestPath = resolvePackagePath(dirPath, `${entry.name}.manifest.json`);
      const manifest = await readManifestFile(manifestPath);

      components.push({
        name: manifest.name,
        layer: currentLayer,
        dirPath,
        manifestPath,
        manifest,
      });
    }
  }

  return components.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getRegistryComponent(name: string): Promise<RegistryComponent | null> {
  const components = await listRegistryComponents();
  return components.find((component) => component.name === name) ?? null;
}

export function findInstalledLayer(config: LoomConfig, name: string): RegistryLayer | null {
  for (const layer of REGISTRY_LAYERS) {
    if (config.installed[layer].includes(name)) {
      return layer;
    }
  }

  return null;
}

export function isInstalled(config: LoomConfig, name: string): boolean {
  return findInstalledLayer(config, name) !== null;
}

export async function loadInstalledComponentManifests(
  projectRoot: string,
  config: LoomConfig,
): Promise<Array<{ layer: RegistryLayer; manifest: LoomManifest }>> {
  const outputRoot = resolvePackagePath(projectRoot, config.output_dir);
  const manifests: Array<{ layer: RegistryLayer; manifest: LoomManifest }> = [];

  for (const layer of REGISTRY_LAYERS) {
    for (const name of config.installed[layer]) {
      const manifestPath = resolvePackagePath(outputRoot, layer, name, `${name}.manifest.json`);
      manifests.push({ layer, manifest: await readManifestFile(manifestPath) });
    }
  }

  return manifests.sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

export function getComponentFileNames(manifest: LoomManifest): string[] {
  return [manifest.files.html, manifest.files.css, manifest.files.js, manifest.files.manifest].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}
