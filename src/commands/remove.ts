import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { findInstalledLayer, getInstalledDependents } from "../utils/components";
import { regenerateFaqirInit, regenerateContext } from "../utils/codegen";
import { generateBundle } from "../utils/bundler";

interface RemoveOptions {
  force: boolean;
  dryRun: boolean;
}

function parseArgs(args: string[]): { components: string[]; options: RemoveOptions } {
  const components: string[] = [];
  const options: RemoveOptions = { force: false, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--force":
        options.force = true;
        break;
      case "--dry-run":
        options.dryRun = true;
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
  log.heading("faqir remove <components...>");
  log.blank();
  console.log("Remove installed components from the project.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir remove dialog toast");
  console.log("  faqir remove button --force");
  log.blank();
  console.log("Options:");
  log.table([
    ["--force", "Remove even if other components depend on it"],
    ["--dry-run", "Show what would be removed without deleting"],
  ]);
}

export async function remove(args: string[]): Promise<void> {
  const { components, options } = parseArgs(args);
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  if (components.length === 0) {
    log.error("No components specified. Usage: faqir remove <component...>");
    log.dim("Run 'faqir remove --help' for options.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);

  // Validate all components are installed
  const toRemove: { name: string; layer: string }[] = [];

  for (const name of components) {
    const layer = findInstalledLayer(name, config);
    if (!layer) {
      log.error(`Component '${name}' is not installed.`);
      process.exit(1);
    }
    toRemove.push({ name, layer });
  }

  // Check dependencies
  if (!options.force) {
    for (const comp of toRemove) {
      const dependents = await getInstalledDependents(comp.name, config, outputDir);
      // Exclude components that are also being removed
      const remainingDependents = dependents.filter(
        (d) => !components.includes(d)
      );

      if (remainingDependents.length > 0) {
        log.error(
          `Cannot remove '${comp.name}' — used by: ${remainingDependents.join(", ")}`
        );
        log.dim("Use --force to remove anyway.");
        process.exit(1);
      }
    }
  }

  // Dry run
  if (options.dryRun) {
    log.heading("Dry run — would remove:");
    for (const comp of toRemove) {
      log.step(`${comp.layer}/${comp.name}/`);
    }
    return;
  }

  // Remove components
  log.heading(`Removing ${toRemove.length} component${toRemove.length > 1 ? "s" : ""}`);

  for (const comp of toRemove) {
    const compDir = join(outputDir, comp.layer, comp.name);

    if (existsSync(compDir)) {
      rmSync(compDir, { recursive: true });
    }

    const layer = comp.layer as keyof typeof config.installed;
    config.installed[layer] = config.installed[layer].filter((c) => c !== comp.name);

    log.success(`Removed ${comp.layer}/${comp.name}/`);
  }

  await writeConfig(config, cwd);

  // Regenerate faqir.js
  if (config.include_core !== false) {
    await regenerateFaqirInit(config, outputDir);
  }

  // Regenerate context
  await regenerateContext(config, outputDir, cwd);

  // Regenerate bundle if it exists
  const bundlePath = join(outputDir, "faqir.bundle.css");
  if (config.bundle?.auto !== false && existsSync(bundlePath)) {
    await generateBundle(cwd);
    log.step("Bundle regenerated.");
  }

  log.blank();
  log.success(`Done! Removed ${toRemove.length} component${toRemove.length > 1 ? "s" : ""}.`);
}
