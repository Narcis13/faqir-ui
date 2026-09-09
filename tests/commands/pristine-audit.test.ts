// `faqir audit` reaches green on a pristine project (task W2-3).
//
// `faqir init` + `faqir add switch dashboard-shell`, with nothing authored:
// **2 errors and 6 warnings, exit 1** — every one of them in the framework's own
// vendor CSS. `switch.css` hardcoded `rgba(`, and `dashboard-shell.css`
// referenced five `--shell-*` author knobs that no token file defines but the
// docs site itself sets, each one carrying a fallback.
//
// An agent gating on `faqir audit` could not reach green by any edit it was
// allowed to make. The only thing a gate like that can teach is to stop reading
// it, which costs far more than the two real defects it was reporting.
//
// Both halves of the fix are pinned here: the vendor CSS is clean, AND a vendor
// finding — the next one, whatever it turns out to be — is reported without
// deciding the exit code.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { runAudit, isVendorPath } from "../../src/audit/checker";

const WORK = join(import.meta.dir, "../.tmp-pristine-audit");

/** Run a function with the process parked in the scratch project. */
async function inProject<T>(fn: () => Promise<T>): Promise<T> {
  const origCwd = process.cwd();
  process.chdir(WORK);
  try {
    return await fn();
  } finally {
    process.chdir(origCwd);
  }
}

describe("faqir audit · a pristine project", () => {
  beforeAll(async () => {
    rmSync(WORK, { recursive: true, force: true });
    mkdirSync(WORK, { recursive: true });
    const quiet = console.log;
    console.log = () => {};
    try {
      await inProject(async () => {
        await init([]);
        // The exact pair from the readiness report.
        await add(["switch", "dashboard-shell"]);
      });
    } finally {
      console.log = quiet;
    }
  });

  afterAll(() => {
    rmSync(WORK, { recursive: true, force: true });
  });

  it("finds nothing at all — not an error, not a warning", async () => {
    const summary = await runAudit({ cwd: WORK });
    expect(
      summary.results.map((r) => `${r.severity}/${r.rule_id} ${r.file}: ${r.message}`),
    ).toEqual([]);
    expect(summary.passed).toBe(true);
  });

  it("still has both of the components it installed", async () => {
    const summary = await runAudit({ cwd: WORK });
    expect(summary.files_scanned).toBeGreaterThan(0);
    expect(summary.components_found).toBeGreaterThan(0);
  });

  describe("and when the framework's own files DO carry a finding", () => {
    const VENDOR_CSS = "ui/primitives/switch/switch.css";

    it("reports it, counts it as vendor, and still exits green", async () => {
      appendFileSync(join(WORK, VENDOR_CSS), `\n[data-ui="switch"] { color: rgba(1, 2, 3, 0.4); }\n`);
      try {
        const summary = await runAudit({ cwd: WORK });
        const vendorFindings = summary.results.filter((r) => isVendorPath(r.file, "ui"));

        expect(vendorFindings.length).toBeGreaterThan(0);
        expect(summary.vendor_counts.error).toBeGreaterThan(0);
        // The authored side is untouched, and it is what decides the exit code.
        expect(summary.counts.error).toBe(0);
        expect(summary.passed).toBe(true);
      } finally {
        // Leave the fixture clean for the strict case below.
      }
    });

    it("--strict folds it back in", async () => {
      const summary = await runAudit({ cwd: WORK, strict: true });
      expect(summary.vendor_counts.error).toBeGreaterThan(0);
      expect(summary.passed).toBe(false);
    });

    it("a finding the project authored fails without --strict", async () => {
      writeFileSync(
        join(WORK, "page.html"),
        `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>t</title></head>\n<body><main><div data-ui="switch" data-state="nope"></div></main>\n<script src="ui/core/faqir-core.js"></script></body></html>\n`,
      );
      const summary = await runAudit({ cwd: WORK });
      expect(summary.counts.error).toBeGreaterThan(0);
      expect(summary.passed).toBe(false);
      rmSync(join(WORK, "page.html"));
    });
  });
});

describe("isVendorPath", () => {
  it("matches the installed tree and nothing outside it", () => {
    expect(isVendorPath("ui/primitives/switch/switch.css", "ui")).toBe(true);
    expect(isVendorPath("ui", "ui")).toBe(true);
    expect(isVendorPath("app/index.html", "ui")).toBe(false);
    // A sibling directory that merely starts with the same letters is not it.
    expect(isVendorPath("ui-kit/thing.css", "ui")).toBe(false);
    // A project that configured a different output dir gets the same answer.
    expect(isVendorPath("src/faqir/recipes/dialog/dialog.css", "src/faqir")).toBe(true);
    expect(isVendorPath("src/pages/index.html", "src/faqir")).toBe(false);
  });
});
