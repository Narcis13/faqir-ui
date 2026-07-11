// faqir upgrade — three-way merge a component from its pristine baseline to the
// registry's current version, preserving the user's edits (task 0.5-05, §9.3).
//
// The three sides of the merge are:
//
//   • base   — the pristine, as-installed snapshot (.faqir/pristine/, 0.5-04)
//   • ours   — the user's working copy under output_dir/<layer>/<component>/
//   • theirs — the component as it exists in the registry now (the new version)
//
// Files only one side changed apply cleanly; files both sides changed
// differently are written with standard git conflict markers and reported. The
// changelog (`changes`) between the two versions is printed, breaking entries
// surfaced prominently, before anything is written. On a real (non-dry-run)
// apply the pristine store advances to the new version so the next `diff`/
// `upgrade` measures drift from it.
//
// Exit codes: 0 = clean (or nothing to do), 2 = completed with conflicts that
// need resolution, 1 = usage/setup error. `--json` always emits a stable
// `faqir-upgrade@1` envelope listing every file and conflict.

import { existsSync, rmSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, type FaqirConfig } from "../utils/config";
import { ensureDir, getRegistryPath } from "../utils/fs";
import { findComponentInRegistry, findInstalledLayer, type Layer } from "../utils/components";
import { loadManifest, type Manifest, type ManifestChange } from "../manifest";
import { regenerateContext, regenerateFaqirInit } from "../utils/codegen";
import { generateBundle } from "../utils/bundler";
import {
  readPristineIndex,
  getPristineEntry,
  readPristineText,
  readComponentFiles,
  savePristine,
  pristineEntryDir,
  type PristineIndex,
} from "../utils/pristine";
import { mergeFile, type FileMergeOutcome, type FileMergeStatus } from "../utils/merge";

/** Stable schema id for the `--json` envelope. */
const UPGRADE_JSON_SCHEMA = "faqir-upgrade@1";

/** Exit code used when the upgrade completes but leaves conflict markers. */
const CONFLICT_EXIT_CODE = 2;

type ComponentStatus =
  | "upgraded" // clean three-way merge applied (or would apply)
  | "conflicted" // merged, but one or more files carry conflict markers
  | "up-to-date" // installed version already matches the registry
  | "no-baseline" // predates the pristine store — cannot merge safely
  | "not-in-registry"; // no longer offered by the local registry

interface FileReport {
  path: string;
  status: FileMergeStatus;
  conflicts: number;
  note?: string;
}

interface ComponentReport {
  component: string;
  layer: Layer | null;
  fromVersion: string | null;
  toVersion: string | null;
  status: ComponentStatus;
  changes: ManifestChange[];
  breaking: boolean;
  files: FileReport[];
  conflictedFiles: string[];
  summary: { updated: number; added: number; deleted: number; unchanged: number; conflicts: number };
}

interface UpgradeOptions {
  json: boolean;
  dryRun: boolean;
  help: boolean;
}

interface UpgradeContext {
  cwd: string;
  outputDir: string;
  registryPath: string;
}

function parseArgs(args: string[]): { components: string[]; options: UpgradeOptions } {
  const components: string[] = [];
  const options: UpgradeOptions = { json: false, dryRun: false, help: false };
  for (const arg of args) {
    if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (!arg.startsWith("-")) components.push(arg);
  }
  return { components, options };
}

function printHelp(): void {
  log.heading("faqir upgrade [components...]");
  log.blank();
  console.log("Three-way merge installed components up to the registry's current version,");
  console.log("keeping your edits. Conflicts are written with standard git markers.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir upgrade button           # upgrade one component");
  console.log("  faqir upgrade                  # upgrade every installed component");
  console.log("  faqir upgrade button --dry-run # preview the merge without writing");
  console.log("  faqir upgrade button --json    # machine-readable merge report");
  log.blank();
  console.log("Options:");
  log.table([
    ["--dry-run", "Report the merge (and any conflicts) without writing"],
    ["--json", "Emit a stable JSON report instead of the human summary"],
    ["--help", "Show this help"],
  ]);
  log.blank();
  log.dim("Exit code 2 means the upgrade wrote conflict markers to resolve. Your");
  log.dim("content is always recoverable — nothing is dropped by a merge.");
}

