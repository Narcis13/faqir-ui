import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditResult } from "../../src/audit/rules";
import { applyRepairs } from "../../src/audit/repairer";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { repair } from "../../src/commands/repair";

const TEST_DIR = join(import.meta.dir, "../.tmp-repairer-test");

describe("Repairer", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("adds missing aria-label to close button", async () => {
    const html = `<div data-ui="dialog" data-state="closed">
  <button data-part="close">X</button>
</div>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    const results: AuditResult[] = [{
      rule_id: "close-label",
      severity: "warning",
      component_name: "dialog",
      file: "test.html",
      line: 2,
      message: '[data-part="close"] button is missing aria-label',
      fix: {
        type: "add-attribute",
        offset: 0,
        details: { attr: "aria-label", value: "Close" },
      },
    }];

    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_applied).toBe(1);

    const result = await Bun.file(filePath).text();
    expect(result).toContain('aria-label="Close"');
  });

  it("adds missing role to panel", async () => {
    const html = `<div data-ui="dialog" data-state="closed">
  <div data-part="panel" aria-modal="true">Content</div>
</div>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    const results: AuditResult[] = [{
      rule_id: "required-aria",
      severity: "critical",
      component_name: "dialog",
      file: "test.html",
      line: 2,
      message: 'Missing role="dialog" on [data-part="panel"]',
      fix: {
        type: "add-attribute",
        offset: 0,
        details: { attr: "role", value: "dialog" },
      },
    }];

    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_applied).toBe(1);

    const result = await Bun.file(filePath).text();
    expect(result).toContain('role="dialog"');
  });

  it("does not duplicate existing attributes", async () => {
    const html = `<div data-ui="dialog" data-state="closed">
  <button data-part="close" aria-label="Close">X</button>
</div>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    const results: AuditResult[] = [{
      rule_id: "close-label",
      severity: "warning",
      component_name: "dialog",
      file: "test.html",
      line: 2,
      message: '[data-part="close"] button is missing aria-label',
      fix: {
        type: "add-attribute",
        offset: 0,
        details: { attr: "aria-label", value: "Close" },
      },
    }];

    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_skipped).toBe(1);
    expect(summary.fixes_applied).toBe(0);
  });

  it("adds script tag for missing controller", async () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <div data-ui="dialog" data-state="closed">
    <button data-part="trigger">Open</button>
  </div>
</body>
</html>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    const results: AuditResult[] = [{
      rule_id: "controller-loaded",
      severity: "error",
      component_name: "dialog",
      file: "test.html",
      line: 4,
      message: 'Recipe [data-ui="dialog"] needs its controller "dialog.js" loaded',
      fix: {
        type: "add-script",
        offset: 0,
        details: { src: "dialog.js", component: "dialog" },
      },
    }];

    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_applied).toBe(1);

    const result = await Bun.file(filePath).text();
    expect(result).toContain('<script type="module"');
    expect(result).toContain("dialog.js");
  });

  it("handles multiple fixes to same file", async () => {
    const html = `<div data-ui="dialog" data-state="closed">
  <div data-part="panel">
    <button data-part="close">X</button>
  </div>
</div>`;
    const filePath = join(TEST_DIR, "test.html");
    await Bun.write(filePath, html);

    const results: AuditResult[] = [
      {
        rule_id: "required-aria",
        severity: "critical",
        component_name: "dialog",
        file: "test.html",
        line: 2,
        message: 'Missing role="dialog" on [data-part="panel"]',
        fix: { type: "add-attribute", offset: 0, details: { attr: "role", value: "dialog" } },
      },
      {
        rule_id: "close-label",
        severity: "warning",
        component_name: "dialog",
        file: "test.html",
        line: 3,
        message: '[data-part="close"] button is missing aria-label',
        fix: { type: "add-attribute", offset: 0, details: { attr: "aria-label", value: "Close" } },
      },
    ];

    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_applied).toBe(2);

    const result = await Bun.file(filePath).text();
    expect(result).toContain('role="dialog"');
    expect(result).toContain('aria-label="Close"');
  });
});

// ── --dry-run must not write, and --help must not run ───────────────────────
//
// `repair(args)` never read `args`: the parameter was declared and ignored, so
// every flag was silently discarded and the command always mutated the project.
// `faqir repair --help` rewrote files; `--dry-run` wrote the same changes and
// then reported them as a preview. For an agent, a preview flag that mutates is
// the worst kind of wrong — it is the flag you reach for precisely when you are
// not sure yet.
describe("faqir repair honors its flags", () => {
  const DIR = join(import.meta.dir, "../.tmp-repair-flags");

  function seed(): string {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    return DIR;
  }

  async function inDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const orig = process.cwd();
    process.chdir(dir);
    try {
      return await fn();
    } finally {
      process.chdir(orig);
    }
  }

  const BROKEN = '<div data-ui="dialog"><div data-part="panel"><h2 data-part="title">T</h2></div></div>\n';

  afterEach(() => {
    rmSync(DIR, { recursive: true, force: true });
  });

  it("--dry-run reports fixes without touching the file", async () => {
    const dir = seed();
    await inDir(dir, async () => {
      await init(["--yes"]);
      await add(["dialog"]);
      writeFileSync(join(dir, "page.html"), BROKEN);
      await repair(["--dry-run"]);
    });
    expect(readFileSync(join(dir, "page.html"), "utf8")).toBe(BROKEN);
  }, 60_000);

  it("--help prints usage without touching the file", async () => {
    const dir = seed();
    await inDir(dir, async () => {
      await init(["--yes"]);
      await add(["dialog"]);
      writeFileSync(join(dir, "page.html"), BROKEN);
      await repair(["--help"]);
    });
    expect(readFileSync(join(dir, "page.html"), "utf8")).toBe(BROKEN);
  }, 60_000);

  it("a bare run still repairs, so --dry-run is a real difference", async () => {
    const dir = seed();
    await inDir(dir, async () => {
      await init(["--yes"]);
      await add(["dialog"]);
      writeFileSync(join(dir, "page.html"), BROKEN);
      await repair([]);
    });
    expect(readFileSync(join(dir, "page.html"), "utf8")).not.toBe(BROKEN);
  }, 60_000);
});
