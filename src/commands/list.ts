import { readConfigFile } from "../utils/config";
import { fileExists } from "../utils/fs";
import { info } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";
import { listRegistryComponents, REGISTRY_LAYERS } from "../utils/registry";

export async function listCommand(_args: string[], cwd: string): Promise<void> {
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  const config = await readConfigFile(configPath);
  const registryComponents = await listRegistryComponents();
  const totalInstalled = REGISTRY_LAYERS.reduce((sum, layer) => sum + config.installed[layer].length, 0);
  const installedNames = new Set(REGISTRY_LAYERS.flatMap((layer) => config.installed[layer]));
  const availableCount = registryComponents.filter((component) => !installedNames.has(component.name)).length;

  info(`Installed (${totalInstalled} components):`);
  info("");

  for (const layer of REGISTRY_LAYERS) {
    const names = config.installed[layer];
    info(`  ${layer.toUpperCase()} (${names.length})`);
    info(`  ${names.length > 0 ? names.map((name) => `✓ ${name}`).join("    ") : "none"}`);
    info("");
  }

  info(`Available (${availableCount} not installed):`);
  info("");

  for (const layer of REGISTRY_LAYERS) {
    const names = registryComponents
      .filter((component) => component.layer === layer && !installedNames.has(component.name))
      .map((component) => component.name);
    info(`  ${layer.toUpperCase()}: ${names.length > 0 ? names.join(", ") : "none"}`);
  }
}
