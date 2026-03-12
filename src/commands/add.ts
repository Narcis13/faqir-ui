import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { copyDir, getRegistryPath, ensureDir } from "../utils/fs";
import { loadManifest, type Manifest } from "../manifest";

type Layer = "primitives" | "recipes" | "patterns";

interface AddOptions {
  all: boolean;
  layer: Layer | null;
  dryRun: boolean;
  noDeps: boolean;
}

function parseArgs(args: string[]): { components: string[]; options: AddOptions } {
  const components: string[] = [];
  const options: AddOptions = {
    all: false,
    layer: null,
    dryRun: false,
    noDeps: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--all":
        options.all = true;
        break;
      case "--layer": {
        const val = args[++i];
        if (val === "primitives" || val === "recipes" || val === "patterns") {
          options.layer = val;
        } else {
          log.error(`Invalid layer: ${val}. Must be: primitives, recipes, patterns`);
          process.exit(1);
        }
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-deps":
        options.noDeps = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (!args[i].startsWith("-")) {
          components.push(args[i]);
        }
    }
  }

  return { components, options };
}

function printHelp() {
  log.heading("loom add <components...>");
  log.blank();
  console.log("Add one or more components to the project.");
  log.blank();
  console.log("Usage:");
  console.log("  loom add button card input");
  console.log("  loom add --all");
  console.log("  loom add --layer primitives");
  log.blank();
  console.log("Options:");
  log.table([
    ["--all", "Add all components"],
    ["--layer <name>", "Add all from a layer (primitives|recipes|patterns)"],
    ["--dry-run", "Show what would be added without writing"],
    ["--no-deps", "Don't auto-install dependencies"],
  ]);
}

function findComponentInRegistry(name: string, registryPath: string): { layer: Layer; path: string } | null {
  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    const compPath = join(registryPath, layer, name);
    if (existsSync(compPath)) {
      return { layer, path: compPath };
    }
  }
  return null;
}

function listRegistryComponents(registryPath: string, layer?: Layer): string[] {
  const layers: Layer[] = layer ? [layer] : ["primitives", "recipes", "patterns"];
  const components: string[] = [];

  for (const l of layers) {
    const layerPath = join(registryPath, l);
    if (!existsSync(layerPath)) continue;

    const glob = new Bun.Glob("*/");
    for (const dir of glob.scanSync({ cwd: layerPath, onlyFiles: false })) {
      // dir comes as "name/" — strip trailing slash
      const name = dir.replace(/\/$/, "");
      // Verify it has a manifest
      if (existsSync(join(layerPath, name, `${name}.manifest.json`))) {
        components.push(name);
      }
    }
  }

  return components;
}

async function getDependencies(manifest: Manifest): Promise<string[]> {
  return manifest.composition?.contains || [];
}

