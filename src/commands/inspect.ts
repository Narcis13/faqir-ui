import { readConfigFile } from "../utils/config";
import { fileExists } from "../utils/fs";
import { readManifestFile, type LoomManifest } from "../utils/manifest";
import { info } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";
import { findInstalledLayer, getRegistryComponent } from "../utils/registry";

export async function inspectCommand(args: string[], cwd: string): Promise<LoomManifest> {
  const [componentName, ...rest] = args;

  if (!componentName) {
    throw new Error("Usage: loom inspect <component>");
  }

  if (rest.length > 0) {
    throw new Error(`Unexpected arguments: ${rest.join(" ")}`);
  }

  const manifest = await resolveManifest(componentName, cwd);

  info(`Manifest for ${manifest.name}`);
  console.log(JSON.stringify(manifest, null, 2));

  return manifest;
}

async function resolveManifest(componentName: string, cwd: string): Promise<LoomManifest> {
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (await fileExists(configPath)) {
    const config = await readConfigFile(configPath);
    const installedLayer = findInstalledLayer(config, componentName);

    if (installedLayer) {
      return await readManifestFile(
        resolvePackagePath(cwd, config.output_dir, installedLayer, componentName, `${componentName}.manifest.json`),
      );
    }
  }

  const registryComponent = await getRegistryComponent(componentName);

  if (!registryComponent) {
    throw new Error(`Unknown component: ${componentName}`);
  }

  return registryComponent.manifest;
}
