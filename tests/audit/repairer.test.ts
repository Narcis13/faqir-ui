import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditResult } from "../../src/audit/rules";
import { applyRepairs, applyRepairsToSource } from "../../src/audit/repairer";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { loadRegistryManifestMap } from "../../src/utils/components";
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
        offset: html.indexOf('<button data-part="close"'),
        details: { attr: "aria-label", value: "Close" },
      },
    }];

    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_applied).toBe(1);

    const result = await Bun.file(filePath).text();
    expect(result).toContain('<button data-part="close" aria-label="Close">');
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
        offset: html.indexOf('<div data-part="panel"'),
        details: { attr: "role", value: "dialog" },
      },
    }];

    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_applied).toBe(1);

    const result = await Bun.file(filePath).text();
    expect(result).toContain('<div data-part="panel" aria-modal="true" role="dialog">');
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
        offset: html.indexOf('<button data-part="close"'),
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
        fix: {
          type: "add-attribute",
          offset: html.indexOf('<div data-part="panel"'),
          details: { attr: "role", value: "dialog" },
        },
      },
      {
        rule_id: "close-label",
        severity: "warning",
        component_name: "dialog",
        file: "test.html",
        line: 3,
        message: '[data-part="close"] button is missing aria-label',
        fix: {
          type: "add-attribute",
          offset: html.indexOf('<button data-part="close"'),
          details: { attr: "aria-label", value: "Close" },
        },
      },
    ];

    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_applied).toBe(2);

    const result = await Bun.file(filePath).text();
    expect(result).toContain('<div data-part="panel" role="dialog">');
    expect(result).toContain('<button data-part="close" aria-label="Close">');
  });
});

// ── add-attribute targets the tag at its offset ─────────────────────────────
//
// `addAttribute` used to search the source for the first `data-part="…"` the
// message named, so with two dialogs in one file the fix for the second was
// written into the first — and the second's was then "skipped" as present.
describe("add-attribute is located by offset", () => {
  const TWO_DIALOGS =
    '<div data-ui="dialog"><div data-part="panel" role="dialog" aria-label="A">A</div></div>\n' +
    '<div data-ui="dialog"><div data-part="panel">B</div></div>\n';

  it("fixes the second of two dialogs, not the first", () => {
    const second = TWO_DIALOGS.lastIndexOf('<div data-part="panel"');
    const results: AuditResult[] = [
      {
        rule_id: "required-aria",
        severity: "critical",
        component_name: "dialog",
        file: "t.html",
        line: 2,
        message: 'Missing role="dialog" on [data-part="panel"]',
        fix: { type: "add-attribute", offset: second, details: { attr: "role", value: "dialog" } },
      },
    ];
    const out = applyRepairsToSource(TWO_DIALOGS, results);
    expect(out.applied).toBe(1);
    expect(out.source).toBe(
      '<div data-ui="dialog"><div data-part="panel" role="dialog" aria-label="A">A</div></div>\n' +
        '<div data-ui="dialog"><div data-part="panel" role="dialog">B</div></div>\n',
    );
  });

  it("an end-to-end audit → repair of two unlabelled close buttons fixes both", async () => {
    const source =
      '<div data-ui="dialog"><div data-part="panel" role="dialog" aria-modal="true">' +
      '<button data-part="close"></button></div></div>\n' +
      '<div data-ui="dialog"><div data-part="panel" role="dialog" aria-modal="true">' +
      '<button data-part="close"></button></div></div>\n';
    const manifests = await loadRegistryManifestMap(join(import.meta.dir, "../../registry"));
    const findings = auditHtmlSource({ source: source, manifests, file: "t.html" }).filter(
      (r) => r.rule_id === "close-label",
    );
    expect(findings.length).toBe(2);
    const out = applyRepairsToSource(source, findings);
    expect(out.applied).toBe(2);
    expect(out.source.match(/<button data-part="close" aria-label="Close">/g)?.length).toBe(2);
  });

  it("finds the tag end past a quoted `>` in a directive", () => {
    const html = '<div data-ui="dialog"><button data-part="close" l-show="n > 0"></button></div>';
    const out = applyRepairsToSource(html, [
      {
        rule_id: "close-label",
        severity: "warning",
        component_name: "dialog",
        file: "t.html",
        line: 1,
        message: "x",
        fix: {
          type: "add-attribute",
          offset: html.indexOf("<button"),
          details: { attr: "aria-label", value: "Close" },
        },
      },
    ]);
    expect(out.source).toContain('<button data-part="close" l-show="n > 0" aria-label="Close">');
  });

  it("keeps a field-group's wiring right when an add-attribute lands inside it", () => {
    // Offsets are mapped through earlier edits, not just ordered: the group's
    // edits straddle the add-attribute's tag.
    const html = '<div data-ui="x"><span data-part="a">1</span><span data-part="b">2</span></div>';
    const a = html.indexOf('<span data-part="a"');
    const b = html.indexOf('<span data-part="b"');
    const out = applyRepairsToSource(html, [
      {
        rule_id: "field-wiring",
        severity: "error",
        component_name: "x",
        file: "t.html",
        line: 1,
        message: "wire",
        fix: {
          type: "wire-field-group",
          offset: 0,
          details: { edits: JSON.stringify([{ offset: 0, set: { id: "g" } }, { offset: b, set: { id: "b" } }]) },
        },
      },
      {
        rule_id: "required-aria",
        severity: "critical",
        component_name: "x",
        file: "t.html",
        line: 1,
        message: "role",
        fix: { type: "add-attribute", offset: a, details: { attr: "role", value: "note" } },
      },
    ]);
    expect(out.applied).toBe(2);
    expect(out.source).toBe(
      '<div data-ui="x" id="g"><span data-part="a" role="note">1</span><span data-part="b" id="b">2</span></div>',
    );
  });
});

