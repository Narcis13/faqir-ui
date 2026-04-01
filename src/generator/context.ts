// Context generator — aggregates installed manifests into optimized AI context files

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, type Manifest } from "../manifest";
import { readConfig, type LoomConfig } from "../utils/config";
import { ensureDir, getRegistryPath } from "../utils/fs";

export interface ContextData {
  meta: {
    framework: string;
    version: string;
    theme: string;
    generated_at: string;
    component_count: {
      primitives: number;
      recipes: number;
      patterns: number;
    };
  };
  protocol: {
    identity: string;
    part: string;
    state: string;
    variant: string;
    size: string;
    css_target: string;
    state_css: string;
    theme_attr: string;
  };
  tokens: {
    prefix: string;
    spacing: string;
    radius: Record<string, string>;
    shadows: string;
    z_index: string;
  };
  components: Record<string, unknown>;
  patterns: Record<string, unknown>;
  rules: Record<string, boolean>;
}

/**
 * Load all installed manifests from a project.
 */
async function loadInstalledManifests(
  config: LoomConfig,
  outputDir: string,
): Promise<Map<string, Manifest>> {
  const manifests = new Map<string, Manifest>();
  for (const layer of ["primitives", "recipes", "patterns"] as const) {
    for (const name of config.installed[layer]) {
      const path = join(outputDir, layer, name, `${name}.manifest.json`);
      if (existsSync(path)) {
        manifests.set(name, await loadManifest(path));
      }
    }
  }
  return manifests;
}

/**
 * Build the compact component entry for context.json.
 */
function buildComponentEntry(manifest: Manifest): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    kind: manifest.kind,
  };

  if (manifest.variants && Object.keys(manifest.variants).length > 0) {
    const variants: Record<string, string[]> = {};
    for (const [key, v] of Object.entries(manifest.variants)) {
      variants[key] = v.values;
    }
    // Flatten single-key variants for brevity
    if (Object.keys(variants).length === 1 && "visual" in variants) {
      entry.variants = variants.visual;
    } else {
      entry.variants = variants;
    }
  }

  if (manifest.variants?.size) {
    entry.sizes = manifest.variants.size.values;
  }

  if (manifest.slots && Object.keys(manifest.slots).length > 0) {
    entry.slots = Object.keys(manifest.slots);
  }

  if (manifest.states && Object.keys(manifest.states).length > 0) {
    entry.states = Object.keys(manifest.states);
  }

  if (manifest.templates?.html) {
    entry.template = manifest.templates.html;
  }

  if (manifest.safe_transforms?.length > 0) {
    entry.safe_transforms = manifest.safe_transforms;
  }

  if (manifest.files?.js) {
    entry.controller = manifest.files.js;
  }

  if (manifest.a11y) {
    const a11yParts: string[] = [];
    if (manifest.a11y.role) a11yParts.push(`role=${manifest.a11y.role}`);
    if (manifest.a11y["aria-modal"]) a11yParts.push("aria-modal=true");
    if (manifest.a11y.focus_trap) a11yParts.push("focus-trap");
    if (manifest.a11y.escape_closes) a11yParts.push("escape-closes");
    if (manifest.a11y.required_attrs) {
      for (const attr of manifest.a11y.required_attrs) {
        // Shorten verbose descriptions
        if (!a11yParts.some((p) => attr.includes(p))) {
          a11yParts.push(attr);
        }
      }
    }
    if (a11yParts.length > 0) {
      entry.a11y = a11yParts.join(", ");
    }
  }

  return entry;
}

/**
 * Generate the full context data structure.
 */
