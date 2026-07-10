#!/usr/bin/env bun
/**
 * Registry self-audit — permanent CI gate (task 0.3-12; rule shipped in 0.3-09,
 * registry remediated in 0.3-10). See FAQIR-PLAN §10.4.
 *
 * Runs the framework's own audit rule engine over every stylesheet in
 * `registry/**` — the same `buildLogicalPropertyResults` that `faqir audit` runs
 * per installed component CSS — and fails the build on a single finding.
 *
 * Today the gate enforces the `logical-properties` rule: any physical,
 * direction-bound property (margin-left, padding-right, left/right offsets,
 * border-*-left/right*, physical corner radii, text-align: left|right)
 * reintroduced into registry CSS outside an explicit `[dir=…]` escape hatch
 * breaks right-to-left locales, so it must be zero. Fix offenders with
 * `faqir repair`, or scope them under `[dir="ltr"|"rtl"]`.
 *
 * Bun-only: imports the TypeScript rule engine from `src/`. Run via
 * `bun run audit:registry` (or `bun scripts/registry-audit.mjs`).
 */
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLogicalPropertyResults } from "../src/audit/checker";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "registry");

const cssFiles = [...new Glob("**/*.css").scanSync(REGISTRY)].sort();

const offenders = [];
for (const rel of cssFiles) {
  const css = readFileSync(join(REGISTRY, rel), "utf8");
  for (const r of buildLogicalPropertyResults(css, basename(rel, ".css"), rel)) {
    offenders.push(`  ${rel}:${r.line} — ${r.message}`);
  }
}

console.log(`▶ Registry self-audit — logical-properties over registry/**/*.css`);
console.log(`  scanned ${cssFiles.length} stylesheet(s)`);

if (offenders.length > 0) {
  console.error(`\n✗ ${offenders.length} finding(s) — physical, direction-bound CSS in the registry:`);
  console.error(offenders.join("\n"));
  console.error(
    `\nFix with \`faqir repair\`, or scope under an explicit [dir="ltr"|"rtl"] block.`,
  );
  process.exit(1);
}

console.log(`✓ Zero findings — registry CSS is fully logical (RTL-safe).`);