// ── an empty ARIA reference is never written ────────────────────────────────
describe("empty ARIA values are not repairs", () => {
  it("the repairer refuses an empty aria-* value rather than writing a bare attribute", () => {
    const html = '<div data-ui="dialog"><div data-part="panel">x</div></div>';
    const out = applyRepairsToSource(html, [
      {
        rule_id: "aria-describedby",
        severity: "warning",
        component_name: "dialog",
        file: "t.html",
        line: 1,
        message: "missing",
        fix: {
          type: "add-attribute",
          offset: html.indexOf('<div data-part="panel"'),
          details: { attr: "aria-describedby", value: "" },
        },
      },
    ]);
    expect(out.applied).toBe(0);
    expect(out.skipped).toBe(1);
    expect(out.source).toBe(html);
  });

  it("aria-labelledby / aria-describedby carry no fix unless there is an id to point at", async () => {
    const manifests = await loadRegistryManifestMap(join(import.meta.dir, "../../registry"));
    const noIds =
      '<div data-ui="dialog"><div data-part="panel" role="dialog" aria-modal="true">' +
      '<h2 data-part="title">T</h2><p data-part="description">D</p></div></div>';
    const bare = auditHtmlSource({ source: noIds, manifests, file: "t.html" }).filter((r) =>
      /aria-(labelledby|describedby)/.test(r.message),
    );
    expect(bare.length).toBeGreaterThan(0);
    for (const r of bare) expect(r.fix, r.message).toBeUndefined();

    const withIds = noIds
      .replace('data-part="title"', 'data-part="title" id="t1"')
      .replace('data-part="description"', 'data-part="description" id="d1"');
    const wired = auditHtmlSource({ source: withIds, manifests, file: "t.html" }).filter((r) =>
      /aria-(labelledby|describedby)/.test(r.message),
    );
    const out = applyRepairsToSource(withIds, wired);
    for (const r of wired) expect(r.fix, r.message).toBeDefined();
    if (wired.some((r) => r.message.includes("labelledby"))) {
      expect(out.source).toContain('aria-labelledby="t1"');
    }
    if (wired.some((r) => r.message.includes("describedby"))) {
      expect(out.source).toContain('aria-describedby="d1"');
    }
    expect(out.source).not.toMatch(/aria-(labelledby|describedby)(?!=)/);
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
