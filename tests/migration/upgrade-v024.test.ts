import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { upgrade } from "../../src/commands/upgrade";
import { audit } from "../../src/commands/audit";
import { doctor } from "../../src/commands/doctor";
import { getRegistryPath } from "../../src/utils/fs";
import { readPristineIndex } from "../../src/utils/pristine";
import { missingConfigMessage } from "../../src/utils/config";
import { LEGACY_RENAMES, MIGRATION_STEPS, parseMigrationDoc } from "../../src/migration";

// End-to-end proof for task 1.0-03: a real v0.2.4 project reaches 1.0 by the
// steps `docs/migration-1.0.md` documents, in the order it documents them.
//
// The fixture under `tests/fixtures/v024-project/` is not a reconstruction. Its
// components are the bytes `git archive v0.2.4` produces — old manifests, old
// stylesheets, old controllers — and its page is written in the vocabulary those
// manifests declared: `data-state="error"`, `data-variant="horizontal"`,
// `data-max="lg"`, a `data-stack-below="sm"` that meant 480px, and a date-picker
// whose month grid sits directly in the popup. The only stand-in is the engine
// itself: `ui/core/loom-core.js` is a comment where 114 KB used to be, because
// what the migration moves is the file's name and the global it publishes.
//
// The whole procedure runs once in `beforeAll` — it is a sequence, and a case
// per step would re-run everything before it — and each `it` interrogates what
// it left behind. `RAN` records the step ids as they execute, so the last case
// can hold the executed order against `MIGRATION_STEPS`.

const ROOT = join(import.meta.dir, "../..");
const FIXTURE = join(import.meta.dir, "../fixtures/v024-project");
const WORK = join(import.meta.dir, "../.tmp-v024-migration");
const DOC = join(ROOT, "docs/migration-1.0.md");

/** Step ids, in the order the migration actually performed them. */
const RAN: string[] = [];

interface Capture {
  output: string;
  code: number;
}

/** Run a command with stdout and `process.exit` captured (see upgrade.test.ts). */
async function run(fn: () => Promise<void>): Promise<Capture> {
  const chunks: string[] = [];
  const origLog = console.log;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  let code = 0;
  console.log = (...a: unknown[]) => {
    chunks.push(a.map(String).join(" ") + "\n");
  };
  (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string) => {
    chunks.push(s);
    return true;
  };
  process.exit = ((c: number) => {
    code = c;
    throw new Error("__exit__");
  }) as never;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__exit__") throw e;
  } finally {
    console.log = origLog;
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return { output: chunks.join(""), code };
}

/** The JSON envelope a `--json` command printed. */
function parseJson<T>(capture: Capture): T {
  const start = capture.output.indexOf("{");
  return JSON.parse(capture.output.slice(start)) as T;
}

interface AuditEnvelope {
  passed: boolean;
  counts: { critical: number; error: number; warning: number; info: number };
  /** Findings in `ui/` — the framework's own installed files. See W2-3. */
  vendor_counts: { critical: number; error: number; warning: number; info: number };
  results: Array<{ rule_id: string; severity: string; file: string; message: string; component_name: string }>;
}

interface UpgradeEnvelope {
  hasConflicts: boolean;
  components: Array<{
    component: string;
    status: string;
    fromVersion: string | null;
    toVersion: string | null;
    breaking: boolean;
    changes: Array<{ version: string; note: string; breaking: boolean }>;
    summary: { updated: number; added: number; deleted: number; unchanged: number; conflicts: number };
  }>;
}

const page = () => readFileSync(join(WORK, "app/index.html"), "utf8");
const writePage = (html: string) => writeFileSync(join(WORK, "app/index.html"), html);
const config = () => JSON.parse(readFileSync(join(WORK, "faqir.config.json"), "utf8"));

let legacyMessage = "";
let legacyRun: Capture;
let preAudit: AuditEnvelope;
let midAudit: AuditEnvelope;
let postAudit: AuditEnvelope;
let upgradeReport: UpgradeEnvelope;
let upgradeHuman = "";
let backfillOutput = "";
let baselineIndex: Awaited<ReturnType<typeof readPristineIndex>>;
let doctorRun: Capture;

