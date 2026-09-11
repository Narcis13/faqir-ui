// faqir theme — manage themes (set, create, generate, list)

import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig, missingConfigMessage } from "../utils/config";
import { copyFile, ensureDir, getRegistryPath } from "../utils/fs";
import { generateBundle } from "../utils/bundler";
import { emitJSON, isJSONMode } from "../utils/json-output";
import { listRegistryThemes } from "../theme-manifest";
import {
  previewStylesheets,
  renderThemePreview,
  type ThemePreviewSpec,
} from "../theme-preview";
import {
  generateThemeBundle,
  themeScorecard,
  THEME_SCORECARD_VERSION,
  type GeneratedThemeFile,
  type ThemeGenerateInput,
  type ThemeRadius,
} from "./theme-generate";
import { densityTokenCss, readPeerThemes, themeBaseSources } from "../theme/sources";
import {
  assertDistinct,
  AXIS_MIN,
  distinctivenessContext,
  prepareTheme,
  TOKEN_MIN,
} from "../theme/distinctiveness";
import {
  coerceSeedValue,
  mergeSeeds,
  SEED_FLAGS,
  setSeedPath,
  type ThemeSeedInput,
} from "../theme/seed";
import { validateThemeSeed, THEME_AXIS_VALUES, THEME_DERIVED_AXES } from "../theme-manifest";

/** The `--json` payload's schema version — the scorecard's, so they cannot drift. */
export const THEME_GENERATE_JSON_VERSION = THEME_SCORECARD_VERSION;

/** Where `theme generate` writes, unless `--out` says otherwise. */
export const DEFAULT_THEME_OUT_DIR = "themes";

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

/** The axis flags, rendered as a help table — derived, so a new axis appears here. */
function axisFlagRows(): [string, string][] {
  const vocabulary = THEME_AXIS_VALUES as Record<string, readonly (string | number)[] | undefined>;
  return Object.entries(SEED_FLAGS)
    .filter(([flag]) => flag !== "accent")
    .map(([flag, path]): [string, string] => [
      `--${flag} <value>`,
      `${path}: ${(vocabulary[path] ?? []).join(", ")}`,
    ]);
}

