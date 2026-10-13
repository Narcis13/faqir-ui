#!/usr/bin/env bun
/**
 * Generate `packages/template/src/registry.js`, the @faqir-ui/template
 * component table of every registry primitive and recipe (docs/template.md
 * §11.1). The table is built from the bindings IR by `src/commands/template.ts`
 * — the same builder `faqir template` runs over a project's installed
 * manifests — so there is one manifest walker, not two.
 *
 * Bun-only (imports the TypeScript builder from `src/`). Run via
 * `bun run build:template-table`, or `--check` to fail when the committed
 * table is stale.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registryTemplateTable, tableModule } from "../src/commands/template";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "packages", "template", "src", "registry.js");
const GENERATOR = "scripts/build-template-table.mjs";

const text = tableModule(await registryTemplateTable(join(ROOT, "registry")), GENERATOR);

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    console.error("✗ packages/template/src/registry.js is missing — run `bun run build:template-table`.");
    process.exit(1);
  }
  if (current !== text) {
    console.error("✗ packages/template/src/registry.js is stale — run `bun run build:template-table` and commit.");
    process.exit(1);
  }
  console.log("✓ Template component table is up to date.");
} else {
  writeFileSync(OUT, text);
  console.log("✓ Wrote packages/template/src/registry.js");
}
