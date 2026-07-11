// Pristine store — the clean, as-installed copy of every component (task 0.5-04,
// FAQIR-PLAN §9.3).
//
// When `faqir add` installs a component it also snapshots a byte-exact copy of
// its files under `.faqir/pristine/{name}@{version}/`. That snapshot is the
// baseline `faqir diff` compares the user's working copy against, and the
// "old" side of the three-way merge `faqir upgrade` will perform (0.5-05).
//
// The store is *versioned*: `pristine.json` at the store root carries a schema
// id (`faqir-pristine@1`). Future format changes bump the id, and readers that
// see an unknown schema degrade gracefully (treat the store as empty) rather
// than crashing — so an old snapshot can never break a newer CLI. The store
// lives inside the git-ignored `.faqir/` directory: it is a local reproducible
// cache, rebuilt from the registry on the next `add`/`upgrade` if absent.
//
// Layout:
//
//   .faqir/pristine/
//   ├── pristine.json                # { schema, components: { <name>: entry } }
//   ├── button@1.0.0/
//   │   ├── button.css
//   │   ├── button.html
//   │   └── button.manifest.json
//   └── card@1.0.0/
//       └── …

import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { ensureDir } from "./fs";

/** Schema id for the pristine store format. Bumped only on a breaking change. */
export const PRISTINE_STORE_SCHEMA = "faqir-pristine@1";

/** One component's current pristine snapshot, as recorded in `pristine.json`. */
export interface PristineEntry {
  /** Manifest version the snapshot was taken from. */
  version: string;
  /** Layer the component installs into (primitives | recipes | patterns). */
  layer: string;
  /** Snapshot directory name relative to the store root, e.g. `button@1.0.0`. */
  dir: string;
  /** Component-relative POSIX file paths captured in the snapshot (sorted). */
  files: string[];
  /** True when the snapshot was a backfill (approximate baseline, not original install). */
  backfilled?: boolean;
}

/** The whole `pristine.json` document. */
export interface PristineIndex {
  schema: string;
  components: Record<string, PristineEntry>;
}

/** A single file to snapshot: component-relative path + raw bytes. */
export interface PristineFile {
  /** POSIX-relative path within the component directory (e.g. `button.css`). */
  path: string;
  bytes: Uint8Array;
}

/** Absolute path to the pristine store root under a project. */
export function pristineRoot(cwd: string): string {
  return join(cwd, ".faqir", "pristine");
}

function indexPath(cwd: string): string {
  return join(pristineRoot(cwd), "pristine.json");
}

/** Absolute directory a component's snapshot lives in. */
export function pristineComponentDir(cwd: string, name: string, version: string): string {
  return join(pristineRoot(cwd), `${name}@${version}`);
}

/** Absolute directory of an already-recorded snapshot entry. */
export function pristineEntryDir(cwd: string, entry: PristineEntry): string {
  return join(pristineRoot(cwd), entry.dir);
}

function emptyIndex(): PristineIndex {
  return { schema: PRISTINE_STORE_SCHEMA, components: {} };
}

/**
 * Read `pristine.json`. Missing file, unparseable JSON, or an unrecognized
 * schema all degrade to an empty index — a corrupt or future-format store is
 * treated as "no baseline" rather than an error, so callers keep working.
 */
export async function readPristineIndex(cwd: string): Promise<PristineIndex> {
  const p = indexPath(cwd);
  if (!existsSync(p)) return emptyIndex();
  try {
    const data = (await Bun.file(p).json()) as Partial<PristineIndex>;
    if (
      data &&
      typeof data === "object" &&
      data.schema === PRISTINE_STORE_SCHEMA &&
      data.components &&
      typeof data.components === "object"
    ) {
      return { schema: data.schema, components: data.components as Record<string, PristineEntry> };
    }
  } catch {
    // fall through
  }
  return emptyIndex();
}

async function writePristineIndex(cwd: string, index: PristineIndex): Promise<void> {
  ensureDir(pristineRoot(cwd));
  await Bun.write(indexPath(cwd), JSON.stringify(index, null, 2) + "\n");
}

/** Look up the current snapshot for a component, or null when none exists. */
export function getPristineEntry(index: PristineIndex, name: string): PristineEntry | null {
  return index.components[name] ?? null;
}

/**
 * Write a component's pristine snapshot (byte-exact) and record it in the index.
 * The bytes are written verbatim, so the snapshot is byte-equal to its source
 * (the registry component, or the verified remote payload). Re-snapshotting the
 * same name replaces its index entry and points it at the new version's dir.
 */
export async function savePristine(
  cwd: string,
  comp: { name: string; version: string; layer: string; files: PristineFile[]; backfilled?: boolean }
): Promise<void> {
  const dir = pristineComponentDir(cwd, comp.name, comp.version);
  const captured: string[] = [];
  for (const file of comp.files) {
    const dest = join(dir, ...file.path.split("/"));
    ensureDir(dirname(dest));
    await Bun.write(dest, file.bytes);
    captured.push(file.path);
  }
  captured.sort();

  const index = await readPristineIndex(cwd);
  index.schema = PRISTINE_STORE_SCHEMA;
  index.components[comp.name] = {
    version: comp.version,
    layer: comp.layer,
    dir: `${comp.name}@${comp.version}`,
    files: captured,
    ...(comp.backfilled ? { backfilled: true } : {}),
  };
  await writePristineIndex(cwd, index);
}

/**
 * Read every file in a component directory (recursive) as raw bytes, ready to
 * hand to {@link savePristine}. Paths are POSIX-normalized and sorted, so the
 * snapshot is reproducible regardless of filesystem scan order.
 */
export async function readComponentFiles(dir: string): Promise<PristineFile[]> {
  const files: PristineFile[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const rel of glob.scan({ cwd: dir, onlyFiles: true })) {
    const path = sep === "/" ? rel : rel.split(sep).join("/");
    const bytes = new Uint8Array(await Bun.file(join(dir, rel)).arrayBuffer());
    files.push({ path, bytes });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

/** Read a snapshotted file's text, or null when it is not in the snapshot. */
export async function readPristineText(
  cwd: string,
  entry: PristineEntry,
  relPath: string
): Promise<string | null> {
  const abs = join(pristineEntryDir(cwd, entry), ...relPath.split("/"));
  if (!existsSync(abs)) return null;
  return Bun.file(abs).text();
}
