import { addCommand } from "./add";
import { readConfigFile } from "../utils/config";
import { fileExists, writeTextFile } from "../utils/fs";
import { success, info } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";
import { renderGalleryHtml } from "../utils/gallery";
import { listRegistryComponents, REGISTRY_LAYERS } from "../utils/registry";

export async function galleryCommand(_args: string[], cwd: string): Promise<void> {
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  let config = await readConfigFile(configPath);
  const totalInstalled = REGISTRY_LAYERS.reduce((sum, layer) => sum + config.installed[layer].length, 0);
  const registryCount = (await listRegistryComponents()).length;

  if (totalInstalled < registryCount) {
    info(`Auto-adding registry components for gallery (${registryCount - totalInstalled} missing)`);
    await addCommand(["--all"], cwd);
    config = await readConfigFile(configPath);
  }

  const galleryPath = resolvePackagePath(cwd, config.output_dir, "gallery.html");
  await writeTextFile(galleryPath, await renderGalleryHtml(cwd, config));
  success("Generated component gallery");
  info(`Gallery file: ${galleryPath}`);
}
