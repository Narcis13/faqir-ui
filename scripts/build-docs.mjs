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
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocsSite } from "../src/generator/docs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Top-level directories that hold source, whatever git says about them. */
const PROTECTED = ["src", "registry", "packages", "scripts", "tests", "bin", "docs", "site", ".git", "node_modules"];

/**
 * Resolve `--out` and refuse any directory a full rebuild must not delete.
 *
 * The build starts with `rmSync(outDir, { recursive: true, force: true })`.
 * An unvalidated `--out` made that `rm -rf` of whatever it named: `--out .` was
 * the repository, `--out src` the CLI, `--out ~` a home directory. The output
 * must be inside the repository, must not be the repository root or one of
 * its source directories (or contain one), and must hold no tracked file.
 * `trackedUnder` is injectable for the tests; by default it asks git.
 *
 * Returns `{ outDir }` or `{ error }`.
 */
export function resolveOutDir(argv, root = ROOT, trackedUnder = gitTrackedUnder) {
  const at = argv.indexOf("--out");
  if (at < 0) return { outDir: resolve(root, "site", "dist") };
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("-")) return { error: "--out needs a directory" };

  const outDir = resolve(root, value);
  const rel = relative(root, outDir);
  if (rel === "") return { error: "--out must not be the repository root" };
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { error: `--out must be inside the repository (${root}); got ${outDir}` };
  }
  const [top, second = ""] = rel.split(sep);
  const siteDist = join("site", "dist");
  // Two carve-outs from the protected directories: the default output, and the
  // `tests/.tmp-*` scratch directories the suite builds into and removes.
  const isSiteDist = rel === siteDist || rel.startsWith(siteDist + sep);
  const isTestScratch = top === "tests" && second.startsWith(".tmp");
  if (PROTECTED.includes(top) && !isSiteDist && !isTestScratch) {
    return { error: `--out must not be a source directory or inside one (${rel})` };
  }
  const tracked = trackedUnder(root, rel);
  if (tracked.length > 0) {
    return { error: `--out ${rel} holds tracked files (${tracked.slice(0, 3).join(", ")}…) — refusing to delete it` };
  }
  return { outDir };
}

/** Tracked files under `rel`, via git. Empty when git is unavailable. */
function gitTrackedUnder(root, rel) {
  const result = spawnSync("git", ["ls-files", "--", rel], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    killSignal: "SIGKILL",
  });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(Boolean);
}

if (import.meta.main) main();

function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes("--check");
  const resolved = resolveOutDir(argv);
  if (resolved.error) {
    console.error(`✗ ${resolved.error}`);
    process.exit(1);
  }
  const outDir = resolved.outDir;

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
}