beforeAll(async () => {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  // `cpSync`, not the CLI's `copyDir`: the fixture's `.loom/` is a dot
  // directory and `Bun.Glob` does not walk into those.
  cpSync(FIXTURE, WORK, { recursive: true });
  process.chdir(WORK);

  // ── What the CLI says before anything is done ──
  // The first thing a v0.2.4 project meets is a command that will not run —
  // not even `--json`, because there is no project to report on.
  legacyMessage = missingConfigMessage(WORK);
  legacyRun = await run(() => audit(["--json"]));

  // ── Step: commit ──
  // Nothing to execute — the fixture stands in for a clean working tree.
  RAN.push("commit");

  // ── Step: rename ──
  RAN.push("rename");
  renameSync(join(WORK, "loom.config.json"), join(WORK, "faqir.config.json"));
  renameSync(join(WORK, ".loom"), join(WORK, ".faqir"));
  renameSync(join(WORK, "ui/loom.bundle.css"), join(WORK, "ui/faqir.bundle.css"));
  writeFileSync(
    join(WORK, "faqir.config.json"),
    readFileSync(join(WORK, "faqir.config.json"), "utf8").replace("loom.bundle.css", "faqir.bundle.css"),
  );
  // Not a step of its own: with the config renamed the project is visible to
  // the CLI for the first time, and this is the 1.0 audit of a v0.2.4 project
  // whose pages have not been touched yet.
  preAudit = parseJson<AuditEnvelope>(await run(() => audit(["--json"])));

  writePage(page().replace("loom.bundle.css", "faqir.bundle.css").replace("core/loom.js", "core/faqir.js"));
  rmSync(join(WORK, "ui/core/loom-core.js"));
  rmSync(join(WORK, "ui/core/loom.js"));

  // ── Step: init --force ──
  RAN.push("init");
  await run(() => init(["--force"]));

  // ── Step: baseline ──
  RAN.push("baseline");
  const installed = config().installed;
  backfillOutput = (
    await run(() => add([...installed.primitives, ...installed.recipes, ...installed.patterns]))
  ).output;
  baselineIndex = await readPristineIndex(WORK);

  // ── Step: upgrade ──
  RAN.push("upgrade");
  const human = await run(() => upgrade([]));
  upgradeHuman = human.output;
  expect(human.code).toBe(0); // exit 2 would mean conflict markers to resolve
  upgradeReport = parseJson<UpgradeEnvelope>(await run(() => upgrade(["--json"])));
  midAudit = parseJson<AuditEnvelope>(await run(() => audit(["--json"])));

  // ── Step: markup ──
  // The two edits the changelog asked for, and nothing else. Each one is held
  // against the doc's own section for that component further down.
  RAN.push("markup");
  writePage(page().replace('data-ui="field-group" data-state="error"', 'data-ui="field-group" data-state="invalid"'));
  // `surface` 2.0.0 — the measure ladder replaced the breakpoint-named widths
  // (docs/migration-1.0.md §"data-max speaks the measure ladder": lg → wide).
  // This rename is as documented as the `data-state` one above and was missing
  // from this walkthrough until `attribute-vocabulary` (W2-2) reported the
  // leftover `data-max="lg"`: no rule had ever checked a non-protocol enum, so
  // an incomplete migration audited clean.
  writePage(page().replace('data-max="lg"', 'data-max="wide"'));
  writePage(
    page()
      .replace(
        '<div data-part="calendar" role="dialog" aria-label="Date picker" hidden>\n              <div data-part="header">',
        '<div data-part="calendar" role="dialog" aria-label="Date picker" hidden>\n              <div data-ui="calendar" data-size="md">\n              <div data-part="header">',
      )
      .replace("              </table>\n            </div>", "              </table>\n              </div>\n            </div>"),
  );

  // ── Step: verify ──
  RAN.push("verify");
  doctorRun = await run(() => doctor([]));
  postAudit = parseJson<AuditEnvelope>(await run(() => audit(["--json"])));
});

afterAll(() => {
  process.chdir(ROOT);
  rmSync(WORK, { recursive: true, force: true });
});

describe("v0.2.4 → 1.0 · the project the CLI cannot see", () => {
  it("refuses to run, and names the rename instead of suggesting init", () => {
    expect(legacyRun.code).toBe(1);
    expect(legacyRun.output + legacyMessage).toContain("loom.config.json");
    expect(legacyMessage).toContain("loom.config.json");
    expect(legacyMessage).toContain("docs/migration-1.0.md");
    // The old advice would have written a config with an empty `installed`
    // list beside a project full of components.
    expect(legacyMessage).toContain("Do not run 'faqir init' here first");
  });

  it("audits as a broken 1.0 project before the migration", () => {
    expect(preAudit.passed).toBe(false);
    const pageFindings = preAudit.results.filter((r) => r.file.startsWith("app/"));
    // The v0.2.4 vocabulary the 1.0 registry no longer recognises, plus the
    // engine the page loads under its old name.
    expect(pageFindings.some((r) => r.message.includes("striped"))).toBe(true);
    expect(pageFindings.some((r) => r.rule_id === "controller-loaded")).toBe(true);
    // Both halves: `counts` is authored-only since W2-3, and a pre-migration
    // project is broken on both sides of that line — the page speaks a
    // vocabulary the 1.0 manifests no longer declare, and `ui/` still holds
    // v0.2.4 component sources.
    const preErrors =
      preAudit.counts.critical +
      preAudit.counts.error +
      preAudit.vendor_counts.critical +
      preAudit.vendor_counts.error;
    expect(preErrors).toBeGreaterThan(10);
  });
});

