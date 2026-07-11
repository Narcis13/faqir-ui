// Remote registry client (task 0.5-03, FAQIR-PLAN §9.2).
//
// Fetches a `registry-index.json` and component files from any static host and
// verifies every byte against the index's SHA-256 hashes *before* returning
// them to the caller. The caller (src/commands/add.ts) buffers all verified
// files in memory and only writes once every component has been fully
// downloaded and verified — so an integrity failure, a missing file, or a
// network error can never leave a half-installed component on disk.

import {
  REGISTRY_INDEX_FILENAME,
  sha256Hex,
  hashComponentFiles,
  validateRegistryIndex,
  indexToMap,
  type RegistryIndex,
  type RegistryIndexEntry,
} from "./registry-index";
import type { FaqirConfig } from "./config";

/** A `@scope/name` component reference split into its parts. */
export interface ScopedName {
  scope: string; // includes the leading '@', e.g. "@acme"
  name: string;
}

/** A single verified file, ready to be written under the output directory. */
export interface RemoteFile {
  /** Destination path relative to `output_dir` (e.g. `primitives/button/button.css`). */
  destRel: string;
  bytes: Uint8Array;
}

/** Parse `@scope/name` → `{ scope, name }`. Returns null for unscoped names. */
export function parseScopedName(raw: string): ScopedName | null {
  const m = /^@([^/]+)\/(.+)$/.exec(raw);
  if (!m) return null;
  return { scope: `@${m[1]}`, name: m[2] };
}

/**
 * Resolve a scope to its base URL via `config.registries`. Accepts keys written
 * with or without the leading `@`. Returns null when the scope is unknown.
 */
export function resolveRegistryUrl(config: FaqirConfig, scope: string): string | null {
  const registries = config.registries;
  if (!registries) return null;
  const bare = scope.replace(/^@/, "");
  return registries[scope] ?? registries[bare] ?? registries[`@${bare}`] ?? null;
}

/**
 * Normalize a user-supplied registry URL to a base: strip trailing slashes and,
 * as a convenience, a trailing `/registry-index.json` if the user pasted the
 * index URL directly.
 */
export function normalizeBase(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  const suffix = `/${REGISTRY_INDEX_FILENAME}`;
  if (u.endsWith(suffix)) u = u.slice(0, -suffix.length);
  return u;
}

// ── Fetch seam ───────────────────────────────────────────────────────────────
// All network access goes through `activeFetch` so tests can serve a static
// registry fixture without a live socket (Bun's test runtime blocks localhost
// fetch). Production never touches these hooks — `activeFetch` is the global
// `fetch` unless a test overrides it.
type FetchLike = (url: string) => Promise<Response>;
let activeFetch: FetchLike = (url) => fetch(url);

/** Test-only: install a fetch implementation. Returns a restore function. */
export function __setFetchImpl(fn: FetchLike): () => void {
  const prev = activeFetch;
  activeFetch = fn;
  return () => {
    activeFetch = prev;
  };
}

/** Join a base URL with path segments, encoding each segment. */
function joinUrl(base: string, ...parts: string[]): string {
  const encoded = parts.map((p) =>
    p
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/")
  );
  return [base.replace(/\/+$/, ""), ...encoded].join("/");
}

async function fetchOrThrow(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await activeFetch(url);
  } catch (err) {
    throw new Error(`network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res;
}

/** Fetch and validate `registry-index.json` from a registry base URL. */
export async function fetchRegistryIndex(base: string): Promise<RegistryIndex> {
  const url = joinUrl(base, REGISTRY_INDEX_FILENAME);
  const res = await fetchOrThrow(url);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`invalid JSON in registry index at ${url}`);
  }
  const result = validateRegistryIndex(data);
  if (!result.ok) throw new Error(`malformed registry index at ${url}: ${result.error}`);
  return result.index;
}

/**
 * Resolve requested component names against a remote index, transitively
 * pulling dependencies from the *same* index (unless `noDeps`). Throws a clean
 * error if a requested component — or one of its declared dependencies — is not
 * present in the index. Returns entries de-duplicated, requested-first.
 */
export function resolveRemoteTargets(
  map: Map<string, RegistryIndexEntry>,
  requested: string[],
  opts: { noDeps: boolean; base: string }
): RegistryIndexEntry[] {
  for (const name of requested) {
    if (!map.has(name)) {
      throw new Error(`Component '${name}' not found in remote registry ${opts.base}.`);
    }
  }

  const out: RegistryIndexEntry[] = [];
  const seen = new Set<string>();
  const queue = [...requested];

  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    const entry = map.get(name);
    if (!entry) {
      // Reachable only via a dependency edge — a top-level miss threw above.
      throw new Error(
        `Component '${name}' is required as a dependency but is not in remote registry ${opts.base}.`
      );
    }
    seen.add(name);
    out.push(entry);
    if (!opts.noDeps) {
      for (const dep of entry.deps) {
        if (!seen.has(dep)) queue.push(dep);
      }
    }
  }

  return out;
}

/**
 * Download and verify every file of a component. Each file is fetched, its
 * SHA-256 checked against the index, and only the fully-verified set is
 * returned — a single mismatch or missing file throws before any bytes reach
 * the caller. Nothing is written here; the caller decides when (and whether) to
 * commit the verified bytes to disk.
 */
export async function downloadComponent(
  base: string,
  entry: RegistryIndexEntry
): Promise<RemoteFile[]> {
  // Self-consistency: the aggregate hash must match the per-file hashes, so a
  // tampered index that edits a file hash without recomputing the component
  // hash is rejected up front.
  if (hashComponentFiles(entry.files) !== entry.hash) {
    throw new Error(`component '${entry.name}' has an inconsistent index hash (self-check failed)`);
  }

  const files: RemoteFile[] = [];
  for (const file of entry.files) {
    const url = joinUrl(base, entry.layer, entry.name, file.path);
    let res: Response;
    try {
      res = await fetchOrThrow(url);
    } catch (err) {
      throw new Error(
        `missing file '${file.path}' for '${entry.name}': ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const actual = sha256Hex(bytes);
    if (actual !== file.sha256) {
      throw new Error(
        `hash mismatch for '${entry.name}/${file.path}' — expected ${file.sha256.slice(0, 16)}…, got ${actual.slice(0, 16)}…`
      );
    }
    files.push({ destRel: `${entry.layer}/${entry.name}/${file.path}`, bytes });
  }

  return files;
}

export { indexToMap };
export type { RegistryIndex, RegistryIndexEntry };
