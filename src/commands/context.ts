// loom context — generate the .loom/context.json aggregated AI context file

import { log } from "../utils/logger";
import { configExists } from "../utils/config";
import { writeContextFiles, generateContext, formatContextJSON, formatContextMarkdown, formatContextCursorRules } from "../generator/context";
import { writeSkillFile } from "../generator/skill";

export async function context(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    log.heading("loom context");
    log.blank();
    console.log("Generate the .loom/context.json aggregated AI context file.");
    log.blank();
    console.log("Options:");
    log.table([
      ["--format json", "JSON format (default)"],
      ["--format md", "Markdown for LLM prompts"],
      ["--format cursorrules", "Cursor IDE rules format"],
      ["--skill", "Also generate .loom/SKILL.md"],
      ["--stdout", "Print to stdout instead of writing file"],
    ]);
    return;
  }

  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No loom.config.json found. Run 'loom init' first.");
    process.exit(1);
  }

  // Parse format
  let format: "json" | "md" | "cursorrules" = "json";
  const fmtIdx = args.indexOf("--format");
  if (fmtIdx >= 0 && args[fmtIdx + 1]) {
    const val = args[fmtIdx + 1];
    if (val === "json" || val === "md" || val === "cursorrules") {
      format = val;
    } else {
      log.error(`Invalid format '${val}'. Must be: json, md, cursorrules`);
      process.exit(1);
    }
  }

  const stdout = args.includes("--stdout");
  const withSkill = args.includes("--skill");

  if (stdout) {
    const data = await generateContext(cwd);
    switch (format) {
      case "md":
        console.log(formatContextMarkdown(data));
        break;
      case "cursorrules":
        console.log(formatContextCursorRules(data));
        break;
      default:
        console.log(formatContextJSON(data));
    }
    return;
  }

  const result = await writeContextFiles(cwd, format);
  log.success(`Context written to ${result.path}`);

  if (withSkill) {
    const skillPath = await writeSkillFile(cwd);
    log.success(`Skill file written to ${skillPath}`);
  }
}
