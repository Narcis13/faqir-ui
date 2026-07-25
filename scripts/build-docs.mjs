#!/usr/bin/env bun
/**
 * Build the documentation site (task 0.7-13, FAQIR-PLAN §13).
 *
 * A thin writer around `src/generator/docs.ts`: the generator produces every file
 * in memory, this script clears the output directory and writes them. There is no
 * bundler, no template engine, and no runtime build — the output is plain HTML +
 * one stylesheet, servable by any static file server.
 *
 * Usage:
 *   bun run build:docs                  → site/dist
 *   bun run build:docs -- --out <dir>   → somewhere else
 *   bun run build:docs -- --check       → fail if the output is missing/stale
 *
 * Deterministic (no timestamps, sorted traversal), so `--check` is a real drift
 * gate and re-running the build twice changes nothing on disk.
 *
 * Bun-only (imports the TypeScript generator from `src/`).
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocsSite } from "../src/generator/docs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const outIndex = argv.indexOf("--out");
const outDir = resolve(ROOT, outIndex >= 0 ? argv[outIndex + 1] : join("site", "dist"));

const files = buildDocsSite();

if (checkOnly) {
  const stale = [];
  for (const f of files) {
    const abs = join(outDir, f.path);
    if (!existsSync(abs) || readFileSync(abs, "utf8") !== f.content) stale.push(f.path);
  }
  if (stale.length > 0) {
    console.error(`✗ Docs site at ${relative(ROOT, outDir)} is stale — run \`bun run build:docs\`.`);
    for (const p of stale.slice(0, 20)) console.error(`   - ${p}`);
    if (stale.length > 20) console.error(`   … and ${stale.length - 20} more`);
    process.exit(1);
  }
  console.log(`✓ Docs site is up to date (${files.length} files).`);
  process.exit(0);
}

// A full rebuild: the previous output must not leave behind a page for a
// component that no longer exists.
rmSync(outDir, { recursive: true, force: true });
for (const f of files) {
  const abs = join(outDir, f.path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, f.content);
}

const pages = files.filter((f) => f.path.endsWith(".html"));
const examples = pages.filter((f) => f.path.startsWith("examples/"));
let bytes = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else bytes += st.size;
  }
};
walk(outDir);

console.log(`✓ Docs site written to ${relative(ROOT, outDir)}`);
console.log(
  `  ${files.length} files · ${pages.length - examples.length} site pages · ` +
    `${examples.length} live examples · ${(bytes / 1024 / 1024).toFixed(2)} MB`,
);
console.log(`  Serve it with any static server, e.g.  bunx serve ${relative(ROOT, outDir)}`);
