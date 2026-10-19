// `@faqir-ui/mcp/audit` — the programmatic auditor (forecraft upstream note 7).
//
// The promise is "the same findings as `faqir audit --stdin --json`", so that is
// what is checked: every audit fixture goes through the CLI (spawned from
// source, exactly as an app shells out to it) and through the COMPILED library
// imported on plain Node by its package name — the exports map, the bundle, the
// vendored registry and the runtime shim all in the path — and the two
// documents must be identical. In-process calls cover the option surface.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { SPAWN_TIMEOUT, runSync } from "../../../tests/helpers/spawn";
import { auditHtml, AUDIT_SCHEMA_VERSION } from "../src/audit";

const PKG = resolve(import.meta.dir, "..");
const REPO = resolve(PKG, "..", "..");
const DIST = join(PKG, "dist", "audit.mjs");
const FIXTURES = join(REPO, "tests", "fixtures");
const TMP = join(import.meta.dir, ".tmp-audit-library");
const CONSUMER = join(TMP, "consumer");
const PROJECT = join(TMP, "project");

interface Case {
  name: string;
  html: string;
  /** CLI arguments after `audit --stdin --json`. */
  cliArgs?: string[];
  /** The same switches, as library options. */
  options?: Record<string, unknown>;
  /** Run the CLI here (and pass it as `root`) instead of outside any project. */
  project?: boolean;
}

const fixtureCases: Case[] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".html"))
  .sort()
  .map((file) => ({ name: file, html: readFileSync(join(FIXTURES, file), "utf8") }));

const extraCases: Case[] = [
  { name: "bad variant", html: `<button data-ui="button" data-variant="neon">x</button>` },
  { name: "invented component", html: `<div data-ui="sparkle-panel">x</div>` },
  {
    name: "full page, date-picker in main",
    html:
      `<!doctype html><html><head><title>t</title></head><body><main>` +
      readFileSync(join(REPO, "registry", "recipes", "date-picker", "date-picker.html"), "utf8") +
      `</main></body></html>`,
  },
  {
    name: "skip rules",
    html: `<button data-ui="button" data-variant="neon">x</button><div data-ui="sparkle-panel">x</div>`,
    cliArgs: ["--skip-rules", "valid-variant,unknown-component"],
    options: { skipRules: ["valid-variant", "unknown-component"] },
  },
  {
    name: "a project's own component, with root",
    html: `<div data-ui="my-widget">x</div><button data-ui="button" data-variant="neon">x</button>`,
    project: true,
  },
];

const cases = [...fixtureCases, ...extraCases];

function cliReport(c: Case): unknown {
  const cwd = c.project ? PROJECT : CONSUMER;
  const r = runSync("bun", [join(REPO, "src", "index.ts"), "audit", "--stdin", "--json", ...(c.cliArgs ?? [])], {
    cwd,
    input: c.html,
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT.CLI,
  });
  if (r.status !== 0 && r.status !== 1) throw new Error(`CLI exited ${r.status}: ${r.stderr}`);
  const report = JSON.parse(r.stdout) as { passed: boolean };
  // The exit code is the report's `passed`, and that is the library's contract too.
  expect(r.status).toBe(report.passed ? 0 : 1);
  return report;
}

function libraryOptions(c: Case): Record<string, unknown> {
  return { ...(c.options ?? {}), ...(c.project ? { root: PROJECT } : {}) };
}

