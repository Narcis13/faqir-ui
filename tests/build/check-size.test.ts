// ═══════════════════════════════════════════════════════════════════════════
// Size-budget gate — scripts/check-size.mjs  [task 0.3-12]
// ═══════════════════════════════════════════════════════════════════════════
//
// The CI "size" job fails the build when any shipped bundle exceeds its gzip
// budget (engine ≤ 14KB, engine+controllers ≤ 43KB, each plugin ≤ 2KB). These
// tests pin the budget parsing/enforcement logic and prove that an over-budget
// fixture makes the script exit non-zero (and an under-budget one exits 0).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "scripts", "check-size.mjs");
const KB = 1024;

// check-size.mjs is plain JS; import via a computed specifier so its exports
// load at runtime without a hand-written declaration file.
type SizeModule = {
  parseBudget: (input: number | string) => number;
  formatBytes: (n: number) => string;
  checkBudget: (t: { label: string; gzipBytes: number; budgetBytes: number | string }) => {
    label: string;
    gzipBytes: number;
    budgetBytes: number;
    ok: boolean;
    overBy: number;
  };
  enforce: (rows: Array<{ ok: boolean }>) => { ok: boolean; failures: unknown[] };
  runSizeCheck: (opts: {
    targets: Array<{ label: string; entry: string; budgetBytes: number | string; minify?: boolean }>;
    log?: (m: string) => void;
    err?: (m: string) => void;
  }) => number;
  BUDGETS: { engine: number; engineWithControllers: number; plugin: number };
  PLUGIN_BUDGETS: Record<string, number>;
  collectDefaultTargets: (root?: string) => Array<{
    label: string;
    entry: string;
    budgetBytes: number | null;
  }>;
  measureGzip: (t: { label: string; entry: string; minify?: boolean }) => number;
};

let mod: SizeModule;
let tmp: string;

beforeAll(async () => {
  mod = (await import(SCRIPT)) as unknown as SizeModule;
  tmp = mkdtempSync(join(tmpdir(), "faqir-checksize-"));
});

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

// ── Budget parsing ───────────────────────────────────────────────────────────
describe("parseBudget", () => {
  test("passes a raw byte number through (rounded)", () => {
    expect(mod.parseBudget(1024)).toBe(1024);
    expect(mod.parseBudget(2048.6)).toBe(2049);
  });

  test("parses KB/MB/GB as binary units", () => {
    expect(mod.parseBudget("14KB")).toBe(14 * KB);
    expect(mod.parseBudget("2kb")).toBe(2 * KB);
    expect(mod.parseBudget("1.5MB")).toBe(1.5 * KB * KB);
    expect(mod.parseBudget("1GB")).toBe(KB * KB * KB);
  });

  test("tolerates whitespace and a trailing 'gzip' label", () => {
    expect(mod.parseBudget("14 KB gzip")).toBe(14 * KB);
    expect(mod.parseBudget("  22KB  ")).toBe(22 * KB);
  });

  test("treats a unit-less string and a bare 'B' as bytes", () => {
    expect(mod.parseBudget("900B")).toBe(900);
    expect(mod.parseBudget("512")).toBe(512);
  });

  test("throws on unparseable input", () => {
    expect(() => mod.parseBudget("not-a-size")).toThrow();
    expect(() => mod.parseBudget(-1)).toThrow();
    // @ts-expect-error — exercising the runtime guard
    expect(() => mod.parseBudget(null)).toThrow();
  });
});

// ── Formatting ───────────────────────────────────────────────────────────────
describe("formatBytes", () => {
  test("bytes under 1KB print as B", () => {
    expect(mod.formatBytes(56)).toBe("56 B");
  });
  test("1KB and above print as KB with two decimals", () => {
    expect(mod.formatBytes(14 * KB)).toBe("14.00 KB");
    expect(mod.formatBytes(Math.round(13.42 * KB))).toBe("13.42 KB");
  });
});

// ── Enforcement ──────────────────────────────────────────────────────────────
describe("checkBudget", () => {
  test("within budget → ok, negative overBy", () => {
    const r = mod.checkBudget({ label: "engine", gzipBytes: 8 * KB, budgetBytes: 14 * KB });
    expect(r.ok).toBe(true);
    expect(r.overBy).toBe(8 * KB - 14 * KB);
  });

  test("over budget → not ok, positive overBy", () => {
    const r = mod.checkBudget({ label: "engine", gzipBytes: 20 * KB, budgetBytes: 14 * KB });
    expect(r.ok).toBe(false);
    expect(r.overBy).toBe(6 * KB);
  });

  test("exactly at budget → ok (overBy 0)", () => {
    const r = mod.checkBudget({ label: "plugin", gzipBytes: 2 * KB, budgetBytes: 2 * KB });
    expect(r.ok).toBe(true);
    expect(r.overBy).toBe(0);
  });

  test("parses a string budget", () => {
    const r = mod.checkBudget({ label: "engine", gzipBytes: 15 * KB, budgetBytes: "14KB" });
    expect(r.budgetBytes).toBe(14 * KB);
    expect(r.ok).toBe(false);
  });

  test("rejects a non-numeric measurement", () => {
    // @ts-expect-error — exercising the runtime guard
    expect(() => mod.checkBudget({ label: "x", gzipBytes: "big", budgetBytes: 10 })).toThrow();
  });
});