describe("v0.2.4 → 1.0 · the documented steps", () => {
  it("leaves nothing behind under the framework's old name", () => {
    for (const rename of LEGACY_RENAMES) {
      const from = rename.from.replace("<output_dir>/", "ui/").replace(/\/$/, "");
      expect(existsSync(join(WORK, from))).toBe(false);
      const to = rename.to.replace("<output_dir>/", "ui/").replace(/\/$/, "");
      // `.faqir/` and the two core files are written by the steps that follow
      // the rename; every target exists by the end of the procedure.
      expect(existsSync(join(WORK, to))).toBe(true);
    }
    expect(page()).not.toContain("loom");
  });

  it("keeps the component inventory across `faqir init --force`", () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURE, "loom.config.json"), "utf8"));
    const after = config();
    for (const layer of ["primitives", "recipes", "patterns"] as const) {
      for (const name of fixture.installed[layer]) expect(after.installed[layer]).toContain(name);
    }
    // …and refreshes what the registry owns, which `upgrade` never touches.
    expect(existsSync(join(WORK, "ui/core/faqir-core.js"))).toBe(true);
    expect(existsSync(join(WORK, "ui/core/faqir.js"))).toBe(true);
    expect(readFileSync(join(WORK, "ui/tokens/index.css"), "utf8")).toContain("--measure-prose");
  });

  it("backfills the baseline from the project's own copy, at the version it records", () => {
    const index = baselineIndex;
    // v0.2.4 shipped every component at 1.0.0. A baseline taken from today's
    // registry would have recorded today's version and left `upgrade` with
    // nothing to do — the failure mode this fixture exists to catch.
    for (const name of ["field-group", "stack", "surface", "grid", "table", "date-picker", "dialog"]) {
      expect(index.components[name].version).toBe("1.0.0");
      expect(index.components[name].backfilled).toBe(true);
    }
    expect(backfillOutput).toContain("captured one from your installed copy at 1.0.0");
  });

  it("installs the dependencies 1.0 components acquired", () => {
    // date-picker@2.0.0 composes `calendar`; the backfill step resolves it.
    expect(config().installed.recipes).toContain("calendar");
    expect(existsSync(join(WORK, "ui/recipes/calendar/calendar.css"))).toBe(true);
  });
});

describe("v0.2.4 → 1.0 · the upgrade", () => {
  it("carries every installed component to its 1.0 version with no conflicts", () => {
    expect(upgradeReport.hasConflicts).toBe(false);
    for (const component of upgradeReport.components) {
      // This is the *second* upgrade run: a first pass that left anything
      // unmerged would show up here as work still to do.
      expect(component.status).toBe("up-to-date");
      const manifest = JSON.parse(readFileSync(join(getRegistryPath(), componentPath(component.component)), "utf8"));
      expect(component.toVersion).toBe(manifest.version);
    }
    expect(upgradeReport.components.length).toBeGreaterThanOrEqual(14);
  });

  it("printed every breaking change on the path, with its migration", () => {
    for (const [component, version] of [
      ["field-group", "2.0.0"],
      ["grid", "2.0.0"],
      ["stack", "2.0.0"],
      ["surface", "2.0.0"],
      ["table", "3.0.0"],
      ["date-picker", "2.0.0"],
      ["auth-form", "2.0.0"],
    ] as const) {
      expect(upgradeHuman).toContain(`✗ ${version}`);
      expect(upgradeHuman).toContain(component);
    }
    expect(upgradeHuman).toContain("BREAKING CHANGES in this upgrade");
  });

  it("carries files the registry changed without bumping the version", () => {
    // dialog is 1.0.0 on both sides and its controller, stylesheet and markup
    // were all rewritten between the two releases. A version-only check reports
    // it up to date and leaves the v0.2.4 files in place forever.
    for (const file of ["dialog.js", "dialog.css", "dialog.html"]) {
      const installed = readFileSync(join(WORK, "ui/recipes/dialog", file), "utf8");
      const registry = readFileSync(join(getRegistryPath(), "recipes/dialog", file), "utf8");
      expect(installed).toBe(registry);
      expect(installed).not.toBe(readFileSync(join(FIXTURE, "ui/recipes/dialog", file), "utf8"));
    }
  });
});

