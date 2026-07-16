// faqir theme — manage themes (set, create, generate, list)

import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { copyFile, ensureDir, getRegistryPath } from "../utils/fs";
import { generateBundle } from "../utils/bundler";
import { emitJSON, isJSONMode } from "../utils/json-output";
import { listRegistryThemes } from "../theme-manifest";
import {
  generateThemeBundle,
  type ThemeGenerateInput,
  type ThemeNeutral,
  type ThemeRadius,
} from "./theme-generate";

export const THEME_GENERATE_JSON_VERSION = 1;

function printHelp() {
  log.heading("faqir theme <subcommand>");
  log.blank();
  console.log("Manage themes for the Faqir project.");
  log.blank();
  console.log("Subcommands:");
  log.table([
    ["set <name>", "Switch the active theme"],
    ["create <name>", "Scaffold a new custom theme"],
    ["generate <name>", "Generate a complete theme from one brand color"],
    ["list", "Show available and active themes"],
  ]);
  log.blank();
  console.log("Examples:");
  console.log("  faqir theme set midnight");
  console.log("  faqir theme create my-brand");
  console.log('  faqir theme generate my-brand --accent "oklch(0.55 0.2 150)"');
  console.log("  faqir theme list");
}

function printGenerateHelp() {
  log.heading("faqir theme generate <name>");
  log.blank();
  console.log("Generate a complete, contrast-verified theme from one brand color.");
  log.blank();
  console.log("Usage:");
  console.log('  faqir theme generate my-brand --accent "oklch(0.55 0.2 150)" [options]');
  log.blank();
  console.log("Options:");
  log.table([
    ["--accent <color>", "Opaque oklch(), #rgb, or #rrggbb brand color (required)"],
    ["--neutral <tone>", "Neutral palette: cool, warm, or gray (default: cool)"],
    ["--radius <size>", "Radius scale: sm, md, or lg (default: md)"],
    ["--scheme <mode>", "Color scheme: light, dark, or both (default: both)"],
    ["--document", "Also emit a brand-matched print/document variant"],
    ["--json", "Report generated files and all computed contrast ratios"],
  ]);
  log.blank();
  log.dim("Outputs: themes/<name>.css + themes/<name>.theme.json");
  log.dim("Contrast policy: white ink in light mode, dark ink in dark mode; the primary ramp step is adjusted automatically.");
}

function optionValue(args: string[], index: number, flag: string): { value: string; next: number } {
  const equal = args[index].indexOf("=");
  if (equal !== -1) {
    const value = args[index].slice(equal + 1);
    if (!value) throw new Error(`${flag} requires a value.`);
    return { value, next: index };
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return { value, next: index + 1 };
}

function parseThemeGenerateArgs(args: string[]): ThemeGenerateInput | null {
  if (args.includes("--help") || args.includes("-h")) return null;

  let name: string | null = null;
  let accent: string | null = null;
  let neutral: ThemeNeutral = "cool";
  let radius: ThemeRadius = "md";
  let scheme: ThemeGenerateInput["scheme"] = "both";
  let document = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const flag = arg.split("=", 1)[0];
    switch (flag) {
      case "--accent": {
        const parsed = optionValue(args, i, "--accent");
        accent = parsed.value;
        i = parsed.next;
        break;
      }
      case "--neutral": {
        const parsed = optionValue(args, i, "--neutral");
        if (!(["cool", "warm", "gray"] as string[]).includes(parsed.value)) {
          throw new Error(`Invalid --neutral '${parsed.value}'. Choose: cool, warm, or gray.`);
        }
        neutral = parsed.value as ThemeNeutral;
        i = parsed.next;
        break;
      }
      case "--radius": {
        const parsed = optionValue(args, i, "--radius");
        if (!(["sm", "md", "lg"] as string[]).includes(parsed.value)) {
          throw new Error(`Invalid --radius '${parsed.value}'. Choose: sm, md, or lg.`);
        }
        radius = parsed.value as ThemeRadius;
        i = parsed.next;
        break;
      }
      case "--scheme": {
        const parsed = optionValue(args, i, "--scheme");
        if (!(["light", "dark", "both"] as string[]).includes(parsed.value)) {
          throw new Error(`Invalid --scheme '${parsed.value}'. Choose: light, dark, or both.`);
        }
        scheme = parsed.value as ThemeGenerateInput["scheme"];
        i = parsed.next;
        break;
      }
      case "--document":
        document = true;
        break;
      case "--json":
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option '${arg}'. Run 'faqir theme generate --help'.`);
        if (name) throw new Error(`Unexpected argument '${arg}'. Usage: faqir theme generate <name> --accent <color>`);
        name = arg;
    }
  }

  if (!name) throw new Error("Theme name required. Usage: faqir theme generate <name> --accent <color>");
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error("Theme name must be lowercase kebab-case (e.g., 'my-brand').");
  }
  if (!accent) {
    throw new Error(
      '--accent is required. Use an opaque oklch() or hex brand color, for example --accent "oklch(0.55 0.2 150)".',
    );
  }

  return { name, accent, neutral, radius, scheme, document };
}

async function themeGenerate(args: string[]): Promise<void> {
  const input = parseThemeGenerateArgs(args);
  if (!input) {
    printGenerateHelp();
    return;
  }

  const tokensDir = join(getRegistryPath(), "tokens");
  const tokenFiles = [...new Bun.Glob("*.css").scanSync(tokensDir)]
    .filter((file) => file !== "index.css")
    .sort();
  const baseCssSources = await Promise.all(
    tokenFiles.map((file) => Bun.file(join(tokensDir, file)).text()),
  );

  // Generation, manifest derivation, and every contrast check happen before
  // this point. No output directory exists yet if any verification throws.
  const result = generateThemeBundle(input, baseCssSources);
  const outputDir = join(process.cwd(), "themes");
  ensureDir(outputDir);
  for (const file of result.generated) {
    await Bun.write(join(process.cwd(), file.css_path), file.css);
    await Bun.write(
      join(process.cwd(), file.manifest_path),
      JSON.stringify(file.manifest, null, 2) + "\n",
    );
  }

  const report = {
    theme_generate_schema_version: THEME_GENERATE_JSON_VERSION,
    command: "theme generate",
    name: result.name,
    accent: result.accent,
    options: {
      neutral: result.neutral,
      radius: result.radius,
      scheme: result.scheme,
      document: result.document,
    },
    generated: result.generated.map((file) => ({
      kind: file.kind,
      name: file.name,
      css: file.css_path,
      manifest: file.manifest_path,
    })),
    contrast: result.generated.flatMap((file) => file.contrast),
  };

  if (isJSONMode()) {
    emitJSON(report);
    return;
  }

  log.success(`Generated contrast-verified theme '${input.name}'.`);
  for (const file of result.generated) {
    log.step(`${file.css_path}`);
    log.step(`${file.manifest_path}`);
  }
  const primaryRatios = report.contrast.filter(
    (pair) => pair.foreground === "color-primary-fg" && pair.background === "color-primary",
  );
  for (const pair of primaryRatios) {
    const adjusted = pair.auto_adjusted ? " (lightness auto-adjusted)" : "";
    log.dim(`${pair.theme} ${pair.scheme}: primary contrast ${pair.ratio.toFixed(2)}:1${adjusted}`);
  }
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

  const registryThemes = listRegistryThemes(registryPath);
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
    case "generate":
      await themeGenerate(args.slice(1));
      break;
    case "list":
      await themeList();
      break;
    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      log.dim("Run 'faqir theme --help' for available subcommands.");
      process.exit(1);
  }
}
