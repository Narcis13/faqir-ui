import type { LoomConfig } from "../utils/config";

export function generateSkill(config: LoomConfig): string {
  const allComponents = [
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ];

  return [
    "# Loom UI Framework Skill",
    "",
    "When building UI with Loom, always read `.loom/context.json` first.",
    "",
    "## Quick Rules",
    "",
    "- Use `data-ui` for component identity",
    "- Use `data-part` for slot roles",
    "- Use `data-state` for runtime state (CSS targets this)",
    "- Use `data-variant` for visual variants",
    "- Use CSS tokens (`var(--color-primary)`) — never hardcode values",
    "- Always include ARIA attributes per component manifest",
    "- Import recipe controllers: `import { createDialog } from \"./ui/recipes/dialog/dialog.js\"`",
    "",
    "## Installed Components",
    "",
    allComponents.length > 0
      ? allComponents.map((name) => `- ${name}`).join("\n")
      : "No components installed yet. Run `loom add <name>` to add components.",
    "",
    "## Available Commands",
    "",
    "- `loom add <name>` — add components",
    "- `loom audit` — check for contract violations",
    "- `loom repair` — auto-fix issues",
    "- `loom explain <name>` — get component details",
    "- `loom trace <name>` — show dependency and file trace",
    "- `loom context` — regenerate AI context file",
    "- `loom conform` — normalize component markup",
    "",
  ].join("\n");
}
