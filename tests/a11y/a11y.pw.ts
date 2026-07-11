/**
 * Automated accessibility suite — task 0.4-24 (FAQIR-PLAN §12.3).
 *
 * One axe-core scan per matrix case (component × {default, contrast} × {light,
 * dark}), with the matrix generated from the registry at runtime by
 * `./a11y-matrix` — the *same* discovery util and page builder the visual suite
 * uses. Adding a component or an a11y theme grows this suite automatically; there
 * is nothing to edit here. Zero-violation policy: any non-exempt WCAG 2.0/2.1 A/AA
 * violation fails the case, and the failure message names the component, the rule,
 * and the offending selector(s).
 *
 * Run:   npx playwright test --config=playwright.a11y.config.ts
 *        npm run test:a11y
 *
 * Each page is the identical self-contained, network-free document the visual
 * suite captures (all framework CSS inlined, no controller JS), so a scan is
 * deterministic and touches nothing external.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { buildA11yMatrix, buildPageHtml } from "./a11y-matrix";
import { WCAG_TAGS } from "./axe-config";
import { partitionViolations } from "./exemptions";
import { formatViolations } from "./report";
import type { AxeViolation } from "./axe-types";

const HERE = dirname(fileURLToPath(import.meta.url));
const matrix = buildA11yMatrix();

/** Run the WCAG A/AA axe scan against whatever is currently loaded in `page`. */
async function scan(page: import("@playwright/test").Page): Promise<AxeViolation[]> {
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  return results.violations as unknown as AxeViolation[];
}

/** Load a fully-assembled document and settle fonts before scanning. Aborts any
 *  real network request as a backstop — pages are already self-contained, and
 *  axe injects its engine in-process, so nothing legitimate hits the network. */
async function mount(page: import("@playwright/test").Page, html: string): Promise<void> {
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

// Tripwire: if the registry ever stops yielding cases, fail loudly rather than
// reporting "0 tests, all green" — the classic silent-skip failure mode.
test("a11y matrix is non-empty", () => {
  expect(matrix.length).toBeGreaterThan(0);
});

// The gate must actually bite. A deliberately-broken fixture (image with no alt,
// button with no name) is run through the exact same scan+partition pipeline the
// registry pages use; if detection or wiring ever regressed, this would go green
// on a plainly-inaccessible page. It also proves the report names rule + selector.
test("gate bites: known-violation fixture is caught by the pipeline", async ({ page }) => {
  const html = readFileSync(join(HERE, "fixtures", "known-violation.html"), "utf8");
  await mount(page, html);

  const violations = await scan(page);
  // No exemptions apply to the fixture's fictional component name.
  const { blocking } = partitionViolations(violations, "known-violation-fixture");
  const ruleIds = blocking.map((v) => v.id);

  expect(ruleIds, "expected axe to flag the missing image alt").toContain("image-alt");
  expect(ruleIds, "expected axe to flag the nameless button").toContain("button-name");

  // The formatted output a red CI run would print must name the rule and a selector.
  const report = formatViolations("fixture", blocking);
  expect(report).toContain("[image-alt]");
  expect(report).toContain("[button-name]");
  expect(report).toMatch(/→ .*button/i);
});

for (const c of matrix) {
  test(c.id, async ({ page }) => {
    await mount(page, buildPageHtml(c));

    const violations = await scan(page);
    const { blocking } = partitionViolations(violations, c.component.name);

    // The assertion's "actual" value IS the human-readable report — a failing run
    // prints the component (via the case id), each violated rule, and every
    // offending selector, with no report artifact to open.
    const report = blocking.length ? formatViolations(c.id, blocking) : "";
    expect(report, `Accessibility violations on ${c.id}`).toBe("");
  });
}