describe("enforce", () => {
  test("all within budget → ok, no failures", () => {
    const rows = [
      mod.checkBudget({ label: "a", gzipBytes: 1, budgetBytes: 10 }),
      mod.checkBudget({ label: "b", gzipBytes: 2, budgetBytes: 10 }),
    ];
    const res = mod.enforce(rows);
    expect(res.ok).toBe(true);
    expect(res.failures).toHaveLength(0);
  });

  test("any over budget → not ok, lists the failures", () => {
    const rows = [
      mod.checkBudget({ label: "a", gzipBytes: 1, budgetBytes: 10 }),
      mod.checkBudget({ label: "b", gzipBytes: 99, budgetBytes: 10 }),
    ];
    const res = mod.enforce(rows);
    expect(res.ok).toBe(false);
    expect(res.failures).toHaveLength(1);
  });
});

describe("BUDGETS", () => {
  test("match the §10.4 numbers", () => {
    expect(mod.BUDGETS.engine).toBe(14 * KB);
    // 45 → 46 in Wave 3; the ledger for every move is in scripts/check-size.mjs.
    expect(mod.BUDGETS.engineWithControllers).toBe(46 * KB);
    expect(mod.BUDGETS.plugin).toBe(2 * KB);
  });

  // Two plugins are over the 2 KB default, each for a named feature: 1.1B-03
  // bought faqir-validate a kilobyte for the programmatic registry and the
  // async validators, and 1.1B-04 bought faqir-rules nine for the evaluator it
  // bundles (raised to 13 in the 1.1 release hardening). Both are enforced from both sides below — not holes in the gate.
  test("the per-plugin exceptions are exactly these two", () => {
    expect(Object.keys(mod.PLUGIN_BUDGETS).sort()).toEqual([
      "faqir-rules.js",
      "faqir-validate.js",
    ]);
    expect(mod.PLUGIN_BUDGETS["faqir-validate.js"]).toBe(3 * KB);
    expect(mod.PLUGIN_BUDGETS["faqir-rules.js"]).toBe(13 * KB);
    const targets = mod.collectDefaultTargets();
    for (const t of targets) {
      if (!t.label.startsWith("plugin: ")) continue;
      const file = t.label.slice("plugin: ".length);
      expect(t.budgetBytes, t.label).toBe(mod.PLUGIN_BUDGETS[file] ?? mod.BUDGETS.plugin);
    }
  });

  test("faqir-validate is really inside its 3 KB", () => {
    const measured = mod.measureGzip({
      label: "plugin: faqir-validate.js",
      entry: join(ROOT, "registry", "core", "plugins", "faqir-validate.js"),
    });
    expect(measured).toBeLessThanOrEqual(3 * KB);
    // …and the exception is not idle headroom: it does not fit in 2 KB either,
    // so deleting the entry would go red rather than pass unnoticed.
    expect(measured).toBeGreaterThan(2 * KB);
  });

  test("faqir-rules is really inside its 13 KB, and really needs 13", () => {
    const measured = mod.measureGzip({
      label: "plugin: faqir-rules.js",
      entry: join(ROOT, "registry", "core", "plugins", "faqir-rules.js"),
    });
    expect(measured).toBeLessThanOrEqual(13 * KB);
    // The same both-sides rule: the entry is not headroom to grow into. If the
    // bundle ever drops under 12 KB the budget should come down with it, and
    // this test is what says so.
    expect(measured).toBeGreaterThan(12 * KB);
  });
});

// ── Over-budget fixture → non-zero exit ──────────────────────────────────────
describe("runSizeCheck (in-process)", () => {
  test("an over-budget fixture returns exit code 1", () => {
    const fixture = join(tmp, "big.js");
    writeFileSync(fixture, `const x = ${JSON.stringify("z".repeat(4096))};\n`);
    const code = mod.runSizeCheck({
      targets: [{ label: "fixture", entry: fixture, budgetBytes: 10, minify: false }],
      log: () => {},
      err: () => {},
    });
    expect(code).toBe(1);
  });

  test("an under-budget fixture returns exit code 0", () => {
    const fixture = join(tmp, "small.js");
    writeFileSync(fixture, `export const x = 1;\n`);
    const code = mod.runSizeCheck({
      targets: [{ label: "fixture", entry: fixture, budgetBytes: "10MB", minify: false }],
      log: () => {},
      err: () => {},
    });
    expect(code).toBe(0);
  });
});

// ── The CLI wiring actually calls process.exit with the right code ───────────
// Spawns the script with `node` — present on CI runners and dev machines. Skips
// cleanly in the rare environment where `node` is not on PATH (Bun-only box).
const hasNode =
  runSync("node", ["--version"], { encoding: "utf8", timeout: SPAWN_TIMEOUT.QUICK }).status === 0;
describe.skipIf(!hasNode)("check-size.mjs CLI", () => {
  function runCli(fixtureBudget: number | string, size: number) {
    const fixture = join(tmp, `cli-${String(size)}.js`);
    writeFileSync(fixture, `const x = ${JSON.stringify("z".repeat(size))};\n`);
    const targets = JSON.stringify([
      { label: "fixture", entry: fixture, budgetBytes: fixtureBudget, minify: false },
    ]);
    return runSync("node", [SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, FAQIR_SIZE_TARGETS: targets },
      timeout: SPAWN_TIMEOUT.BUILD,
    });
  }

  test("exits non-zero on an over-budget target", () => {
    const res = runCli(10, 4096);
    expect(res.status).not.toBe(0);
  });

  test("exits 0 when every target is within budget", () => {
    const res = runCli("10MB", 16);
    expect(res.status).toBe(0);
  });

  test("exits with code 2 on malformed FAQIR_SIZE_TARGETS", () => {
    const res = runSync("node", [SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, FAQIR_SIZE_TARGETS: "{ not an array }" },
      timeout: SPAWN_TIMEOUT.CLI,
    });
    expect(res.status).toBe(2);
  });
});
