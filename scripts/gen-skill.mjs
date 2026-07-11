#!/usr/bin/env bun
/**
 * Regenerate the shipped `.claude/skills/faqir-creator` skill from the registry
 * manifests (task 0.5-07, FAQIR-PLAN §8.2) — the dogfood step: the skill Faqir
 * ships is produced by the same manifest-derived pipeline projects use.
 *
 * Output is deterministic (no timestamps), so regenerating without a manifest
 * change leaves the bytes identical. `--check` fails when the committed skill is
 * stale, gating CI. Run via `bun run gen:skill` (or `--check`).
 *
 * Bun-only (imports the TypeScript generator from `src/`).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateShippedSkillFiles, shippedSkillDir } from "../src/generator/skill";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const files = await generateShippedSkillFiles();
const dir = shippedSkillDir();

if (checkOnly) {
  const stale = [];
  for (const f of files) {
    const abs = join(dir, f.relPath);
    let current = "";
    try {
      current = readFileSync(abs, "utf8");
    } catch {
      stale.push(f.relPath);
      continue;
    }
    if (current !== f.content) stale.push(f.relPath);
  }
  if (stale.length > 0) {
    console.error(`✗ Shipped faqir-creator skill is stale — run \`bun run gen:skill\` and commit.`);
    for (const p of stale) console.error(`   - ${p}`);
    process.exit(1);
  }
  console.log(`✓ Shipped faqir-creator skill is up to date (${files.length} files).`);
  process.exit(0);
}

for (const f of files) {
  const abs = join(dir, f.relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, f.content);
  console.log(`✓ Wrote ${relative(ROOT, abs)}`);
}
