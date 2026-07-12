#!/usr/bin/env node
/**
 * Size-budget gate (task 0.3-12).
 *
 * Minifies each shipped runtime bundle, gzips it, and enforces a hard byte
 * budget. Over-budget on any target fails the build (non-zero exit):
 *
 *   - engine               src/core-src/engine.js         ≤ 14 KB gzip
 *     (directives, reactivity, plugin API — no controllers)
 *   - engine + controllers registry/core/faqir-core.js    ≤ 36 KB gzip
 *     (the shipped single-file build: engine + every recipe controller)
 *   - each plugin          registry/core/plugins/*.js      ≤  2 KB gzip
 *     (official plugins, each self-registering via Faqir.plugin)
 *
 * Minification uses `bun build --minify` — the exact minifier that produces the
 * shipped `faqir-core.min.js` — so the numbers reflect the real artifact. Bun
 * must be on PATH (the CI size job installs it). "KB" means 1024 bytes.
 *
 * The pure budget logic (parseBudget / checkBudget / enforce / formatBytes) is
 * exported and unit-tested independently of Bun. The measurement layer
 * (minifyBytes / measureGzip / collectDefaultTargets / runSizeCheck) drives the
 * CLI. Set FAQIR_SIZE_TARGETS to a JSON array of targets
 * ({ label, entry, budgetBytes, minify? }) to override the default set — the
 * unit test uses this to feed an over-budget fixture and assert a non-zero exit.
 *
 * Runnable via `node scripts/check-size.mjs` or `bun run size`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KB = 1024;

// Budgets, in bytes. The single source of truth for the numbers in §10.4.
export const BUDGETS = {
  engine: 14 * KB,
  engineWithControllers: 36 * KB,
  plugin: 2 * KB,
};

// ── Pure budget logic (no I/O, no Bun) ───────────────────────────────────────

/**
 * Parse a budget into an integer byte count. Accepts a raw number (already
 * bytes) or a human string like "14KB", "14 KB gzip", "2kb", "1.5MB", "900B".
 * "KB"/"MB" are binary (1024). Throws on anything unparseable.
 */
export function parseBudget(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new Error(`invalid byte budget: ${input}`);
    return Math.round(input);
  }
  if (typeof input !== "string") throw new Error(`invalid budget: ${JSON.stringify(input)}`);
  const m = input.trim().match(/^([0-9]*\.?[0-9]+)\s*(b|kb|mb|gb)?\b/i);
  if (!m) throw new Error(`unparseable budget: "${input}"`);
  const value = Number(m[1]);
  const unit = (m[2] || "b").toLowerCase();
  const factor = unit === "gb" ? KB ** 3 : unit === "mb" ? KB ** 2 : unit === "kb" ? KB : 1;
  return Math.round(value * factor);
}

/** Human-readable byte size, e.g. 13741 → "13.42 KB". */
export function formatBytes(n) {
  if (n < KB) return `${n} B`;
  return `${(n / KB).toFixed(2)} KB`;
}

/**
 * Evaluate one measured target against its budget.
 * @param {{label:string, gzipBytes:number, budgetBytes:(number|string)}} target
 * @returns {{label,gzipBytes,budgetBytes,ok,overBy}}
 */
export function checkBudget(target) {
  const budgetBytes = parseBudget(target.budgetBytes);
  const gzipBytes = target.gzipBytes;
  if (typeof gzipBytes !== "number" || !Number.isFinite(gzipBytes)) {
    throw new Error(`${target.label}: gzipBytes must be a number, got ${JSON.stringify(gzipBytes)}`);
  }
  const overBy = gzipBytes - budgetBytes;
  return { label: target.label, gzipBytes, budgetBytes, ok: overBy <= 0, overBy };
}

/**
 * Enforce a set of already-checked results.
 * @param {ReturnType<typeof checkBudget>[]} results
 * @returns {{ok:boolean, failures:typeof results}}
 */
export function enforce(results) {
  const failures = results.filter((r) => !r.ok);
  return { ok: failures.length === 0, failures };
}

// ── Measurement layer (needs Bun to minify) ──────────────────────────────────

/** gzip byte length of a buffer. */
export function gzipSize(buf) {
  return gzipSync(buf).length;
}

/**
 * Minify one entry with `bun build --minify --format=iife` and return the
 * minified bytes. Throws (with a clear message) if Bun is missing or the build
 * fails. The IIFE format bundles the UMD engine / classic-script plugins into a
 * standalone script — the same shape the CDN ships.
 */
