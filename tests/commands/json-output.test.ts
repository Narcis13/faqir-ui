import { describe, it, expect, beforeAll, afterAll, setDefaultTimeout } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMAND_NAMES } from "../../src/command-registry";
import { AUDIT_SCHEMA_VERSION } from "../../src/audit/reporter";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const SRC_INDEX = join(import.meta.dir, "../../src/index.ts");

/** Run the CLI (via the same Bun runtime) and capture its stdout/exit code. */
function runCli(args: string[], opts: { cwd?: string; input?: string } = {}) {
  const res = runSync(process.execPath, [SRC_INDEX, ...args], {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    // Keep runs fast and deterministic; commands must not block on stdin.
    stdio: ["pipe", "pipe", "pipe"],
    timeout: SPAWN_TIMEOUT.CLI,
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", status: res.status ?? 0 };
}

describe("faqir audit --stdin", () => {
  it("audits HTML piped on stdin and emits the versioned schema", () => {
    const html = '<button data-ui="button" data-variant="primary">Hi</button>';
    const { stdout, status } = runCli(["audit", "--stdin", "--json"], { input: html });

    const report = JSON.parse(stdout);
    expect(report.audit_schema_version).toBe(AUDIT_SCHEMA_VERSION);
    expect(report.passed).toBe(true);
    expect(report.components_found).toBe(1);
    expect(status).toBe(0);
  });

  it("reports findings and exits non-zero on invalid markup", () => {
    const html = '<button data-ui="button" data-variant="neon">Bad</button>';
    const { stdout, status } = runCli(["audit", "--stdin", "--json"], { input: html });

    const report = JSON.parse(stdout);
    expect(report.audit_schema_version).toBe(AUDIT_SCHEMA_VERSION);
    expect(report.passed).toBe(false);
    expect(report.results.some((r: { rule_id: string }) => r.rule_id === "valid-variant")).toBe(true);
    expect(status).toBe(1);
  });

  it("works without a project (uses registry manifests)", () => {
    const dir = mkdtempSync(join(tmpdir(), "faqir-stdin-"));
    try {
      const html = '<div data-ui="card"><div data-part="body">x</div></div>';
      const { stdout } = runCli(["audit", "--stdin", "--json"], { cwd: dir, input: html });
      const report = JSON.parse(stdout);
      expect(report.audit_schema_version).toBe(AUDIT_SCHEMA_VERSION);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("audit JSON schema shape", () => {
  it("has a stable top-level shape", () => {
    const html = '<button data-ui="button" data-variant="neon">Bad</button>';
    const { stdout } = runCli(["audit", "--stdin", "--json"], { input: html });
    const report = JSON.parse(stdout);

    // Snapshot of the schema *shape* — a change here is a schema change and must
    // bump AUDIT_SCHEMA_VERSION (and the MCP tool / 1.0 freeze docs). Note the
    // version is NOT bumped for an added key: `vendor_counts` (W2-3) is
    // additive, and AUDIT_SCHEMA_VERSION documents additive fields as
    // non-breaking. A reader that ignores it reads exactly what it read before.
    expect(Object.keys(report).sort()).toEqual([
      "audit_schema_version",
      "components_found",
      "counts",
      "files_scanned",
      "passed",
      "results",
      "vendor_counts",
    ]);
    expect(Object.keys(report.counts).sort()).toEqual(["critical", "error", "info", "warning"]);
    expect(Object.keys(report.vendor_counts).sort()).toEqual(["critical", "error", "info", "warning"]);
    expect(Object.keys(report.results[0]).sort()).toEqual([
      "component_name",
      "file",
      "fixable",
      "line",
      "message",
      "rule_id",
      "severity",
    ]);
  });
});

describe("universal --json guarantee", () => {
  // Fresh empty dir per command so no ambient faqir.config.json leaks in — most
  // commands then hit their "no project" error path, exercising JSON-on-error.
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "faqir-json-meta-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers at least 20 commands", () => {
    expect(COMMAND_NAMES.length).toBeGreaterThanOrEqual(20);
  });

  for (const name of COMMAND_NAMES) {
    it(`\`faqir ${name} --json\` emits parseable JSON`, () => {
      // A fresh sub-dir keeps side-effectful commands (e.g. init) isolated.
      const cwd = mkdtempSync(join(dir, `${name}-`));
      const { stdout, status } = runCli([name, "--json"], { cwd });

      expect(stdout.trim().length).toBeGreaterThan(0);
      const parsed = JSON.parse(stdout); // throws → test fails if not valid JSON
      expect(typeof parsed).toBe("object");
      expect(parsed).not.toBeNull();

      // Non-zero exits must still carry a machine-readable failure signal:
      // either the generic envelope's ok:false, or a bespoke error payload.
      if (status !== 0) {
        const signalsFailure =
          parsed.ok === false ||
          "error" in parsed ||
          parsed.passed === false ||
          parsed.hasConflicts === true;
        expect(signalsFailure).toBe(true);
      }
    });
  }
});

// NOTE: the "large payload through a pipe" regression lives in
// tests/build/dist-cli.test.ts, not here. This file spawns `process.execPath`,
// which under `bun test` is the Bun binary, and Bun's console.log is synchronous
// — so the async-stdout truncation this repo shipped is invisible from here. It
// only reproduces against the compiled bundle on Node, which is what the
// published `bin/faqir` actually runs.

// ═══════════════════════════════════════════════════════════════════════════
// The same guarantee, on the runtime the artifact actually uses  [W3-5]
// ═══════════════════════════════════════════════════════════════════════════
//
// The loop above spawns `process.execPath`, which under `bun test` is the Bun
// binary — so for as long as it existed, the file guarding the `--json` contract
// across all 22 commands never once ran the thing users run. `bin/faqir` is
// `#!/usr/bin/env node`, and on Node the CLI is a different program: `Bun.file`,
// `Bun.write` and `Bun.Glob` are all `src/utils/runtime-shim.ts` standing in for
// them, and `console.log` writes through an async stream rather than
// synchronously. That is not a hypothetical difference — it is why a truncated
// `--json` payload shipped (see tests/build/dist-cli.test.ts) and why
// `trace --json` came back in a different ORDER depending on whether the user
// had Bun installed.
//
// Two other things change here at the same time, because they are the same
// mistake:
//
//   • A REAL PROJECT, not an empty directory. Every command above hits its "no
//     project" error path, so the loop proved that 22 commands can *fail* in
//     JSON and nothing about what they emit when they work.
//   • KEY SETS, not `typeof parsed === "object"`. A command that silently
//     stopped emitting `results`, or started emitting a bare `{}`, passed.

describe("universal --json guarantee · compiled bundle on Node, in a real project", () => {
  const DIST = join(import.meta.dir, "../../dist/faqir.mjs");

  /** The generic envelope every command falls back to. `error` is present only on a failure. */
  const ENVELOPE = ["command", "exit_code", "json_schema_version", "messages", "ok"];

  /**
   * What each command emits in a project that HAS one. `null` means the generic
   * envelope; an array is the exact key set. Recorded from the compiled bundle
   * on Node — the shape an agent parsing this CLI actually receives.
   */
  const SHAPES: Record<string, string[] | null> = {
    init: null,
    doctor: null,
    add: null,
    remove: null,
    diff: ["components", "schema"],
    upgrade: ["components", "dryRun", "hasConflicts", "schema"],
    list: null,
    search: null,
    create: null,
    inspect: null,
    audit: [
      "audit_schema_version",
      "components_found",
      "counts",
      "files_scanned",
      "passed",
      "results",
      "vendor_counts",
    ],
    repair: null,
    context: ["command", "formats"],
    explain: null,
    trace: null,
    conform: null,
    theme: null,
    variant: null,
    scaffold: null,
    bundle: null,
    dev: [
      "auto_bundle",
      "command",
      "dir",
      "overlay",
      "overlay_route",
      "overlay_shortcut",
      "port",
      "serves",
      "url",
    ],
    bindings: null,
  };

  let template: string;
  let workspace: string;

  // A cold `build:cli` on a loaded runner outlives bun's default hook timeout.
  setDefaultTimeout(180_000);

  beforeAll(() => {
    if (!existsSync(DIST)) {
      const build = runSync("bun", ["run", "build:cli"], {
        cwd: join(import.meta.dir, "../.."),
        encoding: "utf8",
        timeout: SPAWN_TIMEOUT.BUILD,
      });
      if (build.status !== 0) {
        throw new Error(`build:cli failed:\n${build.stdout ?? ""}${build.stderr ?? ""}`);
      }
    }

    workspace = mkdtempSync(join(tmpdir(), "faqir-json-node-"));
    template = join(workspace, "template");
    mkdirSync(template, { recursive: true });

    const node = (args: string[]) =>
      runSync("node", [DIST, ...args], { cwd: template, encoding: "utf8", timeout: SPAWN_TIMEOUT.CLI });

    expect(node(["init", "--yes"]).status, "init failed in the fixture project").toBe(0);
    expect(node(["add", "card", "button", "badge"]).status, "add failed").toBe(0);
    // Something for `audit` / `conform` / `repair` to have an opinion about.
    writeFileSync(
      join(template, "page.html"),
      '<div data-ui="card"><div data-part="body">x</div></div>\n',
    );
  });

  afterAll(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  it("the shape table covers every registered command", () => {
    // A command added without a line here would otherwise skip the check.
    expect(Object.keys(SHAPES).sort()).toEqual([...COMMAND_NAMES].sort());
  });

  for (const name of COMMAND_NAMES) {
    it(`node dist/faqir.mjs ${name} --json emits its documented shape`, () => {
      // A copy per command, so a side-effectful one (init, add, remove, repair,
      // conform, bundle) cannot change what the next one sees.
      const cwd = mkdtempSync(join(workspace, `${name}-`));
      cpSync(template, cwd, { recursive: true });

      const r = runSync("node", [DIST, name, "--json"], {
        cwd,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: SPAWN_TIMEOUT.CLI,
      });
      const stdout = r.stdout ?? "";

      expect(stdout.trim().length, `${name} emitted nothing on stdout`).toBeGreaterThan(0);
      const parsed = JSON.parse(stdout); // throws → the test fails, which is the point
      expect(parsed).not.toBeNull();
      expect(typeof parsed).toBe("object");

      const expected = SHAPES[name] ?? ENVELOPE;
      const keys = Object.keys(parsed).sort();
      // The envelope carries `error` only on a failure, so it is allowed but not
      // required; every other key must be exactly the recorded set.
      expect(keys.filter((k) => k !== "error"), `${name} --json changed shape`).toEqual(
        [...expected].sort(),
      );

      if (SHAPES[name] === null) {
        expect(typeof parsed.ok).toBe("boolean");
        expect(typeof parsed.exit_code).toBe("number");
        expect(Array.isArray(parsed.messages)).toBe(true);
      }

      if ((r.status ?? 0) !== 0) {
        const signalsFailure =
          parsed.ok === false ||
          "error" in parsed ||
          parsed.passed === false ||
          parsed.hasConflicts === true;
        expect(signalsFailure, `${name} exited ${r.status} without a machine-readable signal`).toBe(true);
      }
    });
  }
});