/** All files under a component directory, as sorted POSIX-relative paths. */
async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const glob = new Bun.Glob("**/*");
  for await (const rel of glob.scan({ cwd: dir, onlyFiles: true })) {
    out.push(sep === "/" ? rel : rel.split(sep).join("/"));
  }
  out.sort();
  return out;
}

async function readTextOrNull(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return Bun.file(path).text();
}

/**
 * Numeric-dotted version compare (`1.2.0` vs `1.10.0`), falling back to a string
 * compare when a segment is non-numeric. Enough to order changelog entries and
 * to tell "same version" from "newer/older".
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? "0";
    const sb = pb[i] ?? "0";
    const na = Number(sa);
    const nb = Number(sb);
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      if (sa !== sb) return sa < sb ? -1 : 1;
      continue;
    }
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/** Changelog entries strictly after `fromVersion` and up to `toVersion`. */
function selectChanges(changes: ManifestChange[], fromVersion: string, toVersion: string): ManifestChange[] {
  return changes
    .filter(
      (c) =>
        typeof c?.version === "string" &&
        compareVersions(c.version, fromVersion) > 0 &&
        compareVersions(c.version, toVersion) <= 0
    )
    .sort((x, y) => compareVersions(x.version, y.version));
}

function emptySummary(): ComponentReport["summary"] {
  return { updated: 0, added: 0, deleted: 0, unchanged: 0, conflicts: 0 };
}

/**
 * Plan (and, unless `dryRun`, apply) the three-way merge for one component.
 * Reads base/ours/theirs for every file in the union of their trees, runs
 * {@link mergeFile}, then writes/deletes the working copy and advances the
 * pristine store. Pure planning happens before any write, so a dry run is a
 * faithful preview of the real thing.
 */
