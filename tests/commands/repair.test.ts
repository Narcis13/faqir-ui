// `faqir audit <file>`, `faqir audit --fix`, and `faqir repair --json`.
//
// Three defects, one argument surface:
//   - `faqir audit page.html` ignored its positional argument and audited the
//     whole project, silently;
//   - `audit --fix` forwarded `--file`, `--skip-rules` and `--strict` to repair,
//     which read none of them — so a scoped fix mutated every file;
//   - `repair --json` was documented in `--help` and never implemented: it
//     produced the generic envelope of log lines, not a list of fixes.
//
// Spawned through the CLI entry rather than called in-process: the error paths
// exit the process, and the JSON document is only written in `--json` mode,
// which the entry arms.

import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAuditTarget, parseSkipRules } from "../../src/commands/audit";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ENTRY = join(import.meta.dir, "../../src/index.ts");

// Two files, each with a close button that has no accessible name — the one
// fix every dialog audit offers and `repair` knows how to make.
const PAGE = (label: string) =>
  `<div data-ui="dialog"><div data-part="panel" role="dialog" aria-modal="true">` +
  `<button data-part="close"></button>${label}</div></div>\n`;

// Every test spawns the CLI at least once; bun's 5s default is shorter than a
// cold spawn on a loaded machine.
setDefaultTimeout(60_000);

let workspace: string;
let template: string;

function cli(args: string[], cwd: string) {
  return runSync("bun", [ENTRY, ...args], { cwd, encoding: "utf8", timeout: SPAWN_TIMEOUT.CLI });
}

function project(): string {
  const cwd = mkdtempSync(join(workspace, "p-"));
  cpSync(template, cwd, { recursive: true });
  return cwd;
}

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "faqir-repair-cmd-"));
  template = join(workspace, "template");
  mkdirSync(template);
  expect(cli(["init", "--yes"], template).status).toBe(0);
  expect(cli(["add", "dialog"], template).status).toBe(0);
  writeFileSync(join(template, "a.html"), PAGE("A"));
  writeFileSync(join(template, "b.html"), PAGE("B"));
}, 120_000);

