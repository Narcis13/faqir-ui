import { generateContext, generateContextMarkdown, generateCursorRules } from "../generator/context";
import { generateSkill } from "../generator/skill";
import { readConfigFile } from "../utils/config";
import { fileExists, writeJsonFile, writeTextFile } from "../utils/fs";
import { info, success } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";

type ContextFormat = "json" | "md" | "cursorrules";

type ContextArgs = {
  format: ContextFormat;
};

export async function contextCommand(args: string[], cwd: string): Promise<void> {
  const options = parseContextArgs(args);
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  const config = await readConfigFile(configPath);
  const context = await generateContext(cwd, config);
  const loomDir = resolvePackagePath(cwd, ".loom");

  if (options.format === "json") {
    await writeJsonFile(resolvePackagePath(loomDir, "context.json"), context);
    success("Generated .loom/context.json");
  }

  if (options.format === "md" || options.format === "json") {
    const markdown = generateContextMarkdown(context);
    await writeTextFile(resolvePackagePath(loomDir, "context.md"), markdown);
    if (options.format === "md") {
      success("Generated .loom/context.md");
    }
  }

  if (options.format === "cursorrules") {
    const rules = generateCursorRules(context);
    await writeTextFile(resolvePackagePath(cwd, ".cursorrules"), rules);
    success("Generated .cursorrules");
  }

  const skill = generateSkill(config);
  await writeTextFile(resolvePackagePath(loomDir, "SKILL.md"), skill);

  info("Context files regenerated.");
}

function parseContextArgs(args: string[]): ContextArgs {
  const options: ContextArgs = { format: "json" };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--format") {
      const value = args[index + 1];

      if (!value || !["json", "md", "cursorrules"].includes(value)) {
        throw new Error("--format must be one of: json, md, cursorrules");
      }

      options.format = value as ContextFormat;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}
