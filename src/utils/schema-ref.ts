// A project's manifests and the schema their `$schema` names (task 1.1F-26).
//
// Every manifest a project holds points its `$schema` at one file, the
// project root's `manifest.schema.json`, by a path relative to the manifest's
// own directory. Registry manifests carry the path from `registry/<layer>/<name>/`
// (`../../../manifest.schema.json`), which is right in a project only when
// `output_dir` is exactly one segment deep. So `faqir add` rewrites the value
// for the directory it installs into, `init` writes the file it points at, and
// `diff`/`upgrade` compare a manifest with its value put back to the
// pristine's, so the rewrite never reads as a local edit.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { getPackageRoot } from "./fs";

/** The schema file every manifest in a project points at, at the project root. */
export const PROJECT_SCHEMA_FILE = "manifest.schema.json";

/**
 * The `$schema` value for a manifest in `manifestDir`: a POSIX path from that
 * directory to the project root's schema, computed exactly the way
 * `scripts/add-schema-refs.mjs` computes it for the registry.
 */
export function schemaRefFor(manifestDir: string, projectRoot: string): string {
  const rel = relative(manifestDir, join(projectRoot, PROJECT_SCHEMA_FILE)).split("\\").join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** True for a component manifest's file name or path. */
export function isManifestPath(path: string): boolean {
  return path.endsWith(".manifest.json");
}

// The first `"$schema": "…"` pair — the property `add-schema-refs.mjs` puts
// first in every manifest. Matched in the text, not parsed and re-serialised,
// so every other byte of the file stays as the registry shipped it.
const SCHEMA_PAIR = /("\$schema"\s*:\s*)"((?:[^"\\]|\\.)*)"/;

/** The `$schema` value in manifest text, or null when it has none. */
export function readSchemaRef(text: string): string | null {
  const m = SCHEMA_PAIR.exec(text);
  return m ? m[2] : null;
}

/** `text` with its `$schema` value replaced by `ref`; unchanged when it has none. */
export function withSchemaRef(text: string, ref: string): string {
  return text.replace(SCHEMA_PAIR, (_, key: string) => `${key}${JSON.stringify(ref)}`);
}

/**
 * `text` with its `$schema` value set to the one `like` carries, so a manifest
 * whose only difference from its pristine copy is the rewritten path compares
 * equal to it. Unchanged when either side has no `$schema`.
 */
export function normalizeSchemaRef(text: string, like: string | null): string {
  if (like === null) return text;
  const ref = readSchemaRef(like);
  return ref === null || readSchemaRef(text) === null ? text : withSchemaRef(text, ref);
}

/**
 * Put the CLI's `manifest.schema.json` at the project root, where every
 * manifest's `$schema` points. Written when the project has none, and
 * refreshed when the one there is a CLI copy (same `$id`) from an older
 * release; a schema file of the project's own is never touched. Returns
 * whether it wrote the file.
 */
export async function ensureProjectSchema(projectRoot: string): Promise<boolean> {
  const source = join(getPackageRoot(), PROJECT_SCHEMA_FILE);
  if (!existsSync(source)) return false;
  const target = join(projectRoot, PROJECT_SCHEMA_FILE);
  const shipped = readFileSync(source, "utf8");
  if (existsSync(target)) {
    const current = readFileSync(target, "utf8");
    if (current === shipped) return false;
    let ours = false;
    try {
      ours = (JSON.parse(current) as { $id?: unknown }).$id === (JSON.parse(shipped) as { $id?: unknown }).$id;
    } catch {
      // Not JSON we wrote — the project's own file.
    }
    if (!ours) return false;
  }
  await Bun.write(target, shipped);
  return true;
}

/**
 * Point the `$schema` of every manifest directly in an installed component's
 * directory at the project root's schema. The files are otherwise left byte
 * for byte as installed.
 */
export async function pointManifestsAtProjectSchema(componentDir: string, projectRoot: string): Promise<void> {
  if (!existsSync(componentDir)) return;
  const ref = schemaRefFor(componentDir, projectRoot);
  for (const name of readdirSync(componentDir)) {
    if (!isManifestPath(name)) continue;
    const path = join(componentDir, name);
    const text = readFileSync(path, "utf8");
    const next = withSchemaRef(text, ref);
    if (next !== text) await Bun.write(path, next);
  }
}
