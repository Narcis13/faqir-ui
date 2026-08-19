// faqir scaffold — generate full page templates

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { copyFile, ensureDir, getRegistryPath } from "../utils/fs";
import { generateBundle } from "../utils/bundler";
import { generateDocumentScaffold, type DocumentScaffoldName } from "../scaffolds/documents";
import { SCAFFOLDS } from "../scaffolds/registry";
import { generateLandingPage } from "../scaffolds/landing";
import { generateAppPage, type AppScaffoldName } from "../scaffolds/app";

function printHelp() {
  log.heading("faqir scaffold <name>");
  log.blank();
  console.log("Generate a full page template.");
  log.blank();
  console.log("Available scaffolds:");
  log.table(
    Object.values(SCAFFOLDS).map((s) => [s.name, s.description])
  );
  log.blank();
  console.log("Options:");
  log.table([
    ["--output <path>", "Output file path (default: ./<name>.html)"],
    ["--theme <name>", "Theme to apply (invoice/report default: 'document')"],
    ["--no-add", "Don't auto-install missing components"],
  ]);
}

async function ensureComponentsInstalled(
  needed: string[],
  config: Awaited<ReturnType<typeof readConfig>>,
  cwd: string,
  autoAdd: boolean
): Promise<string[]> {
  const installed = new Set([
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ]);

  const missing = needed.filter((c) => !installed.has(c));
  if (missing.length === 0) return [];

  if (!autoAdd) {
    return missing;
  }

  // Auto-add missing components via the add logic
  const registryPath = getRegistryPath();

  for (const name of missing) {
    for (const layer of ["primitives", "recipes", "patterns"] as const) {
      const compPath = join(registryPath, layer, name);
      if (existsSync(compPath)) {
        const outputDir = join(cwd, config.output_dir);
        const destDir = join(outputDir, layer, name);
        ensureDir(destDir);

        // Copy files
        const glob = new Bun.Glob("**/*");
        for await (const path of glob.scan({ cwd: compPath, onlyFiles: true })) {
          const content = await Bun.file(join(compPath, path)).text();
          ensureDir(join(destDir, path, ".."));
          await Bun.write(join(destDir, path), content);
        }

        if (!config.installed[layer].includes(name)) {
          config.installed[layer].push(name);
        }
        break;
      }
    }
  }

  config.installed.primitives.sort();
  config.installed.recipes.sort();
  config.installed.patterns.sort();
  await writeConfig(config, cwd);

  return [];
}

/**
 * The stylesheet a component actually ships, from its manifest (`files.css`),
 * falling back to `<name>.css` when a manifest is unreadable. Returns null when
 * the component has no stylesheet at all.
 */
function stylesheetName(componentDir: string, name: string): string | null {
  const manifestPath = join(componentDir, `${name}.manifest.json`);
  if (existsSync(manifestPath)) {
    try {
      const files = JSON.parse(readFileSync(manifestPath, "utf8")).files as
        | { css?: string }
        | undefined;
      if (files?.css) return existsSync(join(componentDir, files.css)) ? files.css : null;
    } catch {
      // Fall through to the conventional name.
    }
  }
  return existsSync(join(componentDir, `${name}.css`)) ? `${name}.css` : null;
}

function cssLinks(components: string[], hasBundle: boolean, outputDir: string): string {
  if (hasBundle) {
    return `  <link rel="stylesheet" href="${outputDir}/faqir.bundle.css">`;
  }

  const links: string[] = [];
  links.push(`  <link rel="stylesheet" href="${outputDir}/tokens/index.css">`);
  links.push(`  <link rel="stylesheet" href="${outputDir}/tokens/theme.css">`);
  links.push(`  <link rel="stylesheet" href="${outputDir}/base/reset.css">`);
  links.push(`  <link rel="stylesheet" href="${outputDir}/base/prose.css">`);
  links.push(`  <link rel="stylesheet" href="${outputDir}/base/rhythm.css">`);

  const registryPath = getRegistryPath();
  for (const comp of components) {
    const layer = (["primitives", "recipes", "patterns"] as const).find((candidate) =>
      existsSync(join(registryPath, candidate, comp)),
    );
    if (!layer) continue;
    // The stylesheet is not always `<name>.css` — the icon primitive ships the
    // generated `icons.css`, and the manifest is the source of truth for it.
    const sheet = stylesheetName(join(registryPath, layer, comp), comp);
    if (!sheet) continue;
    links.push(`  <link rel="stylesheet" href="${outputDir}/${layer}/${comp}/${sheet}">`);
  }

  return links.join("\n");
}