afterAll(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

describe("parseAuditTarget", () => {
  it("reads --file and a bare positional path the same way", () => {
    expect(parseAuditTarget(["--file", "a.html"])).toEqual({ file: "a.html" });
    expect(parseAuditTarget(["a.html", "--json"])).toEqual({ file: "a.html" });
    expect(parseAuditTarget(["--json"])).toEqual({ file: undefined });
    expect(parseAuditTarget(["--file", "a.html", "a.html"])).toEqual({ file: "a.html" });
  });

  it("refuses what it cannot interpret", () => {
    expect(parseAuditTarget(["--file"]).error).toContain("--file needs a path");
    expect(parseAuditTarget(["--file", "--json"]).error).toContain("--file needs a path");
    expect(parseAuditTarget(["a.html", "b.html"]).error).toContain("one file");
    expect(parseAuditTarget(["--file", "a.html", "b.html"]).error).toContain("two targets");
  });

  it("--skip-rules stops at a path, so the path is the target and not a rule id", () => {
    const args = ["--skip-rules", "close-label", "a.html"];
    expect(parseSkipRules(args)).toEqual(["close-label"]);
    expect(parseAuditTarget(args)).toEqual({ file: "a.html" });
  });
});

describe("faqir audit <file>", () => {
  it("audits only the named file", () => {
    const cwd = project();
    const r = cli(["audit", "a.html", "--json"], cwd);
    const report = JSON.parse(r.stdout);
    const files = new Set(report.results.map((x: { file: string }) => x.file));
    expect(files.has("a.html")).toBe(true);
    expect(files.has("b.html")).toBe(false);
    expect(report.files_scanned).toBe(1);
  });

  it("a file that does not exist is an error, not a clean audit", () => {
    const r = cli(["audit", "nope.html"], project());
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("No such file: nope.html");
  });
});

describe("faqir audit --fix honours the flags it forwards", () => {
  it("--file scopes the repair to that file", () => {
    const cwd = project();
    const r = cli(["audit", "--fix", "--file", "a.html"], cwd);
    expect(r.status).toBe(0);
    expect(readFileSync(join(cwd, "a.html"), "utf8")).toContain('aria-label="Close"');
    expect(readFileSync(join(cwd, "b.html"), "utf8")).toBe(PAGE("B"));
  });

  it("--skip-rules leaves that rule's fixes alone", () => {
    const cwd = project();
    cli(["audit", "--fix", "--skip-rules", "close-label,required-aria"], cwd);
    expect(readFileSync(join(cwd, "a.html"), "utf8")).toBe(PAGE("A"));
    expect(readFileSync(join(cwd, "b.html"), "utf8")).toBe(PAGE("B"));
  });

  it("--strict is refused with the reason, not silently dropped", () => {
    const cwd = project();
    const r = cli(["audit", "--fix", "--strict"], cwd);
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("--strict has no effect on repair");
    expect(readFileSync(join(cwd, "a.html"), "utf8")).toBe(PAGE("A"));
  });
});

describe("faqir repair --json", () => {
  it("emits every fix with its outcome, and what the re-audit still reports", () => {
    const cwd = project();
    const r = cli(["repair", "--json"], cwd);
    expect(r.status).toBe(0);
    const doc = JSON.parse(r.stdout);
    expect(doc.repair_schema_version).toBe(1);
    expect(doc.dry_run).toBe(false);
    expect(doc.fixes_applied).toBeGreaterThanOrEqual(2);
    expect(doc.files_modified).toBe(2);
    // Two rules (`required-aria`, `close-label`) offer the same aria-label for
    // each button: the first applies and the second is reported as skipped —
    // both are listed, so the outcome of every offered fix is visible.
    type Fix = { file: string; rule_id: string; applied: boolean; type: string; line: number };
    for (const file of ["a.html", "b.html"]) {
      const forFile = (doc.fixes as Fix[]).filter((f) => f.file === file);
      expect(forFile.map((f) => f.rule_id)).toContain("close-label");
      expect(forFile.filter((f) => f.applied).length, file).toBeGreaterThanOrEqual(1);
      for (const f of forFile) {
        expect(f.type).toBe("add-attribute");
        expect(typeof f.line).toBe("number");
      }
      expect(readFileSync(join(cwd, file), "utf8")).toContain('aria-label="Close"');
    }
    expect(doc.fixes_skipped).toBe((doc.fixes as Fix[]).filter((f) => !f.applied).length);
    expect(Array.isArray(doc.remaining)).toBe(true);
  });

  it("--dry-run reports the same fixes, writes nothing, and re-audits nothing", () => {
    const cwd = project();
    const r = cli(["repair", "--json", "--dry-run", "b.html"], cwd);
    const doc = JSON.parse(r.stdout);
    expect(doc.dry_run).toBe(true);
    expect(doc.remaining).toBeNull();
    expect(doc.fixes.every((f: { file: string }) => f.file === "b.html")).toBe(true);
    expect(doc.fixes.some((f: { applied: boolean }) => f.applied)).toBe(true);
    expect(readFileSync(join(cwd, "b.html"), "utf8")).toBe(PAGE("B"));
  });
});

// `repair` and a missing controller (task 1.1F-25, entry 10). It used to append
// `<script type="module" src="ui/recipes/dialog/dialog.js">` beside an engine
// that already carried the controller: a hard-coded `ui/`, wrong from a page in
// a subdirectory, checked for idempotency by `includes("faqir.js")`, and a
// module that only exports `createDialog`, so it started nothing.
describe("faqir repair: a missing controller", () => {
  const FULL_PAGE = `<!doctype html>
<html lang="en"><head><title>P</title></head><body><main>
<div data-ui="dialog"><div data-part="panel" role="dialog" aria-modal="true" aria-label="P"><button data-part="close" aria-label="Close"></button>P</div></div>
</main></body></html>
`;
  type Fix = { file: string; rule_id: string; type: string; applied: boolean };

  it("a page that runs the engine from a module gets no add-script fix", () => {
    const cwd = project();
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app/main.mjs"), `import Faqir from "../ui/core/faqir-core.mjs";\n`);
    const page = FULL_PAGE.replace("</head>", `<script type="module" src="app/main.mjs"></script></head>`);
    writeFileSync(join(cwd, "index.html"), page);

    const doc = JSON.parse(cli(["repair", "--json", "index.html"], cwd).stdout);
    expect((doc.fixes as Fix[]).filter((f) => f.type === "add-script")).toEqual([]);
    expect(doc.remaining.filter((r: Fix) => r.rule_id === "controller-loaded")).toEqual([]);
    expect(readFileSync(join(cwd, "index.html"), "utf8")).toBe(page);
  });

  it("loads <output_dir>/core/faqir.js relative to the page, and a second run is a no-op", () => {
    const cwd = mkdtempSync(join(workspace, "deep-"));
    expect(cli(["init", "--yes", "--dir", "web/ui"], cwd).status).toBe(0);
    expect(cli(["add", "dialog"], cwd).status).toBe(0);
    mkdirSync(join(cwd, "pages"));
    writeFileSync(join(cwd, "pages/p.html"), FULL_PAGE);

    const first = JSON.parse(cli(["repair", "--json", "pages/p.html"], cwd).stdout);
    const scripts = (first.fixes as Fix[]).filter((f) => f.type === "add-script");
    expect(scripts.map((f) => [f.rule_id, f.applied])).toEqual([["controller-loaded", true]]);
    const repaired = readFileSync(join(cwd, "pages/p.html"), "utf8");
    expect(repaired).toContain(`  <script type="module" src="../web/ui/core/faqir.js"></script>\n</body>`);
    expect(repaired).not.toContain("recipes/");
    expect(existsSync(join(cwd, "pages", "../web/ui/core/faqir.js"))).toBe(true);
    expect(first.remaining.filter((r: Fix) => r.rule_id === "controller-loaded" || r.rule_id === "focus-trap")).toEqual([]);

    const second = JSON.parse(cli(["repair", "--json", "pages/p.html"], cwd).stdout);
    expect(second.fixes_applied).toBe(0);
    expect(second.files_modified).toBe(0);
    expect(readFileSync(join(cwd, "pages/p.html"), "utf8")).toBe(repaired);
  });
});
