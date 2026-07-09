import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { copyDir, getRegistryPath } from "../utils/fs";
import { loadManifest, type Manifest } from "../manifest";
import { findComponentInRegistry, listRegistryComponents, type Layer } from "../utils/components";
import { regenerateFaqirInit, regenerateContext } from "../utils/codegen";
import { generateBundle } from "../utils/bundler";

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
  log.heading("faqir add <components...>");
  log.blank();
  console.log("Add one or more components to the project.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir add button card input");
  console.log("  faqir add --all");
  console.log("  faqir add --layer primitives");
  log.blank();
  console.log("Options:");
  log.table([
    ["--all", "Add all components"],
    ["--layer <name>", "Add all from a layer (primitives|recipes|patterns)"],
    ["--dry-run", "Show what would be added without writing"],
    ["--no-deps", "Don't auto-install dependencies"],
  ]);
}

async function getDependencies(manifest: Manifest): Promise<string[]> {
  return manifest.composition?.contains || [];
}

export async function add(args: string[]): Promise<void> {
  const { components, options } = parseArgs(args);
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
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
      log.error("No components specified. Usage: faqir add <component...>");
      log.dim("Run 'faqir add --help' for options.");
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
      log.dim("Run 'faqir list' to see available components.");
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

  // Regenerate auto-init faqir.js if any recipes are installed
  if (config.installed.recipes.length > 0 && config.include_core !== false) {
    await regenerateFaqirInit(config, outputDir);
  }

  // Regenerate .faqir/context.json
  await regenerateContext(config, outputDir, cwd);

  // Auto-bundle if bundle file exists
  const bundlePath = join(outputDir, "faqir.bundle.css");
  if (config.bundle?.auto !== false && existsSync(bundlePath)) {
    await generateBundle(cwd);
    log.step("Bundle regenerated.");
  }

  log.blank();
  log.success(`Done! Added ${toInstall.length} component${toInstall.length > 1 ? "s" : ""}.`);
}
