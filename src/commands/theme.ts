// faqir theme — manage themes (set, create, generate, list)

import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { log } from "../utils/logger";
import { isInside } from "../utils/paths";
import { configExists, readConfig, writeConfig, missingConfigMessage } from "../utils/config";
import { regenerateContext } from "../utils/codegen";
import { copyFile, ensureDir, getRegistryPath } from "../utils/fs";
import { generateBundle } from "../utils/bundler";
import { emitJSON, isJSONMode } from "../utils/json-output";
import { listRegistryThemes, type ThemeManifest } from "../theme-manifest";
import { densityFromCss } from "../theme/axes";
import { findFamily } from "../fonts/catalog";
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
  defaultScopeSelector,
  scopeThemeCss,
  type ScopedTheme,
} from "../theme/scope";
import {
  assertDistinct,
  AXIS_MIN,
  distinctivenessContext,
  prepareTheme,
  TOKEN_MIN,
} from "../theme/distinctiveness";
import {
  coerceSeedValue,
  LEGACY_NEUTRAL_DEFAULT,
  LEGACY_RADIUS_SHAPE,
  mergeSeeds,
  radiusConflict,
  SEED_FLAGS,
  setSeedPath,
  THEME_NAME_PATTERN,
  type ThemeSeedInput,
} from "../theme/seed";
import { validateThemeSeed, THEME_AXIS_VALUES, THEME_DERIVED_AXES } from "../theme-manifest";

/** The `--json` payload's schema version — the scorecard's, so they cannot drift. */
export const THEME_GENERATE_JSON_VERSION = THEME_SCORECARD_VERSION;

/** Where `theme generate` writes, unless `--out` says otherwise. */
export const DEFAULT_THEME_OUT_DIR = "themes";

/** The `theme bundle --json` payload's schema version. */
export const THEME_BUNDLE_JSON_VERSION = 1;

function printHelp() {
  log.heading("faqir theme <subcommand>");
  log.blank();
  console.log("Manage themes for the Faqir project.");
  log.blank();
  console.log("Subcommands:");
  log.table([
    ["set <name|path.css>", "Switch the active theme (a name, or a generated theme's stylesheet)"],
    ["create <name>", "Scaffold a new custom theme"],
    ["generate <name>", "Generate a complete theme from one brand color"],
    ["bundle <name>", "Emit a theme scoped to a subtree (data-skin)"],
    ["list", "Show available and active themes"],
  ]);
  log.blank();
  console.log("Examples:");
  console.log("  faqir theme set midnight");
  console.log("  faqir theme set resources/themes/my-brand.css");
  console.log("  faqir theme create my-brand");
  console.log('  faqir theme generate my-brand --accent "oklch(0.55 0.2 150)"');
  console.log("  faqir theme bundle aurora --scope");
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
    ["--radius <size>", "1.0 compatibility flag for --shape: sm, md, or lg (not both)"],
    ["--legacy-blocks", "Dual themes: write three colour blocks instead of one light-dark() block"],
    ["--allow-similar", `Write even when a theme in --out is within ${AXIS_MIN} axes / ${TOKEN_MIN} ΔE`],
    ["--json", "Print the full scorecard: seed, axes, contrast, elevation, focus, tap targets"],
  ]);
  log.blank();
  console.log("Axes (every one optional — an unstated axis takes its documented default):");
  log.table(axisFlagRows());
  log.dim(`Without --seed, --neutral defaults to ${LEGACY_NEUTRAL_DEFAULT} (the 1.0 default); a seed file's unstated neutral is gray.`);
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
        if (!(option.value in LEGACY_RADIUS_SHAPE)) {
          throw new Error(`Invalid --radius '${option.value}'. Choose: sm, md, or lg.`);
        }
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

  // `--radius` is the 1.0 spelling of `--shape`, so it is written where
  // `--shape` would be — as a FLAG, which wins over a `--seed` file like every
  // other flag. Both flags given and disagreeing is an error, not a silent
  // winner: the 1.0 flag used to vanish without a word whenever `--shape` or a
  // seed's `shape.radius` was present.
  if (parsed.radius) {
    const shape = (parsed.flagSeed.shape ?? {}) as Record<string, unknown>;
    const mapped = LEGACY_RADIUS_SHAPE[parsed.radius];
    if (shape.radius !== undefined && shape.radius !== mapped) {
      throw new Error(radiusConflict(parsed.radius, String(shape.radius)));
    }
    setSeedPath(parsed.flagSeed, "shape.radius", mapped);
  }

  return parsed;
}

