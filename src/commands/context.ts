// faqir context — generate the .faqir/context.json aggregated AI context file

import { log } from "../utils/logger";
import { emitJSON } from "../utils/json-output";
import { configExists } from "../utils/config";
import {
  writeContextFiles,
  writeLlmsFiles,
  generateContext,
  formatContextJSON,
  formatContextMarkdown,
  formatContextCursorRules,
  formatContextLlms,
} from "../generator/context";
import { writeSkillFile } from "../generator/skill";

type ContextFormat = "json" | "md" | "cursorrules" | "llms";

/**
 * Machine-readable description of every output format `faqir context` can emit.
 * Surfaced via `--json` so agents can discover the `llms` format (and the files
 * it produces) without scraping `--help`.
 */
const FORMATS: { format: ContextFormat; outputs: string[]; description: string }[] = [
  { format: "json", outputs: [".faqir/context.json"], description: "JSON format (default)" },
  { format: "md", outputs: [".faqir/context.md"], description: "Markdown for LLM prompts" },
  { format: "cursorrules", outputs: [".cursorrules"], description: "Cursor IDE rules format" },
  {
    format: "llms",
    outputs: ["llms.txt", "llms-full.txt"],
    description: "llms.txt convention: concise linked index + full expanded reference",
  },
];

export async function context(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    log.heading("faqir context");
    log.blank();
    console.log("Generate the .faqir/context.json aggregated AI context file.");
    log.blank();
    console.log("Options:");
    log.table([
      ["--format json", "JSON format (default)"],
      ["--format md", "Markdown for LLM prompts"],
      ["--format cursorrules", "Cursor IDE rules format"],
      ["--format llms", "llms.txt + llms-full.txt (llmstxt.org convention)"],
      ["--skill", "Also generate .faqir/SKILL.md"],
      ["--stdout", "Print to stdout instead of writing file"],
      ["--json", "Print command metadata (formats + outputs) as JSON"],
    ]);
    return;
  }

  // Machine-readable metadata: available formats and the files each produces.
  if (args.includes("--json")) {
    emitJSON({ command: "context", formats: FORMATS });
    return;
  }

  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  // Parse format
  let format: ContextFormat = "json";
  const fmtIdx = args.indexOf("--format");
  if (fmtIdx >= 0 && args[fmtIdx + 1]) {
    const val = args[fmtIdx + 1];
    if (FORMATS.some((f) => f.format === val)) {
      format = val as ContextFormat;
    } else {
      log.error(`Invalid format '${val}'. Must be: ${FORMATS.map((f) => f.format).join(", ")}`);
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
      case "llms":
        // Print the concise index; the full reference is only useful as a file.
        console.log(formatContextLlms(data));
        break;
      default:
        console.log(formatContextJSON(data));
    }
    return;
  }

  if (format === "llms") {
    const { paths } = await writeLlmsFiles(cwd);
    for (const p of paths) log.success(`Context written to ${p}`);
  } else {
    const result = await writeContextFiles(cwd, format);
    log.success(`Context written to ${result.path}`);
  }

  if (withSkill) {
    const skillPath = await writeSkillFile(cwd);
    log.success(`Skill file written to ${skillPath}`);
  }
}
