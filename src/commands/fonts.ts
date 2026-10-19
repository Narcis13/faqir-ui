// faqir fonts list|add|remove — self-hosted OFL families (task 1.1A-18, §5.5).
//
//   faqir fonts list                             the curated catalog
//   faqir fonts add fraunces --role heading      download, verify, install
//   faqir fonts add inter --role body --role ui  one family, two roles
//   faqir fonts remove fraunces                  take it back out
//
// The bytes are downloaded once, here, verified against the SHA-256 pinned in
// `src/fonts/catalog.ts`, and written into the project. No page ever asks a
// third-party host for type: see the catalog's header for why that is the
// stance, and `src/fonts/install.ts` for how `fonts.css` is produced.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig, missingConfigMessage } from "../utils/config";
import { ensureDir } from "../utils/fs";
import { emitJSON, isJSONMode } from "../utils/json-output";
import { TOKEN_FILES_ORDERED, generateBundle } from "../utils/bundler";
import { axesFromCss } from "../theme/axes";
import type { Axis } from "../theme/seed";
import {
  FONT_CATALOG,
  familyBytes,
  findFamily,
  isSingleWeight,
  italicFiles,
  roleStack,
  staticWeights,
  type CatalogEntry,
  type FontRole,
} from "../fonts/catalog";
import {
  FONTS_CSS_FILENAME,
  FONTS_DIR,
  ROLE_ORDER,
  ROLE_TOKENS,
  assignRoles,
  downloadFamily,
  fontFilePath,
  isManagedFontsCss,
  normalizeInstalled,
  removeFamily,
  renderFontsCss,
  type InstalledFont,
} from "../fonts/install";

/** The `--json` payload's schema version for every `fonts` subcommand. */
export const FONTS_JSON_VERSION = 1;

/**
 * Whether this invocation wants JSON.
 *
 * Read from the subcommand's own arguments as well as from the armed CLI mode,
 * so the command behaves identically whether it was dispatched by `src/index.ts`
 * (which arms JSON mode before dispatch) or called in-process by a test — the
 * same reason `diff` and `upgrade` parse the flag themselves.
 */
function wantsJSON(args: string[]): boolean {
  return args.includes("--json") || isJSONMode();
}

function printHelp(): void {
  log.heading("faqir fonts <subcommand>");
  log.blank();
  console.log("Install self-hosted, hash-verified OFL font families.");
  log.blank();
  console.log("Subcommands:");
  log.table([
    ["list", "Show the curated catalog with roles, classes and sizes"],
    ["add <family> [--role <r>] [--italic]", "Download, verify and install a family"],
    ["remove <family>", "Remove a family and its files"],
  ]);
  log.blank();
  console.log("Roles:");
  log.table([
    ...ROLE_ORDER.map((role): [string, string] => [role, `sets ${ROLE_TOKENS[role]}`]),
    ["none", "sets no token: @font-face rules only, for your own font-family"],
  ]);
  log.blank();
  console.log("Examples:");
  console.log("  faqir fonts list");
  console.log("  faqir fonts add fraunces --role heading");
  console.log("  faqir fonts add inter --role body --role ui");
  console.log("  faqir fonts add instrument-serif --role none");
  console.log("  faqir fonts add source-serif-4 --role body --italic");
  console.log("  faqir fonts remove fraunces");
  log.blank();
  log.dim(
    "Repeat --role to point one family at several tokens; omit it and the family's " +
      "first catalogued role is used. A role has exactly one family, so assigning " +
      "one takes it off whoever held it.",
  );
  const uprightOnly = FONT_CATALOG.filter((entry) => italicFiles(entry).length === 0);
  log.dim(
    "--italic also installs the family's true-italic faces, hash-pinned like the upright " +
      "ones, so <em> is drawn rather than slanted by the browser" +
      (uprightOnly.length > 0
        ? `; ${uprightOnly.map((entry) => entry.family).join(", ")} ship upright only ` +
          "(`fonts list` marks the families that have italics)."
        : "."),
  );
  log.dim("No Google Fonts link: the WOFF2 files are downloaded once and served by your project.");
}

