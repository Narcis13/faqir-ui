// ═══════════════════════════════════════════════════════════════════════════
// Every synchronous subprocess in the repository carries a wall-clock budget
// ═══════════════════════════════════════════════════════════════════════════
//
// `bun test`'s per-test timeout is cooperative: it fires between turns of the
// event loop. `spawnSync` (and `execSync`, and `Bun.spawnSync`) hold that loop
// for the child's entire life, so a child that never exits does not fail its
// test — it suspends the whole run. That was observed five times on macOS, once
// for 12.3 minutes inside a test declaring a 60s budget: a green run could not
// reliably *happen*, and every wave of work downstream inherited the doubt.
//
// The remedy is per-spawn and kernel-enforced, so this file has two halves:
//
//   1. a source gate — no synchronous spawn anywhere in `tests/`, `scripts/`,
//      `src/` or `packages/` without an explicit `timeout:`, whether it goes
//      through a wrapper or not;
//   2. behavioural proof that the wrappers actually kill and actually report —
//      a gate over source text is worth nothing if the mechanism it mandates
//      does not work.
//
// Deliberately NOT policed: the *asynchronous* spawns (`Bun.spawn`, `spawn`).
// Those yield to the event loop, so bun's per-test timeout can interrupt them;
// they are the case the runner already handles.

import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SPAWN_SCALE,
  SPAWN_TIMEOUT,
  SpawnTimeoutError,
  runSync,
  runSyncBun,
} from "../helpers/spawn";

// scripts/spawn.mjs is plain JS outside tsconfig's include; import it via a
// computed specifier so `tsc --noEmit` does not look for a .mjs declaration.
type ScriptSpawn = {
  BUILD_TIMEOUT_MS: number;
  spawnBudgeted: (
    command: string,
    args: readonly string[],
    options?: Record<string, unknown>,
  ) => { status: number | null; error?: NodeJS.ErrnoException };
  isTimeout: (result: unknown) => boolean;
  timeoutMessage: (command: string, args?: readonly string[], timeoutMs?: number) => string;
};
let scriptSpawn: ScriptSpawn;

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

beforeAll(async () => {
  scriptSpawn = (await import(join(ROOT, "scripts", "spawn.mjs"))) as unknown as ScriptSpawn;
});

/** The two modules that *implement* the budgets; they own the raw calls. */
const WRAPPERS = new Set(["tests/helpers/spawn.ts", "scripts/spawn.mjs"]);

/**
 * Every synchronous spawn API in play, in two classes.
 *
 * RAW is the kernel-level call: no budget means no bound at all, so a naked one
 * is the defect itself.
 *
 * WRAPPED goes through `runSync` / `runSyncBun` / `spawnBudgeted`, which each
 * default to a budget — so a naked one cannot hang. It is policed anyway, for
 * two reasons: choosing a budget is a judgement about the work being launched
 * (a `--version` probe and a cold `vue-tsc` do not deserve the same one), and
 * `timeout: SPAWN_TIMEOUT.BUILT` — a typo, evaluating to `undefined` — is
 * invisible unless something reads the site. The budget-name check below is
 * that something.
 */
const RAW_SPAWNS = ["spawnSync", "execSync", "execFileSync"];
const WRAPPED_SPAWNS = ["runSync", "runSyncBun", "spawnBudgeted"];
const SYNC_SPAWNS = [...RAW_SPAWNS, ...WRAPPED_SPAWNS];

const SOURCE_ROOTS = ["tests", "scripts", "src", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".faqir", ".git", "test-results"]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = SOURCE_ROOTS.flatMap((r) => walk(join(ROOT, r)))
  .map((f) => relative(ROOT, f))
  .filter((f) => !WRAPPERS.has(f))
  .sort();

/**
 * The argument list of the call whose `(` is at `open`, with the parentheses.
 * Strings, template literals and comments are skipped so a `)` inside one does
 * not close the call early. Returns "" if the file's parens never balance.
 */
function argumentList(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      for (; i < source.length; i++) {
        if (source[i] === "\\") i++;
        else if (source[i] === quote) break;
        // A `${…}` may itself contain a `)`, but never an unbalanced one, and
        // never the `)` that closes this call — skipping to the quote is safe.
      }
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return "";
}

interface Call {
  file: string;
  line: number;
  api: string;
  args: string;
  /** RAW is unbounded without a timeout; WRAPPED falls back to a default. */
  kind: "raw" | "wrapped";
  /** The reason text of a `spawn-timeout-exempt:` marker, if one precedes it. */
  exemption: string | null;
}

/**
 * The one sanctioned way out. Written as a marker at the call site rather than
 * as a list here, because a list here is a list that goes stale — the same
 * "exemption by omission" that lets `CONTRAST_PAIRS` quietly exempt whatever it
 * forgot. The count and the reasons are still asserted below, so an exemption
 * cannot be added silently either.
 */
