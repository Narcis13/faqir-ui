import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig } from "../utils/config";
import { getRegistryPath } from "../utils/fs";

type Layer = "primitives" | "recipes" | "patterns";

function listRegistryComponents(registryPath: string): Record<Layer, string[]> {
  const result: Record<Layer, string[]> = {
    primitives: [],
    recipes: [],
    patterns: [],
  };

  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    const layerPath = join(registryPath, layer);
    if (!existsSync(layerPath)) continue;

    const glob = new Bun.Glob("*/");
    for (const dir of glob.scanSync({ cwd: layerPath, onlyFiles: false })) {
      const name = dir.replace(/\/$/, "");
      if (existsSync(join(layerPath, name, `${name}.manifest.json`))) {
        result[layer].push(name);
      }
    }
    result[layer].sort();
  }

  return result;
}

function formatRow(names: string[], installed: Set<string>, cols: number = 4): string[] {
  const lines: string[] = [];
  for (let i = 0; i < names.length; i += cols) {
    const chunk = names.slice(i, i + cols);
    const formatted = chunk.map((name) => {
      const mark = installed.has(name) ? "\x1b[32m✓\x1b[0m" : "\x1b[2m·\x1b[0m";
      return `${mark} ${name.padEnd(16)}`;
    });
    lines.push("  " + formatted.join(""));
  }
  return lines;
}

export async function list(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    log.heading("faqir list");
    log.blank();
    console.log("Show installed and available components.");
    return;
  }

  const cwd = process.cwd();
  const registryPath = getRegistryPath();
  const available = listRegistryComponents(registryPath);

  let installed = new Set<string>();
  let hasConfig = false;

  if (configExists(cwd)) {
    const config = await readConfig(cwd);
    installed = new Set([
      ...config.installed.primitives,
      ...config.installed.recipes,
      ...config.installed.patterns,
    ]);
    hasConfig = true;
  }

  const totalAvailable =
    available.primitives.length + available.recipes.length + available.patterns.length;
  const totalInstalled = installed.size;

  log.heading(`Faqir Components (${totalInstalled} installed / ${totalAvailable} available)`);
  log.blank();

  // Primitives
  if (available.primitives.length > 0) {
    const installedCount = available.primitives.filter((n) => installed.has(n)).length;
    console.log(`  \x1b[1mPRIMITIVES\x1b[0m (${installedCount}/${available.primitives.length})`);
    for (const line of formatRow(available.primitives, installed)) {
      console.log(line);
    }
    log.blank();
  }

  // Recipes
  if (available.recipes.length > 0) {
    const installedCount = available.recipes.filter((n) => installed.has(n)).length;
    console.log(`  \x1b[1mRECIPES\x1b[0m (${installedCount}/${available.recipes.length})`);
    for (const line of formatRow(available.recipes, installed)) {
      console.log(line);
    }
    log.blank();
  }

  // Patterns
  if (available.patterns.length > 0) {
    const installedCount = available.patterns.filter((n) => installed.has(n)).length;
    console.log(`  \x1b[1mPATTERNS\x1b[0m (${installedCount}/${available.patterns.length})`);
    for (const line of formatRow(available.patterns, installed)) {
      console.log(line);
    }
    log.blank();
  }

  if (!hasConfig) {
    log.dim("No faqir.config.json found. Run 'faqir init' to start a project.");
  } else if (totalInstalled === 0) {
    log.dim("No components installed yet. Run 'faqir add <name>' to add components.");
  }
}
