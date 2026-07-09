// Claude Code skill generator — produces .faqir/SKILL.md for agent consumption

import { join } from "node:path";
import { readConfig } from "../utils/config";
import { ensureDir } from "../utils/fs";

/**
 * Generate a Claude Code SKILL.md file for the project.
 */
export async function generateSkill(cwd: string): Promise<string> {
  const config = await readConfig(cwd);

  const allInstalled = [
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ];

  const lines: string[] = [];

  lines.push("# Faqir UI Framework Skill");
  lines.push("");
  lines.push("When building UI with Faqir, always read `.faqir/context.json` first.");
  lines.push("");

  lines.push("## Quick Rules");
  lines.push("");
  lines.push("- Use `data-ui` for component identity");
  lines.push("- Use `data-part` for slot roles");
  lines.push("- Use `data-state` for runtime state (CSS targets this)");
  lines.push("- Use `data-variant` for visual variants");
  lines.push("- Use `data-size` for size variants");
  lines.push("- Use CSS tokens (`var(--color-primary)`) — never hardcode values");
  lines.push("- Always include ARIA attributes per component manifest");
  lines.push("- Never use CSS class names for state — use `data-state` only");
  lines.push("- Never use `!important` in component CSS");
  lines.push("");

  // Data-driven rendering
  lines.push("## Data-Driven Rendering");
  lines.push("");
  lines.push("Include `<script src=\"" + config.output_dir + "/core/api-source.js\"></script>` before faqir-core.js to use `apiSource()`.");
  lines.push("");
  lines.push("```html");
  lines.push("<div l-data=\"{ ...apiSource('/api/items', { idKey: 'id', optimistic: true }), newName: '' }\"");
  lines.push("     l-init=\"load()\">");
  lines.push("  <template l-for=\"item in items\"><span l-text=\"item.name\"></span></template>");
  lines.push("  <form @submit.prevent=\"create({ name: newName }).then(() => newName = '')\">");
  lines.push("    <input data-ui=\"input\" l-model=\"newName\">");
  lines.push("    <button data-ui=\"button\" data-variant=\"primary\">Add</button>");
  lines.push("  </form>");
  lines.push("</div>");
  lines.push("```");
  lines.push("");
  lines.push("Methods: `load()`, `create(payload)`, `update(id, payload)`, `remove(id)`, `startPolling(ms)`, `stopPolling()`");
  lines.push("State: `items` (array), `loading`, `submitting`, `error`");
  lines.push("Note: `apiSource()` is application code — recipe controllers still never call fetch.");
  lines.push("");

  if (config.installed.recipes.length > 0) {
    lines.push("## Recipe Controllers");
    lines.push("");
    lines.push("Interactive components need their JS controller loaded:");
    lines.push("");
    for (const recipe of config.installed.recipes) {
      const factoryName = "create" + recipe.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
      lines.push(`- \`import { ${factoryName} } from "./${config.output_dir}/recipes/${recipe}/${recipe}.js"\``);
    }
    lines.push("");
    lines.push("Or use the auto-init script: `<script type=\"module\" src=\"" + config.output_dir + "/core/faqir.js\"></script>`");
    lines.push("");
  }

  lines.push("## Installed Components");
  lines.push("");
  if (config.installed.primitives.length > 0) {
    lines.push(`Primitives: ${config.installed.primitives.join(", ")}`);
  }
  if (config.installed.recipes.length > 0) {
    lines.push(`Recipes: ${config.installed.recipes.join(", ")}`);
  }
  if (config.installed.patterns.length > 0) {
    lines.push(`Patterns: ${config.installed.patterns.join(", ")}`);
  }
  lines.push("");

  lines.push("## Available Commands");
  lines.push("");
  lines.push("- `faqir add <name>` — add components");
  lines.push("- `faqir audit` — check for contract violations");
  lines.push("- `faqir repair` — auto-fix issues");
  lines.push("- `faqir explain <name>` — get component details");
  lines.push("- `faqir trace <name>` — show dependency and file trace");
  lines.push("- `faqir inspect <name>` — show full manifest");
  lines.push("- `faqir context` — regenerate context file");
  lines.push("- `faqir conform` — normalize component markup");
  lines.push("");

  const content = lines.join("\n");
  return content;
}

/**
 * Write the SKILL.md file to .faqir/ directory.
 */
export async function writeSkillFile(cwd: string): Promise<string> {
  const content = await generateSkill(cwd);
  const faqirDir = join(cwd, ".faqir");
  ensureDir(faqirDir);
  const outPath = join(faqirDir, "SKILL.md");
  await Bun.write(outPath, content);
  return outPath;
}
