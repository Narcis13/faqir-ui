// Locators + loader for the published `manifest.schema.json` (task 0.5-07).
//
// The schema lives at the package root beside `registry/`. It is the single
// source of truth for the schema version stamped into generated artifacts (the
// skill generation header) and the target the CI-gating manifest-validation
// test loads.

import { join } from "node:path";
import { getPackageRoot } from "./fs";

/** Absolute path to the published manifest JSON Schema. */
export function manifestSchemaPath(): string {
  return join(getPackageRoot(), "manifest.schema.json");
}

/** Load and parse the published manifest JSON Schema. */
export async function loadManifestSchema(): Promise<Record<string, unknown>> {
  return (await Bun.file(manifestSchemaPath()).json()) as Record<string, unknown>;
}

let cachedVersion: string | null = null;

/**
 * The `schema_version` the published schema declares (e.g. `"1.0.0"`). Cached
 * after first read. This is the value stamped into every generated skill so a
 * regeneration is provably tied to a schema revision.
 */
export async function getSchemaVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  const schema = await loadManifestSchema();
  cachedVersion = typeof schema.schema_version === "string" ? schema.schema_version : "0";
  return cachedVersion;
}
