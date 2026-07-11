#!/usr/bin/env bun
/**
 * Add (or refresh) a `$schema` reference on every registry manifest — component
 * (`*.manifest.json`) and theme (`*.theme.json`) — pointing at the published
 * `manifest.schema.json` (task 0.5-07). Editors resolve it for completion and
 * validation; CI resolves it via the schema-validation test.
 *
 * The reference is a path relative to each file, so it works at any depth. The
 * key is inserted as the first property to preserve the manifests' hand-authored
 * formatting (blank-line sections) — no wholesale reserialization. Idempotent:
 * re-running only rewrites files whose `$schema` value changed.
 *
 * Run via `bun scripts/add-schema-refs.mjs` (or `--check` for a CI drift gate).
 */
import { Glob } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(ROOT, "manifest.schema.json");
const checkOnly = process.argv.includes("--check");

/** Relative POSIX path from a manifest file to manifest.schema.json. */
function schemaRefFor(file) {
  let rel = relative(dirname(file), SCHEMA).split("\\").join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

/**
 * Insert or update the `$schema` key as the first property, without touching the
 * rest of the file's formatting. Returns the new text (or the original if the
 * value already matches).
 */
function withSchemaRef(text, ref) {
  const line = `  "$schema": ${JSON.stringify(ref)},`;
  if (/^\s*"\$schema"\s*:/m.test(text)) {
    return text.replace(/^\s*"\$schema"\s*:\s*"[^"]*",?/m, line);
  }
  // Insert right after the opening brace of the object.
  return text.replace(/^(\{\s*\n)/, `$1${line}\n`);
}

const files = [];
for (const pattern of ["registry/**/*.manifest.json", "registry/themes/*.theme.json"]) {
  const glob = new Glob(pattern);
  for await (const rel of glob.scan({ cwd: ROOT })) files.push(join(ROOT, rel));
}
files.sort();

let changed = 0;
const stale = [];
for (const file of files) {
  const original = readFileSync(file, "utf8");
  const updated = withSchemaRef(original, schemaRefFor(file));
  if (updated !== original) {
    changed++;
    if (checkOnly) stale.push(relative(ROOT, file));
    else writeFileSync(file, updated);
  }
}

if (checkOnly) {
  if (stale.length > 0) {
    console.error(`✗ ${stale.length} manifest(s) missing an up-to-date $schema — run \`bun scripts/add-schema-refs.mjs\`.`);
    for (const p of stale) console.error(`   - ${p}`);
    process.exit(1);
  }
  console.log(`✓ All ${files.length} manifests carry an up-to-date $schema.`);
  process.exit(0);
}

console.log(`✓ Ensured $schema on ${files.length} manifests (${changed} updated).`);