export function minifyBytes(entry, opts = {}) {
  const bun = process.env.FAQIR_BUN || "bun";
  const tmp = mkdtempSync(join(opts.tmpDir || tmpdir(), "faqir-size-"));
  const out = join(tmp, "out.min.js");
  try {
    const res = spawnSync(
      bun,
      ["build", entry, "--minify", "--format=iife", `--outfile=${out}`],
      { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", cwd: ROOT },
    );
    if (res.error) {
      if (res.error.code === "ENOENT") {
        throw new Error(
          `check-size needs Bun to minify bundles. Install Bun from https://bun.sh and retry.`,
        );
      }
      throw new Error(`check-size failed to launch ${bun}: ${res.error.message}`);
    }
    if (res.status !== 0) {
      throw new Error(`bun build failed for ${entry}:\n${res.stderr || "(no stderr)"}`);
    }
    return readFileSync(out);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Measure one target's gzip size. `minify: false` gzips the raw file as-is
 * (used by the hermetic unit-test fixture); otherwise the entry is minified
 * first. Returns the gzip byte count.
 */
export function measureGzip(target, opts = {}) {
  const entry = resolve(ROOT, target.entry);
  if (!existsSync(entry)) throw new Error(`${target.label}: entry not found: ${target.entry}`);
  const bytes = target.minify === false ? readFileSync(entry) : minifyBytes(entry, opts);
  return gzipSize(bytes);
}

/**
 * The default budget targets, discovered from the repo:
 *   engine, engine+controllers, and one entry per registry/core/plugins/*.js.
 */
export function collectDefaultTargets(root = ROOT) {
  const targets = [
    { label: "engine", entry: "src/core-src/engine.js", budgetBytes: BUDGETS.engine },
    {
      label: "engine + controllers",
      entry: "registry/core/faqir-core.js",
      budgetBytes: BUDGETS.engineWithControllers,
    },
  ];

  const pluginsDir = join(root, "registry", "core", "plugins");
  if (existsSync(pluginsDir)) {
    for (const file of readdirSync(pluginsDir).sort()) {
      if (!file.endsWith(".js")) continue;
      targets.push({
        label: `plugin: ${file}`,
        entry: join("registry", "core", "plugins", file),
        budgetBytes: BUDGETS.plugin,
      });
    }
  }
  return targets;
}

/**
 * Measure + enforce a list of targets. Prints a table and returns an exit code
 * (0 = all within budget, 1 = at least one over budget or a measurement error).
 */
export function runSizeCheck({ targets, log = console.log, err = console.error } = {}) {
  const list = targets && targets.length ? targets : collectDefaultTargets();
  const rows = [];
  let hadError = false;

  for (const t of list) {
    try {
      const gzipBytes = measureGzip(t);
      rows.push(checkBudget({ label: t.label, gzipBytes, budgetBytes: t.budgetBytes }));
    } catch (e) {
      hadError = true;
      err(`✗ ${t.label}: ${e.message}`);
    }
  }

  log("Size budgets (minified + gzip):");
  const pad = Math.max(4, ...rows.map((r) => r.label.length));
  for (const r of rows) {
    const mark = r.ok ? "✓" : "✗";
    const cmp = r.ok ? "≤" : ">";
    const over = r.ok ? "" : `  (over by ${formatBytes(r.overBy)})`;
    log(
      `  ${mark} ${r.label.padEnd(pad)}  ${formatBytes(r.gzipBytes).padStart(9)} ` +
        `${cmp} ${formatBytes(r.budgetBytes).padStart(9)} gzip${over}`,
    );
  }

  const { ok, failures } = enforce(rows);
  if (!ok) {
    err(`\n✗ Size budget exceeded by ${failures.length} target(s):`);
    for (const f of failures) {
      err(`    ${f.label}: ${formatBytes(f.gzipBytes)} > ${formatBytes(f.budgetBytes)} gzip`);
    }
  } else if (!hadError) {
    log(`\n✓ All ${rows.length} target(s) within budget.`);
  }

  return ok && !hadError ? 0 : 1;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (invokedDirectly) {
  let targets;
  if (process.env.FAQIR_SIZE_TARGETS) {
    try {
      targets = JSON.parse(process.env.FAQIR_SIZE_TARGETS);
      if (!Array.isArray(targets)) throw new Error("must be a JSON array");
    } catch (e) {
      process.stderr.write(`Invalid FAQIR_SIZE_TARGETS: ${e.message}\n`);
      process.exit(2);
    }
  }
  process.exit(runSizeCheck({ targets }));
}
