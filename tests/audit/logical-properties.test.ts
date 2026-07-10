// ═══════════════════════════════════════════════════════════════════════════
// logical-properties audit rule  [task 0.3-09]
// ═══════════════════════════════════════════════════════════════════════════
//
// Physical, direction-bound CSS properties (margin-left, padding-right,
// left/right offsets, border-*-left/right*, corner radii, text-align: left|right)
// break in right-to-left locales. This rule flags them and reports the 1:1 logical
// replacement (margin-left → margin-inline-start). `faqir repair` rewrites them.
// A rule scoped to an explicit writing direction — [dir="ltr"] / [dir="rtl"] — is
// the escape hatch and is never flagged.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Glob } from "bun";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import {
  findLogicalPropertyViolations,
  PHYSICAL_TO_LOGICAL_PROPERTY,
} from "../../src/parser/css-parser";
import { buildLogicalPropertyResults } from "../../src/audit/checker";
import { applyRepairs } from "../../src/audit/repairer";
import { LOGICAL_PROPERTIES_RULE, getRuleInventory } from "../../src/audit/rules";

const REGISTRY = join(import.meta.dir, "../../registry");

describe("logical-properties · detection", () => {
  // ── Each flagged property pattern → finding with correct replacement ──
  describe("flags every physical property with the right logical replacement", () => {
    for (const [physical, logical] of Object.entries(PHYSICAL_TO_LOGICAL_PROPERTY)) {
      it(`${physical} → ${logical}`, () => {
        const css = `[data-ui="x"] { ${physical}: 0; }`;
        const v = findLogicalPropertyViolations(css);
        expect(v).toHaveLength(1);
        expect(v[0].kind).toBe("property");
        expect(v[0].property).toBe(physical);
        expect(v[0].from).toBe(physical);
        expect(v[0].to).toBe(logical);
      });
    }

    it("text-align: left → text-align: start", () => {
      const v = findLogicalPropertyViolations(`[data-ui="x"] { text-align: left; }`);
      expect(v).toHaveLength(1);
      expect(v[0].kind).toBe("value");
      expect(v[0].from).toBe("text-align: left");
      expect(v[0].to).toBe("text-align: start");
    });

    it("text-align: right → text-align: end (ignoring !important)", () => {
      const v = findLogicalPropertyViolations(`[data-ui="x"] { text-align: right !important; }`);
      expect(v).toHaveLength(1);
      expect(v[0].to).toBe("text-align: end");
    });

    it("reports the correct 1-based line across a multiline selector", () => {
      const css = `[data-ui="x"],\n[data-ui="y"] {\n  margin-left: 0;\n}`;
      const v = findLogicalPropertyViolations(css);
      expect(v).toHaveLength(1);
      expect(v[0].line).toBe(3);
    });

    it("flags multiple declarations on one line independently", () => {
      const v = findLogicalPropertyViolations(`[data-ui="x"] { margin-left: 0; margin-right: 0; }`);
      expect(v.map(x => x.to)).toEqual(["margin-inline-start", "margin-inline-end"]);
    });
  });

  // ── Legit uses don't flag ──
  describe("does not flag legitimate, direction-agnostic CSS", () => {
    it("text-align: start", () => {
      expect(findLogicalPropertyViolations(`[data-ui="x"] { text-align: start; }`)).toHaveLength(0);
    });

    it("text-align: center", () => {
      expect(findLogicalPropertyViolations(`[data-ui="x"] { text-align: center; }`)).toHaveLength(0);
    });

    it("logical properties themselves", () => {
      const css = `[data-ui="x"] {
        margin-inline-start: 0;
        inset-inline-end: 0;
        border-start-end-radius: 4px;
        padding-inline-end: 8px;
      }`;
      expect(findLogicalPropertyViolations(css)).toHaveLength(0);
    });

    it("left/right used as values, not properties (float, clear, background)", () => {
      const css = `[data-ui="x"] { float: left; clear: right; background-position: left top; }`;
      expect(findLogicalPropertyViolations(css)).toHaveLength(0);
    });

    it("custom properties whose names contain left/right", () => {
      const css = `[data-ui="x"] { --callout-border-left-width: 3px; --my-left: 0; }`;
      expect(findLogicalPropertyViolations(css)).toHaveLength(0);
    });

    it("does not choke on url() containing a semicolon", () => {
      const css = `[data-ui="x"] { background: url(data:image/svg+xml;utf8,<svg/>); margin-left: 0; }`;
      const v = findLogicalPropertyViolations(css);
      expect(v).toHaveLength(1);
      expect(v[0].property).toBe("margin-left");
    });
  });

  // ── The [dir=…]-scoped escape hatch ──
  describe("escape hatch: explicit [dir=…]-scoped blocks are exempt", () => {
    it('[dir="ltr"]-scoped physical properties are not flagged', () => {
      const css = `[dir="ltr"] [data-ui="x"] { margin-left: 0; text-align: left; }`;
      expect(findLogicalPropertyViolations(css)).toHaveLength(0);
    });

    it("[dir=rtl]-scoped physical properties are not flagged", () => {
      const css = `[data-ui="x"][dir=rtl] { padding-right: 0; }`;
      expect(findLogicalPropertyViolations(css)).toHaveLength(0);
    });

    it("still flags the same property outside the direction-scoped block", () => {
      const css = [
        `[dir="ltr"] [data-ui="x"] { margin-left: 0; }`,
        `[data-ui="x"] { margin-left: 0; }`,
      ].join("\n");
      const v = findLogicalPropertyViolations(css);
      expect(v).toHaveLength(1);
      expect(v[0].line).toBe(2);
    });
  });
});

