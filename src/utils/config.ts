import { existsSync } from "node:fs";
import { join } from "node:path";

export interface FaqirConfig {
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
  bundle?: {
    output: string;
    auto: boolean;
    minify: boolean;
  };
}

export const DEFAULT_CONFIG: FaqirConfig = {
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
  return join(cwd, "faqir.config.json");
}

export function configExists(cwd: string = process.cwd()): boolean {
  return existsSync(getConfigPath(cwd));
}

export async function readConfig(cwd: string = process.cwd()): Promise<FaqirConfig> {
  const path = getConfigPath(cwd);
  const file = Bun.file(path);
  const json = await file.json();
  return json as FaqirConfig;
}

export async function writeConfig(config: FaqirConfig, cwd: string = process.cwd()): Promise<void> {
  const path = getConfigPath(cwd);
  await Bun.write(path, JSON.stringify(config, null, 2) + "\n");
}
