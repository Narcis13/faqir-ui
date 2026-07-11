#!/usr/bin/env bun
/**
 * Generate `registry/registry-index.json` from the local registry (task 0.5-03,
 * FAQIR-PLAN §9.2).
 *
 * The index is the single manifest a static host serves so that any third party
 * can distribute Faqir components with **no server logic** — just a folder of
 * files. It is content-addressed (per-file + per-component SHA-256) and
 * deterministic: regenerating without changing a file leaves the bytes
 * identical, so a drift check is a plain string compare.
 *
 * Bun-only (imports the TypeScript builder from `src/`). Run via
 * `bun run build:registry-index`, or `--check` to fail when the committed index
 * is stale (suitable for CI).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistryIndex, serializeRegistryIndex, REGISTRY_INDEX_FILENAME } from "../src/utils/registry-index";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "registry");
const OUT = join(REGISTRY, REGISTRY_INDEX_FILENAME);

const checkOnly = process.argv.includes("--check");

const index = buildRegistryIndex(REGISTRY);
const serialized = serializeRegistryIndex(index);

if (checkOnly) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    console.error(`✗ ${REGISTRY_INDEX_FILENAME} is missing — run \`bun run build:registry-index\`.`);
    process.exit(1);
  }
  if (current !== serialized) {
    console.error(`✗ ${REGISTRY_INDEX_FILENAME} is stale — run \`bun run build:registry-index\` and commit.`);
    process.exit(1);
  }
  console.log(`✓ ${REGISTRY_INDEX_FILENAME} is up to date (${index.count} components).`);
  process.exit(0);
}

writeFileSync(OUT, serialized);
console.log(`✓ Wrote ${REGISTRY_INDEX_FILENAME} — ${index.count} components.`);