async function upgradeComponent(
  name: string,
  config: FaqirConfig,
  ctx: UpgradeContext,
  index: PristineIndex,
  dryRun: boolean
): Promise<ComponentReport> {
  const layer = findInstalledLayer(name, config);
  const base: ComponentReport = {
    component: name,
    layer,
    fromVersion: null,
    toVersion: null,
    status: "up-to-date",
    changes: [],
    breaking: false,
    files: [],
    conflictedFiles: [],
    summary: emptySummary(),
  };

  const entry = getPristineEntry(index, name);
  if (!entry) return { ...base, status: "no-baseline" };
  base.fromVersion = entry.version;

  const found = findComponentInRegistry(name, ctx.registryPath);
  if (!found) return { ...base, status: "not-in-registry" };

  const newManifest = await loadNewManifest(found.path, found.name);
  const newVersion = newManifest?.version ?? entry.version;
  base.toVersion = newVersion;

  if (compareVersions(newVersion, entry.version) === 0) {
    return { ...base, status: "up-to-date" };
  }

  base.changes = selectChanges(newManifest?.changes ?? [], entry.version, newVersion);
  base.breaking = base.changes.some((c) => c.breaking);

  const installedDir = join(ctx.outputDir, found.layer, name);
  const [oursFiles, theirsFiles] = await Promise.all([listFiles(installedDir), listFiles(found.path)]);
  const baseFiles = new Set(entry.files);
  const oursSet = new Set(oursFiles);
  const theirsSet = new Set(theirsFiles);
  const allPaths = [...new Set([...entry.files, ...oursFiles, ...theirsFiles])].sort();

  const markerOpts = {
    oursLabel: "ours",
    baseLabel: `base (${name}@${entry.version})`,
    theirsLabel: `theirs (${name}@${newVersion})`,
  };

  const outcomes: FileMergeOutcome[] = [];
  for (const rel of allPaths) {
    const [baseText, oursText, theirsText] = await Promise.all([
      baseFiles.has(rel) ? readPristineText(ctx.cwd, entry, rel) : Promise.resolve(null),
      oursSet.has(rel) ? readTextOrNull(join(installedDir, ...rel.split("/"))) : Promise.resolve(null),
      theirsSet.has(rel) ? readTextOrNull(join(found.path, ...rel.split("/"))) : Promise.resolve(null),
    ]);
    outcomes.push(mergeFile({ path: rel, base: baseText, ours: oursText, theirs: theirsText }, markerOpts));
  }

  const summary = emptySummary();
  for (const o of outcomes) {
    if (o.status === "conflict") {
      summary.conflicts++;
      base.conflictedFiles.push(o.path);
    } else {
      summary[o.status]++;
    }
    base.files.push({ path: o.path, status: o.status, conflicts: o.conflicts, note: o.note });
  }
  base.summary = summary;
  base.status = base.conflictedFiles.length > 0 ? "conflicted" : "upgraded";

  if (!dryRun) {
    for (const o of outcomes) {
      const dest = join(installedDir, ...o.path.split("/"));
      if (o.action === "write") {
        ensureDir(dirname(dest));
        await Bun.write(dest, o.content ?? "");
      } else if (o.action === "delete") {
        rmSync(dest, { force: true });
      }
    }

    // Advance the pristine baseline to the new version (byte-exact from the
    // registry source), then drop the superseded snapshot directory.
    const oldDir = pristineEntryDir(ctx.cwd, entry);
    const newFiles = await readComponentFiles(found.path);
    await savePristine(ctx.cwd, { name, version: newVersion, layer: found.layer, files: newFiles });
    if (compareVersions(newVersion, entry.version) !== 0) {
      rmSync(oldDir, { recursive: true, force: true });
    }
  }

  return base;
}

/** Load the registry-new manifest for version + changelog (best effort). */
async function loadNewManifest(compPath: string, name: string): Promise<Manifest | null> {
  const manifestPath = join(compPath, `${name}.manifest.json`);
  if (!existsSync(manifestPath)) return null;
  try {
    return await loadManifest(manifestPath);
  } catch {
    return null;
  }
}

// ── Human report ─────────────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function printChangelog(report: ComponentReport): void {
  if (report.changes.length === 0) return;
  if (report.breaking) {
    console.log(`${BOLD}${RED}⚠ BREAKING CHANGES in this upgrade — review before shipping:${RESET}`);
    for (const c of report.changes) {
      if (c.breaking) console.log(`  ${RED}✗ ${c.version}${RESET}  ${c.note}`);
    }
    log.blank();
  }
  log.dim(`Changelog ${report.fromVersion} → ${report.toVersion}:`);
  for (const c of report.changes) {
    const flag = c.breaking ? `${RED}[breaking]${RESET} ` : "";
    console.log(`  • ${c.version}  ${flag}${c.note}`);
  }
}

function printComponentHuman(report: ComponentReport): void {
  switch (report.status) {
    case "no-baseline":
      log.warn(
        `No pristine baseline for '${report.component}' — it predates the store. ` +
          `Run 'faqir add ${report.component}' to backfill a baseline, then upgrade.`
      );
      return;
    case "not-in-registry":
      log.warn(`'${report.component}' is not in the local registry — nothing to upgrade to.`);
      return;
    case "up-to-date":
      log.success(`${report.component} @ ${report.fromVersion} — already up to date.`);
      return;
  }

  log.heading(`${report.component}: ${report.fromVersion} → ${report.toVersion}`);
  printChangelog(report);
  log.blank();

  const s = report.summary;
  log.info(
    `${s.updated} updated · ${s.added} added · ${s.deleted} removed · ${s.unchanged} unchanged · ${s.conflicts} conflicted`
  );

  for (const f of report.files) {
    if (f.status === "unchanged") continue;
    if (f.status === "conflict") {
      console.log(`  ${RED}✗ ${f.path}${RESET}  ${f.note ?? "conflict"} (${f.conflicts} hunk${f.conflicts === 1 ? "" : "s"})`);
    } else {
      log.step(`${f.path} — ${f.status}`);
    }
  }

  if (report.conflictedFiles.length > 0) {
    log.blank();
    log.warn(
      `Resolve the <<<<<<< markers in ${report.conflictedFiles.length} file` +
        `${report.conflictedFiles.length === 1 ? "" : "s"}: ${report.conflictedFiles.join(", ")}`
    );
    log.dim("Every side of a conflict is preserved in the markers — no content was lost.");
  }
}

