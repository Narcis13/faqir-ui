import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AuditResult } from "../../src/audit/rules";
import { applyRepairs } from "../../src/audit/repairer";

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
