import { addCommand } from "./add";
import { readConfigFile } from "../utils/config";
import { fileExists, writeTextFile } from "../utils/fs";
import { info, success } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";
import { getScaffoldDefinition, listScaffoldDefinitions, renderScaffoldHtml } from "../utils/scaffold";

export async function scaffoldCommand(args: string[], cwd: string): Promise<void> {
  const [name] = args;

  if (!name) {
    const available = listScaffoldDefinitions().map((definition) => definition.name).join(", ");
    throw new Error(`Usage: loom scaffold <name>. Available: ${available}`);
  }

  const definition = getScaffoldDefinition(name);

  if (!definition) {
    const available = listScaffoldDefinitions().map((item) => item.name).join(", ");
    throw new Error(`Unknown scaffold: ${name}. Available: ${available}`);
  }

  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  let config = await readConfigFile(configPath);
  const missingPatterns = definition.patterns.filter((pattern) => !config.installed.patterns.includes(pattern));

  if (missingPatterns.length > 0) {
    info(`Auto-adding scaffold patterns: ${missingPatterns.join(", ")}`);
    await addCommand(missingPatterns, cwd);
    config = await readConfigFile(configPath);
  }

  const html = await renderScaffoldHtml(cwd, config, definition);
  const scaffoldPath = resolvePackagePath(cwd, config.output_dir, "scaffolds", `${definition.name}.html`);
  await writeTextFile(scaffoldPath, html);
  success(`Generated scaffold ${definition.name}`);
  info(`Scaffold file: ${scaffoldPath}`);
}