function printGenerateHelp() {
  log.heading("faqir theme generate <name>");
  log.blank();
  console.log("Generate a complete, contrast-verified theme from a seed — one brand colour");
  console.log("plus as many of the fourteen character axes as you care to state.");
  log.blank();
  console.log("Usage:");
  console.log('  faqir theme generate my-brand --accent "oklch(0.55 0.2 150)" [options]');
  console.log("  faqir theme generate my-brand --seed my-brand.seed.json [options]");
  log.blank();
  console.log("Options:");
  log.table([
    ["--accent <color>", "Opaque oklch(), #rgb, or #rrggbb brand color (required)"],
    ["--seed <file>", "A .seed.json to start from; individual flags override it"],
    ["--out <dir>", `Directory to write into (default: ${DEFAULT_THEME_OUT_DIR})`],
    ["--document", "Also emit a brand-matched print/document variant"],
    ["--radius <size>", "1.0 compatibility flag for --shape: sm, md, or lg"],
    ["--legacy-blocks", "Dual themes: write three colour blocks instead of one light-dark() block"],
    ["--allow-similar", `Write even when a theme in --out is within ${AXIS_MIN} axes / ${TOKEN_MIN} ΔE`],
    ["--json", "Print the full scorecard: seed, axes, contrast, elevation, focus, tap targets"],
  ]);
  log.blank();
  console.log("Axes (every one optional — an unstated axis takes its documented default):");
  log.table(axisFlagRows());
  log.blank();
  log.dim(`Outputs: ${DEFAULT_THEME_OUT_DIR}/<name>.{css,theme.json,seed.json,preview.html}`);
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

/** What the command line asked for, before the seed file is read or merged. */
interface ThemeGenerateArgs {
  /** The positional theme name, if one was given. `--seed`'s may stand in. */
  name: string | null;
  /** Path to a `.seed.json`, if `--seed` was given. */
  seedPath: string | null;
  /** The axes the flags stated. Merged OVER the seed file: flags win. */
  flagSeed: Record<string, unknown>;
  radius: ThemeRadius | null;
  legacyBlocks: boolean;
  outDir: string;
  /** Write a theme that collides with one already in `outDir` anyway. */
  allowSimilar: boolean;
}

/**
 * Parse `theme generate`'s command line.
 *
 * The axis flags are NOT validated here, on purpose. A flag writes its value
 * into the seed and `normalizeSeed` — i.e. `validateThemeSeed`, the same
 * function that gates a shipped manifest — produces the error, so
 * `--depth fluffy` prints the identical sentence whether it arrived from this
 * CLI, from a `.seed.json`, or from the MCP tool. Validating twice is how two
 * spellings of the same rule drift apart; the 1.0 parser's own
 * `--neutral cool|warm|gray` check was already wrong, because 1.1 added
 * `tinted`.
 */
function parseThemeGenerateArgs(args: string[]): ThemeGenerateArgs | null {
  if (args.includes("--help") || args.includes("-h")) return null;

  const parsed: ThemeGenerateArgs = {
    name: null,
    seedPath: null,
    flagSeed: {},
    radius: null,
    legacyBlocks: false,
    outDir: DEFAULT_THEME_OUT_DIR,
    allowSimilar: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const flag = arg.split("=", 1)[0];
    const axis = flag.startsWith("--") ? SEED_FLAGS[flag.slice(2)] : undefined;
    if (axis) {
      const option = optionValue(args, i, flag);
      setSeedPath(parsed.flagSeed, axis, coerceSeedValue(axis, option.value));
      i = option.next;
      continue;
    }
    switch (flag) {
      case "--seed": {
        const option = optionValue(args, i, "--seed");
        parsed.seedPath = option.value;
        i = option.next;
        break;
      }
      case "--out": {
        const option = optionValue(args, i, "--out");
        parsed.outDir = option.value.replace(/[\\/]+$/, "");
        i = option.next;
        break;
      }
      case "--radius": {
        const option = optionValue(args, i, "--radius");
        parsed.radius = option.value as ThemeRadius;
        i = option.next;
        break;
      }
      case "--document":
        parsed.flagSeed.document = true;
        break;
      case "--legacy-blocks":
        parsed.legacyBlocks = true;
        break;
      case "--allow-similar":
        parsed.allowSimilar = true;
        break;
      case "--json":
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option '${arg}'. Run 'faqir theme generate --help'.`);
        }
        if (parsed.name) {
          throw new Error(`Unexpected argument '${arg}'. Usage: faqir theme generate <name> --accent <color>`);
        }
        parsed.name = arg;
    }
  }

  return parsed;
}

/** Read a `--seed <file>`, failing with the path rather than with a parser message. */
async function readSeedFile(path: string): Promise<Record<string, unknown>> {
  const resolved = join(process.cwd(), path);
  const source = existsSync(resolved) ? resolved : path;
  if (!existsSync(source)) {
    throw new Error(`Seed file '${path}' not found.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await Bun.file(source).text());
  } catch (error) {
    throw new Error(
      `Seed file '${path}' is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Seed file '${path}' must contain a JSON object (a theme seed).`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * The seed the generator is actually run with: the file, the flags over it, and
 * the two 1.0 options that are not axes.
 */
async function resolveSeedInput(parsed: ThemeGenerateArgs): Promise<ThemeGenerateInput> {
  const fileSeed = parsed.seedPath ? await readSeedFile(parsed.seedPath) : {};
  const merged = mergeSeeds(fileSeed, parsed.flagSeed);
  // The positional name wins over the file's, so one seed can be re-generated
  // under another name without editing it.
  if (parsed.name) merged.name = parsed.name;
  if (merged.name === undefined) {
    throw new Error(
      "Theme name required. Usage: faqir theme generate <name> --accent <color> " +
        "(or name it in the --seed file).",
    );
  }
  if (merged.accent === undefined) {
    throw new Error(
      '--accent is required. Use an opaque oklch() or hex brand color, for example --accent "oklch(0.55 0.2 150)".',
    );
  }
  return {
    ...(merged as unknown as ThemeSeedInput),
    ...(parsed.radius ? { radius: parsed.radius } : {}),
    legacyBlocks: parsed.legacyBlocks,
  };
}

async function themeGenerate(args: string[]): Promise<void> {
  const parsed = parseThemeGenerateArgs(args);
  if (!parsed) {
    printGenerateHelp();
    return;
  }
  const input = await resolveSeedInput(parsed);

  const registryPath = getRegistryPath();
  const baseCssSources = themeBaseSources(registryPath);

  // Generation, manifest derivation, the axis round trip and every contrast
  // check happen before this point. No output directory exists yet if any
  // verification throws.
  const result = generateThemeBundle(input, baseCssSources);

  // Distinctiveness is measured against the themes already in the OUTPUT
  // directory — the set this one would ship beside — and not against the twelve
  // the CLI carries: generating one brand theme into an empty folder has
  // nothing to be distinct from, while regenerating into a registry does.
  // The theme's own artefacts are excluded so a regeneration never collides
  // with the copy of itself it is about to overwrite.
  const peers = readPeerThemes(
    join(process.cwd(), parsed.outDir),
    result.generated.map((file) => file.name),
  );
  if (!parsed.allowSimilar && peers.length > 0) {
    const context = distinctivenessContext(baseCssSources);
    const primary = result.generated.find((file) => file.kind === "theme")!;
    assertDistinct(
      prepareTheme(
        { name: result.name, css: primary.css, scheme: primary.manifest.scheme, axes: result.axes },
        context,
      ),
      peers.map((peer) => prepareTheme(peer, context)),
      context,
    );
  }

  const report = themeScorecard(result, baseCssSources, {
    outDir: parsed.outDir,
    densityCss: densityTokenCss(registryPath),
    peers,
    allowSimilar: parsed.allowSimilar,
  });

  // The seed is written beside the CSS, and it is the SAME object the manifest
  // carries — so `faqir theme generate x --seed x.seed.json` reproduces the
  // theme byte for byte, and a reader can see what the generator was told.
  const seedErrors = validateThemeSeed(result.seed);
  if (seedErrors.length > 0) {
    throw new Error(
      `The resolved seed does not validate against definitions.themeSeed: ` +
        `${seedErrors.map((error) => `${error.field}: ${error.message}`).join("; ")}`,
    );
  }

  ensureDir(join(process.cwd(), parsed.outDir));
  const written = new Map(report.generated.map((file) => [file.name, file]));
  for (const file of result.generated) {
    const paths = written.get(file.name)!;
    await Bun.write(join(process.cwd(), paths.css), file.css);
    await Bun.write(
      join(process.cwd(), paths.manifest),
      JSON.stringify(file.manifest, null, 2) + "\n",
    );
    if (paths.seed) {
      await Bun.write(
        join(process.cwd(), paths.seed),
        JSON.stringify(result.seed, null, 2) + "\n",
      );
    }
    // The manifest declares `preview: "<name>.preview.html"`, so the file has to
    // be there: a shipped manifest must not name a file that is not (1.0R-10).
    // It is written self-contained — the output directory is a drop folder with
    // no registry beside it, so a linking harness would resolve to nothing.
    await Bun.write(
      join(process.cwd(), paths.preview),
      await renderGeneratedPreview(file, result.axes.density),
    );
  }

  if (isJSONMode()) {
    emitJSON(report);
    return;
  }

  log.success(`Generated contrast-verified theme '${result.name}'.`);
  for (const file of report.generated) {
    log.step(file.css);
    log.step(file.manifest);
    if (file.seed) log.step(file.seed);
    log.step(file.preview);
  }
  const primaryRatios = report.contrast.filter(
    (pair) => pair.foreground === "color-primary-fg" && pair.background === "color-primary",
  );
  for (const pair of primaryRatios) {
    const adjusted = pair.auto_adjusted ? " (lightness auto-adjusted)" : "";
    log.dim(`${pair.theme} ${pair.scheme}: primary contrast ${pair.ratio.toFixed(2)}:1${adjusted}`);
  }
  const tap = report.tap_targets.find((target) => target.control === "control-height-md");
  if (tap?.height_px) log.dim(`${report.axes.density} density: ${tap.height_px}px default control height`);
  const distinct = report.distinctiveness;
  if (distinct) {
    const colour = distinct.token_distance == null ? "no shared scheme" : `ΔE ${distinct.token_distance.toFixed(4)}`;
    const verdict = distinct.passes ? "" : distinct.allow_similar ? " — written anyway (--allow-similar)" : "";
    log.dim(
      `nearest theme: ${distinct.nearest} ` +
        `(${distinct.axis_distance}/${THEME_DERIVED_AXES.length} axes differ, ${colour})${verdict}`,
    );
  }
  log.dim("Run with --json for the full scorecard (axes, elevation ΔE, focus ratios, tap targets).");
}

/**
 * Render the self-contained gallery a generated theme's manifest points at.
 *
 * `faqir theme generate` writes into a bare `themes/` directory — there is no
 * `../tokens/` or `../primitives/` beside it to link, and the command may be run
 * outside a Faqir project entirely. So the harness carries its stylesheets: the
 * token surface, the reset, the theme itself, and the components the gallery
 * renders, read from the registry the CLI ships and inlined in cascade order.
 */
async function renderGeneratedPreview(
  file: GeneratedThemeFile,
  density: string,
): Promise<string> {
  const registryPath = getRegistryPath();
  const { name, kind, css: themeCss } = file;
  const spec: ThemePreviewSpec = {
    name,
    tagline:
      kind === "document"
        ? "Generated print companion — light only, sized for the page."
        : "Generated from your brand accent, contrast-verified before it was written.",
    initials: name.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "FA",
    scheme: file.manifest.scheme,
    extraTokens: kind === "document" ? ["tokens/document.css", "tokens/doc-aliases.css"] : undefined,
    // The seed's density, stamped on the harness's root: a theme declares it in
    // a `@ui:density` header rather than at `:root` (a `:root` block cannot
    // override a `[data-density]` subtree scope), so without this a `compact`
    // theme would preview at the comfortable ramp.
    density,
    // 1.1A-18 is what puts `fonts` on a generated manifest; the harness links
    // whatever a manifest names, so the wiring is here rather than waiting.
    ...(file.manifest.fonts?.length ? { fontsHref: "../ui/fonts.css" } : {}),
  };
  const ownSheet = `themes/${name}.css`;
  const sources: string[] = [];
  for (const rel of previewStylesheets(spec)) {
    if (rel === ownSheet) {
      sources.push(`/* ${rel} */\n${themeCss}`);
      continue;
    }
    const path = join(registryPath, rel);
    if (!existsSync(path)) {
      throw new Error(`Preview stylesheet '${rel}' is missing from the registry at ${registryPath}.`);
    }
    sources.push(`/* ${rel} */\n${await Bun.file(path).text()}`);
  }
  return renderThemePreview({ ...spec, inlineCss: sources.join("\n") });
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
    log.error(missingConfigMessage(cwd));
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
    log.error(missingConfigMessage(cwd));
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
  /* --color-bg-subtle:       var(--palette-gray-100); */
  /* --color-bg-muted:        var(--palette-gray-200); */
  /* --color-surface-1:        var(--color-bg-subtle); */
  /* --color-surface-2:        var(--color-bg-muted); */
  /* --color-surface-1-border: var(--color-border); */
  /* --color-surface-2-border: var(--color-border-strong); */
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
  /* --color-surface-1:        var(--color-bg-subtle); */
  /* --color-surface-2:        var(--color-bg-muted); */
  /* --color-surface-1-border: var(--color-border); */
  /* --color-surface-2-border: var(--color-border-strong); */
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
