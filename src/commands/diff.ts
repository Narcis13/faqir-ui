// faqir diff — show a user's drift from the pristine (as-installed) copy of a
// component (task 0.5-04, FAQIR-PLAN §9.3).
//
// The pristine store (.faqir/pristine/, see utils/pristine.ts) holds a byte-exact
// snapshot taken at install time. `diff` compares the working copy under
// `output_dir` against that baseline and reports the drift two ways:
//
//   • human    — standard unified diff, per file, copy-pasteable as a patch.
//   • --json    — a stable `{ schema, components: [...] }` envelope an agent can
//                 consume without parsing patch text (edit counts per file).
//
// When a component has no pristine snapshot (installed before the store existed
// and never re-added) `diff` warns and degrades gracefully — it reports the
// component as having no baseline rather than erroring, and exits 0.

import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig } from "../utils/config";
import { findInstalledLayer, type Layer } from "../utils/components";
import {
  readPristineIndex,
  getPristineEntry,
  readPristineText,
  type PristineEntry,
} from "../utils/pristine";
import { unifiedDiff, diffSummary } from "../utils/diff";

/** Stable schema id for the `--json` envelope. */
const DIFF_JSON_SCHEMA = "faqir-diff@1";

interface FileDrift {
  path: string;
  status: "modified" | "added" | "removed";
  added: number;
  removed: number;
  hunks: number;
}

interface ComponentDrift {
  component: string;
  version: string | null;
  layer: string | null;
  /** Whether a pristine baseline was found for this component. */
  pristine: boolean;
  /** True when the working copy matches the baseline (only meaningful if `pristine`). */
  clean: boolean;
  files: FileDrift[];
  summary: { filesChanged: number; added: number; removed: number };
}

function parseArgs(args: string[]): { components: string[]; json: boolean; help: boolean } {
  const components: string[] = [];
  let json = false;
  let help = false;
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (!arg.startsWith("-")) components.push(arg);
  }
  return { components, json, help };
}

function printHelp(): void {
  log.heading("faqir diff [components...]");
  log.blank();
  console.log("Show how installed components drift from their pristine (as-installed) copy.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir diff button            # unified diff for one component");
  console.log("  faqir diff                   # diff every installed component");
  console.log("  faqir diff button --json     # machine-readable drift summary");
  log.blank();
  console.log("Options:");
  log.table([
    ["--json", "Emit a stable JSON drift summary instead of a unified diff"],
    ["--help", "Show this help"],
  ]);
  log.blank();
  log.dim("The pristine baseline is captured on 'faqir add' under .faqir/pristine/.");
  log.dim("Components added before the store existed backfill a baseline on their next 'faqir add'.");
}

/** All files under an installed component directory, as sorted POSIX paths. */
async function scanInstalledFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const rel of glob.scan({ cwd: dir, onlyFiles: true })) {
    out.push(sep === "/" ? rel : rel.split(sep).join("/"));
  }
  out.sort();
  return out;
}

async function readTextOrEmpty(path: string): Promise<string> {
  if (!existsSync(path)) return "";
  return Bun.file(path).text();
}

/** Compute the drift of one installed component against its pristine baseline. */
async function computeDrift(
  cwd: string,
  outputDir: string,
  component: string,
  layer: Layer,
  entry: PristineEntry | null
): Promise<{ drift: ComponentDrift; patches: string[] }> {
  const installedDir = join(outputDir, layer, component);

  if (!entry) {
    return {
      drift: {
        component,
        version: null,
        layer,
        pristine: false,
        clean: false,
        files: [],
        summary: { filesChanged: 0, added: 0, removed: 0 },
      },
      patches: [],
    };
  }

  const installedFiles = await scanInstalledFiles(installedDir);
  const paths = [...new Set([...entry.files, ...installedFiles])].sort();

  const files: FileDrift[] = [];
  const patches: string[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const rel of paths) {
    const oldText = (await readPristineText(cwd, entry, rel)) ?? "";
    const newText = await readTextOrEmpty(join(installedDir, ...rel.split("/")));
    if (oldText === newText) continue; // unchanged

    const status: FileDrift["status"] =
      oldText === "" ? "added" : newText === "" ? "removed" : "modified";
    const stats = diffSummary(oldText, newText);
    files.push({ path: rel, status, added: stats.added, removed: stats.removed, hunks: stats.hunks });
    totalAdded += stats.added;
    totalRemoved += stats.removed;

    const patch = unifiedDiff(oldText, newText, {
      oldLabel: `a/${rel}`,
      newLabel: `b/${rel}`,
    });
    if (patch) patches.push(patch);
  }

  return {
    drift: {
      component,
      version: entry.version,
      layer,
      pristine: true,
      clean: files.length === 0,
      files,
      summary: { filesChanged: files.length, added: totalAdded, removed: totalRemoved },
    },
    patches,
  };
}

export async function diff(args: string[]): Promise<void> {
  const { components, json, help } = parseArgs(args);

  if (help) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const index = await readPristineIndex(cwd);

  // Resolve the target set: named components, or every installed component.
  const installedAll = [
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ];
  const targets = components.length > 0 ? components : installedAll;

  if (targets.length === 0) {
    if (json) {
      console.log(JSON.stringify({ schema: DIFF_JSON_SCHEMA, components: [] }, null, 2));
    } else {
      log.info("No components installed — nothing to diff.");
    }
    return;
  }

  const drifts: ComponentDrift[] = [];
  const patchOutput: Array<{ component: string; patches: string[] }> = [];

  for (const name of targets) {
    const layer = findInstalledLayer(name, config);
    if (!layer) {
      // An explicitly named, not-installed component is a usage error; when
      // diffing "all" this can't happen (targets come from the installed set).
      log.error(`Component '${name}' is not installed. Run 'faqir list' to see installed components.`);
      process.exit(1);
    }
    const entry = getPristineEntry(index, name);
    const { drift, patches } = await computeDrift(cwd, outputDir, name, layer, entry);
    drifts.push(drift);
    patchOutput.push({ component: name, patches });
  }

  if (json) {
    console.log(JSON.stringify({ schema: DIFF_JSON_SCHEMA, components: drifts }, null, 2));
    return;
  }

  // Human unified-diff report.
  let anyDrift = false;
  for (let i = 0; i < drifts.length; i++) {
    const d = drifts[i];
    if (!d.pristine) {
      log.warn(
        `No pristine baseline for '${d.component}' — added before the pristine store existed. ` +
          `Run 'faqir add ${d.component}' to backfill a baseline, then 'faqir diff ${d.component}'.`
      );
      continue;
    }
    if (d.clean) {
      if (targets.length === 1) log.success(`${d.component} @ ${d.version} — no drift from pristine.`);
      continue;
    }
    anyDrift = true;
    log.heading(
      `${d.component} @ ${d.version} — ${d.summary.filesChanged} file${d.summary.filesChanged === 1 ? "" : "s"} ` +
        `changed (+${d.summary.added} −${d.summary.removed})`
    );
    for (const patch of patchOutput[i].patches) {
      log.blank();
      // Raw patch text — copy-pasteable, no logger decoration.
      process.stdout.write(patch);
    }
  }

  if (!anyDrift && targets.length > 1) {
    log.success("No drift from pristine in any installed component.");
  }
}