async function applyTheme(
  name: string,
  config: Awaited<ReturnType<typeof readConfig>>,
  cwd: string,
): Promise<void> {
  const outputDir = join(cwd, config.output_dir);
  const registryTheme = join(getRegistryPath(), "themes", `${name}.css`);
  const customTheme = join(outputDir, "tokens", `theme-${name}.css`);
  const source = existsSync(registryTheme) ? registryTheme : customTheme;

  if (!existsSync(source)) {
    log.error(`Theme '${name}' not found.`);
    log.dim("Run 'faqir theme list' to see available themes.");
    process.exit(1);
  }

  await copyFile(source, join(outputDir, "tokens", "theme.css"));
  config.theme = name;
  await writeConfig(config, cwd);
}


export async function scaffold(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  const name = args[0];
  const scaffoldDef = SCAFFOLDS[name];

  if (!scaffoldDef) {
    log.error(`Unknown scaffold: '${name}'`);
    log.dim("Available scaffolds: " + Object.keys(SCAFFOLDS).join(", "));
    process.exit(1);
  }

  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const noAdd = args.includes("--no-add");

  const themeIdx = args.indexOf("--theme");
  if (themeIdx >= 0 && !args[themeIdx + 1]) {
    log.error("Missing value for --theme.");
    process.exit(1);
  }
  const requestedTheme = themeIdx >= 0 ? args[themeIdx + 1] : scaffoldDef.defaultTheme;

  // Parse output path
  let outputPath = join(cwd, `${name}.html`);
  const outputIdx = args.indexOf("--output");
  if (outputIdx >= 0 && args[outputIdx + 1]) {
    outputPath = join(cwd, args[outputIdx + 1]);
  }

  log.heading(`Scaffolding: ${scaffoldDef.title}`);

  // Ensure all needed components are installed
  const allNeeded = [...scaffoldDef.components, ...scaffoldDef.patterns];
  const missing = await ensureComponentsInstalled(allNeeded, config, cwd, !noAdd);

  if (missing.length > 0) {
    log.warn(`Missing components: ${missing.join(", ")}`);
    log.dim("Run 'faqir add' to install them, or remove --no-add.");
    process.exit(1);
  }

  if (!noAdd && allNeeded.length > 0) {
    log.step("Ensured all required components are installed.");
  }

  if (requestedTheme) {
    await applyTheme(requestedTheme, config, cwd);
    log.step(`Applied theme: ${requestedTheme}.`);
  }

  // Detect if bundle exists
  const hasBundle = existsSync(join(cwd, config.output_dir, "faqir.bundle.css"));
  if (hasBundle && config.bundle?.auto !== false) {
    await generateBundle(cwd);
    log.step("Bundle regenerated.");
  }

  // Generate the page
  let html: string;
  switch (name) {
    case "landing-page":
      html = generateLandingPage({
        title: scaffoldDef.title,
        stylesheets: cssLinks(allNeeded, hasBundle, config.output_dir),
        registryPath: getRegistryPath(),
      });
      break;
    case "admin-dashboard":
    case "internal-tool":
      html = generateAppPage(name as AppScaffoldName, {
        title: scaffoldDef.title,
        stylesheets: cssLinks(allNeeded, hasBundle, config.output_dir),
        registryPath: getRegistryPath(),
        coreScriptSrc: `${config.output_dir}/core/faqir-core.js`,
      });
      break;
    case "invoice":
    case "report":
      html = generateDocumentScaffold(name as DocumentScaffoldName, {
        title: scaffoldDef.title,
        stylesheets: cssLinks(allNeeded, hasBundle, config.output_dir),
        coreScriptSrc: config.include_core
          ? `${config.output_dir}/core/faqir-core.js`
          : undefined,
      });
      break;
    default:
      log.error(`No generator for scaffold '${name}'.`);
      process.exit(1);
      return;
  }

  ensureDir(join(outputPath, ".."));
  await Bun.write(outputPath, html);

  log.blank();
  log.success(`Scaffold generated: ${outputPath}`);
  log.dim("Open the file in a browser to preview.");
}
