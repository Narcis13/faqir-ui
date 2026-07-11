// Context generator — aggregates installed manifests into optimized AI context files

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, type Manifest } from "../manifest";
import { loadThemeManifest, type ThemeManifest } from "../theme-manifest";
import { readConfig, type FaqirConfig } from "../utils/config";
import { ensureDir, getRegistryPath } from "../utils/fs";

/**
 * The active theme, as embedded in context. Either the full theme manifest (when
 * the active theme ships one — every registry theme does) or a minimal fallback
 * for a custom project theme that has no manifest yet.
 */
export type ContextTheme = ThemeManifest | { name: string; manifest_found: false };

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
  theme: ContextTheme;
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
  config: FaqirConfig,
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
 * Load the active theme's manifest for embedding into context. Registry themes
 * ship `registry/themes/{name}.theme.json`; a custom project theme without a
 * manifest falls back to a minimal `{ name, manifest_found: false }` block.
 */
export async function loadActiveTheme(config: FaqirConfig): Promise<ContextTheme> {
  const manifestPath = join(getRegistryPath(), "themes", `${config.theme}.theme.json`);
  if (existsSync(manifestPath)) {
    return await loadThemeManifest(manifestPath);
  }
  return { name: config.theme, manifest_found: false };
}

/**
 * Build the compact component entry for context.json.
 */
function buildComponentEntry(manifest: Manifest): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    kind: manifest.kind,
  };

  if (manifest.category) {
    entry.category = manifest.category;
  }

  if (manifest.description) {
    entry.description = manifest.description;
  }

  if (manifest.aliases && manifest.aliases.length > 0) {
    entry.aliases = manifest.aliases;
  }

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
  const theme = await loadActiveTheme(config);

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
      framework: "faqir",
      version: "1.0.0",
      theme: config.theme,
      generated_at: new Date().toISOString(),
      component_count: {
        primitives: config.installed.primitives.length,
        recipes: config.installed.recipes.length,
        patterns: config.installed.patterns.length,
      },
    },
    theme,
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
      api_source_is_app_code_not_controller: true,
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

  lines.push("# Faqir UI Context");
  lines.push("");
  lines.push(`Theme: ${data.meta.theme} | Components: ${data.meta.component_count.primitives} primitives, ${data.meta.component_count.recipes} recipes, ${data.meta.component_count.patterns} patterns`);
  lines.push("");

  // Active theme
  const t = data.theme;
  lines.push("## Active Theme");
  lines.push("");
  if ("mood" in t) {
    lines.push(`- Name: ${t.name} v${t.version}`);
    lines.push(`- Mood: ${t.mood.join(", ")}`);
    lines.push(`- Scheme: ${t.scheme} (dark mode: ${t.dark_mode})`);
    lines.push(`- Overrides ${t.tokens_overridden.length} tokens, inherits ${t.tokens_inherited.length} from base`);
    if (t.pairs_with.length > 0) lines.push(`- Pairs with: ${t.pairs_with.join(", ")}`);
  } else {
    lines.push(`- Name: ${t.name} (custom theme — no manifest)`);
  }
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

  // Data Service
  lines.push("## Data-Driven Rendering");
  lines.push("");
  lines.push("Include `core/api-source.js` before `core/faqir-core.js` to use `apiSource()`.");
  lines.push("Spread into `l-data` for server-backed CRUD: `l-data=\"{ ...apiSource('/api/items'), newName: '' }\" l-init=\"load()\"`");
  lines.push("Methods: `load()`, `create(payload)`, `update(id, payload)`, `remove(id)`, `startPolling(ms)`, `stopPolling()`");
  lines.push("State: `items` (array), `loading`, `submitting`, `error`");
  lines.push("Options: `apiSource(url, { idKey: 'id', pollInterval: 0, optimistic: true })`");
  lines.push("Note: `apiSource()` is application code — recipe controllers still never call fetch.");
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
    if (c.aliases) details.push(`Aliases: ${(c.aliases as string[]).join(", ")} (agents can search these names)`);
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

  lines.push("# Faqir UI Framework Rules");
  lines.push("");
  lines.push("When building UI in this project, follow these conventions:");
  lines.push("");

  const t = data.theme;
  if ("mood" in t) {
    lines.push(`Active theme: \`${t.name}\` — ${t.mood.join(", ")} (${t.scheme} scheme, dark mode: ${t.dark_mode}).`);
  } else {
    lines.push(`Active theme: \`${t.name}\` (custom).`);
  }
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

  lines.push("## Data-Driven Rendering");
  lines.push("");
  lines.push("- Include `<script src=\"ui/core/api-source.js\"></script>` before faqir-core.js");
  lines.push("- Use `apiSource(endpoint, options?)` to create server-backed data sources");
  lines.push("- Spread into `l-data`: `l-data=\"{ ...apiSource('/api/items') }\" l-init=\"load()\"`");
  lines.push("- CRUD methods: `load()`, `create(payload)`, `update(id, payload)`, `remove(id)`");
  lines.push("- State: `items`, `loading`, `submitting`, `error`");
  lines.push("- `apiSource()` is application code, NOT a recipe controller — no-fetch rule doesn't apply");
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

  const aliasPairs: string[] = [];
  for (const [name, comp] of Object.entries(data.components)) {
    const a = (comp as Record<string, unknown>).aliases as string[] | undefined;
    if (a?.length) for (const alias of a) aliasPairs.push(`${alias} → ${name}`);
  }
  if (aliasPairs.length > 0) {
    lines.push(`Aliases (resolve to the component on the right): ${aliasPairs.join(", ")}`);
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
  lines.push("- `faqir add <name>` — add components (accepts aliases)");
  lines.push("- `faqir search <query>` — find components by name, alias, or description");
  lines.push("- `faqir audit` — check for contract violations");
  lines.push("- `faqir repair` — auto-fix issues");
  lines.push("- `faqir explain <name>` — get component details");
  lines.push("- `faqir trace <name>` — show dependency and file trace");
  lines.push("- `faqir context` — regenerate this context file");
  lines.push("");

  return lines.join("\n");
}