const EXEMPT_MARKER = /spawn-timeout-exempt:\s*(.+)/;

/** The reason on a `spawn-timeout-exempt:` marker within the 6 lines above `line`. */
function exemptionFor(lines: string[], line: number): string | null {
  for (let i = Math.max(0, line - 7); i < line - 1; i++) {
    const m = EXEMPT_MARKER.exec(lines[i] ?? "");
    if (m) return m[1].trim();
  }
  return null;
}

/** Every call to a synchronous spawn API, outside comments and strings. */
function syncSpawnCalls(file: string): Call[] {
  const source = readFileSync(join(ROOT, file), "utf8");
  const lines = source.split("\n");
  const found: Call[] = [];
  for (const api of SYNC_SPAWNS) {
    // An identifier boundary before the name keeps `runSync`/`spawnBudgeted`
    // out, and `Bun.spawnSync` in (the `.` is not an identifier character).
    const pattern = new RegExp(`(?<![A-Za-z0-9_$])${api}\\s*\\(`, "g");
    for (const m of source.matchAll(pattern)) {
      const open = m.index + m[0].length - 1;
      // Skip a mention inside a comment or a string — the prose in this repo
      // names these APIs often. Cheap check: is the match inside one?
      if (isInsideCommentOrString(source, m.index)) continue;
      const line = source.slice(0, m.index).split("\n").length;
      found.push({
        file,
        line,
        api,
        args: argumentList(source, open),
        kind: RAW_SPAWNS.includes(api) ? "raw" : "wrapped",
        exemption: exemptionFor(lines, line),
      });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

/** True when `index` falls inside a comment or a string literal. */
function isInsideCommentOrString(source: string, index: number): boolean {
  let i = 0;
  while (i < index) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      if (end === -1 || end > index) return true;
      i = end + 1;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1 || end > index) return true;
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      for (; j < source.length; j++) {
        if (source[j] === "\\") j++;
        else if (source[j] === quote) break;
      }
      if (j > index) return true;
      i = j + 1;
      continue;
    }
    i++;
  }
  return false;
}

const allCalls = sourceFiles.flatMap(syncSpawnCalls);

