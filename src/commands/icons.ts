// faqir add icons [--only a,b,c] — install the icon primitive, optionally
// subsetting `icons.css` to just the glyphs a project uses (task 0.4-05 · §B4).
//
// Routed here from `faqir add` when the first argument is the plural `icons`
// (the singular `icon` is the ordinary registry component and installs the full
// sheet). With `--only`, we emit a trimmed `icons.css` + a matching subset
// `icon.manifest.json` (so the `icon-name` audit rule validates against exactly
// what's installed) + a trimmed reference page. Re-running `--only` with a
// different set MERGES: the new glyphs are unioned with those already installed.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { copyDir, ensureDir, getRegistryPath } from "../utils/fs";
import { regenerateContext } from "../utils/codegen";
import {
  buildSubsetReferenceHtml,
  iconNamesFromCss,
  subsetIconManifest,
  subsetIconsCss,
  validateIconNames,
} from "../utils/icons";

interface IconsOptions {
  only: string[];
  dryRun: boolean;
}

function parseArgs(args: string[]): IconsOptions {
  const options: IconsOptions = { only: [], dryRun: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--only": {
        const val = args[++i];
        if (val) options.only.push(...splitNames(val));
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        // Support `--only=a,b,c` and bare positional names.
        if (arg.startsWith("--only=")) {
          options.only.push(...splitNames(arg.slice("--only=".length)));
        } else if (!arg.startsWith("-")) {
          options.only.push(...splitNames(arg));
        }
    }
  }

  return options;
}

/** Split a `check,x, chevron-down` value into trimmed, non-empty names. */
function splitNames(value: string): string[] {
  return value
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function printHelp() {
  log.heading("faqir add icons [--only <names>]");
  log.blank();
  console.log("Install the icon primitive, optionally trimming icons.css to a subset.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir add icons                          # full icon set (all glyphs)");
  console.log("  faqir add icons --only check,x,chevron-down");
  log.blank();
  console.log("Options:");
  log.table([
    ["--only <names>", "Comma-separated icon names to include (repeatable)"],
    ["--dry-run", "Show what would be written without writing"],
  ]);
  log.blank();
  log.dim("Re-running --only with a different set merges: new glyphs are added to the installed subset.");
}

/** Human-readable byte size, e.g. 1741 → "1.70 KB". */
function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(2)} KB`;
}

export async function addIcons(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const iconOutDir = join(outputDir, "primitives", "icon");
  const registryIconDir = join(getRegistryPath(), "primitives", "icon");

  // No --only → install the full icon set, same as `faqir add icon`.
  if (options.only.length === 0) {
    return installFullIconSet({ config, cwd, outputDir, iconOutDir, registryIconDir, dryRun: options.dryRun });
  }

  // Load the authoritative full artifacts shipped with the CLI.
  const fullCss = await Bun.file(join(registryIconDir, "icons.css")).text();
  const fullManifest = (await Bun.file(join(registryIconDir, "icon.manifest.json")).json()) as Record<string, any>;
  const catalog = iconNamesFromCss(fullCss);

  // Validate requested names; unknown ones abort with nearest-match hints.
  const { valid, unknown } = validateIconNames(options.only, catalog);
  if (unknown.length > 0) {
    for (const u of unknown) {
      const hint = u.suggestion ? ` — did you mean "${u.suggestion}"?` : "";
      log.error(`Unknown icon "${u.name}"${hint}`);
    }
    if (unknown.every((u) => !u.suggestion)) {
      log.dim(`Run 'faqir inspect icon' to see all ${catalog.length} available icon names.`);
    }
    process.exit(1);
  }

  // Merge with any already-installed subset (re-run adds, never clobbers).
  const existingCssPath = join(iconOutDir, "icons.css");
  const existingNames = existsSync(existingCssPath)
    ? iconNamesFromCss(await Bun.file(existingCssPath).text())
    : [];
  const finalNames = [...new Set([...existingNames, ...valid])].sort();
  const added = valid.filter((n) => !existingNames.includes(n));

  // Regenerate all three artifacts from the full registry sheet + the merged set.
  const css = subsetIconsCss(fullCss, finalNames);
  const manifest = subsetIconManifest(fullManifest, finalNames);
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const html = buildSubsetReferenceHtml(finalNames, fullManifest.icon_set ?? {});
  const license = await Bun.file(join(registryIconDir, "LICENSE.lucide")).text();

  if (options.dryRun) {
    log.heading("Dry run — would write:");
    log.step(`${iconOutDir}/icons.css (${formatBytes(Buffer.byteLength(css))}, ${finalNames.length} glyph(s))`);
    log.step(`${iconOutDir}/icon.manifest.json`);
    log.step(`${iconOutDir}/icon.html`);
    log.step(`${iconOutDir}/LICENSE.lucide`);
    log.blank();
    log.info(existingNames.length > 0
      ? `Merges ${added.length} new glyph(s) into ${existingNames.length} already installed → ${finalNames.length} total.`
      : `Installs ${finalNames.length} glyph(s).`);
    return;
  }

  ensureDir(iconOutDir);
  await Bun.write(join(iconOutDir, "icons.css"), css);
  await Bun.write(join(iconOutDir, "icon.manifest.json"), manifestJson);
  await Bun.write(join(iconOutDir, "icon.html"), html);
  await Bun.write(join(iconOutDir, "LICENSE.lucide"), license);

  if (!config.installed.primitives.includes("icon")) {
    config.installed.primitives.push("icon");
    config.installed.primitives.sort();
  }
  await writeConfig(config, cwd);
  await regenerateContext(config, outputDir, cwd);

  log.heading(existingNames.length > 0 ? "Updated icon subset" : "Installed icon subset");
  if (existingNames.length > 0) {
    log.success(`Added ${added.length} glyph(s) — ${finalNames.length} total in icons.css.`);
    if (added.length === 0) log.dim("(all requested glyphs were already installed)");
  } else {
    log.success(`icons.css → ${finalNames.length} glyph(s) (${formatBytes(Buffer.byteLength(css))}).`);
  }
  log.step(`primitives/icon/ — icons.css, icon.manifest.json, icon.html, LICENSE.lucide`);
}

/** Install the complete icon primitive (all glyphs), mirroring `faqir add icon`. */
async function installFullIconSet(ctx: {
  config: Awaited<ReturnType<typeof readConfig>>;
  cwd: string;
  outputDir: string;
  iconOutDir: string;
  registryIconDir: string;
  dryRun: boolean;
}): Promise<void> {
  const { config, cwd, outputDir, iconOutDir, registryIconDir, dryRun } = ctx;

  if (dryRun) {
    log.heading("Dry run — would install the full icon set:");
    log.step(`${iconOutDir}/ (icons.css, icon.manifest.json, icon.html, LICENSE.lucide)`);
    log.dim("Tip: pass --only <names> to trim icons.css to just the glyphs you use.");
    return;
  }

  await copyDir(registryIconDir, iconOutDir);

  if (!config.installed.primitives.includes("icon")) {
    config.installed.primitives.push("icon");
    config.installed.primitives.sort();
  }
  await writeConfig(config, cwd);
  await regenerateContext(config, outputDir, cwd);

  log.heading("Installed the full icon set");
  log.success("icon → primitives/icon/");
  log.dim("Tip: 'faqir add icons --only check,x,…' trims icons.css to just the glyphs you use.");
}
