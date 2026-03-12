import { readConfigFile } from "../utils/config";
import { fileExists } from "../utils/fs";
import { info, success } from "../utils/logger";
import { writeProjectConfig, regenerateProjectContext } from "../utils/project";
import { resolvePackagePath } from "../utils/paths";
import {
  getProjectThemePath,
  listThemeRecords,
  syncProjectTokens,
  writeProjectThemeTemplate,
} from "../utils/theme";

export async function themeCommand(args: string[], cwd: string): Promise<void> {
  const [subcommand, ...rest] = args;

  if (!subcommand) {
    throw new Error("Usage: loom theme <set|create|list> [args]");
  }

  if (subcommand === "list") {
    await listThemes(cwd);
    return;
  }

  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  const config = await readConfigFile(configPath);

  if (subcommand === "set") {
    const [themeName] = rest;

    if (!themeName) {
      throw new Error("Usage: loom theme set <name>");
    }

    config.theme = themeName;
    await syncProjectTokens(cwd, config);
    await writeProjectConfig(cwd, config);
    await regenerateProjectContext(cwd, config);
    success(`Active theme set to ${themeName}`);
    return;
  }

  if (subcommand === "create") {
    const [themeName] = rest;

    if (!themeName) {
      throw new Error("Usage: loom theme create <name>");
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(themeName)) {
      throw new Error("Theme names must be lowercase kebab-case");
    }

    const records = await listThemeRecords(cwd, config);

    if (records.some((record) => record.name === themeName)) {
      throw new Error(`Theme already exists: ${themeName}`);
    }

    const themePath = await writeProjectThemeTemplate(cwd, config, themeName);
    success(`Created theme ${themeName}`);
    info(`Theme file: ${themePath}`);
    info(`Run \`loom theme set ${themeName}\` to activate it.`);
    return;
  }

  throw new Error(`Unknown theme command: ${subcommand}`);
}

async function listThemes(cwd: string): Promise<void> {
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    const records = await listThemeRecords();
    info("Themes:");

    for (const record of records) {
      info(`  ${record.name} (${record.source})`);
    }

    return;
  }

  const config = await readConfigFile(configPath);
  const records = await listThemeRecords(cwd, config);

  info("Themes:");

  for (const record of records) {
    const marker = record.name === config.theme ? "✓" : " ";
    const suffix = record.source === "project"
      ? `project: ${getProjectThemePath(cwd, config, record.name)}`
      : "built-in";
    info(`  ${marker} ${record.name} (${suffix})`);
  }
}
