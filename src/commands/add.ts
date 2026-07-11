import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig, type FaqirConfig } from "../utils/config";
import { copyDir, ensureDir, getRegistryPath } from "../utils/fs";
import { loadManifest, type Manifest } from "../manifest";
import { findComponentInRegistry, listRegistryComponents, type Layer } from "../utils/components";
import { regenerateFaqirInit, regenerateContext } from "../utils/codegen";
import { generateBundle } from "../utils/bundler";
import { readPristineIndex, savePristine, readComponentFiles } from "../utils/pristine";
import { addIcons } from "./icons";
import {
  parseScopedName,
  resolveRegistryUrl,
  normalizeBase,
  fetchRegistryIndex,
  resolveRemoteTargets,
  downloadComponent,
  indexToMap,
  type RemoteFile,
  type RegistryIndexEntry,
} from "../utils/remote-registry";

interface AddOptions {
  all: boolean;
  layer: Layer | null;
  dryRun: boolean;
  noDeps: boolean;
  /** Explicit remote registry base URL (`--registry <url>`), or null for local. */
  registry: string | null;
}

function parseArgs(args: string[]): { components: string[]; options: AddOptions } {
  const components: string[] = [];
  const options: AddOptions = {
    all: false,
    layer: null,
    dryRun: false,
    noDeps: false,
    registry: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--all":
        options.all = true;
        break;
      case "--layer": {
        const val = args[++i];
        if (val === "primitives" || val === "recipes" || val === "patterns") {
          options.layer = val;
        } else {
          log.error(`Invalid layer: ${val}. Must be: primitives, recipes, patterns`);
          process.exit(1);
        }
        break;
      }
      case "--registry": {
        const val = args[++i];
        if (!val || val.startsWith("-")) {
          log.error("--registry requires a URL, e.g. --registry https://ui.example.com/registry");
          process.exit(1);
        }
        options.registry = val;
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-deps":
        options.noDeps = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (!args[i].startsWith("-")) {
          components.push(args[i]);
        }
    }
  }

  return { components, options };
}

function printHelp() {
  log.heading("faqir add <components...>");
  log.blank();
  console.log("Add one or more components to the project.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir add button card input");
  console.log("  faqir add --all");
  console.log("  faqir add --layer primitives");
  console.log("  faqir add icons --only check,x,chevron-down   # subset the icon set");
  console.log("  faqir add button --registry https://ui.example.com/registry");
  console.log("  faqir add @acme/data-grid                      # via registries map");
  log.blank();
  console.log("Options:");
  log.table([
    ["--all", "Add all components"],
    ["--layer <name>", "Add all from a layer (primitives|recipes|patterns)"],
    ["--registry <url>", "Fetch from a remote registry (SHA-256 verified)"],
    ["--dry-run", "Show what would be added without writing"],
    ["--no-deps", "Don't auto-install dependencies"],
  ]);
  log.blank();
  log.dim("Run 'faqir add icons --help' for icon-subsetting options.");
  log.dim("Scoped names like @scope/name resolve through the 'registries' map in faqir.config.json.");
}

async function getDependencies(manifest: Manifest): Promise<string[]> {
  return manifest.composition?.contains || [];
}

