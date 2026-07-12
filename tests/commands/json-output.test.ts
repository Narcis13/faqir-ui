import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMAND_NAMES } from "../../src/command-registry";
import { AUDIT_SCHEMA_VERSION } from "../../src/audit/reporter";

const SRC_INDEX = join(import.meta.dir, "../../src/index.ts");

/** Run the CLI (via the same Bun runtime) and capture its stdout/exit code. */
function runCli(args: string[], opts: { cwd?: string; input?: string } = {}) {
  const res = spawnSync(process.execPath, [SRC_INDEX, ...args], {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    // Keep runs fast and deterministic; commands must not block on stdin.
    stdio: ["pipe", "pipe", "pipe"],
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
    // bump AUDIT_SCHEMA_VERSION (and the MCP tool / 1.0 freeze docs).
    expect(Object.keys(report).sort()).toEqual([
      "audit_schema_version",
      "components_found",
      "counts",
      "files_scanned",
      "passed",
      "results",
    ]);
    expect(Object.keys(report.counts).sort()).toEqual(["critical", "error", "info", "warning"]);
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