/** The number each heading voice class draws at (`HEADING_WEIGHTS`, resolved). */
const VOICE_WEIGHTS: Record<Axis<"type.voice.weight">, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
};

/**
 * The active theme's heading voice weight, read from the project's installed
 * `tokens/theme.css` over its base token files — the same derivation
 * `theme-manifest`'s axes use. Null when the project carries no theme file or
 * it cannot be read; the caller then warns without naming a number.
 */
export function headingVoiceWeight(
  outputDir: string,
): { voice: Axis<"type.voice.weight">; weight: number } | null {
  const tokensDir = join(outputDir, "tokens");
  const themePath = join(tokensDir, "theme.css");
  if (!existsSync(themePath)) return null;
  try {
    const base = ["index.css", ...TOKEN_FILES_ORDERED]
      .map((file) => join(tokensDir, file))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path, "utf8"));
    const voice = axesFromCss(readFileSync(themePath, "utf8"), base).type.voice?.weight;
    return voice ? { voice, weight: VOICE_WEIGHTS[voice] } : null;
  } catch {
    return null;
  }
}

/**
 * What a single-weight family costs, said once at install time (forecraft
 * upstream note 18). Only a static family with exactly one weight warns: a
 * variable family draws every weight in its range, and a 400/700 static pair
 * never reaches synthesis for a heading voice.
 */
export function weightWarnings(
  entry: CatalogEntry,
  roles: readonly FontRole[],
  heading: { voice: string; weight: number } | null,
): string[] {
  if (!isSingleWeight(entry)) return [];
  const only = staticWeights(entry)![0];
  const textRoles = roles.filter((role) => role !== "heading");
  if (roles.includes("heading") && !roles.includes("body") && !roles.includes("ui")) {
    if (heading && heading.weight === only) return [];
    const asked = heading
      ? `the active theme draws headings at ${heading.weight} (${heading.voice})`
      : "a heading voice heavier than that is drawn at it";
    return [
      `${entry.family} ships one weight (${only}) and ${asked} — fonts.css sets ` +
        `font-synthesis-weight: none, so headings render at ${only} instead of a synthesized bold. ` +
        `For the theme's weight, pick a variable heading family or a theme with a regular heading voice.`,
    ];
  }
  if (textRoles.length > 0) {
    return [
      `${entry.family} ships one weight (${only}): bold ${textRoles.join("/")} text set in it ` +
        `is synthesized by the browser.`,
    ];
  }
  if (roles.length === 0) {
    return [
      `${entry.family} ships one weight (${only}): where you set it, add ` +
        `font-synthesis-weight: none if a heavier weight should not be synthesized.`,
    ];
  }
  return [];
}

/** Human-readable byte size, matching `faqir add icons`. */
function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

interface FontsArgs {
  family: string | null;
  roles: FontRole[];
  /** `--role none`: install the faces, point no role token at them. */
  noRole: boolean;
  /** `--italic`: install the family's true-italic faces too. */
  italic: boolean;
}