export async function generateContext(cwd: string): Promise<ContextData> {
  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const manifests = await loadInstalledManifests(config, outputDir);

  const components: Record<string, unknown> = {};
  const patterns: Record<string, unknown> = {};

  for (const [name, manifest] of manifests) {
    const entry = buildComponentEntry(manifest);

    if (manifest.kind === "pattern") {
      patterns[name] = {
        uses: manifest.composition.contains,
        ...entry,
      };
    } else {
      components[name] = entry;
    }
  }

  return {
    meta: {
      framework: "loom",
      version: "1.0.0",
      theme: config.theme,
      generated_at: new Date().toISOString(),
      component_count: {
        primitives: config.installed.primitives.length,
        recipes: config.installed.recipes.length,
        patterns: config.installed.patterns.length,
      },
    },
    protocol: {
      identity: "data-ui",
      part: "data-part",
      state: "data-state",
      variant: "data-variant",
      size: "data-size",
      css_target: "[data-ui='name']",
      state_css: "[data-state='value']",
      theme_attr: "data-theme on <html>",
    },
    tokens: {
      prefix: "--",
      spacing: "4px base (--space-1 through --space-24)",
      radius: { sm: "4px", md: "6px", lg: "8px", xl: "12px" },
      shadows: "xs, sm, md, lg, xl",
      z_index: "dropdown:50, sticky:100, overlay:200, modal:300, toast:400",
    },
    components,
    patterns,
    rules: {
      use_data_state_not_classes: true,
      always_aria_label_on_icon_buttons: true,
      always_aria_labelledby_on_dialog_panel: true,
      semantic_html_over_div_soup: true,
      tokens_only_no_hardcoded_values: true,
    },
  };
}

/**
 * Format context as JSON string.
 */
export function formatContextJSON(data: ContextData): string {
  return JSON.stringify(data, null, 2) + "\n";
}

/**
 * Format context as Markdown for LLM prompts.
 */