function bun(args: string[], cwd: string): void {
  const r = runSync("bun", [join(REPO, "src", "index.ts"), ...args], { cwd, encoding: "utf8", timeout: SPAWN_TIMEOUT.CLI });
  if (r.status !== 0) throw new Error(`faqir ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
}

let nodeReports: unknown[] = [];
let nodeStderr = "";

beforeAll(() => {
  const build = runSync("node", [join(PKG, "build.mjs")], { cwd: PKG, stdio: "pipe", timeout: SPAWN_TIMEOUT.BUILD });
  if (build.status !== 0) throw new Error(`build failed:\n${build.stderr?.toString() ?? ""}`);
  if (!existsSync(DIST)) throw new Error(`compiled library missing at ${DIST}`);

  rmSync(TMP, { recursive: true, force: true });
  // A consumer that depends on the package the way an app does: by name,
  // through node_modules, so the `./audit` exports entry is what resolves.
  mkdirSync(join(CONSUMER, "node_modules", "@faqir-ui"), { recursive: true });
  symlinkSync(PKG, join(CONSUMER, "node_modules", "@faqir-ui", "mcp"), "dir");
  writeFileSync(join(CONSUMER, "package.json"), JSON.stringify({ name: "consumer", type: "module", private: true }));
  writeFileSync(
    join(CONSUMER, "run.mjs"),
    [
      `import { readFileSync } from "node:fs";`,
      `import { auditHtml, AUDIT_SCHEMA_VERSION } from "@faqir-ui/mcp/audit";`,
      `const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));`,
      `const out = [];`,
      `for (const c of cases) out.push(await auditHtml(c.html, c.options));`,
      `if (AUDIT_SCHEMA_VERSION !== 1) throw new Error("schema version");`,
      `process.stdout.write(JSON.stringify(out));`,
    ].join("\n"),
  );

  // A Faqir project with a component of its own, for the `root` overlay.
  mkdirSync(PROJECT, { recursive: true });
  bun(["init"], PROJECT);
  bun(["create", "my-widget", "--kind", "primitive"], PROJECT);

  writeFileSync(
    join(CONSUMER, "cases.json"),
    JSON.stringify(cases.map((c) => ({ html: c.html, options: libraryOptions(c) }))),
  );
  const run = runSync("node", [join(CONSUMER, "run.mjs"), join(CONSUMER, "cases.json")], {
    cwd: CONSUMER,
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT.CLI,
  });
  nodeStderr = run.stderr;
  if (run.status !== 0) throw new Error(`node consumer failed (${run.status}):\n${run.stderr}`);
  nodeReports = JSON.parse(run.stdout);
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("@faqir-ui/mcp/audit on plain Node", () => {
  it("imports by package name without starting the MCP server", () => {
    expect(nodeReports.length).toBe(cases.length);
    expect(nodeStderr).not.toContain("faqir-mcp server running");
  });

  it("the bundle carries no Bun pragma or shebang", () => {
    const head = readFileSync(DIST, "utf8").slice(0, 200);
    expect(head.startsWith("#!")).toBe(false);
    expect(head).not.toContain("// @bun");
  });

  for (const [i, c] of cases.entries()) {
    it(`gives the CLI's findings: ${c.name}`, () => {
      expect(nodeReports[i]).toEqual(cliReport(c));
    });
  }

  it("the fixtures exercise both outcomes", () => {
    const passed = nodeReports.map((r) => (r as { passed: boolean }).passed);
    expect(passed).toContain(true);
    expect(passed).toContain(false);
  });
});

describe("auditHtml options (in process)", () => {
  it("returns the versioned CLI document", async () => {
    const report = await auditHtml(`<button data-ui="button" data-variant="neon">x</button>`);
    expect(report.audit_schema_version).toBe(AUDIT_SCHEMA_VERSION);
    expect(report.passed).toBe(false);
    expect(report.results.map((r) => r.rule_id)).toContain("valid-variant");
    expect(report.results.every((r) => r.file === "<stdin>")).toBe(true);
  });

  it("`root` lays a project's own components over the registry", async () => {
    const html = `<div data-ui="my-widget">x</div>`;
    const bare = await auditHtml(html);
    const inProject = await auditHtml(html, { root: PROJECT });
    expect(bare.results.map((r) => r.rule_id)).toContain("unknown-component");
    expect(inProject.results.map((r) => r.rule_id)).not.toContain("unknown-component");
  });

  it("`components` adds an app's own manifests, validated", async () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO, "registry", "primitives", "badge", "badge.manifest.json"), "utf8"),
    );
    const own = { ...manifest, name: "app-chip" };
    const html = `<span data-ui="app-chip">x</span>`;
    expect((await auditHtml(html)).results.map((r) => r.rule_id)).toContain("unknown-component");
    for (const components of [[own], { "app-chip": own }]) {
      const report = await auditHtml(html, { components });
      expect(report.results.map((r) => r.rule_id)).not.toContain("unknown-component");
    }
    await expect(auditHtml(html, { components: [{ name: "broken" }] })).rejects.toThrow(
      "components 'broken' is not a valid manifest",
    );
  });

  it("`strict` reports undeclared data-* attributes", async () => {
    const html = `<button data-ui="button" data-tracking="x">x</button>`;
    const loose = await auditHtml(html);
    const strict = await auditHtml(html, { strict: true });
    expect(loose.results.map((r) => r.rule_id)).not.toContain("undeclared-markup-attribute");
    expect(strict.results.map((r) => r.rule_id)).toContain("undeclared-markup-attribute");
  });

  it("rejects a non-string", async () => {
    await expect(auditHtml(42 as unknown as string)).rejects.toThrow("html must be a string");
  });
});
