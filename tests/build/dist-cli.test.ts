import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(ROOT, "dist", "faqir.mjs");

/**
 * Run the compiled CLI with the Node runtime. `node` has no global `Bun`, so
 * this exercises the exact code path a machine with no Bun installed would take.
 */
function runNode(args: string[], cwd: string) {
  return spawnSync("node", [DIST, ...args], { cwd, encoding: "utf8" });
}

let tmp: string;

// Same rationale as tests/build/core-package.test.ts: the cold-checkout build
// in beforeAll can outlive bun's 5s default hook timeout on CI.
setDefaultTimeout(120_000);

beforeAll(() => {
  if (!existsSync(DIST)) {
    const build = spawnSync("bun", ["run", "build:cli"], { cwd: ROOT, encoding: "utf8" });
    if (build.status !== 0) {
      throw new Error(`build:cli failed:\n${build.stdout ?? ""}${build.stderr ?? ""}`);
    }
  }
  tmp = mkdtempSync(join(tmpdir(), "faqir-dist-"));
});

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("compiled dist/faqir.mjs runs on plain Node", () => {
  test("the bundle exists after building", () => {
    expect(existsSync(DIST)).toBe(true);
  });

  test("--version prints the version and exits 0", () => {
    const r = runNode(["--version"], tmp);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("help exits 0", () => {
    const r = runNode(["help"], tmp);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("faqir");
  });

  test("list resolves the shipped registry and exits 0", () => {
    const r = runNode(["list"], tmp);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("PRIMITIVES");
  });

  test("init then add --dry-run works end-to-end", () => {
    const init = runNode(["init"], tmp);
    expect(init.status).toBe(0);
    expect(existsSync(join(tmp, "faqir.config.json"))).toBe(true);

    const dry = runNode(["add", "button", "--dry-run"], tmp);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("button");
    // --dry-run must not write the component
    expect(existsSync(join(tmp, "ui", "primitives", "button"))).toBe(false);
  });

  test("a real add installs component files (glob + write shims)", () => {
    const add = runNode(["add", "button"], tmp);
    expect(add.status).toBe(0);
    expect(existsSync(join(tmp, "ui", "primitives", "button", "button.css"))).toBe(true);
    expect(existsSync(join(tmp, "ui", "primitives", "button", "button.manifest.json"))).toBe(true);
  });
});

// ── Large JSON payloads must survive a piped stdout ──────────────────────────
//
// `console.log` writes through Node's async stdout stream. When stdout is a pipe
// — how every agent and CI wrapper captures the CLI — a queued write is abandoned
// if the process tears down before the stream drains, and the reader gets a
// document truncated at the pipe buffer (64 KiB) with no error anywhere.
//
// Both JSON emit paths sat exactly there: `emitJSON` is followed by
// `process.exit` in audit/upgrade/bindings, and `flushEnvelope` runs from inside
// a `process.on("exit")` handler. The fix is `fs.writeSync(1, …)`, which bypasses
// the stream.
//
// This has to live here rather than in tests/commands/json-output.test.ts: that
// file spawns `process.execPath`, which under `bun test` is the Bun binary, and
// Bun's console.log is synchronous — the bug is invisible from there. `spawnSync`
// gives the child a real pipe, so running the compiled bundle on Node reproduces
// exactly what a subprocess wrapper sees.
describe("JSON mode survives a piped stdout at size", () => {
  const PIPE_BUFFER_BYTES = 65536;

  // One log line per file, so a long name buys payload size far more cheaply
  // than more files do.
  const pageName = (i: number) => `page-${String(i).padStart(4, "0")}-${"x".repeat(120)}.html`;

  function bulkProject(pages: number): string {
    const cwd = mkdtempSync(join(tmp, "bulk-"));
    runNode(["init", "--yes"], cwd);
    runNode(["add", "card", "button", "badge"], cwd);
    mkdirSync(join(cwd, "pages"), { recursive: true });
    for (let i = 0; i < pages; i++) {
      // Invalid variant values (→ audit findings) with attributes in
      // non-canonical order (→ conform rewrites): one fixture, both paths.
      writeFileSync(
        join(cwd, "pages", pageName(i)),
        `<div data-variant="NOPE${i}" data-ui="card">` +
          `<button data-variant="BOGUS${i}" data-ui="button">x</button>` +
          `<span data-size="HUGE${i}" data-ui="badge">y</span></div>\n`
      );
    }
    return cwd;
  }

  test("audit --json is complete through a pipe (bespoke schema, non-zero exit)", () => {
    const cwd = bulkProject(400);
    const r = runNode(["audit", "--json"], cwd);

    expect(r.stdout.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
    const report = JSON.parse(r.stdout); // truncation fails here
    expect(report.passed).toBe(false);
    expect(r.status).toBe(1);
    // Assert the tail arrived, not just the head.
    expect(Array.isArray(report.results)).toBe(true);
    expect(report.results.length).toBeGreaterThan(1000);
  });

  test("the generic envelope is complete through a pipe on a zero exit", () => {
    const cwd = bulkProject(700);
    // A real shell pipe, not spawnSync's own: spawnSync drains the child's
    // stdout as it is written, which keeps the buffer from filling and hides
    // the very stall this test exists to catch. `| cat` is what an agent's
    // subprocess wrapper actually looks like.
    const r = spawnSync("sh", ["-c", `node ${JSON.stringify(DIST)} conform --json | cat`], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });

    expect(r.stdout.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.exit_code).toBe(0);
    expect(envelope.messages.length).toBeGreaterThan(500);
  });
});