/**
 * The one-line project blurb embedded in both llms.txt and llms-full.txt.
 * Purely derived from the installed set + active theme — no hand-maintained prose.
 */
function llmsBlurb(data: ContextData): string {
  const c = data.meta.component_count;
  const t = data.theme;
  const themeDesc = "mood" in t ? `${t.name} (${t.mood.join(", ")})` : `${t.name}`;
  return (
    `Zero-class, manifest-driven UI framework. This project installs ` +
    `${c.primitives} primitive${c.primitives === 1 ? "" : "s"}, ` +
    `${c.recipes} recipe${c.recipes === 1 ? "" : "s"}, and ` +
    `${c.patterns} pattern${c.patterns === 1 ? "" : "s"} on the ${themeDesc} theme. ` +
    `Components are identified by \`data-ui\` attributes and styled entirely with design tokens — no CSS classes.`
  );
}

/** Split installed components into primitives and recipes, preserving insertion order. */
function partitionComponents(data: ContextData): {
  primitives: [string, Record<string, unknown>][];
  recipes: [string, Record<string, unknown>][];
} {
  const primitives: [string, Record<string, unknown>][] = [];
  const recipes: [string, Record<string, unknown>][] = [];
  for (const [name, comp] of Object.entries(data.components)) {
    const c = comp as Record<string, unknown>;
    if (c.kind === "recipe") recipes.push([name, c]);
    else primitives.push([name, c]);
  }
  return { primitives, recipes };
}

/**
 * Format the concise `llms.txt` index following the llmstxt.org convention:
 * an H1 project title, a blockquote summary, an optional detail paragraph, and
 * H2 sections whose bodies are markdown link lists (`[name](url): notes`).
 *
 * Every link points to an anchor inside the companion `llms-full.txt`, so the
 * index is a genuine table of contents into the expanded reference. All content
 * is derived from installed manifests and design tokens — no hand-written prose.
 */
