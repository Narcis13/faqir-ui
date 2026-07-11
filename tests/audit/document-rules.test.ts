// Document-level audit rules (task 0.4-15): duplicate-id, heading-order, landmark.
// These run over a whole HTML file (ParsedDocument), not a component vs manifest.

import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseDocument } from "../../src/parser/html-parser";
import {
  duplicateIdRule,
  headingOrderRule,
  landmarkRule,
  DOCUMENT_RULES,
  getRuleInventory,
  type AuditResult,
} from "../../src/audit/rules";
import { applyRepairs } from "../../src/audit/repairer";
import { printAuditJSON } from "../../src/audit/reporter";
import type { AuditSummary } from "../../src/audit/checker";

function check(rule: { check: (d: ReturnType<typeof parseDocument>) => AuditResult[] }, html: string) {
  return rule.check(parseDocument(html, "test.html"));
}

// ───────────────────────────── duplicate-id ─────────────────────────────

describe("duplicate-id", () => {
  it("passes a clean fixture (all ids unique)", () => {
    const html = `<form>
  <label for="a">A</label><input id="a">
  <label for="b">B</label><input id="b">
</form>`;
    expect(check(duplicateIdRule, html).length).toBe(0);
  });

  it("flags the duplicate with correct line/column and stable code + severity", () => {
    const html = `<ul>
  <li id="row">first</li>
  <li id="row">second</li>
</ul>`;
    const results = check(duplicateIdRule, html);
    expect(results.length).toBe(1);
    const [r] = results;
    expect(r.rule_id).toBe("duplicate-id");
    expect(r.severity).toBe("error");
    // Second <li> is on line 3, indented two spaces → column 3.
    expect(r.line).toBe(3);
    expect(r.column).toBe(3);
    expect(r.message).toContain(`id="row"`);
  });

  it("flags every occurrence after the first (3 duplicates → 2 findings)", () => {
    const html = `<div><i id="d">1</i><i id="d">2</i><i id="d">3</i></div>`;
    const results = check(duplicateIdRule, html);
    expect(results.length).toBe(2);
  });

  it("ignores ids that only appear inside comments (masking)", () => {
    const html = `<!-- <b id="x"></b> --><b id="x"></b><b id="x"></b>`;
    // Only the two real <b> count → one finding for the 2nd real occurrence.
    expect(check(duplicateIdRule, html).length).toBe(1);
  });

  describe("shadow boundaries out of scope (documented)", () => {
    it("does NOT flag the same id in a <template> vs light DOM", () => {
      const html = `<div>
  <span id="title">light</span>
  <template>
    <span id="title">shadow</span>
  </template>
</div>`;
      expect(check(duplicateIdRule, html).length).toBe(0);
    });

    it("still flags a genuine duplicate within the same template scope", () => {
      const html = `<template>
  <span id="dup">a</span>
  <span id="dup">b</span>
</template>`;
      expect(check(duplicateIdRule, html).length).toBe(1);
    });
  });

  describe("auto-repairable only when a safe rename exists", () => {
    it("marks an UNREFERENCED duplicate as fixable (rename-id)", () => {
      const html = `<div><span id="dup"></span><span id="dup"></span></div>`;
      const [r] = check(duplicateIdRule, html);
      expect(r.fix).toBeDefined();
      expect(r.fix!.type).toBe("rename-id");
      expect(r.fix!.details.from).toBe("dup");
      expect(r.fix!.details.to).toBe("dup-2");
    });

    it("is report-only when the id is referenced via label[for]", () => {
      const html = `<div>
  <label for="email">Email</label>
  <input id="email">
  <input id="email">
</div>`;
      const results = check(duplicateIdRule, html);
      expect(results.length).toBe(1);
      expect(results[0].fix).toBeUndefined();
      expect(results[0].message.toLowerCase()).toContain("referenced");
    });

    it("is report-only when the id is referenced via aria-labelledby", () => {
      const html = `<div>
  <h2 id="t">Title</h2>
  <section aria-labelledby="t">a</section>
  <h2 id="t">Dup</h2>
</div>`;
      const [r] = check(duplicateIdRule, html);
      expect(r.fix).toBeUndefined();
    });

    it("is report-only when the id is referenced via a #fragment href", () => {
      const html = `<div>
  <a href="#go">jump</a>
  <div id="go">x</div>
  <div id="go">y</div>
</div>`;
      const [r] = check(duplicateIdRule, html);
      expect(r.fix).toBeUndefined();
    });
  });

  describe("repair round-trip", () => {
    let dir: string;
    const write = (name: string, body: string) => {
      dir = mkdtempSync(join(tmpdir(), "faqir-dupid-"));
      const p = join(dir, name);
      writeFileSync(p, body);
      return p;
    };

    it("renames unreferenced duplicates to unique ids and re-audits clean", async () => {
      const html = `<div><i id="d">1</i><i id="d">2</i><i id="d">3</i></div>`;
      const p = write("page.html", html);
      try {
        const results = duplicateIdRule.check(parseDocument(html, "page.html"));
        expect(results.every((r) => r.fix)).toBe(true);
        const summary = await applyRepairs(results, dir);
        expect(summary.fixes_applied).toBe(2);

        const after = readFileSync(p, "utf8");
        // The three ids are now distinct.
        expect(after).toContain(`id="d"`);
        expect(after).toContain(`id="d-2"`);
        expect(after).toContain(`id="d-3"`);
        // And a fresh audit finds nothing.
        expect(duplicateIdRule.check(parseDocument(after, "page.html")).length).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("leaves a referenced duplicate untouched (no fix to apply)", async () => {
      const html = `<div><label for="d">L</label><input id="d"><input id="d"></div>`;
      const p = write("ref.html", html);
      try {
        const results = duplicateIdRule.check(parseDocument(html, "ref.html"));
        const summary = await applyRepairs(results, dir);
        expect(summary.fixes_applied).toBe(0);
        expect(readFileSync(p, "utf8")).toBe(html);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

// ───────────────────────────── heading-order ─────────────────────────────

describe("heading-order", () => {
  it("passes a well-ordered outline (h1 → h2 → h3)", () => {
    const html = `<article><h1>T</h1><h2>S</h2><h3>Sub</h3></article>`;
    expect(check(headingOrderRule, html).length).toBe(0);
  });

  it("allows repeated same-level headings (h1 → h2 → h2)", () => {
    const html = `<article><h1>T</h1><h2>One</h2><h2>Two</h2></article>`;
    expect(check(headingOrderRule, html).length).toBe(0);
  });

  it("allows going back up a level (h1 → h2 → h3 → h2)", () => {
    const html = `<article><h1>T</h1><h2>A</h2><h3>A.1</h3><h2>B</h2></article>`;
    expect(check(headingOrderRule, html).length).toBe(0);
  });

  it("does not flag a fragment that starts deep (first heading is h3)", () => {
    const html = `<section><h3>Section</h3><h4>Detail</h4></section>`;
    expect(check(headingOrderRule, html).length).toBe(0);
  });

  it("flags a skipped level with correct line/column and an actionable message", () => {
    const html = `<article>
  <h1>Title</h1>
  <h3>Skips h2</h3>
</article>`;
    const results = check(headingOrderRule, html);
    expect(results.length).toBe(1);
    const [r] = results;
    expect(r.rule_id).toBe("heading-order");
    expect(r.severity).toBe("warning");
    expect(r.line).toBe(3);
    expect(r.column).toBe(3);
    expect(r.message).toContain("h1 → h3");
    expect(r.message).toContain("<h2>"); // tells you what to use
  });

  it("flags a mid-document skip (h2 → h4)", () => {
    const html = `<article><h1>T</h1><h2>A</h2><h4>Deep</h4></article>`;
    const results = check(headingOrderRule, html);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain("h2 → h4");
  });
});

// ───────────────────────────── landmark ─────────────────────────────

describe("landmark", () => {
  describe("page must have a main landmark", () => {
    it("flags a full document with no main", () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <p>content</p>
</body>
</html>`;
      const results = check(landmarkRule, html);
      const missing = results.filter((r) => r.message.includes("no main landmark"));
      expect(missing.length).toBe(1);
      expect(missing[0].rule_id).toBe("landmark");
      expect(missing[0].line).toBe(3); // the <body>
    });

    it("passes a full document that has a <main>", () => {
      const html = `<!DOCTYPE html>
<html><body><main><p>content</p></main></body></html>`;
      expect(check(landmarkRule, html).length).toBe(0);
    });

    it("accepts role=\"main\" as a main landmark", () => {
      const html = `<!DOCTYPE html>
<html><body><div role="main">content</div></body></html>`;
      expect(check(landmarkRule, html).length).toBe(0);
    });

    it("does NOT flag a component fragment (not a page)", () => {
      const html = `<button data-ui="button">Click</button>`;
      expect(check(landmarkRule, html).length).toBe(0);
    });
  });

  describe("dialogs must not be nested in main flow", () => {
    it("flags a dialog inside <main>", () => {
      const html = `<main>
  <div data-ui="dialog"><div data-part="panel">x</div></div>
</main>`;
      const results = check(landmarkRule, html);
      const nested = results.filter((r) => r.message.includes("nested inside <main>"));
      expect(nested.length).toBe(1);
      expect(nested[0].line).toBe(2);
    });

    it("passes a dialog that is a sibling of main", () => {
      const html = `<div>
  <main><p>content</p></main>
  <div data-ui="dialog"><div data-part="panel">x</div></div>
</div>`;
      expect(check(landmarkRule, html).length).toBe(0);
    });

    it("flags a native <dialog> and role=dialog inside main", () => {
      const html = `<main>
  <dialog>native</dialog>
  <div role="dialog">aria</div>
</main>`;
      expect(check(landmarkRule, html).filter((r) => r.message.includes("nested")).length).toBe(2);
    });
  });

  describe("multiple navs must be labeled", () => {
    it("flags each unlabeled nav when there are several", () => {
      const html = `<div>
  <nav aria-label="Primary">a</nav>
  <nav>b</nav>
  <nav>c</nav>
</div>`;
      const results = check(landmarkRule, html);
      const unlabeled = results.filter((r) => r.message.includes("no accessible name"));
      expect(unlabeled.length).toBe(2);
      expect(unlabeled[0].line).toBe(3);
      expect(unlabeled[1].line).toBe(4);
    });

    it("passes when every nav is labeled", () => {
      const html = `<div>
  <nav aria-label="Primary">a</nav>
  <nav aria-labelledby="h">b</nav>
</div>`;
      expect(check(landmarkRule, html).length).toBe(0);
    });

    it("does not require a label when there is only one nav", () => {
      const html = `<div><nav>only</nav></div>`;
      expect(check(landmarkRule, html).length).toBe(0);
    });

    it("counts role=navigation toward the multiple-nav rule", () => {
      const html = `<div>
  <nav aria-label="Primary">a</nav>
  <div role="navigation">b</div>
</div>`;
      const results = check(landmarkRule, html);
      expect(results.filter((r) => r.message.includes("no accessible name")).length).toBe(1);
    });
  });
});

// ───────────────────── rule inventory + JSON output ─────────────────────

describe("document rules · inventory & JSON", () => {
  it("registers every document rule in DOCUMENT_RULES", () => {
    expect(DOCUMENT_RULES.map((r) => r.id).sort()).toEqual([
      "duplicate-id",
      "field-wiring",
      "heading-order",
      "landmark",
    ]);
  });

  it("exposes the three stable codes in the audit rule inventory", () => {
    const inv = getRuleInventory();
    for (const id of ["duplicate-id", "heading-order", "landmark"]) {
      const entry = inv.find((r) => r.id === id);
      expect(entry).toBeDefined();
      expect(entry!.applies_to).toBe("HTML document");
      expect(entry!.description.length).toBeGreaterThan(0);
    }
  });

  it("emits line and column for document-rule findings in JSON output", () => {
    const summary: AuditSummary = {
      results: [
        {
          rule_id: "duplicate-id",
          severity: "error",
          component_name: "",
          file: "page.html",
          line: 12,
          column: 5,
          message: "Duplicate id",
        },
      ],
      files_scanned: 1,
      components_found: 0,
      counts: { critical: 0, error: 1, warning: 0, info: 0 },
      passed: false,
    };

    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };
    try {
      printAuditJSON(summary);
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.results[0].line).toBe(12);
    expect(parsed.results[0].column).toBe(5);
    expect(parsed.results[0].rule_id).toBe("duplicate-id");
  });
});
