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
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

// ── Registry reproduction (acceptance criterion) ──
// Running the rule on the registry reproduces the known button-group and table
// findings. 0.3-10 fixes them; here we only assert they are surfaced.
describe("logical-properties · registry reproduction", () => {
  it("reproduces the button-group corner-radius / margin findings in button.css", () => {
    const css = readFileSync(join(REGISTRY, "primitives/button/button.css"), "utf8");
    const v = findLogicalPropertyViolations(css);
    const tos = v.map(x => x.to);
    expect(tos).toContain("border-start-start-radius"); // border-top-left-radius
    expect(tos).toContain("border-end-start-radius");   // border-bottom-left-radius
    expect(tos).toContain("border-start-end-radius");   // border-top-right-radius
    expect(tos).toContain("border-end-end-radius");     // border-bottom-right-radius
    expect(tos).toContain("margin-inline-start");        // margin-left: -1px
  });

  it("reproduces the crud-table margin findings", () => {
    const css = readFileSync(join(REGISTRY, "patterns/crud-table/crud-table.css"), "utf8");
    const v = findLogicalPropertyViolations(css);
    expect(v.length).toBeGreaterThan(0);
    expect(v.map(x => x.from).every(p => p === "margin-left" || p === "margin-right")).toBe(true);
  });
});
