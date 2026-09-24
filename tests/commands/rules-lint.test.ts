// `faqir rules lint` — the lint behind a CLI.
//
// The lint itself is proved in packages/rules/tests/lint.test.ts; what this
// file owns is everything the command adds: reading a definition from a file or
// from stdin, the bespoke `--json` document, and the exit code, which is the
// only part of the output a CI job reads. The contract is `faqir audit`'s —
// non-zero when something is an error, zero when everything is a warning — and
// it is asserted rather than described, because an exit code that quietly
// becomes 0 turns a gate into a decoration.
//
// The last block runs the compiled Node bundle. `src/commands/rules.ts` imports
// `packages/rules/src/index.js` directly, so the published CLI carries the
// evaluator inside it; that only holds if the bundler actually resolves the
// package's ESM source, which no Bun-hosted test can tell you.

import { describe, expect, it, beforeAll, afterAll, setDefaultTimeout } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";
import { RULES_LINT_SCHEMA_VERSION, parseLocales } from "../../src/commands/rules";
import { COMMAND_DEFINITIONS } from "../../src/command-registry";

setDefaultTimeout(180_000);

const SRC_INDEX = join(import.meta.dir, "../../src/index.ts");
const DIST = join(import.meta.dir, "../../dist/faqir.mjs");

const CLEAN = JSON.stringify({
  version: "1",
  fields: {
    plan: { type: "string", enum: ["solo", "team"], required: true },
    seats: { type: "integer", minimum: 1 },
  },
  rules: [{ id: "seats-for-teams", show: "seats", when: { "==": [{ var: "plan" }, "team"] } }],
});

/** A definition whose only problem is a warning: the exit code must stay 0. */
const WARNING_ONLY = JSON.stringify({
  fields: { a: { type: "string" } },
  rules: [{ id: "form-level", validate: { var: "a" }, path: "form" }],
});

const BROKEN = JSON.stringify({
  fields: { plan: { type: "string" } },
  rules: [{ id: "typo", show: "seats", when: { "==": [{ var: "plna" }, "team"] } }],
});

const HALF_TRANSLATED = JSON.stringify({
  fields: { email: { type: "string", format: "email" } },
  messages: { en: { "email.format": "Not an email.", required: "Needed." }, ro: { required: "Necesar." } },
});

function runCli(args: string[], opts: { cwd?: string; input?: string } = {}) {
  const res = runSync(process.execPath, [SRC_INDEX, ...args], {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: SPAWN_TIMEOUT.CLI,
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", status: res.status ?? 0 };
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "faqir-rules-lint-"));
  writeFileSync(join(dir, "clean.json"), CLEAN);
  writeFileSync(join(dir, "warning.json"), WARNING_ONLY);
  writeFileSync(join(dir, "broken.json"), BROKEN);
  writeFileSync(join(dir, "half.json"), HALF_TRANSLATED);
  writeFileSync(join(dir, "not-json.json"), "{ this is not json");
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("faqir rules lint — a definition in a file", () => {
  it("passes a clean definition and exits 0", () => {
    const { stdout, status } = runCli(["rules", "lint", join(dir, "clean.json")]);
    expect(status).toBe(0);
    expect(stdout).toContain("No findings");
  });

  it("reports a broken one and exits 1", () => {
    const { stdout, status } = runCli(["rules", "lint", join(dir, "broken.json")]);
    expect(status).toBe(1);
    expect(stdout).toContain("rule-refs");
    expect(stdout).toContain("plna");
  });

  it("exits 0 when everything it found is a warning", () => {
    const { stdout, status } = runCli(["rules", "lint", join(dir, "warning.json")]);
    expect(status).toBe(0);
    expect(stdout).toContain("rule-refs");
    expect(stdout).toContain("1 warning");
  });

  it("needs no project — a definition is not a Faqir installation", () => {
    const empty = mkdtempSync(join(dir, "empty-"));
    const { status } = runCli(["rules", "lint", join(dir, "clean.json")], { cwd: empty });
    expect(status).toBe(0);
  });

  it("resolves a relative path against the working directory", () => {
    const { status } = runCli(["rules", "lint", "clean.json"], { cwd: dir });
    expect(status).toBe(0);
  });

  it("says so when the file is not there", () => {
    const { stderr, status } = runCli(["rules", "lint", join(dir, "absent.json")]);
    expect(status).toBe(1);
    expect(stderr).toContain("Could not read");
  });

  it("says so when the file is not JSON, in the lint's own vocabulary", () => {
    const { stdout, status } = runCli(["rules", "lint", join(dir, "not-json.json")]);
    expect(status).toBe(1);
    expect(stdout).toContain("schema");
    expect(stdout).toContain("not valid JSON");
  });
});

describe("faqir rules lint --stdin", () => {
  it("lints a definition piped in", () => {
    const { stdout, status } = runCli(["rules", "lint", "--stdin"], { input: CLEAN });
    expect(status).toBe(0);
    expect(stdout).toContain("No findings");
  });

  it("reports a broken one piped in", () => {
    const { stdout, status } = runCli(["rules", "lint", "--stdin"], { input: BROKEN });
    expect(status).toBe(1);
    expect(stdout).toContain("rule-refs");
  });

  it("names <stdin> as the source", () => {
    const { stdout } = runCli(["rules", "lint", "--stdin", "--json"], { input: CLEAN });
    expect(JSON.parse(stdout).source).toBe("<stdin>");
  });
});

describe("faqir rules lint --json", () => {
  it("emits the bespoke document and nothing else", () => {
    const { stdout, status } = runCli(["rules", "lint", "--json", join(dir, "clean.json")]);
    const report = JSON.parse(stdout);
    expect(Object.keys(report).sort()).toEqual([
      "counts", "findings", "ok", "rules_lint_schema_version", "source",
    ]);
    expect(report.rules_lint_schema_version).toBe(RULES_LINT_SCHEMA_VERSION);
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.counts).toEqual({ error: 0, warning: 0 });
    expect(status).toBe(0);
  });

  it("carries every finding's id, severity, place and sentence", () => {
    const { stdout, status } = runCli(["rules", "lint", "--json", join(dir, "broken.json")]);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    expect(status).toBe(1);
    expect(report.counts.error).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(typeof finding.rule).toBe("string");
      expect(["error", "warning"]).toContain(finding.severity);
      expect(typeof finding.path).toBe("string");
      expect(finding.message.length).toBeGreaterThan(0);
    }
    expect(report.findings.some((f: { rule: string }) => f.rule === "rule-refs")).toBe(true);
  });

  it("still prints the document when the file cannot be read", () => {
    const { stdout, status } = runCli(["rules", "lint", "--json", join(dir, "absent.json")]);
    expect(status).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    expect(report.source).toBe(join(dir, "absent.json"));
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].rule).toBe("schema");
    expect(report.findings[0].message).toContain("could not read");
  });

  it("still prints the document when no definition was named", () => {
    const { stdout, status } = runCli(["rules", "lint", "--json"]);
    expect(status).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    expect(report.findings[0].message).toContain("no definition given");
  });

  it("signals failure the way the --json contract requires", () => {
    // The meta-test in tests/commands/json-output.test.ts accepts `ok: false`
    // as a bespoke command's machine-readable failure signal; this is the one
    // this command emits.
    const { stdout, status } = runCli(["rules", "lint", "--json", join(dir, "not-json.json")]);
    expect(status).toBe(1);
    expect(JSON.parse(stdout).ok).toBe(false);
  });
});

