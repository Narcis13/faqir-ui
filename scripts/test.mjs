#!/usr/bin/env bun
/**
 * The test entry point — `bun run test`.
 *
 * Why this exists instead of a bare `bun test`:
 *
 * `registry/core/faqir-core.js` and `registry/core/faqir-core.dev.js` are two
 * builds of the SAME engine, and each one bootstraps itself the moment it is
 * `require`d — installing a MutationObserver over `document.body` that lives
 * for the rest of the process, with no teardown handle on the public API.
 *
 * Bun runs every test file in ONE process sharing ONE happy-dom realm. So the
 * moment a file requires the dev build, that engine starts initializing scopes
 * and emitting `[Faqir dev]` diagnostics on markup mounted by *other* files —
 * every scope gets double-initialized and the production engine's "…and it
 * stays silent" assertions see the dev engine's warnings.
 *
 * That is exactly what broke CI: the failures depend on the order Bun happens
 * to walk the test directory, which differs between macOS (dev build loaded
 * late) and Linux (loaded early, before the engine suites). The suite passed
 * locally and failed on the runner with no change to the repo.
 *
 * So: partition the suite by which engine build a file executes, and give each
 * partition its own process. Detection is by source inspection rather than a
 * hand-kept list, so a new dev-engine test is isolated automatically.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Bun's own discovery rule: a test file has .test/.spec (or _test_/_spec_). */
const IS_TEST = /(\.|_)(test|spec)(\.|_).*\.(ts|tsx|js|jsx|mjs|cjs)$|(\.|_)(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
// NB: no "build" here — `tests/build/` is a real suite, not a build output.
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".faqir"]);

/** A file that *executes* the dev engine — `require(…/faqir-core.dev.js)`. */
const LOADS_DEV_ENGINE = /require\(\s*["'][^"']*faqir-core\.dev\.js["']\s*\)/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (IS_TEST.test(entry)) out.push(full);
  }
  return out;
}

const all = [...walk(join(ROOT, "tests")), ...walk(join(ROOT, "packages"))]
  .map((f) => relative(ROOT, f))
  .sort();

const devEngine = all.filter((f) => LOADS_DEV_ENGINE.test(readFileSync(join(ROOT, f), "utf8")));
const main = all.filter((f) => !devEngine.includes(f));

/** One `bun test` process over `files`. Returns its exit status. */
function run(label, files) {
  if (files.length === 0) return 0;
  process.stdout.write(`\n──── ${label} — ${files.length} file(s) ────\n`);
  const result = spawnSync("bun", ["test", ...files], { cwd: ROOT, stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`failed to launch bun: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

// Production engine first — it is the bulk of the suite, so a genuine failure
// surfaces before the (much smaller) dev-engine pass runs.
const mainStatus = run("production engine + everything else", main);
const devStatus = run("dev engine (isolated process)", devEngine);

if (mainStatus !== 0 || devStatus !== 0) {
  process.stderr.write(
    `\n✗ test failed — production pass: ${mainStatus === 0 ? "ok" : "FAILED"}, ` +
      `dev-engine pass: ${devStatus === 0 ? "ok" : "FAILED"}\n`,
  );
  process.exit(1);
}
process.stdout.write(`\n✓ all ${all.length} test file(s) passed across 2 isolated processes\n`);
