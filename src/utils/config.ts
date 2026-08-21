import { existsSync } from "node:fs";
import { join } from "node:path";
import { LEGACY_CONFIG_FILE, legacyConfigExists } from "../migration";

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
  /**
   * Remote registries, keyed by scope. A scoped component name `@scope/name`
   * resolves through this map to a base URL, from which `faqir add` fetches
   * `registry-index.json` and the component's files (see remote-registry.ts).
   * Keys may be written with or without the leading `@` (`"@acme"` or `"acme"`).
   * Absent by default — the bundled registry stays the offline-first source.
   */
  registries?: Record<string, string>;
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

/**
 * What to print when a command finds no project (task 1.0-03).
 *
 * "Run 'faqir init' first" is right for an empty directory and wrong — briefly,
 * expensively wrong — for a project written by the last 0.x release: that
 * project *is* a Faqir project, it is just still called by the framework's
 * former name, and `faqir init` would write a second config beside it that has
 * forgotten every installed component. A v0.2.4 project's first contact with
 * the 1.0 CLI is this message, so it is the right place to say so.
 */
export function missingConfigMessage(cwd: string = process.cwd()): string {
  if (!legacyConfigExists(cwd)) return "No faqir.config.json found. Run 'faqir init' first.";
  return (
    `No faqir.config.json found — but ${LEGACY_CONFIG_FILE} is. This project predates the ` +
    `rename to Faqir: rename the config (and '.loom/' to '.faqir/') and follow ` +
    `docs/migration-1.0.md. Do not run 'faqir init' here first — it would start a project ` +
    `that has forgotten your installed components.`
  );
}