export function formatContextLlms(data: ContextData): string {
  const lines: string[] = [];
  const { primitives, recipes } = partitionComponents(data);

  lines.push(`# Faqir UI (${data.meta.theme} theme)`);
  lines.push("");
  lines.push(`> ${llmsBlurb(data)}`);
  lines.push("");
  lines.push(
    "Components carry their contract in `data-ui`/`data-part`/`data-state` attributes; " +
      "CSS targets those attributes (`[data-ui=\"button\"]`) and every value comes from a " +
      "`--token`. The full expanded reference — templates, variants, slots, states, and " +
      "accessibility contracts — lives in llms-full.txt.",
  );
  lines.push("");

  const linkItem = (name: string, c: Record<string, unknown>): string => {
    const desc = c.description ? `: ${c.description}` : "";
    return `- [${name}](llms-full.txt#${name})${desc}`;
  };

  if (primitives.length > 0) {
    lines.push("## Primitives");
    lines.push("");
    for (const [name, c] of primitives) lines.push(linkItem(name, c));
    lines.push("");
  }

  if (recipes.length > 0) {
    lines.push("## Recipes");
    lines.push("");
    for (const [name, c] of recipes) lines.push(linkItem(name, c));
    lines.push("");
  }

  const patternEntries = Object.entries(data.patterns);
  if (patternEntries.length > 0) {
    lines.push("## Patterns");
    lines.push("");
    for (const [name, pat] of patternEntries) {
      const p = pat as Record<string, unknown>;
      const desc = p.description ? `: ${p.description}` : "";
      lines.push(`- [${name}](llms-full.txt#${name})${desc}`);
    }
    lines.push("");
  }

  lines.push("## Optional");
  lines.push("");
  lines.push("- [Attribute protocol](llms-full.txt#attribute-protocol): the data-ui / data-part / data-state contract");
  lines.push("- [Design tokens](llms-full.txt#design-tokens): spacing, radius, shadow, and z-index scales");
  lines.push("- [Data-driven rendering](llms-full.txt#data-driven-rendering): apiSource() for server-backed CRUD");
  lines.push("- [Rules](llms-full.txt#rules): authoring constraints agents must follow");
  lines.push("");

  return lines.join("\n");
}

/** Render one component's full reference block (used by llms-full.txt). */
function llmsFullComponentBlock(name: string, c: Record<string, unknown>): string[] {
  const lines: string[] = [];
  lines.push(`### ${name}`);
  lines.push("");

  const meta: string[] = [];
  meta.push(`kind: ${c.kind}`);
  if (c.category) meta.push(`category: ${c.category}`);
  lines.push(`_${meta.join(" · ")}_`);
  lines.push("");

  if (c.description) {
    lines.push(String(c.description));
    lines.push("");
  }

  if (c.template) {
    lines.push("```html");
    lines.push(String(c.template));
    lines.push("```");
    lines.push("");
  }

  const details: string[] = [];
  if (c.aliases) details.push(`Aliases: ${(c.aliases as string[]).join(", ")}`);
  if (c.variants) details.push(`Variants: ${JSON.stringify(c.variants)}`);
  if (c.sizes) details.push(`Sizes: ${(c.sizes as string[]).join(", ")}`);
  if (c.slots) details.push(`Slots: ${(c.slots as string[]).join(", ")}`);
  if (c.states) details.push(`States: ${(c.states as string[]).join(" → ")}`);
  if (c.a11y) details.push(`A11y: ${c.a11y}`);
  if (c.controller) details.push(`Controller: ${c.controller}`);
  if (c.safe_transforms) details.push(`Safe transforms: ${(c.safe_transforms as string[]).join(", ")}`);
  if (c.uses) details.push(`Composes: ${(c.uses as string[]).join(", ")}`);
  for (const d of details) lines.push(`- ${d}`);
  if (details.length > 0) lines.push("");

  return lines;
}

/**
 * Format the full `llms-full.txt` expanded reference: a self-contained document
 * with an anchor for every link emitted by {@link formatContextLlms}. Sections
 * cover the attribute protocol, design tokens, data-driven rendering, every
 * installed component and pattern, and the authoring rules. Fully manifest- and
 * token-derived; contains no timestamp so output is deterministic.
 */