describe("v0.2.4 → 1.0 · the field-group vocabulary (task 0.6-01)", () => {
  it("is an audit error before the markup step and clean after it", () => {
    const before = midAudit.results.filter(
      (r) => r.file.startsWith("app/") && r.message.includes('Invalid state "error"'),
    );
    expect(before).toHaveLength(1);
    expect(before[0].severity).toBe("error");
    expect(postAudit.results.some((r) => r.message.includes('Invalid state "error"'))).toBe(false);
    expect(page()).toContain('data-state="invalid"');
  });

  it("ships the stylesheet the new state needs", () => {
    const css = readFileSync(join(WORK, "ui/primitives/field-group/field-group.css"), "utf8");
    expect(css).toContain('[data-state="invalid"]');
    expect(css).toContain('[data-part="required"]');
  });

  it("is the edit the migration doc prescribes", () => {
    const documented = parseMigrationDoc(readFileSync(DOC, "utf8")).find(
      (d) => d.component === "field-group" && d.version === "2.0.0",
    );
    expect(documented).toBeDefined();
    expect(documented!.body).toContain('data-state="invalid"');
  });
});

describe("v0.2.4 → 1.0 · the migrated project", () => {
  it("audits with no critical or error findings on its own pages", () => {
    const pageFindings = postAudit.results.filter((r) => r.file.startsWith("app/"));
    expect(pageFindings.filter((r) => r.severity === "critical" || r.severity === "error")).toEqual([]);
    // One residual warning, and it is not the migration's: the `landmark` rule
    // flags any role="dialog" inside <main>, which a date-picker's popup always
    // is — the registry's own reference markup trips it the same way. Named
    // here so a *new* warning cannot hide behind a vague threshold.
    expect(pageFindings.map((r) => r.rule_id)).toEqual(["landmark"]);
  });

  it("leaves only the registry's own pre-existing CSS findings", () => {
    // `no-hardcoded-values` fires on three components the registry ships with
    // an rgba() shadow (switch, stat, document). `audit:registry` does not run
    // the CSS rule set over its own stylesheets, so the framework is not held
    // to a rule it applies to projects — filed as follow-up 1.0R-16.
    const errors = postAudit.results.filter((r) => r.severity === "critical" || r.severity === "error");
    expect(errors.every((r) => r.rule_id === "no-hardcoded-values" && r.file.startsWith("ui/"))).toBe(true);
    expect(errors.every((r) => r.file.includes("switch"))).toBe(true);
  });

  it("passes faqir doctor", () => {
    expect(doctorRun.code).toBe(0);
    expect(doctorRun.output).not.toContain("core/ directory not found");
  });

  it("runs its upgraded controllers", async () => {
    // The smoke the plan asks for, through the project's own files rather than
    // the registry's: the merged table.js sorting the merged page's markup.
    document.body.innerHTML = page().replace(/<script[\s\S]*?<\/script>/g, "");
    const { createTable } = await import(join(WORK, "ui/recipes/table/table.js"));
    const root = document.querySelector("[data-ui='table']") as HTMLElement;
    const api = createTable(root);
    // Column 2 is the money column: 1200.00 then 340.00 in document order.
    const totals = () =>
      [...root.querySelectorAll("[data-part='tbody'] [data-part='tr']")].map((tr) =>
        (tr.querySelectorAll("[data-part='td']")[2]?.textContent ?? "").trim(),
      );
    expect(totals()).toEqual(["1200.00", "340.00"]);
    api.sort(2, "ascending");
    expect(totals()).toEqual(["340.00", "1200.00"]);
    api.sort(2, "descending");
    expect(totals()).toEqual(["1200.00", "340.00"]);
    api.destroy();

    const { createDialog } = await import(join(WORK, "ui/recipes/dialog/dialog.js"));
    const dialogRoot = document.querySelector("[data-ui='dialog']") as HTMLElement;
    const dialog = createDialog(dialogRoot);
    dialog.open();
    expect(dialogRoot.dataset.state).toBe("open");
    dialog.close();
    expect(dialogRoot.dataset.state).toBe("closed");
    dialog.destroy();
  });

  it("ran the steps the doc documents, in the order it documents them", () => {
    expect(RAN).toEqual(MIGRATION_STEPS.map((s) => s.id));
  });
});

/** `<layer>/<name>/<name>.manifest.json` for a component in the registry. */
function componentPath(name: string): string {
  for (const layer of ["primitives", "recipes", "patterns"]) {
    const rel = join(layer, name, `${name}.manifest.json`);
    if (existsSync(join(getRegistryPath(), rel))) return rel;
  }
  throw new Error(`no manifest for ${name}`);
}
