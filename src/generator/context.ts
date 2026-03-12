import type { LoomConfig } from "../utils/config";
import { LOOM_VERSION } from "../utils/config";
import { loadInstalledComponentManifests } from "../utils/registry";
import type { LoomManifest } from "../utils/manifest";

export async function generateContext(
  projectRoot: string,
  config: LoomConfig,
): Promise<Record<string, unknown>> {
  const components = await loadInstalledComponentManifests(projectRoot, config);
  const patternEntries = components.filter(({ layer }) => layer === "patterns");

  return {
    meta: {
      framework: "loom",
      version: config.version,
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
    components: Object.fromEntries(
      components.map(({ manifest }) => [
        manifest.name,
        buildComponentEntry(manifest),
      ]),
    ),
    patterns: Object.fromEntries(
      patternEntries.map(({ manifest }) => [
        manifest.name,
        {
          uses: manifest.composition.contains,
          template: manifest.templates.html,
        },
      ]),
    ),
    rules: {
      use_data_state_not_classes: true,
      always_aria_label_on_icon_buttons: true,
      always_aria_labelledby_on_dialog_panel: true,
      semantic_html_over_div_soup: true,
      tokens_only_no_hardcoded_values: true,
    },
  };
}

function buildComponentEntry(manifest: LoomManifest): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    kind: manifest.kind,
    category: manifest.category,
    description: manifest.description,
    selector: manifest.anatomy.selector,
  };

  if (manifest.slots && Object.keys(manifest.slots).length > 0) {
    entry.slots = Object.keys(manifest.slots);
  }

  if (manifest.variants && Object.keys(manifest.variants).length > 0) {
    entry.variants = Object.fromEntries(
      Object.entries(manifest.variants).map(([name, variant]) => [
        name,
        {
          values: variant.values,
          default: variant.default,
          attr: variant.attr,
        },
      ]),
    );
  }

  if (manifest.states && Object.keys(manifest.states).length > 0) {
    entry.states = Object.keys(manifest.states);
  }

  if (manifest.a11y) {
    const parts: string[] = [];
    if (manifest.a11y.role) parts.push(`role=${manifest.a11y.role}`);
    if (manifest.a11y["aria-modal"]) parts.push("aria-modal=true");
    if (manifest.a11y.focus_trap) parts.push("focus-trap");
    if (manifest.a11y.escape_closes) parts.push("escape-closes");
    if (manifest.a11y.return_focus) parts.push(`return-focus→${manifest.a11y.return_focus}`);
    if (parts.length > 0) {
      entry.a11y = parts.join(", ");
    }
  }

  if (manifest.templates.html) {
    entry.template = manifest.templates.html;
  }

  entry.safe_transforms = manifest.safe_transforms;

  if (manifest.files.js) {
    entry.controller = manifest.files.js;
  }

  return entry;
}

export function generateContextMarkdown(context: Record<string, unknown>): string {
  const meta = context.meta as Record<string, unknown>;
  const protocol = context.protocol as Record<string, string>;
  const components = context.components as Record<string, Record<string, unknown>>;
  const rules = context.rules as Record<string, boolean>;

  const lines: string[] = [
    "# Loom UI Context",
    "",
    `> Generated ${(meta.generated_at as string).split("T")[0]} | v${meta.version} | theme: ${meta.theme}`,
    "",
    "## Protocol",
    "",
    "| Attribute | Purpose |",
    "|-----------|---------|",
    `| \`${protocol.identity}\` | Component identity |`,
    `| \`${protocol.part}\` | Slot role within parent |`,
    `| \`${protocol.state}\` | Runtime state (JS toggles this) |`,
    `| \`${protocol.variant}\` | Visual variant |`,
    `| \`${protocol.size}\` | Size variant |`,
    "",
    "CSS targets: `[data-ui='name']`, `[data-state='value']`",
    `Theme: \`${protocol.theme_attr}\``,
    "",
    "## Components",
    "",
  ];

  for (const [name, comp] of Object.entries(components)) {
    lines.push(`### ${name} (${comp.kind})`);
    lines.push("");
    lines.push(comp.description as string);
    lines.push("");

    if (comp.slots) {
      lines.push(`**Slots:** ${(comp.slots as string[]).join(", ")}`);
    }

    if (comp.variants) {
      const variantEntries = Object.entries(comp.variants as Record<string, { values: string[]; default: string }>)
        .map(([k, v]) => `${k}: ${v.values.join(" | ")}`)
        .join("  ");
      lines.push(`**Variants:** ${variantEntries}`);
    }

    if (comp.states) {
      lines.push(`**States:** ${(comp.states as string[]).join(" → ")}`);
    }

    if (comp.a11y) {
      lines.push(`**A11y:** ${comp.a11y}`);
    }

    if (comp.controller) {
      lines.push(`**Controller:** ${comp.controller}`);
    }

    lines.push("");
  }

  lines.push("## Rules");
  lines.push("");
  for (const [rule, _] of Object.entries(rules)) {
    lines.push(`- ${rule.replace(/_/g, " ")}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function generateCursorRules(context: Record<string, unknown>): string {
  const protocol = context.protocol as Record<string, string>;
  const components = context.components as Record<string, Record<string, unknown>>;

  const lines: string[] = [
    "# Loom UI Framework Rules",
    "",
    "When building UI with this project, follow these rules:",
    "",
    "## Attribute Protocol",
    "",
    `- Use \`${protocol.identity}\` for component identity (e.g., data-ui=\"button\")`,
    `- Use \`${protocol.part}\` for slot roles (e.g., data-part=\"trigger\")`,
    `- Use \`${protocol.state}\` for runtime state — CSS targets this, JS toggles it`,
    `- Use \`${protocol.variant}\` for visual variants`,
    `- Use \`${protocol.size}\` for size variants`,
    "- Never use class names for component identity or state",
    "- Use CSS tokens (var(--color-primary)) — never hardcode values",
    "- Always include ARIA attributes per component manifest",
    "",
    "## Available Components",
    "",
  ];

  for (const [name, comp] of Object.entries(components)) {
    const parts: string[] = [`**${name}** (${comp.kind}): ${comp.description}`];

    if (comp.template) {
      parts.push(`  Template: \`${(comp.template as string).replace(/\n/g, " ").slice(0, 120)}\``);
    }

    if (comp.safe_transforms) {
      parts.push(`  Safe: ${(comp.safe_transforms as string[]).join(", ")}`);
    }

    lines.push(parts.join("\n"));
    lines.push("");
  }

  lines.push("## Do NOT");
  lines.push("");
  lines.push("- Use class names for state (use data-state)");
  lines.push("- Hardcode color/spacing/shadow values (use tokens)");
  lines.push("- Remove ARIA attributes from components");
  lines.push("- Remove focus trap from dialogs");
  lines.push("- Use `!important` in component CSS");
  lines.push("");

  return lines.join("\n");
}
