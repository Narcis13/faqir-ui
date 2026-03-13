// loom variant — add or remove variant values from components

import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig } from "../utils/config";
import { loadManifest } from "../manifest";

function printHelp() {
  log.heading("loom variant <subcommand>");
  log.blank();
  console.log("Add or remove variant values from a component.");
  log.blank();
  console.log("Subcommands:");
  log.table([
    ["add <component> <variant>=<value>", "Add a new variant value"],
    ["remove <component> <variant>=<value>", "Remove a variant value"],
  ]);
  log.blank();
  console.log("Examples:");
  console.log("  loom variant add button visual=accent");
  console.log("  loom variant remove button visual=accent");
}

function parseVariantArg(arg: string): { group: string; value: string } | null {
  const match = arg.match(/^([a-z][a-z0-9-]*)=([a-z][a-z0-9-]*)$/);
  if (!match) return null;
  return { group: match[1], value: match[2] };
}

function findInstalledComponent(
  name: string,
  config: { installed: { primitives: string[]; recipes: string[]; patterns: string[] }; output_dir: string },
  cwd: string
): { layer: string; dir: string } | null {
  for (const layer of ["primitives", "recipes", "patterns"] as const) {
    if (config.installed[layer].includes(name)) {
      return { layer, dir: join(cwd, config.output_dir, layer, name) };
    }
  }
  return null;
}

async function variantAdd(componentName: string, variantStr: string): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No loom.config.json found. Run 'loom init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const parsed = parseVariantArg(variantStr);

  if (!parsed) {
    log.error("Invalid variant format. Use: variant=value (e.g., visual=accent)");
    process.exit(1);
  }

  const { group, value } = parsed;

  // Find installed component
  const found = findInstalledComponent(componentName, config, cwd);
  if (!found) {
    log.error(`Component '${componentName}' is not installed.`);
    log.dim("Run 'loom list' to see installed components.");
    process.exit(1);
  }

  const manifestPath = join(found.dir, `${componentName}.manifest.json`);
  if (!existsSync(manifestPath)) {
    log.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = await loadManifest(manifestPath);

  // Check if variant group exists
  if (!manifest.variants[group]) {
    // Create new variant group
    manifest.variants[group] = {
      values: [value],
      default: value,
      attr: group === "size" ? "data-size" : "data-variant",
      applied_to: "root",
    };
    log.info(`Created new variant group '${group}' with value '${value}'.`);
  } else {
    // Check if value already exists
    if (manifest.variants[group].values.includes(value)) {
      log.warn(`Variant '${group}=${value}' already exists on '${componentName}'.`);
      return;
    }
    manifest.variants[group].values.push(value);
    log.info(`Added '${value}' to variant group '${group}'.`);
  }

  // Write updated manifest
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  // Add CSS stub for the new variant
  const cssPath = join(found.dir, `${componentName}.css`);
  if (existsSync(cssPath)) {
    const css = await Bun.file(cssPath).text();
    const attr = manifest.variants[group].attr;
    const selector = `[data-ui="${componentName}"][${attr}="${value}"]`;

    // Only add if not already present
    if (!css.includes(selector)) {
      const stub = `\n/* ── Variant: ${group}=${value} ── */\n${selector} {\n  /* TODO: Add styles for ${group}=${value} variant */\n}\n`;
      await Bun.write(cssPath, css + stub);
      log.step(`Added CSS stub to ${componentName}.css`);
    }
  }

  log.success(`Variant '${group}=${value}' added to '${componentName}'.`);
  log.dim("Edit the CSS file to style the new variant.");
}

async function variantRemove(componentName: string, variantStr: string): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No loom.config.json found. Run 'loom init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const parsed = parseVariantArg(variantStr);

  if (!parsed) {
    log.error("Invalid variant format. Use: variant=value (e.g., visual=accent)");
    process.exit(1);
  }

  const { group, value } = parsed;

  const found = findInstalledComponent(componentName, config, cwd);
  if (!found) {
    log.error(`Component '${componentName}' is not installed.`);
    process.exit(1);
  }

  const manifestPath = join(found.dir, `${componentName}.manifest.json`);
  if (!existsSync(manifestPath)) {
    log.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = await loadManifest(manifestPath);

  if (!manifest.variants[group]) {
    log.error(`Variant group '${group}' does not exist on '${componentName}'.`);
    process.exit(1);
  }

  const idx = manifest.variants[group].values.indexOf(value);
  if (idx === -1) {
    log.error(`Variant value '${value}' not found in group '${group}'.`);
    log.dim(`Available values: ${manifest.variants[group].values.join(", ")}`);
    process.exit(1);
  }

  // Don't allow removing the default value
  if (manifest.variants[group].default === value) {
    log.error(`Cannot remove '${value}' — it is the default for group '${group}'.`);
    log.dim("Change the default value first, or remove the entire group.");
    process.exit(1);
  }

  // Don't allow removing the last value
  if (manifest.variants[group].values.length === 1) {
    log.error("Cannot remove the last value in a variant group.");
    process.exit(1);
  }

  manifest.variants[group].values.splice(idx, 1);

  // Write updated manifest
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  log.success(`Variant '${group}=${value}' removed from '${componentName}'.`);
  log.dim("Note: CSS rules for this variant were not removed. Clean up manually if needed.");
}

export async function variant(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  const subcommand = args[0];

  switch (subcommand) {
    case "add": {
      const componentName = args[1];
      const variantStr = args[2];
      if (!componentName || !variantStr) {
        log.error("Usage: loom variant add <component> <variant>=<value>");
        process.exit(1);
      }
      await variantAdd(componentName, variantStr);
      break;
    }
    case "remove": {
      const componentName = args[1];
      const variantStr = args[2];
      if (!componentName || !variantStr) {
        log.error("Usage: loom variant remove <component> <variant>=<value>");
        process.exit(1);
      }
      await variantRemove(componentName, variantStr);
      break;
    }
    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      log.dim("Run 'loom variant --help' for available subcommands.");
      process.exit(1);
  }
}
