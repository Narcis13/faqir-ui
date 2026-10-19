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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTimeout, spawnBudgeted } from "./spawn.mjs";

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

// The strict-CSP builds (forecraft #50) bootstrap on `require` exactly like the
// two above, so each gets a process of its own. A file that loads the engine
// through `tests/helpers/engine-build` is a parameterised suite: it runs in the
// production pass AND again in the CSP pass, there with FAQIR_ENGINE_BUILD=csp.
const LOADS_CSP_ENGINE = /require\(\s*["'][^"']*faqir-core\.csp\.js["']\s*\)/;
const LOADS_CSP_DEV_ENGINE = /require\(\s*["'][^"']*faqir-core\.csp\.dev\.js["']\s*\)/;
const ENGINE_MATRIX = /from\s+["'][^"']*helpers\/engine-build["']/;
const source = (f) => readFileSync(join(ROOT, f), "utf8");
const cspDevEngine = all.filter((f) => LOADS_CSP_DEV_ENGINE.test(source(f)));
const cspEngine = all.filter((f) => LOADS_CSP_ENGINE.test(source(f)) && !cspDevEngine.includes(f));
const matrix = all.filter((f) => ENGINE_MATRIX.test(source(f)));
const main = all.filter((f) => !devEngine.includes(f) && !cspEngine.includes(f) && !cspDevEngine.includes(f));

/**
 * The last backstop. Every `spawnSync` inside the suite carries its own budget
 * (`tests/helpers/spawn.ts`), and bun's per-test timeout covers async work — but
 * neither bounds a partition that wedges somewhere else, and a run that never
 * returns reports nothing at all. So each partition also gets a wall-clock cap.
 *
 * Sized for a cold checkout on a loaded CI runner, not for a warm laptop:
 * the point is that `bun run test` always terminates, not that it is quick.
 * Override with `FAQIR_TEST_TIMEOUT_MS`.
 */
const PARTITION_TIMEOUT_MS = (() => {
  const raw = Number(process.env.FAQIR_TEST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 20 * 60_000;
})();

/** One `bun test` process over `files`. Returns its exit status. */
function run(label, files, env) {
  if (files.length === 0) return 0;
  process.stdout.write(`\n──── ${label} — ${files.length} file(s) ────\n`);
  const args = ["test", ...files];
  const result = spawnBudgeted("bun", args, {
    cwd: ROOT,
    stdio: "inherit",
    timeout: PARTITION_TIMEOUT_MS,
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  if (isTimeout(result)) {
    process.stderr.write(
      `\n✗ the "${label}" partition ran past its ${PARTITION_TIMEOUT_MS}ms cap over ` +
        `${files.length} file(s) and was killed. The output above stops at whatever ` +
        `ran last, which is the file to look at.\n` +
        `Raise the cap with FAQIR_TEST_TIMEOUT_MS=<ms> if this machine is simply slow.\n`,
    );
    return 1;
  }
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
const cspStatus = run("strict-CSP engine (isolated process)", [...cspEngine, ...matrix].sort(), {
  FAQIR_ENGINE_BUILD: "csp",
});
const cspDevStatus = run("strict-CSP dev engine (isolated process)", cspDevEngine);

const passes = [
  ["production pass", mainStatus],
  ["dev-engine pass", devStatus],
  ["strict-CSP pass", cspStatus],
  ["strict-CSP dev pass", cspDevStatus],
];
if (passes.some(([, status]) => status !== 0)) {
  process.stderr.write(
    `\n✗ test failed — ${passes.map(([name, status]) => `${name}: ${status === 0 ? "ok" : "FAILED"}`).join(", ")}\n`,
  );
  process.exit(1);
}
process.stdout.write(`\n✓ all ${all.length} test file(s) passed across ${passes.length} isolated processes\n`);