// ── Rule inventory / JSON output ──
describe("logical-properties · rule inventory", () => {
  it("ships the rule with warning severity and an escape-hatch exemption", () => {
    expect(LOGICAL_PROPERTIES_RULE.id).toBe("logical-properties");
    expect(LOGICAL_PROPERTIES_RULE.severity).toBe("warning");
    expect(LOGICAL_PROPERTIES_RULE.exempt?.some(e => e.includes("[dir="))).toBe(true);
  });

  it("is listed in the audit rule inventory", () => {
    const inv = getRuleInventory();
    const rule = inv.find(r => r.id === "logical-properties");
    expect(rule).toBeDefined();
    expect(rule!.applies_to).toContain("component CSS");
  });
});

// ── Findings carry a deterministic 1:1 fix ──
describe("logical-properties · findings & fixes", () => {
  it("builds a warning result with a rewrite-css fix for each violation", () => {
    const css = `[data-ui="x"] { margin-left: 0; text-align: left; }`;
    const results = buildLogicalPropertyResults(css, "x", "ui/x.css");
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.rule_id).toBe("logical-properties");
      expect(r.severity).toBe("warning");
      expect(r.fix?.type).toBe("rewrite-css");
    }
    expect(results[0].message).toContain("margin-left → margin-inline-start");
    expect(results[1].message).toContain("text-align: left → text-align: start");
  });
});

