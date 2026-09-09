import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(ROOT, "dist", "faqir.mjs");

/**
 * Run the compiled CLI with the Node runtime. `node` has no global `Bun`, so
 * this exercises the exact code path a machine with no Bun installed would take.
 */
function runNode(args: string[], cwd: string) {
  return runSync("node", [DIST, ...args], { cwd, encoding: "utf8", timeout: SPAWN_TIMEOUT.CLI });
}

let tmp: string;

// Same rationale as tests/build/core-package.test.ts: the cold-checkout build
// in beforeAll can outlive bun's 5s default hook timeout on CI.
setDefaultTimeout(120_000);

beforeAll(() => {
  if (!existsSync(DIST)) {
    const build = runSync("bun", ["run", "build:cli"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.BUILD,
    });
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

  test("conform's --include/--exclude globs work on plain Node", () => {
    // `Bun.Glob#match` had no counterpart in the Node polyfill, so the moment
    // conform started filtering paths the compiled CLI died with
    // `g.match is not a function` — on Node only, which is every user who has
    // not installed Bun. The default exclusions run through the same call, so
    // this covers the no-flag path too.
    const cwd = bulkProject(3);
    mkdirSync(join(cwd, "vendor"), { recursive: true });
    const vendored = join(cwd, "vendor", "third-party.html");
    const original = `<div data-variant="NOPE" data-ui="card">x</div>\n`;
    writeFileSync(vendored, original);

    const r = runNode(["conform", "--exclude", "pages/**"], cwd);
    expect(r.stderr ?? "").not.toContain("is not a function");
    expect(r.status).toBe(0);
    // --exclude took the pages out, and `vendor/` was never in.
    expect(r.stdout).not.toContain("pages/");
    expect(readFileSync(vendored, "utf8")).toBe(original);
  });

  test("the generic envelope is complete through a pipe on a zero exit", () => {
    const cwd = bulkProject(700);
    // A real shell pipe, not spawnSync's own: spawnSync drains the child's
    // stdout as it is written, which keeps the buffer from filling and hides
    // the very stall this test exists to catch. `| cat` is what an agent's
    // subprocess wrapper actually looks like.
    const r = runSync("sh", ["-c", `node ${JSON.stringify(DIST)} conform --json | cat`], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: SPAWN_TIMEOUT.CLI,
    });

    expect(r.stdout.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.exit_code).toBe(0);
    expect(envelope.messages.length).toBeGreaterThan(500);
  });
});

// ── the package is bin-only ────────────────────────────────────────────────

describe("faqir-ui-cli declares no importable entry point", () => {
  test("package.json has no `exports` map", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.exports).toBeUndefined();
    expect(pkg.main).toBeUndefined();
    expect(pkg.bin.faqir).toBe("./bin/faqir");
  });

  test("the dist bundle it used to point at still exits the process on load", () => {
    // Not a defect to fix in the bundle — a CLI entry SHOULD parse argv and
    // exit. It is the reason the package must not advertise it as an import:
    // `import "faqir-ui-cli"` ran main() against the *host's* argv and killed
    // the host. This asserts the hazard is real, so the missing `exports` above
    // is understood as load-bearing rather than tidied away later.
    const r = runSync("node", ["-e", `import(${JSON.stringify(DIST)})`], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.CLI,
    });
    // No argv[2] → the CLI prints its help banner and returns; the point is that
    // importing it RUNS the CLI rather than exposing an API.
    expect(r.stdout).toContain("Agent-Native UI Framework CLI");
  });
});

// ── `faqir dev` on the Node path ────────────────────────────────────────────
//
// `runtime-shim.ts`'s `Bun.serve` polyfill (a hand-rolled `node:http` server
// with its own Request/Response adaptation) had NO test at all: `faqir dev` is
// its only consumer, and every dev-server test spawned Bun. So on a machine
// with no Bun installed — which is every user who has not gone out of their way
// — `faqir dev` ran entirely untested code.
//
// One smoke, end to end: start the compiled bundle on Node, ask it for a page,
// and require the page back with the overlay injected. That exercises the
// polyfill's listen, its request adaptation, its `Response` handling and its
// stop path in a single pass.
describe("faqir dev runs on plain Node (the Bun.serve polyfill)", () => {
  test("serves a page, injects the overlay, and stops", async () => {
    const dir = mkdtempSync(join(tmp, "dev-"));
    writeFileSync(join(dir, "index.html"), "<html><body><h1>hello</h1></body></html>");

    const port = 43000 + Math.floor(Math.random() * 10000);
    const server = spawn("node", [DIST, "dev", "--port", String(port)], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const fetchPage = (path: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        });
        req.on("error", reject);
        req.end();
      });

    try {
      let stderr = "";
      server.stderr?.on("data", (b) => (stderr += b));
      let listening = false;
      for (let i = 0; i < 100 && !listening; i++) {
        if (server.exitCode !== null) throw new Error(`dev server exited on Node: ${stderr}`);
        try {
          await fetchPage("/");
          listening = true;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      expect(listening, `dev server never listened on Node: ${stderr}`).toBe(true);

      const page = await fetchPage("/index.html");
      expect(page.status).toBe(200);
      expect(page.body).toContain("<h1>hello</h1>");
      // The overlay proves the response body went through the CLI's own
      // rewriting rather than being streamed straight off disk.
      expect(page.body).toContain("data-faqir-dev-overlay");

      // A path outside the served directory is refused, on this runtime too.
      const escape = await fetchPage("/..%2f..%2fetc/passwd");
      expect(escape.status).toBeGreaterThanOrEqual(400);
    } finally {
      server.kill("SIGKILL");
    }
  }, 60_000);
});