export async function add(args: string[]): Promise<void> {
  const { components, options } = parseArgs(args);
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No loom.config.json found. Run 'loom init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const registryPath = getRegistryPath();
  const outputDir = join(cwd, config.output_dir);

  // Determine which components to add
  let toAdd: string[] = [];

  if (options.all) {
    toAdd = listRegistryComponents(registryPath);
  } else if (options.layer) {
    toAdd = listRegistryComponents(registryPath, options.layer);
  } else {
    if (components.length === 0) {
      log.error("No components specified. Usage: loom add <component...>");
      log.dim("Run 'loom add --help' for options.");
      process.exit(1);
    }
    toAdd = components;
  }

  // Validate all requested components exist in registry
  const resolved: { name: string; layer: Layer; path: string }[] = [];
  for (const name of toAdd) {
    const found = findComponentInRegistry(name, registryPath);
    if (!found) {
      log.error(`Component '${name}' not found in registry.`);
      log.dim("Run 'loom list' to see available components.");
      process.exit(1);
    }
    resolved.push({ name, ...found });
  }

  // Resolve dependencies
  if (!options.noDeps) {
    const allInstalled = new Set([
      ...config.installed.primitives,
      ...config.installed.recipes,
      ...config.installed.patterns,
      ...resolved.map((r) => r.name),
    ]);

    const depsToAdd: { name: string; layer: Layer; path: string }[] = [];

    for (const comp of resolved) {
      const manifestPath = join(comp.path, `${comp.name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      const manifest = await loadManifest(manifestPath);
      const deps = await getDependencies(manifest);

      for (const dep of deps) {
        if (!allInstalled.has(dep)) {
          const found = findComponentInRegistry(dep, registryPath);
          if (found) {
            depsToAdd.push({ name: dep, ...found });
            allInstalled.add(dep);
          }
        }
      }
    }

    if (depsToAdd.length > 0) {
      log.info(`Auto-adding dependencies: ${depsToAdd.map((d) => d.name).join(", ")}`);
      resolved.push(...depsToAdd);
    }
  }

  // Filter out already installed
  const alreadyInstalled = new Set([
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ]);

  const toInstall = resolved.filter((r) => !alreadyInstalled.has(r.name));

  if (toInstall.length === 0) {
    log.info("All requested components are already installed.");
    return;
  }

  // Dry run
  if (options.dryRun) {
    log.heading("Dry run — would add:");
    for (const comp of toInstall) {
      log.step(`${comp.layer}/${comp.name}`);
    }
    return;
  }

  // Install components
  log.heading(`Adding ${toInstall.length} component${toInstall.length > 1 ? "s" : ""}`);

  for (const comp of toInstall) {
    const destDir = join(outputDir, comp.layer, comp.name);
    await copyDir(comp.path, destDir);

    // Update config
    if (!config.installed[comp.layer].includes(comp.name)) {
      config.installed[comp.layer].push(comp.name);
    }

    log.success(`${comp.name} → ${comp.layer}/${comp.name}/`);
  }

  // Sort installed lists for consistency
  config.installed.primitives.sort();
  config.installed.recipes.sort();
  config.installed.patterns.sort();

  await writeConfig(config, cwd);

  // Regenerate auto-init loom.js if any recipes are installed
  if (config.installed.recipes.length > 0 && config.include_core !== false) {
    await regenerateLoomInit(config, outputDir);
  }

  // Regenerate .loom/context.json
  await regenerateContext(config, outputDir, cwd);

  log.blank();
  log.success(`Done! Added ${toInstall.length} component${toInstall.length > 1 ? "s" : ""}.`);
}

// Map recipe names to their controller factory names
function controllerName(recipe: string): string {
  return "create" + recipe.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

async function regenerateLoomInit(
  config: { installed: { recipes: string[] } },
  outputDir: string
): Promise<void> {
  const coreDir = join(outputDir, "core");
  if (!existsSync(coreDir)) return;

  const recipes = config.installed.recipes;
  if (recipes.length === 0) return;

  const imports = recipes
    .map((r) => `import { ${controllerName(r)} } from "../recipes/${r}/${r}.js";`)
    .join("\n");

  const entries = recipes
    .map((r) => `  ${r}: ${controllerName(r)},`)
    .join("\n");

  const content = `// @ui:core loom
// @ui:provides init controllers
// Auto-generated by \`loom add\`. Do not edit manually.

${imports}

const controllers = {
${entries}
};

function init() {
  for (const [name, factory] of Object.entries(controllers)) {
    document.querySelectorAll(\`[data-ui="\${name}"]\`).forEach(factory);
  }
}

// Auto-init on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Re-init on dynamic content (MutationObserver)
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      const ui = node.getAttribute?.("data-ui");
      if (ui && controllers[ui]) controllers[ui](node);
      if (node.querySelectorAll) {
        for (const [name, factory] of Object.entries(controllers)) {
          node.querySelectorAll(\`[data-ui="\${name}"]\`).forEach(factory);
        }
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

export { init, controllers };
`;

  await Bun.write(join(coreDir, "loom.js"), content);
}

async function regenerateContext(
  config: { installed: { primitives: string[]; recipes: string[]; patterns: string[] }; theme: string },
  outputDir: string,
  cwd: string
): Promise<void> {
  const components: Record<string, unknown> = {};

  for (const layer of ["primitives", "recipes", "patterns"] as const) {
    for (const name of config.installed[layer]) {
      const manifestPath = join(outputDir, layer, name, `${name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      const manifest = await loadManifest(manifestPath);

      const entry: Record<string, unknown> = {
        kind: manifest.kind,
      };

      if (manifest.variants) {
        const variants: Record<string, string[]> = {};
        for (const [key, v] of Object.entries(manifest.variants)) {
          variants[key] = v.values;
        }
        entry.variants = variants;
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

      components[name] = entry;
    }
  }

  const context = {
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
    components,
    rules: {
      use_data_state_not_classes: true,
      always_aria_label_on_icon_buttons: true,
      always_aria_labelledby_on_dialog_panel: true,
      semantic_html_over_div_soup: true,
      tokens_only_no_hardcoded_values: true,
    },
  };

  const loomDir = join(cwd, ".loom");
  ensureDir(loomDir);
  await Bun.write(join(loomDir, "context.json"), JSON.stringify(context, null, 2) + "\n");
}