// ── Repair round-trip: fixture CSS → repaired output → zero findings ──
describe("logical-properties · repair round-trip", () => {
  const TEST_DIR = join(import.meta.dir, "../.tmp-logical-props-test");

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, "ui"), { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("repairs a fixture to zero findings while preserving values and the escape hatch", async () => {
    const css = [
      `[data-ui="x"] {`,
      `  margin-left: var(--space-1);`,
      `  padding-right: 8px;`,
      `  left: 0;`,
      `  right: auto;`,
      `  border-top-left-radius: 4px;`,
      `  border-bottom-right-radius: 4px;`,
      `  border-right-color: transparent;`,
      `  border-left-style: dashed;`,
      `  text-align: left;`,
      `  margin-right: calc(1.25rem - 1px);`,
      `}`,
      `[dir="ltr"] [data-ui="x"] { margin-left: 0; }`,
    ].join("\n");

    const rel = "ui/x.css";
    const abs = join(TEST_DIR, rel);
    writeFileSync(abs, css);

    // Fixture starts dirty.
    expect(findLogicalPropertyViolations(css).length).toBeGreaterThan(0);

    const results = buildLogicalPropertyResults(css, "x", rel);
    const summary = await applyRepairs(results, TEST_DIR);
    expect(summary.fixes_applied).toBe(results.length);
    expect(summary.fixes_skipped).toBe(0);

    const repaired = readFileSync(abs, "utf8");

    // Round-trip: repaired output has zero findings.
    expect(findLogicalPropertyViolations(repaired)).toHaveLength(0);

    // Values are preserved verbatim; only the property/value token is swapped.
    expect(repaired).toContain("margin-inline-start: var(--space-1);");
    expect(repaired).toContain("margin-inline-end: calc(1.25rem - 1px);");
    expect(repaired).toContain("inset-inline-end: auto;");
    expect(repaired).toContain("text-align: start;");

    // The [dir="ltr"] escape-hatch line is left untouched.
    expect(repaired).toContain(`[dir="ltr"] [data-ui="x"] { margin-left: 0; }`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Registry self-audit — permanent CI gate  [task 0.3-10]
// ═══════════════════════════════════════════════════════════════════════════
//
// 0.3-09 shipped the rule; 0.3-10 remediated every registry offender (140 physical
// declarations across 28 stylesheets → logical). This gate keeps the registry clean
// forever: any physical, direction-bound property reintroduced into registry/**/*.css
// (outside a [dir=…] escape hatch) fails CI. It scans the source registry directly —
// buildLogicalPropertyResults is exactly what `faqir audit` runs per component CSS.
describe("logical-properties · registry self-audit (permanent CI gate)", () => {
  const cssFiles = [...new Glob("**/*.css").scanSync(REGISTRY)].sort();

  it("scans the full registry stylesheet set", () => {
    expect(cssFiles.length).toBeGreaterThan(20);
  });

  it("has ZERO logical-properties findings across registry/**/*.css", () => {
    const offenders: string[] = [];
    for (const rel of cssFiles) {
      const css = readFileSync(join(REGISTRY, rel), "utf8");
      for (const r of buildLogicalPropertyResults(css, basename(rel, ".css"), rel)) {
        offenders.push(`${rel}:${r.line} — ${r.message}`);
      }
    }
    // A non-empty list means a physical, direction-bound property was reintroduced.
    // Fix it with `faqir repair`, or scope it under an explicit [dir="ltr"|"rtl"].
    expect(offenders).toEqual([]);
  });
});

// ── button-group renders correctly in RTL (acceptance criterion, task 0.3-10) ──
// The classic offender: group corners and the -1px border overlap must follow the
// writing direction. After 0.3-10 the group rules are fully logical, so the first
// child rounds on its inline-start side and the last on its inline-end side — correct
// in both LTR and RTL. (Manually verified: button.html under dir="rtl".)
describe("logical-properties · button-group RTL correctness", () => {
  const buttonCss = readFileSync(join(REGISTRY, "primitives/button/button.css"), "utf8");

  it("button.css is free of physical, direction-bound properties", () => {
    expect(findLogicalPropertyViolations(buttonCss)).toHaveLength(0);
  });

  it("the button-group rules use logical corner-radius / margin properties", () => {
    // Slice from the button-group section so the assertions target the group rules.
    const group = buttonCss.slice(buttonCss.indexOf('[data-ui="button-group"]'));
    expect(group).toContain("border-start-start-radius: 0;");
    expect(group).toContain("border-end-start-radius: 0;");
    expect(group).toContain("margin-inline-start: -1px;");
    expect(group).toContain("border-start-end-radius: 0;");
    expect(group).toContain("border-end-end-radius: 0;");
    // …and none of the physical originals survive.
    expect(group).not.toContain("border-top-left-radius");
    expect(group).not.toContain("border-bottom-left-radius");
    expect(group).not.toContain("border-top-right-radius");
    expect(group).not.toContain("border-bottom-right-radius");
    expect(group).not.toContain("margin-left");
  });
});

// ── dir="rtl" on the demo pages doesn't error (task 0.3-10) ──
// Lightweight happy-dom smoke test: load every component demo fragment under an
// rtl-scoped root and assert it parses without throwing and inherits the direction.
// Full visual RTL coverage arrives with 0.4-23.
describe("logical-properties · dir=rtl demo pages don't error", () => {
  const demoHtml = [...new Glob("{primitives,recipes,patterns}/*/*.html").scanSync(REGISTRY)].sort();

  it("finds the component demo fragments", () => {
    expect(demoHtml.length).toBeGreaterThan(20);
  });

  it("parses every demo fragment under dir=rtl without throwing", () => {
    for (const rel of demoHtml) {
      const html = readFileSync(join(REGISTRY, rel), "utf8");
      const root = document.createElement("div");
      root.setAttribute("dir", "rtl");
      expect(() => { root.innerHTML = html; }).not.toThrow();
      document.body.appendChild(root);
      // Every component root resolves the rtl direction from its rtl-scoped ancestor.
      for (const el of root.querySelectorAll("[data-ui]")) {
        expect(el.closest('[dir="rtl"]')).toBe(root);
      }
      document.body.removeChild(root);
    }
  });

  it("button-group demo carries its three buttons under dir=rtl", () => {
    const html = readFileSync(join(REGISTRY, "primitives/button/button.html"), "utf8");
    const root = document.createElement("div");
    root.setAttribute("dir", "rtl");
    root.innerHTML = html;
    const group = root.querySelector('[data-ui="button-group"]');
    expect(group).not.toBeNull();
    expect(group!.querySelectorAll('[data-ui="button"]').length).toBe(3);
  });
});