describe("--locales", () => {
  it("is parsed from a comma or space separated list", () => {
    expect(parseLocales(["lint", "--locales", "en,ro"])).toEqual(["en", "ro"]);
    expect(parseLocales(["lint", "--locales", "en, ro", "--json"])).toEqual(["en", "ro"]);
    expect(parseLocales(["lint", "--json"])).toEqual([]);
    expect(parseLocales(["lint", "--locales"])).toEqual([]);
  });

  it("turns a locale gap from a warning into an error", () => {
    const without = runCli(["rules", "lint", "--json", join(dir, "half.json")]);
    const withFlag = runCli(["rules", "lint", "--json", "--locales", "en,ro", join(dir, "half.json")]);

    expect(JSON.parse(without.stdout).ok).toBe(true);
    expect(without.status).toBe(0);
    expect(JSON.parse(withFlag.stdout).ok).toBe(false);
    expect(withFlag.status).toBe(1);
  });

  it("does not mistake its own value for the definition path", () => {
    const { stdout, status } = runCli(["rules", "lint", "--locales", "en,ro", "--json", join(dir, "clean.json")]);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).source).toBe(join(dir, "clean.json"));
  });
});

describe("faqir rules, the command", () => {
  it("is registered under Quality with a usage line", () => {
    const definition = COMMAND_DEFINITIONS.rules;
    expect(definition.category).toBe("Quality");
    expect(definition.args).toContain("lint");
    expect(definition.summary.length).toBeGreaterThan(0);
  });

  it("prints help with no subcommand, and exits 0", () => {
    const { stdout, status } = runCli(["rules"]);
    expect(status).toBe(0);
    expect(stdout).toContain("faqir rules lint");
    // The seven rule ids are the reason to read the help at all.
    for (const rule of ["schema", "rule-verb", "rule-ops", "rule-refs", "rule-cycles",
      "rule-unreachable", "rule-messages"]) {
      expect(stdout).toContain(rule);
    }
  });

  it("prints help for --help without linting anything", () => {
    const { stdout, status } = runCli(["rules", "lint", "--help", join(dir, "broken.json")]);
    expect(status).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).not.toContain("plna");
  });

  it("refuses a subcommand it does not have", () => {
    const { stderr, status } = runCli(["rules", "fix"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Unknown subcommand");
  });

  it("asks for a definition when given none", () => {
    const { stderr, status } = runCli(["rules", "lint"]);
    expect(status).toBe(1);
    expect(stderr).toContain("needs a definition");
  });
});

describe("the compiled Node bundle carries the evaluator", () => {
  beforeAll(() => {
    // Not just "is it there": a bundle built before this command existed is
    // still there, and would fail here as an unknown command rather than as the
    // packaging problem this block is looking for.
    const knows = existsSync(DIST) && runSync("node", [DIST, "rules", "--json"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: SPAWN_TIMEOUT.CLI,
    }).status === 0;
    if (knows) return;
    const build = runSync("bun", ["run", "build:cli"], {
      cwd: join(import.meta.dir, "../.."),
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.BUILD,
    });
    if (build.status !== 0) {
      throw new Error(`build:cli failed:\n${build.stdout ?? ""}${build.stderr ?? ""}`);
    }
  });

  it("lints on Node, with no dependency to install", () => {
    const clean = runSync("node", [DIST, "rules", "lint", "--json", join(dir, "clean.json")], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: SPAWN_TIMEOUT.CLI,
    });
    const report = JSON.parse(clean.stdout ?? "");
    expect(report.ok).toBe(true);
    expect(clean.status ?? 0).toBe(0);

    const broken = runSync("node", [DIST, "rules", "lint", "--json", join(dir, "broken.json")], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: SPAWN_TIMEOUT.CLI,
    });
    expect(JSON.parse(broken.stdout ?? "").ok).toBe(false);
    expect(broken.status).toBe(1);
  });
});
