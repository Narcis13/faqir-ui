// Full-registry context — the agent surfaces the documentation site hosts.
// Task 0.7-15 (FAQIR-PLAN §13, §8.2).
//
// `faqir context --format llms` (task 0.5-06) describes the components a
// *project* installed. The documentation site has to describe the whole
// registry instead: an agent that lands on `https://…/llms.txt` has no project
// yet, and the question it is asking is "what does this framework have?".
//
// The difference is the input set and nothing else. Both paths build the same
// `ContextData` through `composeContextData` and render it with the same
// `formatContextLlms` / `formatContextLlmsFull` formatters, so the hosted files
// cannot drift into a second dialect of the same document — they are the same
// generator, pointed at a registry instead of at a `ui/` directory.
//
// `node:fs` only, no Bun APIs: this runs inside the docs generator, which is
// also imported by the Playwright (Node) runner.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "../manifest";
import type { ThemeManifest } from "../theme-manifest";
import { composeContextData, type ContextData, type ContextTheme } from "./context";
import { loadPluginMetadata } from "./plugins";

/** The subset of a registry component this module needs. */
export interface RegistryComponent {
  name: string;
  layer: "primitives" | "recipes" | "patterns";
  manifest: Manifest;
}

export interface RegistryContextOptions {
  /** Registry root — supplies the theme manifest and the official plugins. */
  registryRoot: string;
  /** Every documentable component, in registry order (layer, then name). */
  components: RegistryComponent[];
  /** Active theme name, as the hosted documents should describe it. */
  theme: string;
}

/**
 * Build {@link ContextData} for a whole registry.
 *
 * `meta.generated_at` is deliberately the empty string: everything the site
 * emits has to be byte-identical across rebuilds (that is what makes
 * `build:docs --check` a drift gate), and neither llms.txt nor llms-full.txt
 * renders the field. A timestamp here would buy nothing and break that.
 */
export function buildRegistryContext(options: RegistryContextOptions): ContextData {
  const { registryRoot, components, theme } = options;

  const themeManifestPath = join(registryRoot, "themes", `${theme}.theme.json`);
  const themeContext: ContextTheme = existsSync(themeManifestPath)
    ? (JSON.parse(readFileSync(themeManifestPath, "utf8")) as ThemeManifest)
    : { name: theme, manifest_found: false };

  const count = (layer: RegistryComponent["layer"]) =>
    components.filter((c) => c.layer === layer).length;

  return composeContextData({
    entries: components.map((c) => [c.name, c.manifest] as [string, Manifest]),
    theme: themeContext,
    themeName: theme,
    pluginMetadata: loadPluginMetadata(join(registryRoot, "core", "plugins")),
    componentCount: {
      primitives: count("primitives"),
      recipes: count("recipes"),
      patterns: count("patterns"),
    },
    generatedAt: "",
    scope: "registry",
  });
}