describe("no synchronous spawn without a wall-clock budget", () => {
  it("finds the synchronous spawn sites at all (the scanner is not vacuous)", () => {
    // The gate is only worth something if it sees the call sites. If a refactor
    // renames every wrapper this drops to zero and the suite says so, rather
    // than reporting a green scan over nothing.
    expect(sourceFiles.length).toBeGreaterThan(100);
    expect(allCalls.filter((c) => c.kind === "raw").length).toBeGreaterThanOrEqual(5);
    expect(allCalls.filter((c) => c.kind === "wrapped").length).toBeGreaterThanOrEqual(20);
  });

  it("every synchronous spawn passes an explicit timeout", () => {
    const naked = allCalls
      .filter((c) => !c.exemption)
      .filter((c) => !/\btimeout\s*:/.test(c.args));
    const report = naked.map((c) => `${c.file}:${c.line} — ${c.api}(…) has no timeout`);
    expect(report, report.join("\n")).toEqual([]);
  });

  it("the exemptions are exactly two, each carrying its argument", () => {
    // Asserting the COUNT is what makes this an exemption list rather than an
    // exemption habit: a third naked spawn cannot be waved through by adding a
    // marker, because adding one fails this test until it is argued for here.
    // Identified by file rather than by line: a line number in this very file
    // would shift on any edit above, which is churn, not a signal.
    const exempt = allCalls.filter((c) => c.exemption);
    expect(exempt.map((c) => `${c.file} (${c.kind})`).sort()).toEqual([
      // The interactive release script — see the marker there for why.
      "scripts/release.mjs (raw)",
      // The wrapper's own default-budget proof: giving it an explicit timeout
      // would test the argument instead of the default.
      "tests/meta/spawn-timeouts.test.ts (wrapped)",
    ]);
    for (const call of exempt) {
      // A marker is a claim; a claim needs an argument next to it.
      expect(call.exemption!.length, `${call.file}:${call.line}`).toBeGreaterThan(20);
    }
  });

  it("the one genuinely unbounded spawn cannot run inside the test suite", () => {
    // An exempt WRAPPED call still gets the wrapper's default budget, so it is
    // bounded. An exempt RAW call is not bounded by anything — that is only
    // acceptable while nothing under `bun run test` can reach it.
    for (const call of allCalls.filter((c) => c.exemption && c.kind === "raw")) {
      expect(call.file.startsWith("scripts/"), call.file).toBe(true);
      expect(call.file.includes(".test."), call.file).toBe(false);
    }
    const SELF = "tests/meta/spawn-timeouts.test.ts";

    // The invariant is that nothing under `bun run test` can **execute** an
    // unbounded spawn — not that nothing may name the file containing one.
    // `release.mjs` guards its entry point (`main()` runs only when the file is
    // argv[1]), so importing it evaluates definitions and nothing else, which is
    // what lets `tests/build/release.test.ts` unit-test the version arithmetic
    // instead of re-implementing it beside the thing it is supposed to check.
    //
    // That exemption is only as good as the guard, so the guard is asserted here
    // rather than assumed. Spawning the file is still forbidden outright: a
    // subprocess would reach `main()` and, through it, an interactive `npm
    // publish` that no budget bounds.
    const RELEASE = "scripts/release.mjs";
    const releaseSource = readFileSync(join(ROOT, RELEASE), "utf8");
    expect(
      releaseSource,
      `${RELEASE} must guard main() behind an argv[1] check, or importing it starts a release`,
    ).toContain("resolve(process.argv[1]) === fileURLToPath(import.meta.url)");

    const importsOnly = /^\s*import\s[^;]*from\s+["'][^"']*release\.mjs["'];?\s*$/m;
    const suiteReaches = sourceFiles
      .filter((f) => f !== SELF && (f.includes(".test.") || f.includes(".spec.")))
      // A quoted path is how a test would spawn or import it; a mention in prose
      // is not. This file is excluded because it necessarily names the exemption.
      .filter((f) => {
        const text = readFileSync(join(ROOT, f), "utf8");
        if (!/["'`][^"'`]*release\.mjs/.test(text)) return false;
        // Every quoted reference must be either the guarded import or a plain
        // `readFileSync` of the source — never an argument to a spawn.
        const spawned = new RegExp(
          `(spawnSync|execFileSync|execSync|runSync|Bun\\.spawnSync)[^;]*release\\.mjs`,
        ).test(text);
        return spawned || !importsOnly.test(text);
      });
    expect(suiteReaches).toEqual([]);
    expect(sourceFiles).toContain(SELF);
  });

  it("the budgets used are real numbers, not an undefined constant", () => {
    // `timeout: SPAWN_TIMEOUT.BUILT` (a typo) is `undefined`, which spawnSync
    // treats as "no timeout" — the exact defect, wearing the fix's clothes.
    const named = allCalls.flatMap((c) =>
      [...c.args.matchAll(/\btimeout\s*:\s*SPAWN_TIMEOUT\.([A-Za-z_]+)/g)].map((m) => ({
        where: `${c.file}:${c.line}`,
        key: m[1],
      })),
    );
    const unknown = named.filter((n) => !(n.key in SPAWN_TIMEOUT));
    expect(unknown.map((n) => `${n.where} — SPAWN_TIMEOUT.${n.key} is not defined`)).toEqual([]);
    for (const key of Object.keys(SPAWN_TIMEOUT)) {
      expect(SPAWN_TIMEOUT[key as keyof typeof SPAWN_TIMEOUT]).toBeGreaterThan(0);
    }
  });

  it("excludes the wrappers, which are the only files allowed a raw call", () => {
    for (const wrapper of WRAPPERS) {
      expect(sourceFiles).not.toContain(wrapper);
      // …and the exclusion names a file that exists and does hold a raw call,
      // so it is an exclusion rather than a stale path.
      expect(syncSpawnCalls(wrapper).length).toBeGreaterThan(0);
    }
  });
});

// ── the mechanism the gate mandates actually works ──────────────────────────

/** A child that ignores SIGTERM and never exits on its own. */
const WEDGED = ["sh", "-c", "trap '' TERM; sleep 30"];

describe("runSync", () => {
  it("kills a wedged child at its budget and throws a SpawnTimeoutError", () => {
    const started = Date.now();
    let thrown: unknown;
    try {
      runSync(WEDGED[0], WEDGED.slice(1), { encoding: "utf8", timeout: 400 });
    } catch (e) {
      thrown = e;
    }
    const elapsed = Date.now() - started;

    expect(thrown).toBeInstanceOf(SpawnTimeoutError);
    expect((thrown as SpawnTimeoutError).timeoutMs).toBe(400);
    // The whole point: bounded, and nowhere near the child's own 30s.
    expect(elapsed).toBeLessThan(10_000);
  });

  it("names the command, the budget and the streams in the failure message", () => {
    try {
      runSync("sh", ["-c", "echo marker-out; echo marker-err 1>&2; sleep 30"], {
        encoding: "utf8",
        timeout: 400,
        cwd: ROOT,
      });
      throw new Error("expected a timeout");
    } catch (e) {
      expect(e).toBeInstanceOf(SpawnTimeoutError);
      const message = (e as Error).message;
      expect(message).toContain("400ms budget");
      expect(message).toContain("sh -c");
      expect(message).toContain(ROOT);
      expect(message).toContain("marker-out");
      expect(message).toContain("marker-err");
      expect(message).toContain("FAQIR_TEST_SPAWN_SCALE");
    }
  });

  it("returns normally, and untouched, when the child finishes in time", () => {
    const r = runSync("sh", ["-c", "echo hello"], { encoding: "utf8", timeout: SPAWN_TIMEOUT.QUICK });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("hello");
    expect(r.error).toBeUndefined();
  });

  it("passes a non-zero exit through rather than throwing", () => {
    const r = runSync("sh", ["-c", "exit 3"], { encoding: "utf8", timeout: SPAWN_TIMEOUT.QUICK });
    expect(r.status).toBe(3);
  });

  it("passes a missing binary through as ENOENT, so optional-tool probes still work", () => {
    // `tests/build/check-size.test.ts` and the `lsof` probe in dev.test.ts both
    // read `.status` to decide whether the tool exists; throwing would break them.
    const r = runSync("faqir-no-such-binary-xyz", [], {
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.QUICK,
    });
    expect(r.status).not.toBe(0);
    expect((r.error as NodeJS.ErrnoException | undefined)?.code).toBe("ENOENT");
  });

  it("defaults to a budget when the caller omits one", () => {
    // The safety net under the gate: a call site that forgets a timeout is
    // still bounded, so the worst a future omission costs is a less apt budget.
    // spawn-timeout-exempt: this call exists to prove the wrapper's own default
    // applies; passing an explicit timeout here would test the argument instead
    // of the default, which is the only thing worth testing.
    const r = runSync("sh", ["-c", "echo ok"], { encoding: "utf8" });
    expect(r.status).toBe(0);
  });

  it("scales every budget by FAQIR_TEST_SPAWN_SCALE", () => {
    expect(SPAWN_SCALE).toBeGreaterThan(0);
    expect(SPAWN_TIMEOUT.QUICK).toBe(Math.round(10_000 * SPAWN_SCALE));
    expect(SPAWN_TIMEOUT.CLI).toBe(Math.round(30_000 * SPAWN_SCALE));
    expect(SPAWN_TIMEOUT.BUILD).toBe(Math.round(90_000 * SPAWN_SCALE));
    // Ordered by what they describe, so a budget never silently outranks a
    // slower class of work.
    expect(SPAWN_TIMEOUT.QUICK).toBeLessThan(SPAWN_TIMEOUT.CLI);
    expect(SPAWN_TIMEOUT.CLI).toBeLessThan(SPAWN_TIMEOUT.BUILD);
  });
});

describe("runSyncBun", () => {
  it("kills a wedged child at its budget and throws a SpawnTimeoutError", () => {
    const started = Date.now();
    let thrown: unknown;
    try {
      runSyncBun(WEDGED, { timeout: 400 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SpawnTimeoutError);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("returns Bun's own result shape when the child finishes in time", () => {
    const r = runSyncBun(["sh", "-c", "echo hello"], { timeout: SPAWN_TIMEOUT.QUICK });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString().trim()).toBe("hello");
  });

  it("does not mistake a fast external kill for a timeout", () => {
    // `exitCode === null` alone would; the elapsed-time check is what keeps a
    // self-signalled child from being reported as a stalled one.
    const r = runSyncBun(["sh", "-c", "kill -9 $$"], { timeout: SPAWN_TIMEOUT.QUICK });
    expect(r.exitCode).toBeNull();
  });
});

describe("scripts/spawn.mjs", () => {
  it("kills a wedged child and reports the expiry distinguishably", () => {
    const started = Date.now();
    const result = scriptSpawn.spawnBudgeted(WEDGED[0], WEDGED.slice(1), {
      encoding: "utf8",
      timeout: 400,
    });
    expect(scriptSpawn.isTimeout(result)).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("does not report a plain failure as a timeout", () => {
    const ok = scriptSpawn.spawnBudgeted("sh", ["-c", "exit 4"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(scriptSpawn.isTimeout(ok)).toBe(false);
    expect(ok.status).toBe(4);

    const missing = scriptSpawn.spawnBudgeted("faqir-no-such-binary-xyz", [], {
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(scriptSpawn.isTimeout(missing)).toBe(false);
  });

  it("carries a positive default budget and an actionable message", () => {
    expect(scriptSpawn.BUILD_TIMEOUT_MS).toBeGreaterThan(0);
    const message = scriptSpawn.timeoutMessage("bun", ["build", "entry.ts"], 1234);
    expect(message).toContain("1234ms");
    expect(message).toContain("bun build entry.ts");
    expect(message).toContain("FAQIR_SPAWN_TIMEOUT_MS");
  });
});
