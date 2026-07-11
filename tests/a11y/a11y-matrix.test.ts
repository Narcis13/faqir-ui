/**
 * Meta-tests for the automated a11y suite — task 0.4-24 (FAQIR-PLAN §12.3).
 *
 * These run in the ordinary `bun test` suite (no browser). They guard the parts
 * the axe run itself can't:
 *
 *   1. Page discovery matches the visual suite's — the acceptance-critical meta
 *      test. Both suites MUST scan the same registry pages via the same shared
 *      util, so the a11y gate can never silently skip a page the visual gate
 *      covers (or vice-versa).
 *   2. The a11y matrix is the exact component × theme × scheme cross-product.
 *   3. The exemption list is well-formed and minimal — every entry carries a real
 *      justification, so the "documented exemption mechanism" can't be abused to
 *      quietly mute the gate.
 *   4. The report + partition helpers behave (they produce the component + rule +
 *      selector output the acceptance criteria require) — pinned without a browser.
 */

import { describe, test, expect } from "bun:test";
import {
  buildA11yMatrix,
  A11Y_THEMES,
  buildPageHtml as a11yBuildPageHtml,
  discoverComponents as a11yDiscoverComponents,
} from "./a11y-matrix";
import {
  discoverComponents,
  discoverThemes,
  buildMatrix as buildVisualMatrix,
  buildPageHtml as visualBuildPageHtml,
  SCHEMES,
} from "../visual/matrix";
import { A11Y_EXEMPTIONS, findExemption, partitionViolations, ALL_COMPONENTS } from "./exemptions";
import { WCAG_TAGS } from "./axe-config";
import { formatViolations, formatViolation, selectorOf } from "./report";
import type { AxeViolation } from "./axe-types";

describe("a11y ↔ visual page-discovery parity", () => {
  test("both suites discover the exact same registry pages via the shared util", () => {
    // The a11y suite re-exports the visual suite's discovery util verbatim — same
    // function, not a copy — so there is literally one implementation to drift.
    expect(a11yDiscoverComponents).toBe(discoverComponents);
    expect(a11yBuildPageHtml).toBe(visualBuildPageHtml);

    const a11yPages = new Set(buildA11yMatrix().map((c) => c.component.htmlRel));
    const visualPages = new Set(buildVisualMatrix().map((c) => c.component.htmlRel));
    const discovered = new Set(discoverComponents().map((c) => c.htmlRel));

    // Every page the visual suite screenshots is a page the a11y suite scans.
    expect([...a11yPages].sort()).toEqual([...visualPages].sort());
    expect([...a11yPages].sort()).toEqual([...discovered].sort());
    expect(a11yPages.size).toBeGreaterThan(0);
  });
});

describe("a11y matrix generation", () => {
  test("matrix is the full component × a11y-theme × scheme cross-product, unique ids", () => {
    const components = discoverComponents();
    const matrix = buildA11yMatrix();

    expect(components.length).toBeGreaterThan(0);
    expect(matrix.length).toBe(components.length * A11Y_THEMES.length * SCHEMES.length);

    const ids = new Set(matrix.map((c) => c.id));
    expect(ids.size).toBe(matrix.length); // no two cases collide

    // Every case is one of the a11y themes and one of the schemes.
    for (const c of matrix) {
      expect(A11Y_THEMES).toContain(c.theme);
      expect(SCHEMES).toContain(c.scheme);
    }
  });

  test("both required themes (default + contrast) exist in the registry", () => {
    const themes = new Set(discoverThemes());
    for (const t of A11Y_THEMES) expect(themes.has(t)).toBe(true);
    // §12.3 minimum: a neutral baseline theme and the high-contrast theme.
    expect(A11Y_THEMES).toContain("default");
    expect(A11Y_THEMES).toContain("contrast");
  });

  test("both schemes are represented for every component (light + dark swept)", () => {
    const matrix = buildA11yMatrix();
    for (const scheme of SCHEMES) {
      expect(matrix.some((c) => c.scheme === scheme)).toBe(true);
    }
    // Per component × theme, exactly one case per scheme.
    const perComponent = matrix.filter(
      (c) => c.component.name === matrix[0].component.name && c.theme === "default",
    );
    expect(perComponent.map((c) => c.scheme).sort()).toEqual([...SCHEMES].sort());
  });

  test("the assembled page carries the case's data-theme (scheme axis is real)", () => {
    const dark = buildA11yMatrix().find((c) => c.scheme === "dark")!;
    const html = a11yBuildPageHtml(dark);
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain(`/* theme: ${dark.theme} */`);
  });

  test("scan targets the WCAG 2 A/AA success criteria (no best-practice noise)", () => {
    expect([...WCAG_TAGS].sort()).toEqual(["wcag21a", "wcag21aa", "wcag2a", "wcag2aa"]);
    expect(WCAG_TAGS).not.toContain("best-practice");
  });
});