/** Read a component's manifest version, defaulting to `0.0.0` (mirrors registry-index). */
async function readManifestVersion(manifestPath: string): Promise<string> {
  if (!existsSync(manifestPath)) return "0.0.0";
  try {
    const m = await loadManifest(manifestPath);
    return typeof m.version === "string" && m.version.length > 0 ? m.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Snapshot a component's pristine copy from its local registry source, so
 * `faqir diff`/`faqir upgrade` have a byte-exact baseline. Used both for fresh
 * installs and for backfilling components that predate the pristine store.
 */
async function snapshotFromRegistry(
  comp: { name: string; layer: Layer; path: string },
  cwd: string,
  backfilled = false
): Promise<void> {
  const version = await readManifestVersion(join(comp.path, `${comp.name}.manifest.json`));
  const files = await readComponentFiles(comp.path);
  await savePristine(cwd, { name: comp.name, version, layer: comp.layer, files, backfilled });
}

/**
 * Backfill story: components installed before the pristine store existed get a
 * snapshot on their next `add` — captured from the *current* registry source
 * and flagged `backfilled` (it may not match the exact bytes they first
 * installed). Each backfill warns, so the approximate baseline is never silent.
 */
async function backfillLocalPristine(
  resolved: { name: string; layer: Layer; path: string }[],
  alreadyInstalled: Set<string>,
  cwd: string
): Promise<void> {
  const index = await readPristineIndex(cwd);
  const done = new Set<string>();
  for (const comp of resolved) {
    if (!alreadyInstalled.has(comp.name)) continue; // fresh installs snapshot elsewhere
    if (index.components[comp.name] || done.has(comp.name)) continue;
    done.add(comp.name);
    await snapshotFromRegistry(comp, cwd, true);
    log.warn(
      `No pristine snapshot for '${comp.name}' — captured one from the registry as the upgrade baseline ` +
        `(it may differ from your original install; run 'faqir diff ${comp.name}' to review).`
    );
  }
}

/**
 * Shared post-install step for both the local and remote flows: sort the
 * installed lists, persist the config, regenerate the auto-init and context
 * files, and refresh the CSS bundle when one exists.
 */
async function finalizeInstall(config: FaqirConfig, cwd: string, outputDir: string): Promise<void> {
  config.installed.primitives.sort();
  config.installed.recipes.sort();
  config.installed.patterns.sort();

  await writeConfig(config, cwd);

  // Regenerate auto-init faqir.js if any recipes are installed
  if (config.installed.recipes.length > 0 && config.include_core !== false) {
    await regenerateFaqirInit(config, outputDir);
  }

  // Regenerate .faqir/context.json
  await regenerateContext(config, outputDir, cwd);

  // Auto-bundle if bundle file exists
  const bundlePath = join(outputDir, "faqir.bundle.css");
  if (config.bundle?.auto !== false && existsSync(bundlePath)) {
    await generateBundle(cwd);
    log.step("Bundle regenerated.");
  }
}

export async function add(args: string[]): Promise<void> {
  // The plural `icons` target subsets the icon primitive (`--only …`); the
  // singular `icon` is the ordinary registry component. Delegate before the
  // generic component resolution below, which has no "icons" entry.
  if (args[0] === "icons") {
    return addIcons(args.slice(1));
  }

  const { components, options } = parseArgs(args);
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);

  // Remote mode is entered only when a registry is explicitly named — either via
  // `--registry <url>` or a scoped `@scope/name`. Plain `faqir add button` with
  // no `--registry` never touches the network and stays byte-identical.
  const remoteMode = options.registry !== null || components.some((c) => c.startsWith("@"));
  if (remoteMode) {
    return addRemote(components, options, config, cwd, outputDir);
  }

  return addLocal(components, options, config, cwd, outputDir);
}

async function addLocal(
  components: string[],
  options: AddOptions,
  config: FaqirConfig,
  cwd: string,
  outputDir: string
): Promise<void> {
  const registryPath = getRegistryPath();

  // Determine which components to add
  let toAdd: string[] = [];

  if (options.all) {
    toAdd = listRegistryComponents(registryPath);
  } else if (options.layer) {
    toAdd = listRegistryComponents(registryPath, options.layer);
  } else {
    if (components.length === 0) {
      log.error("No components specified. Usage: faqir add <component...>");
      log.dim("Run 'faqir add --help' for options.");
      process.exit(1);
    }
    toAdd = components;
  }

  // Validate all requested components exist in registry
  const resolved: { name: string; layer: Layer; path: string }[] = [];
  for (const name of toAdd) {
    const found = findComponentInRegistry(name, registryPath);
    if (!found) {
      log.error(`Component '${name}' not found in registry.`);
      log.dim("Run 'faqir list' to see available components.");
      process.exit(1);
    }
    // `found.name` is the canonical component (aliases like `alert` resolve to
    // `callout`), so components install and register under their real name.
    if (found.name !== name) {
      log.info(`'${name}' is an alias of '${found.name}' — adding '${found.name}'.`);
    }
    resolved.push(found);
  }

  // Resolve dependencies
  if (!options.noDeps) {
    const allInstalled = new Set([
      ...config.installed.primitives,
      ...config.installed.recipes,
      ...config.installed.patterns,
      ...resolved.map((r) => r.name),
    ]);

    const depsToAdd: { name: string; layer: Layer; path: string }[] = [];

    for (const comp of resolved) {
      const manifestPath = join(comp.path, `${comp.name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      const manifest = await loadManifest(manifestPath);
      const deps = await getDependencies(manifest);

      for (const dep of deps) {
        if (!allInstalled.has(dep)) {
          const found = findComponentInRegistry(dep, registryPath);
          if (found) {
            depsToAdd.push(found);
            allInstalled.add(found.name);
          }
        }
      }
    }

    if (depsToAdd.length > 0) {
      log.info(`Auto-adding dependencies: ${depsToAdd.map((d) => d.name).join(", ")}`);
      resolved.push(...depsToAdd);
    }
  }

  // Filter out already installed
  const alreadyInstalled = new Set([
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ]);

  const toInstall = resolved.filter((r) => !alreadyInstalled.has(r.name));

  // Dry run — never writes, so no pristine snapshot or backfill either.
  if (options.dryRun) {
    if (toInstall.length === 0) {
      log.info("All requested components are already installed.");
      return;
    }
    log.heading("Dry run — would add:");
    for (const comp of toInstall) {
      log.step(`${comp.layer}/${comp.name}`);
    }
    return;
  }

  // Backfill pristine snapshots for already-installed components that predate
  // the store, so `faqir diff`/`faqir upgrade` have a baseline going forward.
  await backfillLocalPristine(resolved, alreadyInstalled, cwd);

  if (toInstall.length === 0) {
    log.info("All requested components are already installed.");
    return;
  }

  // Install components
  log.heading(`Adding ${toInstall.length} component${toInstall.length > 1 ? "s" : ""}`);

  for (const comp of toInstall) {
    const destDir = join(outputDir, comp.layer, comp.name);
    await copyDir(comp.path, destDir);

    // Update config
    if (!config.installed[comp.layer].includes(comp.name)) {
      config.installed[comp.layer].push(comp.name);
    }

    // Snapshot the pristine copy (byte-exact from the registry source).
    await snapshotFromRegistry(comp, cwd);

    log.success(`${comp.name} → ${comp.layer}/${comp.name}/`);
  }

  await finalizeInstall(config, cwd, outputDir);

  log.blank();
  log.success(`Done! Added ${toInstall.length} component${toInstall.length > 1 ? "s" : ""}.`);
}

/**
 * Group the requested targets by the remote registry they come from. With an
 * explicit `--registry <url>` there is a single group (scoped names have their
 * scope stripped). Otherwise every name must be scoped and is grouped by the
 * base URL its scope resolves to.
 */
interface RemoteGroup {
  base: string;
  label: string;
  names: string[];
}

function planRemoteGroups(
  components: string[],
  options: AddOptions,
  config: FaqirConfig
): RemoteGroup[] {
  if (options.registry) {
    const base = normalizeBase(options.registry);
    const names = components.map((c) => parseScopedName(c)?.name ?? c);
    return [{ base, label: options.registry, names }];
  }

  if (options.all || options.layer) {
    log.error("--all and --layer require an explicit --registry <url>.");
    process.exit(1);
  }

  const byBase = new Map<string, RemoteGroup>();
  for (const c of components) {
    const scoped = parseScopedName(c);
    if (!scoped) {
      log.error(`'${c}' has no registry. Use a scoped name (e.g. @scope/${c}) or pass --registry <url>.`);
      process.exit(1);
    }
    const url = resolveRegistryUrl(config, scoped.scope);
    if (!url) {
      const known = Object.keys(config.registries ?? {});
      log.error(`Unknown registry scope '${scoped.scope}'.`);
      if (known.length > 0) {
        log.dim(`Known scopes: ${known.join(", ")}`);
      } else {
        log.dim(
          `Add it to faqir.config.json, e.g. { "registries": { "${scoped.scope}": "https://ui.example.com/registry" } }`
        );
      }
      process.exit(1);
    }
    const base = normalizeBase(url);
    const group = byBase.get(base) ?? { base, label: `${scoped.scope} (${url})`, names: [] };
    group.names.push(scoped.name);
    byBase.set(base, group);
  }
  return [...byBase.values()];
}

async function addRemote(
  components: string[],
  options: AddOptions,
  config: FaqirConfig,
  cwd: string,
  outputDir: string
): Promise<void> {
  if (components.length === 0 && !options.all && !options.layer) {
    log.error("No components specified. Usage: faqir add <component...> --registry <url>");
    process.exit(1);
  }

  const groups = planRemoteGroups(components, options, config);

  const alreadyInstalled = new Set([
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ]);

  // Buffer everything before touching disk. An integrity failure, a missing
  // file, or a bad index aborts here — nothing has been written yet, so the
  // project is never left with a half-installed component.
  const plannedWrites: RemoteFile[] = [];
  const toInstall: RegistryIndexEntry[] = [];
  const plannedNames = new Set<string>();

  for (const group of groups) {
    let index;
    try {
      index = await fetchRegistryIndex(group.base);
    } catch (err) {
      log.error(`Could not load registry index from ${group.base}: ${message(err)}`);
      process.exit(1);
    }
    const map = indexToMap(index);

    let requested: string[];
    if (options.registry && options.all) {
      requested = index.components.map((e) => e.name);
    } else if (options.registry && options.layer) {
      requested = index.components.filter((e) => e.layer === options.layer).map((e) => e.name);
    } else {
      requested = group.names;
    }

    let resolved: RegistryIndexEntry[];
    try {
      resolved = resolveRemoteTargets(map, requested, { noDeps: options.noDeps, base: group.base });
    } catch (err) {
      log.error(message(err));
      log.dim("Run 'faqir list' or inspect the registry's registry-index.json for available components.");
      process.exit(1);
    }

    for (const entry of resolved) {
      if (alreadyInstalled.has(entry.name) || plannedNames.has(entry.name)) continue;
      try {
        const files = await downloadComponent(group.base, entry);
        plannedWrites.push(...files);
        toInstall.push(entry);
        plannedNames.add(entry.name);
      } catch (err) {
        log.error(`Integrity check failed for '${entry.name}' from ${group.base}: ${message(err)}`);
        log.dim("No files were written — the install was aborted before any change to disk.");
        process.exit(1);
      }
    }
  }

  if (toInstall.length === 0) {
    log.info("All requested components are already installed.");
    return;
  }

  if (options.dryRun) {
    log.heading("Dry run — would add (remote):");
    for (const entry of toInstall) {
      log.step(`${entry.layer}/${entry.name}  (${entry.hash.slice(0, 12)}…)`);
    }
    return;
  }

  // Every file is verified — commit the buffered bytes to disk.
  log.heading(`Adding ${toInstall.length} component${toInstall.length > 1 ? "s" : ""} from remote registry`);

  for (const write of plannedWrites) {
    const dest = join(outputDir, write.destRel);
    ensureDir(dirname(dest));
    await Bun.write(dest, write.bytes);
  }

  for (const entry of toInstall) {
    if (!config.installed[entry.layer].includes(entry.name)) {
      config.installed[entry.layer].push(entry.name);
    }

    // Snapshot the pristine copy from the already-verified bytes — the same
    // buffer that was just committed to disk, so it is byte-exact to the host.
    const prefix = `${entry.layer}/${entry.name}/`;
    const files = plannedWrites
      .filter((w) => w.destRel.startsWith(prefix))
      .map((w) => ({ path: w.destRel.slice(prefix.length), bytes: w.bytes }));
    await savePristine(cwd, { name: entry.name, version: entry.version, layer: entry.layer, files });

    log.success(`${entry.name} → ${entry.layer}/${entry.name}/`);
  }

  await finalizeInstall(config, cwd, outputDir);

  log.blank();
  log.success(`Done! Added ${toInstall.length} component${toInstall.length > 1 ? "s" : ""} from remote registry.`);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