function parseArgs(args: string[], subcommand: string): FontsArgs {
  const parsed: FontsArgs = { family: null, roles: [], noRole: false, italic: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--role" || arg.startsWith("--role=")) {
      const value = arg.startsWith("--role=") ? arg.slice("--role=".length) : args[++i];
      if (!value) throw new Error("--role requires a value.");
      for (const role of value.split(",").map((part) => part.trim()).filter(Boolean)) {
        if (role === "none") {
          parsed.noRole = true;
          continue;
        }
        if (!(ROLE_ORDER as readonly string[]).includes(role)) {
          throw new Error(`Unknown role '${role}'. Roles are: ${ROLE_ORDER.join(", ")}, or none.`);
        }
        if (!parsed.roles.includes(role as FontRole)) parsed.roles.push(role as FontRole);
      }
      if (parsed.noRole && parsed.roles.length > 0) {
        throw new Error("--role none cannot be combined with another role.");
      }
      continue;
    }
    if (arg === "--italic" && subcommand === "add") {
      parsed.italic = true;
      continue;
    }
    if (arg === "--json") continue;
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option '${arg}'. Run 'faqir fonts --help'.`);
    }
    if (parsed.family) {
      throw new Error(`Unexpected argument '${arg}'. Usage: faqir fonts ${subcommand} <family>`);
    }
    parsed.family = arg;
  }

  return parsed;
}

/** Resolve a family name against the catalog, failing with the near misses. */
function resolveFamily(name: string): CatalogEntry {
  const entry = findFamily(name);
  if (entry) return entry;
  const needle = name.trim().toLowerCase();
  const near = FONT_CATALOG.filter(
    (candidate) =>
      candidate.id.includes(needle) || candidate.family.toLowerCase().includes(needle),
  ).map((candidate) => candidate.id);
  throw new Error(
    `Unknown font family '${name}'.` +
      (near.length > 0
        ? ` Did you mean ${near.join(", ")}?`
        : " Run 'faqir fonts list' for the sixteen catalogued families."),
  );
}

async function fontsList(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const installed = configExists(cwd)
    ? normalizeInstalled((await readConfig(cwd)).fonts ?? [])
    : [];
  const roleOf = (id: string) => installed.find((font) => font.id === id)?.roles ?? [];

  if (wantsJSON(args)) {
    emitJSON({
      fonts_schema_version: FONTS_JSON_VERSION,
      families: FONT_CATALOG.map((entry) => ({
        id: entry.id,
        family: entry.family,
        license: entry.license,
        license_url: entry.licenseUrl,
        class: entry.class,
        roles: entry.roles,
        variable: entry.variable,
        fallback: entry.fallback,
        bytes: familyBytes(entry),
        files: entry.files.map((file) => ({
          file: file.file,
          subset: file.subset,
          weight: file.weight,
          bytes: file.bytes,
          sha256: file.sha256,
          url: file.url,
        })),
        // Additive (fonts_schema_version stays 1): the pinned true-italic faces
        // `--italic` installs, empty where the catalog has none for the family.
        italics: italicFiles(entry).map((file) => ({
          file: file.file,
          subset: file.subset,
          weight: file.weight,
          bytes: file.bytes,
          sha256: file.sha256,
          url: file.url,
        })),
        single_weight: isSingleWeight(entry),
        installed: installed.some((font) => font.id === entry.id),
        installed_roles: roleOf(entry.id),
      })),
    });
    return;
  }

  log.heading(`Font catalog — ${FONT_CATALOG.length} families, all SIL Open Font License`);
  log.blank();
  log.table(
    FONT_CATALOG.map((entry): [string, string] => {
      const roles = roleOf(entry.id);
      const mark = roles.length > 0
        ? ` ✓ installed as ${roles.join(" + ")}`
        : installed.some((font) => font.id === entry.id)
          ? " ✓ installed, no role"
          : "";
      const shape = entry.variable
        ? "variable"
        : isSingleWeight(entry)
          ? `static, one weight (${staticWeights(entry)![0]})`
          : "static";
      const italics = italicFiles(entry).length > 0 ? ", italics with --italic" : "";
      return [
        entry.id,
        `${entry.family} — ${entry.class}, suits ${entry.roles.join("/")}, ` +
          `${shape}${italics}, ${formatBytes(familyBytes(entry))}${mark}`,
      ];
    }),
  );
  log.blank();
  log.dim("faqir fonts add <id> --role heading   installs one, hash-verified, into your project.");
}

/**
 * Refuse to touch a `fonts.css` the CLI did not write.
 *
 * The stylesheet is rendered whole from the install list, so both `add` and
 * `remove` replace it — which would silently destroy a hand-written one. The
 * managed header is what tells the two apart.
 */
async function assertRewritable(cssPath: string, outputDirLabel: string): Promise<void> {
  if (!existsSync(cssPath)) return;
  if (isManagedFontsCss(await Bun.file(cssPath).text())) return;
  throw new Error(
    `${outputDirLabel}/${FONTS_CSS_FILENAME} was not written by 'faqir fonts' ` +
      `(it is missing the managed header) — refusing to overwrite it. Move it aside first.`,
  );
}

async function fontsAdd(args: string[]): Promise<void> {
  const cwd = process.cwd();
  if (!configExists(cwd)) {
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  const parsed = parseArgs(args, "add");
  if (!parsed.family) {
    throw new Error("Family name required. Usage: faqir fonts add <family> [--role <role>]");
  }
  const entry = resolveFamily(parsed.family);

  // No `--role` takes the family's primary catalogued role, which is the one a
  // reader of `fonts list` would pick anyway; `--role none` takes no role.
  const roles: FontRole[] = parsed.noRole
    ? []
    : parsed.roles.length > 0
      ? parsed.roles
      : [entry.roles[0]];
  const unsuited = roles.filter((role) => !entry.roles.includes(role));

  // Refused before any download: an italic the catalog has no pin for cannot
  // be verified, and installing it unverified is the one thing `fonts` never does.
  if (parsed.italic && italicFiles(entry).length === 0) {
    throw new Error(
      `${entry.family} has no italic faces pinned in this catalog — its upstream ` +
        `package ships upright only, and 'faqir fonts list' shows the families that ` +
        `have italics. Install it without --italic.`,
    );
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const cssPath = join(outputDir, FONTS_CSS_FILENAME);

  await assertRewritable(cssPath, config.output_dir);

  // Download and verify everything BEFORE touching the project: a bad hash or a
  // dead URL must leave no files, no stylesheet and no config change.
  const downloaded = await downloadFamily(entry, { italic: parsed.italic });

  // A displaced family that ends up holding no role leaves the install list but
  // keeps its files: `remove` is what deletes bytes, so a mis-aimed `add` is
  // recoverable without a second download.
  const result = assignRoles(config.fonts ?? [], entry, roles, { italic: parsed.italic });
  const held = result.fonts.find((font) => font.id === entry.id)?.roles ?? [];
  ensureDir(join(outputDir, FONTS_DIR, entry.id));
  for (const { file, bytes } of downloaded) {
    await Bun.write(fontFilePath(outputDir, entry.id, file.file), bytes);
  }
  await Bun.write(cssPath, renderFontsCss(result.fonts));

  config.fonts = result.fonts;
  await writeConfig(config, cwd);

  // The bundle inlines fonts.css after the theme, so a stale bundle would show
  // none of this.
  const bundlePath = config.bundle?.output
    ? join(cwd, config.bundle.output)
    : join(outputDir, "faqir.bundle.css");
  const rebundled = config.bundle?.auto !== false && existsSync(bundlePath);
  if (rebundled) await generateBundle(cwd);

  const payload = {
    fonts_schema_version: FONTS_JSON_VERSION,
    installed: {
      id: entry.id,
      family: entry.family,
      license: entry.license,
      roles,
      italic: parsed.italic,
      files: downloaded.map(({ file }) => `${FONTS_DIR}/${entry.id}/${file.file}`),
      bytes: downloaded.reduce((total, { bytes }) => total + bytes.byteLength, 0),
      stack: roleStack(entry),
    },
    tokens: roles.map((role) => ROLE_TOKENS[role]),
    stylesheet: `${config.output_dir}/${FONTS_CSS_FILENAME}`,
    displaced: result.displaced.map(([role, id]) => ({ role, id })),
    fonts: result.fonts,
    bundle_regenerated: rebundled,
    warnings: [
      ...unsuited.map(
        (role) =>
          `${entry.family} is catalogued for ${entry.roles.join("/")}, not ${role} — installed anyway.`,
      ),
      ...weightWarnings(entry, held, headingVoiceWeight(outputDir)),
    ],
  };

  if (wantsJSON(args)) {
    emitJSON(payload);
    return;
  }

  for (const warning of payload.warnings) log.warn(warning);
  log.success(
    `Installed ${entry.family} (${entry.license}) ` +
      `${roles.length > 0 ? `as ${roles.join(" + ")}` : "with no role (@font-face rules only)"} — ` +
      `${formatBytes(payload.installed.bytes)} in ${downloaded.length} file(s).`,
  );
  for (const file of payload.installed.files) log.step(`${config.output_dir}/${file}`);
  log.step(`${config.output_dir}/${FONTS_CSS_FILENAME}`);
  for (const role of roles) log.dim(`${ROLE_TOKENS[role]}: ${roleStack(entry)}`);
  if (roles.length === 0) log.dim(`font-family: ${roleStack(entry)};   — wherever you want it`);
  for (const { role, id } of payload.displaced) {
    log.dim(`${ROLE_TOKENS[role as FontRole]} moved off ${id}; 'faqir fonts remove ${id}' deletes its files.`);
  }
  if (rebundled) log.step("Bundle regenerated.");
  else log.dim(`Link ${config.output_dir}/${FONTS_CSS_FILENAME} after your theme, or run 'faqir bundle'.`);
}

async function fontsRemove(args: string[]): Promise<void> {
  const cwd = process.cwd();
  if (!configExists(cwd)) {
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  const parsed = parseArgs(args, "remove");
  if (!parsed.family) {
    throw new Error("Family name required. Usage: faqir fonts remove <family>");
  }
  const entry = resolveFamily(parsed.family);

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const remaining = removeFamily(config.fonts ?? [], entry.id);
  if (!remaining) {
    throw new Error(`${entry.family} is not installed. Run 'faqir fonts list' to see what is.`);
  }

  const cssPath = join(outputDir, FONTS_CSS_FILENAME);
  await assertRewritable(cssPath, config.output_dir);
  const css = renderFontsCss(remaining);
  if (css) {
    await Bun.write(cssPath, css);
  } else if (existsSync(cssPath)) {
    // An empty stylesheet would still be inlined by the bundler, and a `fonts.css`
    // with no `@font-face` in it is a puzzle for the next reader.
    rmSync(cssPath);
  }
  rmSync(join(outputDir, FONTS_DIR, entry.id), { recursive: true, force: true });
  if (remaining.length === 0) {
    rmSync(join(outputDir, FONTS_DIR), { recursive: true, force: true });
  }

  config.fonts = remaining;
  if (remaining.length === 0) delete config.fonts;
  await writeConfig(config, cwd);

  const bundlePath = config.bundle?.output
    ? join(cwd, config.bundle.output)
    : join(outputDir, "faqir.bundle.css");
  const rebundled = config.bundle?.auto !== false && existsSync(bundlePath);
  if (rebundled) await generateBundle(cwd);

  if (wantsJSON(args)) {
    emitJSON({
      fonts_schema_version: FONTS_JSON_VERSION,
      removed: entry.id,
      fonts: remaining,
      stylesheet: css ? `${config.output_dir}/${FONTS_CSS_FILENAME}` : null,
      bundle_regenerated: rebundled,
    });
    return;
  }

  log.success(`Removed ${entry.family} and its files.`);
  log.step(
    css
      ? `${config.output_dir}/${FONTS_CSS_FILENAME} rewritten — ` +
          `${remaining.length} famil${remaining.length === 1 ? "y" : "ies"} left`
      : `${config.output_dir}/${FONTS_CSS_FILENAME} deleted (no families left)`,
  );
  if (rebundled) log.step("Bundle regenerated.");
}

export async function fonts(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  // `faqir fonts --json` (the shape the universal --json meta-test runs) has no
  // subcommand, so it prints help into the envelope like `faqir theme` does.
  const subcommand = args[0];
  if (subcommand === "--json") {
    printHelp();
    return;
  }

  switch (subcommand) {
    case "list":
      await fontsList(args.slice(1));
      break;
    case "add":
      await fontsAdd(args.slice(1));
      break;
    case "remove":
      await fontsRemove(args.slice(1));
      break;
    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      log.dim("Run 'faqir fonts --help' for available subcommands.");
      process.exit(1);
  }
}

export type { InstalledFont };