/**
 * Resolve a user-given output directory against the working directory.
 *
 * An absolute path is the user saying exactly where, and is honoured as given
 * (it used to be glued onto the cwd, so `--out /tmp/x` wrote `./tmp/x`). A
 * RELATIVE path must stay inside the working directory — the same containment
 * `add` asserts before it writes — so a stray `../..` cannot put files
 * somewhere the command line does not visibly name.
 */
export function resolveOutDir(cwd: string, dir: string, flag = "--out"): string {
  if (isAbsolute(dir)) return resolve(dir);
  const root = resolve(cwd);
  const target = resolve(root, dir);
  if (!isInside(root, target)) {
    throw new Error(
      `Refusing to write outside the project: ${flag} '${dir}' resolves to ${target}. ` +
        `Pass an absolute path if that is really where it should go.`,
    );
  }
  return target;
}

/** Read a `--seed <file>`, failing with the path rather than with a parser message. */
async function readSeedFile(path: string): Promise<Record<string, unknown>> {
  const source = resolve(process.cwd(), path);
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
  // The 1.0 command line keeps its 1.0 default; a seed file is the 1.1 form and
  // takes the seed table's (see LEGACY_NEUTRAL_DEFAULT).
  if (!parsed.seedPath && merged.neutral === undefined) merged.neutral = LEGACY_NEUTRAL_DEFAULT;
  return {
    ...(merged as unknown as ThemeSeedInput),
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
  // Resolved (and contained) before anything is generated, so a refused --out
  // costs nothing and writes nothing.
  const outAbs = resolveOutDir(process.cwd(), parsed.outDir);

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
    outAbs,
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

  ensureDir(outAbs);
  for (const file of result.generated) {
    // The report's paths are `--out` as typed, for display; the writes go to
    // the resolved directory, so an absolute --out is honoured exactly.
    await Bun.write(join(outAbs, `${file.name}.css`), file.css);
    await Bun.write(
      join(outAbs, `${file.name}.theme.json`),
      JSON.stringify(file.manifest, null, 2) + "\n",
    );
    if (file.kind === "theme") {
      await Bun.write(
        join(outAbs, `${file.name}.seed.json`),
        JSON.stringify(result.seed, null, 2) + "\n",
      );
    }
    // The manifest declares `preview: "<name>.preview.html"`, so the file has to
    // be there: a shipped manifest must not name a file that is not (1.0R-10).
    // It is written self-contained — the output directory is a drop folder with
    // no registry beside it, so a linking harness would resolve to nothing.
    await Bun.write(
      join(outAbs, `${file.name}.preview.html`),
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
  // `theme set <name>` finds the default `themes/` by itself; anywhere else it
  // needs the stylesheet's path, so say which one.
  const applyWith =
    outAbs === resolve(process.cwd(), DEFAULT_THEME_OUT_DIR)
      ? result.name
      : (isInside(process.cwd(), outAbs) ? relative(process.cwd(), outAbs).split(sep).join("/") : outAbs) +
        `/${result.name}.css`;
  log.info(`Apply it: faqir theme set ${applyWith}`);
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

// ── theme bundle --scope ────────────────────────────────────────────────────

function printBundleHelp() {
  log.heading("faqir theme bundle <name> --scope [selector]");
  log.blank();
  console.log("Emit a theme scoped to a subtree, so two themes can be live on one page:");
  console.log("a customer's brand previewed inside your admin, a gallery, a side-by-side");
  console.log("comparison. Every `:root` block becomes the scope selector; every");
  console.log("`[data-theme]` block is scoped to that subtree — on the scope root, inside it,");
  console.log("and around it, so an island follows the page's scheme. Declarations are copied");
  console.log("through untouched — including `light-dark()`, which reads the island's");
  console.log("`color-scheme`: inherited for a dual theme, pinned for a single-scheme one.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir theme bundle aurora --scope");
  console.log('  faqir theme bundle aurora --scope=".brand-preview"');
  log.blank();
  console.log("Options:");
  log.table([
    ["--scope [selector]", `Required. Defaults to ${defaultScopeSelector("<name>")}`],
    ["--out <dir>", "Directory to write into (default: the project's output dir, else .)"],
    ["--json", "Print the rewrite report instead of the human summary"],
  ]);
  log.blank();
  log.dim("Outputs: <name>.scoped.css — link it after the page's own theme.");
  log.dim("A selector that is a bare kebab-case word must use the --scope=<selector> form.");
}

/** What `theme bundle`'s command line asked for. */
interface ThemeBundleArgs {
  name: string | null;
  /** `--scope` was given at all — it is what asks for the rewrite. */
  scope: boolean;
  /** An explicit selector, or null for `[data-skin="<name>"]`. */
  selector: string | null;
  outDir: string | null;
}

/**
 * A value that follows a bare `--scope` is a selector only if it cannot be the
 * theme name — otherwise `faqir theme bundle --scope aurora` would silently
 * scope an unnamed theme to a selector spelled `aurora`. A CSS selector for this
 * purpose always carries a `[`, `.`, `#`, `:`, a combinator or a space; a theme
 * name is the kebab-case word `theme create` already enforces. The `--scope=…`
 * form is unambiguous and accepts anything.
 */
function looksLikeSelector(value: string): boolean {
  return !/^[a-z][a-z0-9-]*$/.test(value.trim());
}

function parseThemeBundleArgs(args: string[]): ThemeBundleArgs | null {
  if (args.includes("--help") || args.includes("-h")) return null;

  const parsed: ThemeBundleArgs = { name: null, scope: false, selector: null, outDir: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const flag = arg.split("=", 1)[0];
    switch (flag) {
      case "--scope": {
        parsed.scope = true;
        const equal = arg.indexOf("=");
        if (equal !== -1) {
          const value = arg.slice(equal + 1);
          if (!value) throw new Error("--scope= requires a selector, or use a bare --scope.");
          parsed.selector = value;
          break;
        }
        const next = args[i + 1];
        if (next && !next.startsWith("-") && looksLikeSelector(next)) {
          parsed.selector = next;
          i += 1;
        }
        break;
      }
      case "--out": {
        const option = optionValue(args, i, "--out");
        parsed.outDir = option.value.replace(/[\\/]+$/, "");
        i = option.next;
        break;
      }
      case "--json":
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option '${arg}'. Run 'faqir theme bundle --help'.`);
        }
        if (parsed.name) {
          throw new Error(`Unexpected argument '${arg}'. Usage: faqir theme bundle <name> --scope`);
        }
        parsed.name = arg;
    }
  }

  return parsed;
}

/** One theme stylesheet found on disk, with the path a reader would recognise. */
interface ThemeSource {
  name: string;
  /** Absolute path. */
  path: string;
  /** How the path is described in output — registry-relative or project-relative. */
  label: string;
  css: string;
}

/** Where `set`, `bundle` and `list` look for a theme, in precedence order. */
interface ThemeLocations {
  registryPath: string;
  /** `<output_dir>/tokens` — `theme create`'s `theme-<name>.css`. Null without a project. */
  projectTokensDir: string | null;
  /** `<cwd>/themes` — where `theme generate` writes by default. */
  generatedDir: string;
}

function themeLocations(cwd: string, config: { output_dir: string } | null): ThemeLocations {
  return {
    registryPath: getRegistryPath(),
    projectTokensDir: config ? join(cwd, config.output_dir, "tokens") : null,
    generatedDir: join(cwd, DEFAULT_THEME_OUT_DIR),
  };
}

/**
 * A theme name is a path segment in every lookup below and in the file `bundle`
 * writes, so it is held to the kebab-case `theme generate` already enforces
 * before it is joined onto anything — `../../x` is not a theme.
 */
function assertThemeName(name: string, usage: string): void {
  if (!THEME_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid theme name '${name}': a theme name is lowercase kebab-case (e.g. 'my-brand'). ${usage}`);
  }
}

/**
 * Find a theme's stylesheet: the registry first, then the project's own
 * `tokens/theme-<name>.css` (`theme create`), then `themes/<name>.css` — what
 * `theme generate` writes by default, so a generated theme is usable by name
 * the moment it exists. Returns null rather than throwing so the companion
 * lookup can use the same function.
 */
async function findThemeSource(name: string, where: ThemeLocations): Promise<ThemeSource | null> {
  const candidates: Array<[path: string | null, label: string]> = [
    [join(where.registryPath, "themes", `${name}.css`), `registry/themes/${name}.css`],
    [where.projectTokensDir && join(where.projectTokensDir, `theme-${name}.css`), `tokens/theme-${name}.css`],
    [join(where.generatedDir, `${name}.css`), `${DEFAULT_THEME_OUT_DIR}/${name}.css`],
  ];
  for (const [path, label] of candidates) {
    if (path && existsSync(path)) {
      return { name, path, label, css: await Bun.file(path).text() };
    }
  }
  return null;
}

/**
 * The manifest beside a theme's stylesheet, if it has one: a registry theme's
 * `<name>.theme.json`, or the one `theme generate` wrote next to its CSS. A
 * `theme create` stylesheet has none. Unreadable means absent — it only feeds
 * hints.
 */
function themeManifestFor(source: ThemeSource): ThemeManifest | null {
  const path = source.path.replace(/\.css$/, ".theme.json");
  if (path === source.path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ThemeManifest;
  } catch {
    return null;
  }
}

async function themeBundle(args: string[]): Promise<void> {
  const parsed = parseThemeBundleArgs(args);
  if (!parsed) {
    printBundleHelp();
    return;
  }
  if (!parsed.name) {
    throw new Error("Theme name required. Usage: faqir theme bundle <name> --scope");
  }
  assertThemeName(parsed.name, "Usage: faqir theme bundle <name> --scope");
  if (!parsed.scope) {
    throw new Error(
      `'faqir theme bundle' emits scoped stylesheets — pass --scope to write ` +
        `${parsed.name}.scoped.css on ${defaultScopeSelector(parsed.name)}, or ` +
        `--scope=<selector> for your own convention.`,
    );
  }

  const cwd = process.cwd();
  const config = configExists(cwd) ? await readConfig(cwd) : null;
  const where = themeLocations(cwd, config);

  const primary = await findThemeSource(parsed.name, where);
  if (!primary) {
    throw new Error(
      `Theme '${parsed.name}' not found. Run 'faqir theme list' to see available themes.`,
    );
  }

  // A print companion is a theme in its own right, named `<theme>-document`, and
  // it is selected by that name — so under the default convention it takes its
  // OWN `data-skin` scope and both files are written. An explicit selector names
  // one subtree and cannot address two themes at once, so the companion is
  // reported rather than silently given a selector the caller did not choose.
  const companion = await findThemeSource(`${parsed.name}-document`, where);
  const skipped: Array<{ theme: string; reason: string }> = [];
  const sources: ThemeSource[] = [primary];
  if (companion) {
    if (parsed.selector) {
      skipped.push({
        theme: companion.name,
        reason:
          `an explicit --scope names one subtree; bundle it with ` +
          `'faqir theme bundle ${companion.name} --scope=<selector>'`,
      });
    } else {
      sources.push(companion);
    }
  }

  const outDir = parsed.outDir ?? (config ? config.output_dir : ".");
  const outAbs = resolveOutDir(cwd, outDir);
  ensureDir(outAbs);

  const written: Array<{ source: ThemeSource; scoped: ScopedTheme; rel: string }> = [];
  for (const source of sources) {
    const selector = parsed.selector ?? defaultScopeSelector(source.name);
    const scoped = scopeThemeCss(source.css, { selector, name: source.name });
    const rel = join(outDir, `${source.name}.scoped.css`);
    await Bun.write(join(outAbs, `${source.name}.scoped.css`), scoped.css);
    written.push({ source, scoped, rel });
  }

  if (isJSONMode()) {
    emitJSON({
      json_schema_version: THEME_BUNDLE_JSON_VERSION,
      theme: primary.name,
      scope: written[0].scoped.selector,
      files: written.map(({ source, scoped, rel }) => ({
        theme: source.name,
        source: source.label,
        path: rel,
        scope: scoped.selector,
        color_scheme: scoped.colorScheme,
        tokens: scoped.tokens.length,
        rewrites: scoped.rewrites,
        untouched: scoped.untouched,
      })),
      skipped,
    });
    return;
  }

  log.success(`Scoped '${primary.name}' to ${written[0].scoped.selector}.`);
  for (const { source, scoped, rel } of written) {
    log.step(`${rel}  (${source.label} → ${scoped.selector})`);
    log.dim(
      `  ${scoped.rewrites.length} selector${scoped.rewrites.length === 1 ? "" : "s"} rewritten, ` +
        `${scoped.tokens.length} tokens, color-scheme: ${scoped.colorScheme}`,
    );
    for (const skip of scoped.untouched) {
      log.dim(`  left as authored — ${skip.prelude} (${skip.reason})`);
    }
  }
  for (const skip of skipped) {
    log.dim(`skipped ${skip.theme}: ${skip.reason}`);
  }
  log.blank();
  log.dim(`Link it after the page's own theme, then mark the subtree:`);
  log.dim(`  <div ${written[0].scoped.selector.replace(/^\[|\]$/g, "")}> … </div>`);
}

/** `theme create`'s stylesheets: `<output_dir>/tokens/theme-<name>.css`. */
function listProjectThemes(outputDir: string): string[] {
  const tokensDir = join(outputDir, "tokens");
  if (!existsSync(tokensDir)) return [];

  const themes: string[] = [];
  const glob = new Bun.Glob("theme-*.css");
  for (const file of glob.scanSync({ cwd: tokensDir })) {
    themes.push(file.replace(/^theme-/, "").replace(/\.css$/, ""));
  }
  return themes.sort();
}

/**
 * `theme generate`'s stylesheets: every `themes/<name>.css` with a kebab-case
 * name. A `*.scoped.css` from `theme bundle --out themes` is a derived file,
 * not a theme, and is left out.
 */
function listGeneratedThemes(generatedDir: string): string[] {
  if (!existsSync(generatedDir)) return [];
  const themes: string[] = [];
  for (const file of new Bun.Glob("*.css").scanSync({ cwd: generatedDir })) {
    if (file.endsWith(".scoped.css")) continue;
    const name = file.replace(/\.css$/, "");
    if (THEME_NAME_PATTERN.test(name)) themes.push(name);
  }
  return themes.sort();
}

/**
 * What `theme set` cannot apply for the user, said out loud [1.1A-30].
 *
 *  - DENSITY is a subtree modifier (`data-density`), not a token a theme can
 *    declare at `:root`, so a theme states the density it was designed for in
 *    an `@ui:density` header and the page has to opt in on `<html>`.
 *  - FONTS: a manifest names the self-hosted families it was designed for, and
 *    `faqir fonts add` is what installs them — the theme's own stack falls back
 *    to faces the reader already has until then.
 */
export function themeSetHints(css: string, manifest: ThemeManifest | null): string[] {
  const hints: string[] = [];
  if (/@ui:density\s+[a-z]+/i.test(css)) {
    const density = densityFromCss(css);
    if (density !== "comfortable") {
      hints.push(`Designed for ${density} density — add data-density="${density}" to <html> to apply it.`);
    }
  }
  const byFamily = new Map<string, string[]>();
  for (const font of manifest?.fonts ?? []) {
    const id = findFamily(font.source ?? font.family)?.id;
    if (!id) continue;
    byFamily.set(id, [...(byFamily.get(id) ?? []), font.role]);
  }
  for (const [id, roles] of byFamily) {
    hints.push(
      `Designed for a self-hosted face — run: faqir fonts add ${id} ${roles.map((role) => `--role ${role}`).join(" ")}`,
    );
  }
  return hints;
}

/**
 * `theme set`'s argument is a stylesheet rather than a name when it ends in
 * `.css` — which a kebab-case theme name cannot. Anything else is a name, and
 * a name with a path in it is still refused as one.
 */
function isThemePath(arg: string): boolean {
  return arg.endsWith(".css");
}

/**
 * A theme stylesheet named by path — what `theme generate --out <dir>` wrote.
 * Name lookup only reaches the default `themes/`, so a theme generated anywhere
 * else was unusable by `theme set` until copied into `tokens/` by hand. The
 * theme's name is the file's, held to the same kebab-case as any other.
 */
async function themeSourceFromPath(arg: string): Promise<ThemeSource> {
  const cwd = process.cwd();
  const path = resolve(cwd, arg);
  if (!existsSync(path)) {
    throw new Error(`Theme stylesheet not found: ${arg}`);
  }
  const name = basename(path, ".css");
  assertThemeName(name, "The stylesheet's file name is the theme's name.");
  const label = isInside(cwd, path) ? relative(cwd, path).split(sep).join("/") : path;
  return { name, path, label, css: await Bun.file(path).text() };
}

async function themeSet(nameOrSource: string | ThemeSource): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    throw new Error(missingConfigMessage(cwd));
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);

  const source =
    typeof nameOrSource === "string"
      ? await findThemeSource(nameOrSource, themeLocations(cwd, config))
      : nameOrSource;
  if (!source) {
    throw new Error(
      `Theme '${nameOrSource}' not found. Run 'faqir theme list' to see available themes, ` +
        `or pass a generated theme's stylesheet: faqir theme set <dir>/${nameOrSource}.css`,
    );
  }
  const name = source.name;

  // Copy theme to output as theme.css
  await copyFile(source.path, join(outputDir, "tokens", "theme.css"));

  // Update config
  config.theme = name;
  await writeConfig(config, cwd);

  // Regenerate bundle if it exists
  const bundlePath = join(outputDir, "faqir.bundle.css");
  if (config.bundle?.auto !== false && existsSync(bundlePath)) {
    await generateBundle(cwd);
    log.step("Bundle regenerated.");
  }

  // `.faqir/context.json` records the active theme, and an agent reads it
  // before it writes markup — refreshed the way `add`/`remove` refresh it, but
  // only where one exists, so `theme set` never creates a file nobody asked for.
  if (existsSync(join(cwd, ".faqir", "context.json"))) {
    await regenerateContext(config, outputDir, cwd);
    log.step("Context refreshed.");
  }

  log.success(`Theme set to '${name}'.`);
  log.dim(`Theme file: ${config.output_dir}/tokens/theme.css  (from ${source.label})`);
  for (const hint of themeSetHints(source.css, themeManifestFor(source))) {
    log.info(hint);
  }
}

async function themeCreate(name: string): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    throw new Error(missingConfigMessage(cwd));
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const themePath = join(outputDir, "tokens", `theme-${name}.css`);

  if (existsSync(themePath)) {
    throw new Error(`Theme '${name}' already exists at ${config.output_dir}/tokens/theme-${name}.css`);
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
  const config = configExists(cwd) ? await readConfig(cwd) : null;
  const activeTheme = config?.theme ?? "default";
  const customThemes = config ? listProjectThemes(join(cwd, config.output_dir)) : [];
  // Shadowed names are listed once, under the location `theme set` resolves.
  const taken = new Set([...registryThemes, ...customThemes]);
  const generatedThemes = listGeneratedThemes(join(cwd, DEFAULT_THEME_OUT_DIR))
    .filter((name) => !taken.has(name));

  const line = (t: string) =>
    config && t === activeTheme ? `  ${"\x1b[32m"}✓ ${t} (active)${"\x1b[0m"}` : `    ${t}`;
  const section = (title: string, themes: string[]) => {
    if (themes.length === 0) return;
    log.blank();
    console.log(`  ${title}:`);
    for (const t of themes) console.log(line(t));
  };

  log.heading(config ? "Themes" : "Available Themes");
  log.blank();
  console.log("  Built-in:");
  for (const t of registryThemes) console.log(line(t));
  section("Custom", customThemes);
  section(`Generated (${DEFAULT_THEME_OUT_DIR}/)`, generatedThemes);

  log.blank();
  if (!config) log.dim("Run 'faqir init --theme <name>' to use a theme.");
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
      if (!name) throw new Error("Theme name required. Usage: faqir theme set <name|path.css>");
      if (isThemePath(name)) {
        await themeSet(await themeSourceFromPath(name));
        break;
      }
      assertThemeName(name, "Usage: faqir theme set <name|path.css>");
      await themeSet(name);
      break;
    }
    case "create": {
      const name = args[1];
      if (!name) throw new Error("Theme name required. Usage: faqir theme create <name>");
      assertThemeName(name, "Usage: faqir theme create <name>");
      await themeCreate(name);
      break;
    }
    case "generate":
      await themeGenerate(args.slice(1));
      break;
    case "bundle":
      await themeBundle(args.slice(1));
      break;
    case "list":
      await themeList();
      break;
    default:
      throw new Error(`Unknown subcommand: ${subcommand}. Run 'faqir theme --help' for available subcommands.`);
  }
}