export function formatContextMarkdown(data: ContextData): string {
  const lines: string[] = [];

  lines.push("# Loom UI Context");
  lines.push("");
  lines.push(`Theme: ${data.meta.theme} | Components: ${data.meta.component_count.primitives} primitives, ${data.meta.component_count.recipes} recipes, ${data.meta.component_count.patterns} patterns`);
  lines.push("");

  // Protocol
  lines.push("## Attribute Protocol");
  lines.push("");
  lines.push("| Attribute | Purpose |");
  lines.push("|-----------|---------|");
  lines.push(`| \`${data.protocol.identity}\` | Component identity — what this element IS |`);
  lines.push(`| \`${data.protocol.part}\` | Slot role within a parent component |`);
  lines.push(`| \`${data.protocol.state}\` | Runtime state (changed by JS) |`);
  lines.push(`| \`${data.protocol.variant}\` | Visual variant |`);
  lines.push(`| \`${data.protocol.size}\` | Size variant |`);
  lines.push("");
  lines.push(`CSS targeting: \`${data.protocol.css_target}\` | State: \`${data.protocol.state_css}\` | Theme: \`${data.protocol.theme_attr}\``);
  lines.push("");

  // Tokens summary
  lines.push("## Design Tokens");
  lines.push("");
  lines.push(`- Spacing: ${data.tokens.spacing}`);
  lines.push(`- Radius: ${Object.entries(data.tokens.radius).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  lines.push(`- Shadows: ${data.tokens.shadows}`);
  lines.push(`- Z-index: ${data.tokens.z_index}`);
  lines.push("");

  // Components
  lines.push("## Components");
  lines.push("");

  for (const [name, comp] of Object.entries(data.components)) {
    const c = comp as Record<string, unknown>;
    lines.push(`### ${name} (${c.kind})`);
    lines.push("");

    if (c.template) {
      lines.push("```html");
      lines.push(String(c.template));
      lines.push("```");
      lines.push("");
    }

    const details: string[] = [];
    if (c.variants) details.push(`Variants: ${JSON.stringify(c.variants)}`);
    if (c.sizes) details.push(`Sizes: ${(c.sizes as string[]).join(", ")}`);
    if (c.slots) details.push(`Slots: ${(c.slots as string[]).join(", ")}`);
    if (c.states) details.push(`States: ${(c.states as string[]).join(" → ")}`);
    if (c.a11y) details.push(`A11y: ${c.a11y}`);
    if (c.controller) details.push(`Controller: ${c.controller}`);
    if (c.safe_transforms) details.push(`Safe: ${(c.safe_transforms as string[]).join(", ")}`);

    for (const d of details) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  }

  // Patterns
  if (Object.keys(data.patterns).length > 0) {
    lines.push("## Patterns");
    lines.push("");
    for (const [name, pat] of Object.entries(data.patterns)) {
      const p = pat as Record<string, unknown>;
      lines.push(`- **${name}**: uses ${(p.uses as string[]).join(", ")}`);
    }
    lines.push("");
  }

  // Rules
  lines.push("## Rules");
  lines.push("");
  for (const [rule, enabled] of Object.entries(data.rules)) {
    if (enabled) {
      lines.push(`- ${rule.replace(/_/g, " ")}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Format context as Cursor IDE rules (.cursorrules format).
 */
export function formatContextCursorRules(data: ContextData): string {
  const lines: string[] = [];

  lines.push("# Loom UI Framework Rules");
  lines.push("");
  lines.push("When building UI in this project, follow these conventions:");
  lines.push("");
  lines.push("## Component Authoring");
  lines.push("");
  lines.push("- Use `data-ui` attribute for component identity (e.g., `data-ui=\"button\"`)");
  lines.push("- Use `data-part` attribute for slot roles within components (e.g., `data-part=\"trigger\"`)");
  lines.push("- Use `data-state` for runtime state changes — NEVER use CSS classes for state");
  lines.push("- Use `data-variant` for visual variants and `data-size` for size variants");
  lines.push("- CSS selectors target attributes: `[data-ui=\"button\"]`, `[data-ui=\"button\"][data-variant=\"primary\"]`");
  lines.push("- Always use CSS custom property tokens (`var(--color-primary)`) — never hardcode values");
  lines.push("- Always include required ARIA attributes per component manifest");
  lines.push("- Dark theme: `data-theme=\"dark\"` on `<html>` element");
  lines.push("");

  lines.push("## Available Components");
  lines.push("");

  const primitives = Object.entries(data.components).filter(([, c]) => (c as any).kind === "primitive");
  const recipes = Object.entries(data.components).filter(([, c]) => (c as any).kind === "recipe");

  if (primitives.length > 0) {
    lines.push(`Primitives: ${primitives.map(([n]) => n).join(", ")}`);
  }
  if (recipes.length > 0) {
    lines.push(`Recipes (interactive): ${recipes.map(([n]) => n).join(", ")}`);
  }
  if (Object.keys(data.patterns).length > 0) {
    lines.push(`Patterns: ${Object.keys(data.patterns).join(", ")}`);
  }
  lines.push("");

  // Component quick-reference
  lines.push("## Component Templates");
  lines.push("");
  for (const [name, comp] of Object.entries(data.components)) {
    const c = comp as Record<string, unknown>;
    if (c.template) {
      lines.push(`### ${name}`);
      lines.push("```html");
      lines.push(String(c.template));
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## CLI Commands");
  lines.push("");
  lines.push("- `loom add <name>` — add components");
  lines.push("- `loom audit` — check for contract violations");
  lines.push("- `loom repair` — auto-fix issues");
  lines.push("- `loom explain <name>` — get component details");
  lines.push("- `loom trace <name>` — show dependency and file trace");
  lines.push("- `loom context` — regenerate this context file");
  lines.push("");

  return lines.join("\n");
}

/**
 * Write the .loom/context.json file and optionally the skill file.
 */
export async function writeContextFiles(
  cwd: string,
  format: "json" | "md" | "cursorrules" = "json",
): Promise<{ path: string; content: string }> {
  const data = await generateContext(cwd);
  const loomDir = join(cwd, ".loom");
  ensureDir(loomDir);

  let content: string;
  let filename: string;

  switch (format) {
    case "md":
      content = formatContextMarkdown(data);
      filename = "context.md";
      break;
    case "cursorrules":
      content = formatContextCursorRules(data);
      filename = ".cursorrules";
      break;
    case "json":
    default:
      content = formatContextJSON(data);
      filename = "context.json";
      break;
  }

  const outPath = format === "cursorrules" ? join(cwd, filename) : join(loomDir, filename);
  await Bun.write(outPath, content);

  return { path: outPath, content };
}
