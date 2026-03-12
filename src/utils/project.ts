import { generateContext } from "../generator/context";
import type { LoomConfig } from "./config";
import { writeJsonFile } from "./fs";
import { resolvePackagePath } from "./paths";

export async function writeProjectConfig(projectRoot: string, config: LoomConfig): Promise<void> {
  await writeJsonFile(resolvePackagePath(projectRoot, "loom.config.json"), config);
}

export async function regenerateProjectContext(projectRoot: string, config: LoomConfig): Promise<void> {
  await writeJsonFile(
    resolvePackagePath(projectRoot, ".loom", "context.json"),
    await generateContext(projectRoot, config),
  );
}
