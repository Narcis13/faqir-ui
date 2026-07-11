// Remote registry protocol (task 0.5-03, FAQIR-PLAN §9.2).
//
// `registry-index.json` is the single manifest a static host serves so that any
// third party can distribute Faqir components with **no server logic** — just a
// folder of files. This module defines the format and the deterministic,
// content-addressed generator that produces it from a local registry.
//
// The index is content-addressed: every file carries its own SHA-256, and every
// component carries an aggregate hash derived from its files. A remote install
// verifies each downloaded byte against these hashes *before* anything is
// written to disk (see remote-registry.ts), so an integrity failure can never
// leave a half-installed component. Node-safe on purpose — only `sha256Hex`,
// `hashComponentFiles`, `validateRegistryIndex`, and `indexToMap` are used by
// the compiled CLI's fetch path; `buildRegistryIndex` (Bun.Glob + fs) is used
// only by the generator script and tests.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import type { Layer } from "./components";

/** Filename served at the registry root that lists every hosted component. */
export const REGISTRY_INDEX_FILENAME = "registry-index.json";

/** Format identifier — bumped only on a breaking change to the index shape. */
export const REGISTRY_INDEX_SCHEMA = "faqir-registry-index@1";

/** The three installable layers, in the order they appear in the index. */
const LAYERS: Layer[] = ["primitives", "recipes", "patterns"];

/** One file of a component: path relative to the component directory + its hash. */
export interface RegistryIndexFile {
  /** POSIX-relative path within the component directory (e.g. `button.css`). */
  path: string;
  /** Lowercase hex SHA-256 of the file's raw bytes. */
  sha256: string;
}

/** One component as advertised by a registry index. */
export interface RegistryIndexEntry {
  name: string;
  /** Manifest `kind`: primitive | recipe | pattern | scaffold. */
  kind: string;
  /** Registry directory the component installs into. */
  layer: Layer;
  version: string;
  /** Every file needed to reproduce the component, byte-for-byte. */
  files: RegistryIndexFile[];
  /** Aggregate SHA-256 over the component's files (a stable component id). */
  hash: string;
  /** Direct component dependencies (manifest `composition.contains`). */
  deps: string[];
}

/** The whole `registry-index.json` document. */
export interface RegistryIndex {
  schema: string;
  count: number;
  components: RegistryIndexEntry[];
}

/** Lowercase hex SHA-256 of a byte buffer. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Aggregate component hash: a SHA-256 over the component's files, ordered by
 * path so the result is independent of filesystem or download order. Two
 * components with identical file contents produce identical hashes.
 */
export function hashComponentFiles(files: RegistryIndexFile[]): string {
  const h = createHash("sha256");
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const f of sorted) {
    h.update(f.path);
    h.update("\0");
    h.update(f.sha256);
    h.update("\n");
  }
  return h.digest("hex");
}

/** Comparator producing a stable POSIX-path ordering. */
function byPath(a: RegistryIndexFile, b: RegistryIndexFile): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * Every file in a component directory (recursive), each with its SHA-256.
 * Scans the whole directory — not just the manifest's declared `files` — so the
 * index always reproduces a component byte-identically to a local `copyDir`
 * (e.g. `icon` ships a `LICENSE.lucide` the manifest never lists).
 */
function scanComponentFiles(compDir: string): RegistryIndexFile[] {
  const files: RegistryIndexFile[] = [];
  const glob = new Bun.Glob("**/*");
  for (const rel of glob.scanSync({ cwd: compDir, onlyFiles: true })) {
    const path = sep === "/" ? rel : rel.split(sep).join("/");
    files.push({ path, sha256: sha256Hex(readFileSync(join(compDir, rel))) });
  }
  files.sort(byPath);
  return files;
}

/**
 * Build a complete, deterministic registry index from a local registry path.
 * Components are emitted in layer order (primitives → recipes → patterns), then
 * by name; files within each component are path-sorted. Serializing the result
 * twice yields byte-identical output.
 */
export function buildRegistryIndex(registryPath: string): RegistryIndex {
  const components: RegistryIndexEntry[] = [];

  for (const layer of LAYERS) {
    const layerPath = join(registryPath, layer);
    if (!existsSync(layerPath)) continue;

    const names: string[] = [];
    const glob = new Bun.Glob("*/");
    for (const dir of glob.scanSync({ cwd: layerPath, onlyFiles: false })) {
      names.push(dir.replace(/\/$/, ""));
    }
    names.sort();

    for (const name of names) {
      const compDir = join(layerPath, name);
      const manifestPath = join(compDir, `${name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      let manifest: {
        kind?: unknown;
        version?: unknown;
        composition?: { contains?: unknown };
      };
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        continue; // A component with an unparseable manifest is not distributable.
      }

      const files = scanComponentFiles(compDir);
      const contains = manifest.composition?.contains;
      components.push({
        name,
        kind: typeof manifest.kind === "string" ? manifest.kind : "primitive",
        layer,
        version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
        files,
        hash: hashComponentFiles(files),
        deps: Array.isArray(contains) ? contains.filter((d): d is string => typeof d === "string") : [],
      });
    }
  }

  return { schema: REGISTRY_INDEX_SCHEMA, count: components.length, components };
}

/** Canonical, deterministic serialization (2-space indent, trailing newline). */
export function serializeRegistryIndex(index: RegistryIndex): string {
  return JSON.stringify(index, null, 2) + "\n";
}

/** Index the components of a (possibly remote) registry index by name. */
export function indexToMap(index: RegistryIndex): Map<string, RegistryIndexEntry> {
  const map = new Map<string, RegistryIndexEntry>();
  for (const entry of index.components) map.set(entry.name, entry);
  return map;
}

/**
 * Structurally validate a parsed, untrusted registry index (as fetched from a
 * third-party host). Returns the typed index on success or a human-readable
 * reason on failure — never throws.
 */
export function validateRegistryIndex(
  data: unknown
): { ok: true; index: RegistryIndex } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "not a JSON object" };
  }
  const d = data as Record<string, unknown>;
  if (typeof d.schema !== "string") {
    return { ok: false, error: "missing 'schema' string" };
  }
  if (!Array.isArray(d.components)) {
    return { ok: false, error: "missing 'components' array" };
  }

  const validLayers = new Set<string>(LAYERS);
  for (let i = 0; i < d.components.length; i++) {
    const e = d.components[i] as Record<string, unknown>;
    const where = `components[${i}]`;
    if (typeof e !== "object" || e === null) return { ok: false, error: `${where} is not an object` };
    if (typeof e.name !== "string" || e.name.length === 0) return { ok: false, error: `${where}.name missing` };
    if (typeof e.layer !== "string" || !validLayers.has(e.layer)) {
      return { ok: false, error: `${where}.layer must be one of ${[...validLayers].join(", ")}` };
    }
    if (typeof e.hash !== "string") return { ok: false, error: `${where}.hash missing` };
    if (!Array.isArray(e.files) || e.files.length === 0) {
      return { ok: false, error: `${where}.files must be a non-empty array` };
    }
    for (let j = 0; j < e.files.length; j++) {
      const f = e.files[j] as Record<string, unknown>;
      if (typeof f !== "object" || f === null || typeof f.path !== "string" || typeof f.sha256 !== "string") {
        return { ok: false, error: `${where}.files[${j}] must have string 'path' and 'sha256'` };
      }
    }
    if (e.deps !== undefined && !Array.isArray(e.deps)) {
      return { ok: false, error: `${where}.deps must be an array when present` };
    }
  }

  return { ok: true, index: data as unknown as RegistryIndex };
}