// ── Command entry ────────────────────────────────────────────────────────────

/**
 * `faqir upgrade [components...]`. The optional `internal.registryPath` seam
 * lets tests point "theirs" at a fixture registry; production always resolves
 * the bundled registry.
 */
export async function upgrade(args: string[], internal?: { registryPath?: string }): Promise<void> {
  const { components, options } = parseArgs(args);

  if (options.help) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const ctx: UpgradeContext = {
    cwd,
    outputDir: join(cwd, config.output_dir),
    registryPath: internal?.registryPath ?? getRegistryPath(),
  };
  const index = await readPristineIndex(cwd);

  const installedAll = [
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ];

  let targets: string[];
  if (components.length > 0) {
    for (const name of components) {
      if (!findInstalledLayer(name, config)) {
        log.error(`Component '${name}' is not installed. Run 'faqir list' to see installed components.`);
        process.exit(1);
      }
    }
    targets = components;
  } else {
    targets = installedAll;
  }

  if (targets.length === 0) {
    if (options.json) {
      console.log(
        JSON.stringify({ schema: UPGRADE_JSON_SCHEMA, dryRun: options.dryRun, components: [], hasConflicts: false }, null, 2)
      );
    } else {
      log.info("No components installed — nothing to upgrade.");
    }
    return;
  }

  const reports: ComponentReport[] = [];
  for (const name of targets) {
    reports.push(await upgradeComponent(name, config, ctx, index, options.dryRun));
  }

  const applied = reports.some((r) => r.status === "upgraded" || r.status === "conflicted");
  const hasConflicts = reports.some((r) => r.status === "conflicted");

  // Regenerate derived artifacts (context, bundle) only from a clean tree —
  // a working copy that still carries conflict markers is invalid JSON/CSS, so
  // rebuilding from it would bake broken output into the bundle. After the user
  // resolves the markers, the next `add`/`bundle` refreshes them.
  if (applied && !options.dryRun && !hasConflicts) {
    await finalize(config, ctx);
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        { schema: UPGRADE_JSON_SCHEMA, dryRun: options.dryRun, components: reports, hasConflicts },
        null,
        2
      )
    );
  } else {
    for (const r of reports) printComponentHuman(r);
    log.blank();
    if (options.dryRun) {
      log.dim("Dry run — no files were written.");
    }
    if (hasConflicts) {
      log.warn("Upgrade completed with conflicts. Resolve the markers above, then re-audit.");
    } else if (applied) {
      log.success("Upgrade complete — no conflicts.");
    }
  }

  if (hasConflicts) process.exit(CONFLICT_EXIT_CODE);
}

/** Regenerate derived artifacts (auto-init, context, bundle) after an apply. */
async function finalize(config: FaqirConfig, ctx: UpgradeContext): Promise<void> {
  if (config.installed.recipes.length > 0 && config.include_core !== false) {
    await regenerateFaqirInit(config, ctx.outputDir);
  }
  await regenerateContext(config, ctx.outputDir, ctx.cwd);
  const bundlePath = join(ctx.outputDir, "faqir.bundle.css");
  if (config.bundle?.auto !== false && existsSync(bundlePath)) {
    await generateBundle(ctx.cwd);
  }
}