describe("exemption mechanism", () => {
  test("every exemption is well-formed and carries a real justification", () => {
    for (const e of A11Y_EXEMPTIONS) {
      expect(typeof e.rule).toBe("string");
      expect(e.rule.length).toBeGreaterThan(0);
      expect(typeof e.component).toBe("string");
      expect(e.component.length).toBeGreaterThan(0);
      // A justification must actually explain something — not a placeholder.
      expect(e.justification.trim().length).toBeGreaterThanOrEqual(24);
    }
  });

  test("the only active exemptions are the documented WCAG-1.4.3 disabled-control false positives", () => {
    // A guard against scope creep: if someone adds an exemption for a *real*
    // violation, this fails and forces the justification into review.
    for (const e of A11Y_EXEMPTIONS) {
      expect(e.rule).toBe("color-contrast");
      expect(["label", "switch", "slider"]).toContain(e.component);
      expect(e.justification).toContain("1.4.3");
    }
  });

  test("findExemption matches by rule + component, and honours the wildcard", () => {
    const exemptions = [
      { rule: "color-contrast", component: "slider", justification: "disabled output, per WCAG 1.4.3" },
      { rule: "region", component: ALL_COMPONENTS, justification: "fragment pages have no page-level landmark" },
    ];
    expect(findExemption("color-contrast", "slider", exemptions)).toBeDefined();
    expect(findExemption("color-contrast", "badge", exemptions)).toBeUndefined();
    // Wildcard matches any component.
    expect(findExemption("region", "anything", exemptions)).toBeDefined();
    // Rule must still match.
    expect(findExemption("label", "anything", exemptions)).toBeUndefined();
  });

  test("partitionViolations splits blocking from exempted", () => {
    const violations: AxeViolation[] = [
      { id: "color-contrast", nodes: [{ target: ["output"] }] },
      { id: "button-name", nodes: [{ target: ["button"] }] },
    ];
    const exemptions = [
      { rule: "color-contrast", component: "slider", justification: "disabled output, per WCAG 1.4.3" },
    ];
    const { blocking, exempted } = partitionViolations(violations, "slider", exemptions);
    expect(blocking.map((v) => v.id)).toEqual(["button-name"]);
    expect(exempted.map((e) => e.violation.id)).toEqual(["color-contrast"]);
    expect(exempted[0].exemption.component).toBe("slider");

    // Same violations on a component with no exemption → nothing waived.
    const other = partitionViolations(violations, "badge", exemptions);
    expect(other.blocking.length).toBe(2);
    expect(other.exempted.length).toBe(0);
  });
});

describe("violation reporting (component + rule + selector)", () => {
  test("selectorOf flattens single- and nested-frame targets", () => {
    expect(selectorOf({ target: ["main > .btn"] })).toBe("main > .btn");
    expect(selectorOf({ target: [["iframe#a", "button.b"]] })).toBe("iframe#a button.b");
    expect(selectorOf({ target: [] })).toBe("<unknown selector>");
  });

  test("formatViolation names the rule and every offending selector", () => {
    const v: AxeViolation = {
      id: "color-contrast",
      impact: "serious",
      help: "Elements must meet minimum color contrast ratio thresholds",
      helpUrl: "https://dequeuniversity.com/rules/axe/color-contrast",
      nodes: [{ target: [".a"] }, { target: [".b"] }],
    };
    const out = formatViolation(v);
    expect(out).toContain("[color-contrast]");
    expect(out).toContain("(serious)");
    expect(out).toContain("→ .a");
    expect(out).toContain("→ .b");
    expect(out).toContain("dequeuniversity.com");
  });

  test("formatViolations header names the case (and therefore the component)", () => {
    const out = formatViolations("primitive__badge__default__light", [
      { id: "color-contrast", nodes: [{ target: ["span[data-variant=success]"] }] },
    ]);
    expect(out).toContain("primitive__badge__default__light");
    expect(out).toContain("[color-contrast]");
    expect(out).toContain("→ span[data-variant=success]");
  });
});
