/**
 * Mobile accessibility sweep — task 0.8-11 (FAQIR-NEXT §19).
 *
 * The main axe suite (`a11y.pw.ts`) scans every reference page at 1280px. That
 * is one rendering of the markup; a phone is another. Media queries move
 * elements out of the flow, hide panes, stack controls and reorder columns — so
 * a page can be green at 1280 and broken at 390 with no markup change at all:
 *
 *   - an off-canvas drawer that is `position: fixed` and translated out of view
 *     but still in the tab order (axe's `aria-hidden-focus` / focus-order rules);
 *   - a pane hidden by a media query whose labelled controls now point at
 *     nothing (`aria-*` reference rules);
 *   - controls that reflow into overlapping or clipped targets, and text that
 *     lands on a different background once a two-column layout stacks
 *     (`color-contrast` is computed against what is actually behind the text).
 *
 * The set is the layout-bearing one — manifest `category: layout` or
 * `kind: pattern` — discovered exactly as the visual suite's viewport axis
 * discovers it (`buildMobileA11yMatrix`), so the two gates can never disagree
 * about which pages have responsive behaviour worth re-checking. Components with
 * no responsive behaviour render identically at both widths and are deliberately
 * not re-scanned.
 *
 * Same policy as the desktop scan and the *same exemption list*: zero non-exempt
 * WCAG 2.0/2.1 A/AA violations. A mobile-only exemption would be a mobile-only
 * accessibility bug — the whole point is that there are none.
 *
 * Run:   npx playwright test --config=playwright.a11y.config.ts --grep "^mobile__"
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildMobileA11yMatrix, buildPageHtml, MOBILE_VIEWPORT } from "./a11y-matrix";
import { WCAG_TAGS } from "./axe-config";
import { partitionViolations } from "./exemptions";
import { formatViolations } from "./report";
import type { AxeViolation } from "./axe-types";

const matrix = buildMobileA11yMatrix();

// Tripwire: manifest-driven discovery yielding nothing would otherwise report
// "0 tests, all green" — the silent-skip failure mode.
test("mobile a11y matrix is non-empty", () => {
  expect(matrix.length).toBeGreaterThan(0);
  for (const c of matrix) expect(c.width).toBe(MOBILE_VIEWPORT.width);
});

for (const c of matrix) {
  test(c.id, async ({ page }) => {
    await page.setViewportSize({ width: c.width, height: MOBILE_VIEWPORT.height });
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.setContent(buildPageHtml(c), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    // Sanity: the scan really happened at the phone width, not the config's
    // 1280 default — a viewport that silently failed to apply would make every
    // case a duplicate of the desktop scan and this suite worthless.
    expect(await page.evaluate(() => window.innerWidth)).toBe(c.width);

    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    const { blocking } = partitionViolations(
      results.violations as unknown as AxeViolation[],
      c.component.name,
    );

    const report = blocking.length ? formatViolations(c.id, blocking) : "";
    expect(report, `Accessibility violations on ${c.id} (390px)`).toBe("");
  });
}
