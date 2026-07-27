// Context generator — aggregates installed manifests into optimized AI context files

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, type Manifest } from "../manifest";
import { BREAKPOINT_LIST, PROTOCOL_ATTRIBUTES, TIERS } from "../utils/breakpoints";
import {
  ARCHETYPES,
  LAYOUT_MECHANISMS,
  LAYOUT_PRIMITIVES,
  LAYOUT_RULES,
  MEASURE_TOKENS,
  RESPONSIVE_GRAMMAR,
  RHYTHM_TOKENS,
} from "../utils/layout";
import { loadThemeManifest, type ThemeManifest } from "../theme-manifest";
import { readConfig, type FaqirConfig } from "../utils/config";
import { ensureDir, getRegistryPath } from "../utils/fs";
import { loadPluginMetadata, type PluginMetadata } from "./plugins";

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
    /**
     * What the component set describes: the components a project installed
     * (the default), or a whole registry — which is what the documentation
     * site hosts (task 0.7-15). The only thing it changes is the summary
     * sentence: "this project installs …" is false on a hosted llms.txt.
     */
    scope?: "project" | "registry";
    component_count: {
      primitives: number;
      recipes: number;
      patterns: number;
    };
    plugin_count: number;
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
  /**
   * Density mode — a pure-CSS token modifier, NOT a sixth protocol attribute.
   * Embedded so agents discover it without reading the stylesheet.
   */
  density: {
    attribute: string;
    values: string[];
    default: string;
    scope: string;
    remaps: string[];
    stylesheet: string;
    example: string;
    notes: string[];
  };
  /**
   * The breakpoint canon and the responsive attribute grammar (task 0.8-12).
   * Embedded for the same reason density is: an agent that knows every variant
   * but has to *guess* a breakpoint writes markup that is right on a laptop and
   * broken on a phone. Derived from `src/utils/breakpoints.ts` — the numbers are
   * never retyped here.
   */
  responsive: {
    grammar: string;
    reads_as: string;
    tiers: { tier: string; min_width: string; px: number }[];
    rules: string[];
    excluded_attributes: string[];
    example: string;
    note: string;
  };
  /**
   * The layout doctrine (task 0.8-12): the three mechanisms in order, the five
   * primitives that express them, the measure and rhythm ladders, and the page
   * archetypes. Derived from `src/utils/layout.ts`; the per-component attribute
   * lists stay where they belong — in `components`.
   */
  layout: {
    doctrine: { step: number; mechanism: string; title: string; summary: string }[];
    primitives: { name: string; mechanism: string; use: string }[];
    measure: Record<string, string>;
    rhythm: Record<string, string>;
    archetypes: string[];
    reference: string;
  };
  /**
   * The in-page inspection surface (task 0.7-12). Embedded so an agent driving
   * a browser knows what to read without loading the engine source.
   */
  devtools: {
    global: string;
    version: number;
    inspect: string;
    keys: Record<string, string>;
    snapshot_keys: Record<string, string>;
    dev_build: string;
    overlay: string;
    notes: string[];
  };
  components: Record<string, unknown>;
  patterns: Record<string, unknown>;
  plugins: Record<string, {
    file: string;
    provides: string[];
    description?: string;
  }>;
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
export function buildComponentEntry(manifest: Manifest): Record<string, unknown> {
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

  // Declared responsiveness (task 0.8-02): attr → the tiers its values may be
  // suffixed with. Derived from `"responsive": true`, so a component that never
  // declares it carries no key at all and no component is named here.
  const responsive: Record<string, string[]> = {};
  for (const v of Object.values(manifest.variants ?? {})) {
    if (v.responsive === true) responsive[v.attr] = [...TIERS];
  }
  if (Object.keys(responsive).length > 0) {
    entry.responsive = responsive;
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
 * Everything {@link composeContextData} needs that depends on *where* the
 * components came from. A project reads them out of its `ui/` directory; the
 * documentation site reads them straight out of the registry (task 0.7-15), and
 * both then produce identical prose through the same formatters — the llms.txt
 * pair a site serves is the same generator a project runs, not a second one.
 */
export interface ContextComposition {
  /**
   * `[name, manifest]` pairs in the order they should appear. Deliberately an
   * iterable of pairs rather than a `Map`: a name can exist in two layers
   * (`empty-state` is both a primitive and a pattern) and both must survive —
   * they land in different records, since the split is by `kind`.
   */
  entries: Iterable<[string, Manifest]>;
  theme: ContextTheme;
  themeName: string;
  pluginMetadata: PluginMetadata[];
  /** Where the plugin files live, relative to whatever loads them. */
  pluginDir?: string;
  componentCount: ContextData["meta"]["component_count"];
  /** ISO timestamp for `meta.generated_at`. */
  generatedAt: string;
  /** What the component set is — see {@link ContextData.meta.scope}. */
  scope?: "project" | "registry";
}

/**
 * Assemble {@link ContextData} from already-loaded manifests. Pure — no file
 * system, no configuration — so the one description of the framework (protocol,
 * tokens, density, devtools, rules) has exactly one source.
 */
export function composeContextData(input: ContextComposition): ContextData {
  const components: Record<string, unknown> = {};
  const patterns: Record<string, unknown> = {};
  const plugins: ContextData["plugins"] = {};

  for (const [name, manifest] of input.entries) {
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

  for (const plugin of input.pluginMetadata) {
    plugins[plugin.name] = {
      file: `${input.pluginDir ?? "core/plugins"}/${plugin.file}`,
      provides: plugin.provides,
      ...(plugin.description ? { description: plugin.description } : {}),
    };
  }

  return {
    meta: {
      framework: "faqir",
      version: "1.0.0",
      theme: input.themeName,
      generated_at: input.generatedAt,
      ...(input.scope ? { scope: input.scope } : {}),
      component_count: input.componentCount,
      plugin_count: input.pluginMetadata.length,
    },
    theme: input.theme,
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
    density: {
      attribute: "data-density",
      values: ["comfortable", "compact"],
      default: "comfortable",
      scope: "subtree — the element it is set on and every descendant, until an inner data-density resets it",
      remaps: [
        "--space-1 … --space-24 (× --density-scale; --space-0 and --space-px are invariant)",
        "--control-height-sm|md|lg (explicit shorter ramp: 28/32/40px compact vs 32/40/48px comfortable)",
        "the component aliases that read them: --button-height-*, --input-height, --card-padding, --field-gap, --callout-padding-*, --kv-*-gap",
      ],
      stylesheet: "tokens/density.css",
      example: '<section data-density="compact"> … dense form / table / toolbar … </section>',
      notes: [
        "Pure CSS — no JavaScript reads or writes data-density, and no component contract, manifest or audit rule knows about it.",
        "It is not part of the five-attribute protocol (data-ui/data-part/data-state/data-variant/data-size); it only re-declares tokens.",
        "Components need no changes to support it: keep authoring against var(--space-*) and var(--control-height-*).",
        "Paged-media tokens (--doc-*, --page-*) are deliberately not remapped — print density belongs to the theme.",
      ],
    },
    responsive: {
      grammar: RESPONSIVE_GRAMMAR,
      reads_as: "this value, from that tier up",
      tiers: BREAKPOINT_LIST.map((b) => ({
        tier: b.tier,
        min_width: `${b.rem}rem`,
        px: b.px,
      })),
      rules: [...LAYOUT_RULES],
      excluded_attributes: [...PROTOCOL_ATTRIBUTES],
      example:
        '<div data-ui="grid" data-cols="1" data-cols-md="2" data-cols-lg="4" data-gap="4"> … </div>',
      note:
        "Only a variant group a manifest declares `\"responsive\": true` takes a suffix — every component's set is in `components.<name>.responsive`. `faqir audit` reports an unknown tier and an out-of-set value separately.",
    },
    layout: {
      doctrine: LAYOUT_MECHANISMS.map((m) => ({
        step: m.step,
        mechanism: m.key,
        title: m.title,
        summary: m.summary,
      })),
      primitives: LAYOUT_PRIMITIVES.map((p) => ({
        name: p.name,
        mechanism: p.mechanism,
        use: p.use,
      })),
      measure: Object.fromEntries(MEASURE_TOKENS.map((m) => [`--${m.token}`, m.role])),
      rhythm: Object.fromEntries(RHYTHM_TOKENS.map((r) => [`--${r.token}`, r.role])),
      archetypes: ARCHETYPES.map((a) => a.title),
      reference: "docs/layout.md",
    },
    devtools: {
      global: "window.__FAQIR_DEVTOOLS__",
      version: 1,
      inspect: "Faqir.inspect(elementOrSelector)",
      keys: {
        version: "number — handle schema version, bumped only on a breaking shape change",
        dev: "boolean — true when the page loaded core/faqir-core.dev.js",
        faqir: "object — the Faqir global itself",
        "inspect(el|selector)":
          "object|null — full snapshot for one element (see snapshot_keys)",
        "scopes(within?)":
          "array — declared scope roots: { el, id, label, scope } in document order",
        "components(within?)":
          "array — mounted components: { el, label, ui, variant, size, state, parts[], controller }",
        "stores()": "object — snapshot of every Faqir.store() on the page",
        "warnings()":
          "array — recorded diagnostics, oldest first; always empty in the production engine",
      },
      snapshot_keys: {
        el: "Element — the element inspected",
        scopeRoot: "Element|null — nearest ancestor-or-self owning a scope",
        scopeId: "number|null — that scope's id",
        scope: "object|null — plain deep copy of the scope's data (magics excluded)",
        directives: "array — { type, arg, expression, modifiers[], raw } per l-*/:/@ attribute",
        controller: "object|null — { ui, el, api, methods[] } of the owning [data-ui]",
        state: "object — { ui, part, variant, size, state } protocol attributes",
      },
      dev_build: "core/faqir-core.dev.js",
      overlay: "injected by `faqir dev`; toggle with Ctrl/Cmd+Shift+F",
      notes: [
        "Both engine builds install the handle, so the keys are readable on any Faqir page.",
        "Snapshots are copies: mutating them does not touch the live scope, and reading them registers no reactive dependency.",
        "The development engine (core/faqir-core.dev.js) adds four diagnostic classes — expression, directive, reorder, html — readable via warnings(). The production engine records none.",
        "The `faqir dev` overlay is served by the dev server only; it is never written into a project.",
      ],
    },
    components,
    patterns,
    plugins,
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
 * Generate the full context data structure for an installed project.
 */
export async function generateContext(cwd: string): Promise<ContextData> {
  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const manifests = await loadInstalledManifests(config, outputDir);

  return composeContextData({
    entries: manifests,
    theme: await loadActiveTheme(config),
    themeName: config.theme,
    pluginMetadata: loadPluginMetadata(join(outputDir, "core", "plugins")),
    // Counted from the config, not from the loaded manifests: the config is what
    // the project declares it installed, and a manifest that failed to load is a
    // problem to see rather than to silently subtract.
    componentCount: {
      primitives: config.installed.primitives.length,
      recipes: config.installed.recipes.length,
      patterns: config.installed.patterns.length,
    },
    generatedAt: new Date().toISOString(),
  });
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

  // Layout & responsiveness
  lines.push("## Layout System");
  lines.push("");
  lines.push("Reach for the first mechanism that solves the problem:");
  for (const d of data.layout.doctrine) lines.push(`${d.step}. **${d.title}.** ${d.summary}`);
  lines.push("");
  lines.push("| Primitive | Mechanism | Reach for it when |");
  lines.push("|-----------|-----------|-------------------|");
  for (const p of data.layout.primitives) {
    lines.push(`| \`${p.name}\` | ${p.mechanism} | ${p.use} |`);
  }
  lines.push("");
  lines.push(`Measure (centred column widths): ${Object.entries(data.layout.measure).map(([t, role]) => `\`${t}\` — ${role}`).join("; ")}.`);
  lines.push(`Rhythm (page air): ${Object.entries(data.layout.rhythm).map(([t, role]) => `\`${t}\` — ${role}`).join("; ")}.`);
  lines.push(`Page archetypes with copy-ready markup: ${data.layout.archetypes.join(", ")} — see \`${data.layout.reference}\`.`);
  lines.push("");

  lines.push("## Responsive Tiers");
  lines.push("");
  lines.push(`\`${data.responsive.grammar}\` — "${data.responsive.reads_as}".`);
  lines.push("");
  lines.push("| Tier | Min-width | px |");
  lines.push("|------|-----------|----|");
  for (const t of data.responsive.tiers) lines.push(`| \`${t.tier}\` | \`${t.min_width}\` | ${t.px} |`);
  lines.push("");
  lines.push("```html");
  lines.push(data.responsive.example);
  lines.push("```");
  lines.push("");
  for (const r of data.responsive.rules) lines.push(`- ${r}`);
  lines.push(`- Never suffixed: ${data.responsive.excluded_attributes.map((a) => `\`${a}\``).join(", ")}.`);
  lines.push(`- ${data.responsive.note}`);
  lines.push("");

  // Density
  lines.push("## Density Mode");
  lines.push("");
  lines.push(`\`${data.density.attribute}="${data.density.values.filter((v) => v !== data.density.default).join("|")}"\` on any container tightens its subtree. Default: \`${data.density.default}\`.`);
  lines.push("");
  lines.push("```html");
  lines.push(data.density.example);
  lines.push("```");
  lines.push("");
  lines.push(`Scope: ${data.density.scope}. Defined in \`${data.density.stylesheet}\`.`);
  lines.push("Remaps:");
  for (const r of data.density.remaps) lines.push(`- ${r}`);
  for (const n of data.density.notes) lines.push(`- ${n}`);
  lines.push("");

  // Devtools
  lines.push("## Inspecting a Live Page");
  lines.push("");
  lines.push(`\`${data.devtools.inspect}\` returns what Faqir knows about one element. The same functions hang off \`${data.devtools.global}\` (v${data.devtools.version}) on every Faqir page.`);
  lines.push("");
  for (const [key, meaning] of Object.entries(data.devtools.keys)) {
    lines.push(`- \`${data.devtools.global}.${key}\` — ${meaning}`);
  }
  lines.push("");
  lines.push("`inspect()` returns:");
  for (const [key, meaning] of Object.entries(data.devtools.snapshot_keys)) {
    lines.push(`- \`${key}\` — ${meaning}`);
  }
  lines.push("");
  for (const n of data.devtools.notes) lines.push(`- ${n}`);
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

  if (Object.keys(data.plugins).length > 0) {
    lines.push("## Official Plugins");
    lines.push("");
    lines.push("Load individual files after `core/faqir-core.js`, or run `faqir bundle --js`.");
    lines.push("");
    for (const [name, plugin] of Object.entries(data.plugins)) {
      const summary = plugin.description ? ` — ${plugin.description}` : "";
      lines.push(`- **${name}** (${plugin.provides.join(", ")}): \`${plugin.file}\`${summary}`);
    }
    lines.push("");
  }

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
    if (c.responsive) details.push(`Responsive: ${formatResponsive(c.responsive as Record<string, string[]>)}`);
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

  lines.push("## Layout");
  lines.push("");
  for (const p of data.layout.primitives) lines.push(`- \`${p.name}\` (${p.mechanism}): ${p.use}`);
  lines.push(`- Responsive values are suffixed attributes — \`${data.responsive.grammar}\`, tiers ${data.responsive.tiers.map((t) => `${t.tier} ${t.min_width}`).join(", ")}`);
  for (const r of data.responsive.rules) lines.push(`- ${r}`);
  lines.push(`- Page archetypes (dashboard, landing, document, split view, form): \`${data.layout.reference}\``);
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

  if (Object.keys(data.plugins).length > 0) {
    lines.push("## Official Plugins");
    lines.push("");
    lines.push("- Load a plugin after `core/faqir-core.js`, or use `faqir bundle --js`");
    for (const [name, plugin] of Object.entries(data.plugins)) {
      lines.push(`- ${name}: ${plugin.provides.join(", ")} (${plugin.file})`);
    }
    lines.push("");
  }

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
  const counted =
    `${c.primitives} primitive${c.primitives === 1 ? "" : "s"}, ` +
    `${c.recipes} recipe${c.recipes === 1 ? "" : "s"}, and ` +
    `${c.patterns} pattern${c.patterns === 1 ? "" : "s"}`;
  // A hosted, registry-wide file has no project to speak of — see `meta.scope`.
  const subject =
    data.meta.scope === "registry"
      ? `The registry ships ${counted}, documented against the ${themeDesc} theme. `
      : `This project installs ${counted} on the ${themeDesc} theme. `;
  return (
    `Zero-class, manifest-driven UI framework. ${subject}` +
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
  // Layout is stated here, not only linked: an agent that reads the index and
  // stops must still know the ladder and the grammar, because guessing a
  // breakpoint is the one thing the component list cannot teach it.
  lines.push(
    `Layout is ${data.layout.primitives.length} primitives — ` +
      `${data.layout.primitives.map((p) => `\`${p.name}\``).join(", ")} — and one breakpoint ladder: ` +
      `${data.responsive.tiers.map((t) => `${t.tier} ${t.min_width}`).join(", ")}. ` +
      `A responsive value is a suffixed attribute, \`${data.responsive.grammar}\` ("${data.responsive.reads_as}"), ` +
      `mobile-first and min-width only; the five protocol attributes never take one. ` +
      `Page archetypes: ${data.layout.archetypes.join(", ")}.`,
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

  if (Object.keys(data.plugins).length > 0) {
    lines.push("## Plugins");
    lines.push("");
    lines.push("- [Official plugins](llms-full.txt#official-plugins): directives and magics loadable separately or through `faqir bundle --js`");
    lines.push("");
  }

  lines.push("## Optional");
  lines.push("");
  lines.push("- [Attribute protocol](llms-full.txt#attribute-protocol): the data-ui / data-part / data-state contract");
  lines.push("- [Design tokens](llms-full.txt#design-tokens): spacing, radius, shadow, and z-index scales");
  lines.push("- [Layout system](llms-full.txt#layout-system): the doctrine, the five layout primitives, measure and rhythm tokens");
  lines.push("- [Responsive tiers](llms-full.txt#responsive-tiers): the breakpoint canon and the data-<attr>-<tier> grammar");
  lines.push("- [Density mode](llms-full.txt#density-mode): data-density, a pure-CSS token modifier for dense subtrees");
  lines.push("- [Inspecting a live page](llms-full.txt#inspecting-a-live-page): window.__FAQIR_DEVTOOLS__ and Faqir.inspect()");
  lines.push("- [Data-driven rendering](llms-full.txt#data-driven-rendering): apiSource() for server-backed CRUD");
  lines.push("- [Rules](llms-full.txt#rules): authoring constraints agents must follow");
  lines.push("");

  return lines.join("\n");
}

/**
 * Render a component's declared responsiveness for the llms surfaces:
 * `data-cols-{sm|md|lg|xl} (value applies from that tier up)`. One formatter,
 * both files — the grammar is stated per component, never as global prose.
 */
function formatResponsive(responsive: Record<string, string[]>): string {
  const grammar = Object.entries(responsive)
    .map(([attr, tiers]) => `${attr}-{${tiers.join("|")}}`)
    .join(", ");
  return `${grammar} (value applies from that tier up; mobile-first)`;
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
  if (c.responsive) details.push(`Responsive: ${formatResponsive(c.responsive as Record<string, string[]>)}`);
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

  // Layout system
  lines.push("## Layout system");
  lines.push("");
  lines.push("Reach for the first mechanism that solves the problem:");
  lines.push("");
  for (const d of data.layout.doctrine) lines.push(`${d.step}. **${d.title}.** ${d.summary}`);
  lines.push("");
  lines.push("| Primitive | Mechanism | Reach for it when |");
  lines.push("|-----------|-----------|-------------------|");
  for (const p of data.layout.primitives) {
    lines.push(`| \`${p.name}\` | ${p.mechanism} | ${p.use} |`);
  }
  lines.push("");
  lines.push("Measure — the width of a centred column, `container`'s `data-measure`:");
  for (const [token, role] of Object.entries(data.layout.measure)) lines.push(`- \`${token}\` — ${role}`);
  lines.push("");
  lines.push("Rhythm — the air between page sections:");
  for (const [token, role] of Object.entries(data.layout.rhythm)) lines.push(`- \`${token}\` — ${role}`);
  lines.push("");
  lines.push(`Page archetypes with copy-ready markup — ${data.layout.archetypes.join(", ")} — are documented in \`${data.layout.reference}\`.`);
  lines.push("");

  // Responsive tiers
  lines.push("## Responsive tiers");
  lines.push("");
  lines.push(`\`${data.responsive.grammar}\` — "${data.responsive.reads_as}".`);
  lines.push("");
  lines.push("| Tier | Min-width | px |");
  lines.push("|------|-----------|----|");
  for (const t of data.responsive.tiers) lines.push(`| \`${t.tier}\` | \`${t.min_width}\` | ${t.px} |`);
  lines.push("");
  lines.push("```html");
  lines.push(data.responsive.example);
  lines.push("```");
  lines.push("");
  for (const r of data.responsive.rules) lines.push(`- ${r}`);
  lines.push(`- Never suffixed: ${data.responsive.excluded_attributes.map((a) => `\`${a}\``).join(", ")}.`);
  lines.push(`- ${data.responsive.note}`);
  lines.push("");

  // Density mode
  lines.push("## Density mode");
  lines.push("");
  lines.push(`\`${data.density.attribute}\` — values: ${data.density.values.map((v) => `\`${v}\``).join(", ")} (default \`${data.density.default}\`), defined in \`${data.density.stylesheet}\`.`);
  lines.push(`Scope: ${data.density.scope}.`);
  lines.push("");
  lines.push("```html");
  lines.push(data.density.example);
  lines.push("```");
  lines.push("");
  lines.push("Remaps:");
  for (const r of data.density.remaps) lines.push(`- ${r}`);
  lines.push("");
  for (const n of data.density.notes) lines.push(`- ${n}`);
  lines.push("");

  // Devtools
  lines.push("## Inspecting a live page");
  lines.push("");
  lines.push(`\`${data.devtools.global}\` (v${data.devtools.version}) is installed by both engine builds. \`${data.devtools.inspect}\` is the same function.`);
  lines.push("");
  lines.push("| Key | Returns |");
  lines.push("|-----|---------|");
  for (const [key, meaning] of Object.entries(data.devtools.keys)) {
    lines.push(`| \`${key}\` | ${meaning} |`);
  }
  lines.push("");
  lines.push("`inspect(el)` snapshot:");
  lines.push("");
  lines.push("| Key | Value |");
  lines.push("|-----|-------|");
  for (const [key, meaning] of Object.entries(data.devtools.snapshot_keys)) {
    lines.push(`| \`${key}\` | ${meaning} |`);
  }
  lines.push("");
  lines.push(`Development engine: \`${data.devtools.dev_build}\` · Overlay: ${data.devtools.overlay}`);
  lines.push("");
  for (const n of data.devtools.notes) lines.push(`- ${n}`);
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

  if (Object.keys(data.plugins).length > 0) {
    lines.push("## Official plugins");
    lines.push("");
    lines.push("Load individual files after `core/faqir-core.js`, or run `faqir bundle --js`.");
    lines.push("");
    for (const [name, plugin] of Object.entries(data.plugins)) {
      const summary = plugin.description ? ` — ${plugin.description}` : "";
      lines.push(`- **${name}** (${plugin.provides.join(", ")}): \`${plugin.file}\`${summary}`);
    }
    lines.push("");
  }

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