export function formatContextLlmsFull(data: ContextData): string {
  const lines: string[] = [];
  const { primitives, recipes } = partitionComponents(data);

  lines.push("# Faqir UI — Full Reference");
  lines.push("");
  lines.push(`> ${llmsBlurb(data)}`);
  lines.push("");

  // Active theme
  const t = data.theme;
  lines.push("## Active theme");
  lines.push("");
  if ("mood" in t) {
    lines.push(`- Name: ${t.name} v${t.version}`);
    lines.push(`- Mood: ${t.mood.join(", ")}`);
    lines.push(`- Scheme: ${t.scheme} (dark mode: ${t.dark_mode})`);
    lines.push(`- Overrides ${t.tokens_overridden.length} tokens, inherits ${t.tokens_inherited.length} from base`);
    if (t.pairs_with.length > 0) lines.push(`- Pairs with: ${t.pairs_with.join(", ")}`);
  } else {
    lines.push(`- Name: ${t.name} (custom theme — no manifest)`);
  }
  lines.push("");

  // Attribute protocol
  lines.push("## Attribute protocol");
  lines.push("");
  lines.push("| Attribute | Purpose |");
  lines.push("|-----------|---------|");
  lines.push(`| \`${data.protocol.identity}\` | Component identity — what this element IS |`);
  lines.push(`| \`${data.protocol.part}\` | Slot role within a parent component |`);
  lines.push(`| \`${data.protocol.state}\` | Runtime state (changed by JS) |`);
  lines.push(`| \`${data.protocol.variant}\` | Visual variant |`);
  lines.push(`| \`${data.protocol.size}\` | Size variant |`);
  lines.push("");
  lines.push(`CSS targeting: \`${data.protocol.css_target}\` · State: \`${data.protocol.state_css}\` · Theme: \`${data.protocol.theme_attr}\``);
  lines.push("");

  // Design tokens
  lines.push("## Design tokens");
  lines.push("");
  lines.push(`- Prefix: \`${data.tokens.prefix}\``);
  lines.push(`- Spacing: ${data.tokens.spacing}`);
  lines.push(`- Radius: ${Object.entries(data.tokens.radius).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  lines.push(`- Shadows: ${data.tokens.shadows}`);
  lines.push(`- Z-index: ${data.tokens.z_index}`);
  lines.push("");

  // Data-driven rendering
  lines.push("## Data-driven rendering");
  lines.push("");
  lines.push("Include `core/api-source.js` before `core/faqir-core.js` to use `apiSource()`.");
  lines.push("Spread into `l-data` for server-backed CRUD: `l-data=\"{ ...apiSource('/api/items'), newName: '' }\" l-init=\"load()\"`");
  lines.push("Methods: `load()`, `create(payload)`, `update(id, payload)`, `remove(id)`, `startPolling(ms)`, `stopPolling()`");
  lines.push("State: `items` (array), `loading`, `submitting`, `error`");
  lines.push("Options: `apiSource(url, { idKey: 'id', pollInterval: 0, optimistic: true })`");
  lines.push("Note: `apiSource()` is application code — recipe controllers still never call fetch.");
  lines.push("");

  // Primitives
  if (primitives.length > 0) {
    lines.push("## Primitives");
    lines.push("");
    for (const [name, c] of primitives) lines.push(...llmsFullComponentBlock(name, c));
  }

  // Recipes
  if (recipes.length > 0) {
    lines.push("## Recipes");
    lines.push("");
    for (const [name, c] of recipes) lines.push(...llmsFullComponentBlock(name, c));
  }

  // Patterns
  const patternEntries = Object.entries(data.patterns);
  if (patternEntries.length > 0) {
    lines.push("## Patterns");
    lines.push("");
    for (const [name, pat] of patternEntries) {
      lines.push(...llmsFullComponentBlock(name, pat as Record<string, unknown>));
    }
  }

  // Rules
  lines.push("## Rules");
  lines.push("");
  for (const [rule, enabled] of Object.entries(data.rules)) {
    if (enabled) lines.push(`- ${rule.replace(/_/g, " ")}`);
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate and write the `llms.txt` + `llms-full.txt` pair at the project root,
 * following the llmstxt.org convention. Returns the paths and contents written.
 */
export async function writeLlmsFiles(
  cwd: string,
): Promise<{ paths: string[]; contents: Record<string, string> }> {
  const data = await generateContext(cwd);
  const index = formatContextLlms(data);
  const full = formatContextLlmsFull(data);

  const indexPath = join(cwd, "llms.txt");
  const fullPath = join(cwd, "llms-full.txt");
  await Bun.write(indexPath, index);
  await Bun.write(fullPath, full);

  return {
    paths: [indexPath, fullPath],
    contents: { "llms.txt": index, "llms-full.txt": full },
  };
}

/**
 * Write the .faqir/context.json file and optionally the skill file.
 */
export async function writeContextFiles(
  cwd: string,
  format: "json" | "md" | "cursorrules" = "json",
): Promise<{ path: string; content: string }> {
  const data = await generateContext(cwd);
  const faqirDir = join(cwd, ".faqir");
  ensureDir(faqirDir);

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

  const outPath = format === "cursorrules" ? join(cwd, filename) : join(faqirDir, filename);
  await Bun.write(outPath, content);

  return { path: outPath, content };
}
