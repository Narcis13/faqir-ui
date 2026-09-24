// faqir scaffold — generate full page templates

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig, missingConfigMessage } from "../utils/config";
import { copyFile, ensureDir, getRegistryPath } from "../utils/fs";
import { generateBundle } from "../utils/bundler";
import { SCAFFOLDS, scaffoldDocument } from "../scaffolds";
import { add } from "./add";

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

/**
 * Install what the scaffold needs through `faqir add` itself — the same
 * dependency resolution, pristine snapshot, auto-init and context regeneration
 * a hand-run `faqir add` performs. This used to copy registry files by hand:
 * no snapshot meant `faqir diff` and `faqir upgrade` had no baseline for any
 * component a scaffold installed, and no dependency resolution meant a pattern's
 * nested components were only there if the scaffold's list happened to name them.
 *
 * Returns the names still missing (only when `autoAdd` is off).
 */
async function ensureComponentsInstalled(
  needed: string[],
  config: Awaited<ReturnType<typeof readConfig>>,
  autoAdd: boolean
): Promise<string[]> {
  const installed = new Set([
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ]);

  const missing = needed.filter((c) => !installed.has(c));
  if (missing.length === 0) return [];
  if (!autoAdd) return missing;

  await add(missing);
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


/**
 * The value after `name`, or undefined when the flag is absent. A flag given
 * with no value — at the end of the line, or followed by another flag — is an
 * error: `--output --theme dark` used to write the page to a file called
 * `--theme`.
 */
function flagValue(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("-")) {
    log.error(`Missing value for ${name}.`);
    process.exit(1);
  }
  return value;
}

/**
 * Where `--output` points, resolved against the project and held inside it.
 * `join(cwd, arg)` turned `--output /tmp/x.html` into `<cwd>/tmp/x.html` and let
 * `--output ../../x.html` write outside the project; the containment check is
 * the one `faqir add` applies to every file it writes.
 */
function resolveOutputPath(cwd: string, arg: string): string {
  const root = resolve(cwd);
  const path = resolve(root, arg);
  const rel = relative(root, path);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    log.error(`Refusing to write outside the project: '${arg}'`);
    log.dim("--output takes a path inside the project directory.");
    process.exit(1);
  }
  return path;
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
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  let config = await readConfig(cwd);
  const noAdd = args.includes("--no-add");

  const themeArg = flagValue(args, "--theme");
  const requestedTheme = themeArg ?? scaffoldDef.defaultTheme;

  const outputPath = resolveOutputPath(cwd, flagValue(args, "--output") ?? `${name}.html`);

  log.heading(`Scaffolding: ${scaffoldDef.title}`);

  // Ensure all needed components are installed
  const allNeeded = [...scaffoldDef.components, ...scaffoldDef.patterns];
  const missing = await ensureComponentsInstalled(allNeeded, config, !noAdd);

  if (missing.length > 0) {
    log.warn(`Missing components: ${missing.join(", ")}`);
    log.dim("Run 'faqir add' to install them, or remove --no-add.");
    process.exit(1);
  }
  // `faqir add` wrote its own copy of the config; continue from that one.
  config = await readConfig(cwd);

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

  // Generate the page — through the same dispatcher the docs gallery uses.
  const html = scaffoldDocument(name, {
    title: scaffoldDef.title,
    stylesheets: cssLinks(allNeeded, hasBundle, config.output_dir),
    registryPath: getRegistryPath(),
    engineSrc: `${config.output_dir}/core/faqir-core.js`,
    includeCore: Boolean(config.include_core),
  });

  ensureDir(dirname(outputPath));
  await Bun.write(outputPath, html);

  log.blank();
  log.success(`Scaffold generated: ${outputPath}`);
  log.dim("Open the file in a browser to preview.");
}
