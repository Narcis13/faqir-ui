// faqir theme — manage themes (set, create, list)

import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { copyFile, ensureDir, getRegistryPath } from "../utils/fs";
import { generateBundle } from "../utils/bundler";

function printHelp() {
  log.heading("faqir theme <subcommand>");
  log.blank();
  console.log("Manage themes for the Faqir project.");
  log.blank();
  console.log("Subcommands:");
  log.table([
    ["set <name>", "Switch the active theme"],
    ["create <name>", "Scaffold a new custom theme"],
    ["list", "Show available and active themes"],
  ]);
  log.blank();
  console.log("Examples:");
  console.log("  faqir theme set midnight");
  console.log("  faqir theme create my-brand");
  console.log("  faqir theme list");
}

function listAvailableThemes(registryPath: string): string[] {
  const themesDir = join(registryPath, "themes");
  if (!existsSync(themesDir)) return [];

  const themes: string[] = [];
  const glob = new Bun.Glob("*.css");
  for (const file of glob.scanSync({ cwd: themesDir })) {
    themes.push(file.replace(/\.css$/, ""));
  }
  return themes.sort();
}

function listProjectThemes(outputDir: string): string[] {
  const tokensDir = join(outputDir, "tokens");
  if (!existsSync(tokensDir)) return [];

  const themes: string[] = [];
  const glob = new Bun.Glob("theme-*.css");
  for (const file of glob.scanSync({ cwd: tokensDir })) {
    themes.push(file.replace(/^theme-/, "").replace(/\.css$/, ""));
  }

  // Also check for the active theme.css
  if (existsSync(join(tokensDir, "theme.css"))) {
    // The active theme is already applied
  }

  return themes.sort();
}

async function themeSet(name: string): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const registryPath = getRegistryPath();
  const outputDir = join(cwd, config.output_dir);

  // Check registry first
  let themePath = join(registryPath, "themes", `${name}.css`);

  if (!existsSync(themePath)) {
    // Check project custom themes
    themePath = join(outputDir, "tokens", `theme-${name}.css`);
    if (!existsSync(themePath)) {
      log.error(`Theme '${name}' not found.`);
      log.dim("Run 'faqir theme list' to see available themes.");
      process.exit(1);
    }
  }

  // Copy theme to output as theme.css
  await copyFile(themePath, join(outputDir, "tokens", "theme.css"));

  // Update config
  config.theme = name;
  await writeConfig(config, cwd);

  // Regenerate bundle if it exists
  const bundlePath = join(outputDir, "faqir.bundle.css");
  if (config.bundle?.auto !== false && existsSync(bundlePath)) {
    await generateBundle(cwd);
    log.step("Bundle regenerated.");
  }

  log.success(`Theme set to '${name}'.`);
  log.dim(`Theme file: ${config.output_dir}/tokens/theme.css`);
}

