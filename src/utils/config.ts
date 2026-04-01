import { existsSync } from "node:fs";
import { join } from "node:path";

export interface LoomConfig {
  version: string;
  theme: string;
  output_dir: string;
  tokens_split: boolean;
  include_core: boolean;
  installed: {
    primitives: string[];
    recipes: string[];
    patterns: string[];
  };
}

export const DEFAULT_CONFIG: LoomConfig = {
  version: "1.0.0",
  theme: "default",
  output_dir: "./ui",
  tokens_split: false,
  include_core: true,
  installed: {
    primitives: [],
    recipes: [],
    patterns: [],
  },
};

export function getConfigPath(cwd: string = process.cwd()): string {
  return join(cwd, "loom.config.json");
}

export function configExists(cwd: string = process.cwd()): boolean {
  return existsSync(getConfigPath(cwd));
}

export async function readConfig(cwd: string = process.cwd()): Promise<LoomConfig> {
  const path = getConfigPath(cwd);
  const file = Bun.file(path);
  const json = await file.json();
  return json as LoomConfig;
}

export async function writeConfig(config: LoomConfig, cwd: string = process.cwd()): Promise<void> {
  const path = getConfigPath(cwd);
  await Bun.write(path, JSON.stringify(config, null, 2) + "\n");
}
