import {
  appendUniqueLine,
  ensureDir,
  fileExists,
  readTextFile,
  writeJsonFile,
  writeTextFile,
} from "../utils/fs";
import {
  createDefaultConfig,
  formatOutputDir,
  type LoomConfig,
  LOOM_VERSION,
} from "../utils/config";
import { success } from "../utils/logger";
import {
  resolvePackagePath,
  resolveRegistryPath,
} from "../utils/paths";
import { regenerateProjectContext } from "../utils/project";
import { ensureCoreModules, writeLoomScript } from "../utils/recipes";
import { syncProjectTokens } from "../utils/theme";

type InitOptions = {
  dir: string;
  theme: string;
  tokensSplit: boolean;
  includeCore: boolean;
};

export async function initCommand(args: string[], cwd: string): Promise<void> {
  const options = parseInitArgs(args);
  const outputDir = formatOutputDir(options.dir);
  const config = createDefaultConfig({
    version: LOOM_VERSION,
    theme: options.theme,
    outputDir,
    tokensSplit: options.tokensSplit,
    includeCore: options.includeCore,
  });

  await ensureProjectStructure(cwd, config);
  await syncProjectTokens(cwd, config);
  await writeBaseStyles(cwd, config);

  if (config.include_core) {
    await ensureCoreModules(cwd, config);
  }

  await writeLoomScript(cwd, config);

  await writeJsonFile(resolvePackagePath(cwd, "loom.config.json"), config);
  await ensureDir(resolvePackagePath(cwd, ".loom"));
  await regenerateProjectContext(cwd, config);

  if (await fileExists(resolvePackagePath(cwd, ".git"))) {
    await appendUniqueLine(resolvePackagePath(cwd, ".gitignore"), ".loom/");
  }

  success(`Initialized Loom in ${config.output_dir}`);
}

function parseInitArgs(args: string[]): InitOptions {
  const options: InitOptions = {
    dir: "./ui",
    theme: "default",
    tokensSplit: false,
    includeCore: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--theme") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--theme requires a value");
      }
      options.theme = value;
      index += 1;
      continue;
    }

    if (arg === "--tokens-split") {
      options.tokensSplit = true;
      continue;
    }

    if (arg === "--no-core") {
      options.includeCore = false;
      continue;
    }

    if (arg === "--dir") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--dir requires a value");
      }
      options.dir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function ensureProjectStructure(projectRoot: string, config: LoomConfig): Promise<void> {
  const outputRoot = resolvePackagePath(projectRoot, config.output_dir);
  const directories = [
    outputRoot,
    resolvePackagePath(outputRoot, "tokens"),
    resolvePackagePath(outputRoot, "base"),
    resolvePackagePath(outputRoot, "primitives"),
    resolvePackagePath(outputRoot, "recipes"),
    resolvePackagePath(outputRoot, "patterns"),
    resolvePackagePath(outputRoot, "scaffolds"),
    resolvePackagePath(outputRoot, "themes"),
  ];

  if (config.include_core) {
    directories.push(resolvePackagePath(outputRoot, "core"));
  }

  for (const directory of directories) {
    await ensureDir(directory);
  }
}

async function writeBaseStyles(projectRoot: string, config: LoomConfig): Promise<void> {
  const outputRoot = resolvePackagePath(projectRoot, config.output_dir);
  const baseDir = resolvePackagePath(outputRoot, "base");
  const baseFiles = ["reset.css", "prose.css"] as const;

  for (const fileName of baseFiles) {
    await writeTextFile(
      resolvePackagePath(baseDir, fileName),
      await readTextFile(resolveRegistryPath("base", fileName)),
    );
  }
}

export const testables = {
  parseInitArgs,
};