async function themeCreate(name: string): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const themePath = join(outputDir, "tokens", `theme-${name}.css`);

  if (existsSync(themePath)) {
    log.error(`Theme '${name}' already exists at ${config.output_dir}/tokens/theme-${name}.css`);
    process.exit(1);
  }

  ensureDir(join(outputDir, "tokens"));

  const content = `/* @ui:theme ${name} — Custom theme */
/* Override semantic tokens below. Uncomment and modify values as needed. */

:root {
  /* ── Surfaces ── */
  /* --color-bg:              var(--palette-gray-25); */
  /* --color-bg-subtle:       var(--palette-gray-50); */
  /* --color-bg-muted:        var(--palette-gray-100); */
  /* --color-fg:              var(--palette-gray-950); */
  /* --color-fg-muted:        var(--palette-gray-500); */
  /* --color-fg-subtle:       var(--palette-gray-400); */

  /* ── Interactive: Primary ── */
  /* --color-primary:         var(--palette-indigo-500); */
  /* --color-primary-hover:   var(--palette-indigo-600); */
  /* --color-primary-active:  var(--palette-indigo-700); */
  /* --color-primary-fg:      white; */
  /* --color-primary-subtle:  var(--palette-indigo-50); */

  /* ── Interactive: Secondary ── */
  /* --color-secondary:       var(--palette-gray-100); */
  /* --color-secondary-hover: var(--palette-gray-200); */
  /* --color-secondary-fg:    var(--palette-gray-900); */

  /* ── Interactive: Destructive ── */
  /* --color-destructive:        var(--palette-red-500); */
  /* --color-destructive-hover:  var(--palette-red-600); */
  /* --color-destructive-fg:     white; */
  /* --color-destructive-subtle: var(--palette-red-50); */

  /* ── Feedback ── */
  /* --color-success:         var(--palette-green-500); */
  /* --color-success-subtle:  var(--palette-green-50); */
  /* --color-warning:         var(--palette-amber-500); */
  /* --color-warning-subtle:  var(--palette-amber-50); */
  /* --color-info:            var(--palette-blue-500); */
  /* --color-info-subtle:     var(--palette-blue-50); */

  /* ── Borders ── */
  /* --color-border:          var(--palette-gray-200); */
  /* --color-border-strong:   var(--palette-gray-300); */
  /* --color-ring:            oklch(0.55 0.22 264 / 0.4); */

  /* ── Shadows ── */
  /* --shadow-xs:  0 1px 2px oklch(0 0 0 / 0.04); */
  /* --shadow-sm:  0 1px 3px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04); */
  /* --shadow-md:  0 4px 6px oklch(0 0 0 / 0.05), 0 2px 4px oklch(0 0 0 / 0.04); */
  /* --shadow-lg:  0 10px 15px oklch(0 0 0 / 0.06), 0 4px 6px oklch(0 0 0 / 0.04); */
  /* --shadow-xl:  0 20px 25px oklch(0 0 0 / 0.08), 0 8px 10px oklch(0 0 0 / 0.04); */

  /* ── Radii ── */
  /* --radius-sm:   0.25rem; */
  /* --radius-md:   0.375rem; */
  /* --radius-lg:   0.5rem; */
  /* --radius-xl:   0.75rem; */
  /* --radius-2xl:  1rem; */

  /* ── Component Aliases ── */
  /* --button-radius:     var(--radius-md); */
  /* --card-radius:       var(--radius-lg); */
  /* --card-shadow:       var(--shadow-sm); */
  /* --dialog-radius:     var(--radius-xl); */
  /* --dialog-shadow:     var(--shadow-xl); */
}

/* ── Dark Mode ── */
[data-theme="dark"] {
  /* --color-bg:              var(--palette-gray-950); */
  /* --color-bg-subtle:       var(--palette-gray-900); */
  /* --color-bg-muted:        var(--palette-gray-800); */
  /* --color-fg:              var(--palette-gray-50); */
  /* --color-fg-muted:        var(--palette-gray-400); */
  /* --color-fg-subtle:       var(--palette-gray-500); */

  /* --color-primary:         var(--palette-indigo-400); */
  /* --color-primary-hover:   var(--palette-indigo-300); */

  /* --color-secondary:       var(--palette-gray-800); */
  /* --color-secondary-hover: var(--palette-gray-700); */
  /* --color-secondary-fg:    var(--palette-gray-100); */

  /* --color-border:          var(--palette-gray-800); */
  /* --color-border-strong:   var(--palette-gray-700); */

  /* --shadow-xs:  none; */
  /* --shadow-sm:  0 1px 3px oklch(0 0 0 / 0.3); */
  /* --shadow-md:  0 4px 6px oklch(0 0 0 / 0.3); */
  /* --shadow-lg:  0 10px 15px oklch(0 0 0 / 0.4); */
  /* --shadow-xl:  0 20px 25px oklch(0 0 0 / 0.5); */
}

/* ── Auto Dark Mode (system preference) ── */
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] {
    /* Copy the same overrides from [data-theme="dark"] above */
  }
}
`;

  await Bun.write(themePath, content);

  log.success(`Custom theme '${name}' created!`);
  log.step(`File: ${config.output_dir}/tokens/theme-${name}.css`);
  log.blank();
  log.dim("Edit the file and uncomment tokens to customize.");
  log.dim(`Then run: faqir theme set ${name}`);
}

async function themeList(): Promise<void> {
  const cwd = process.cwd();
  const registryPath = getRegistryPath();

  const registryThemes = listAvailableThemes(registryPath);
  let activeTheme = "default";

  if (configExists(cwd)) {
    const config = await readConfig(cwd);
    activeTheme = config.theme;
    const outputDir = join(cwd, config.output_dir);
    const customThemes = listProjectThemes(outputDir);

    log.heading("Themes");
    log.blank();

    console.log("  Built-in:");
    for (const t of registryThemes) {
      const marker = t === activeTheme ? `  ${"\x1b[32m"}✓ ${t} (active)${"\x1b[0m"}` : `    ${t}`;
      console.log(marker);
    }

    if (customThemes.length > 0) {
      log.blank();
      console.log("  Custom:");
      for (const t of customThemes) {
        const marker = t === activeTheme ? `  ${"\x1b[32m"}✓ ${t} (active)${"\x1b[0m"}` : `    ${t}`;
        console.log(marker);
      }
    }
  } else {
    log.heading("Available Themes");
    log.blank();
    for (const t of registryThemes) {
      console.log(`    ${t}`);
    }
    log.blank();
    log.dim("Run 'faqir init --theme <name>' to use a theme.");
  }

  log.blank();
  log.dim("Run 'faqir theme create <name>' to create a custom theme.");
}

export async function theme(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  const subcommand = args[0];

  switch (subcommand) {
    case "set": {
      const name = args[1];
      if (!name) {
        log.error("Theme name required. Usage: faqir theme set <name>");
        process.exit(1);
      }
      await themeSet(name);
      break;
    }
    case "create": {
      const name = args[1];
      if (!name) {
        log.error("Theme name required. Usage: faqir theme create <name>");
        process.exit(1);
      }
      // Validate name: kebab-case, no spaces
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        log.error("Theme name must be lowercase kebab-case (e.g., 'my-brand').");
        process.exit(1);
      }
      await themeCreate(name);
      break;
    }
    case "list":
      await themeList();
      break;
    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      log.dim("Run 'faqir theme --help' for available subcommands.");
      process.exit(1);
  }
}
