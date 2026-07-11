/**
 * Visual-regression suite — task 0.4-23 (FAQIR-PLAN §12.2).
 *
 * One screenshot test per matrix case (component × theme × light/dark × LTR/RTL),
 * with the matrix generated from the registry at runtime by `./matrix`. Adding a
 * component or a theme grows this suite automatically — there is nothing to edit
 * here. The page for each case is a fully self-contained document (all framework
 * CSS inlined, no controller JS, no network), so a capture is deterministic.
 *
 * Run:      npx playwright test                     (compares against baselines)
 * Update:   npx playwright test --update-snapshots  (regenerate baselines)
 * Shard:    npx playwright test --shard=1/4         (see .github/workflows/visual.yml)
 *
 * Baselines are platform-specific — generate/update them in the pinned Linux
 * container, never on a developer laptop. See tests/visual/README.md.
 */

import { test, expect } from "@playwright/test";
import { buildMatrix, buildPageHtml } from "./matrix";

const matrix = buildMatrix();

// A tripwire, not a real screenshot: if the registry ever stops yielding cases
// (a broken scan, an empty registry), fail loudly instead of "0 tests, all pass".
test("matrix is non-empty", () => {
  expect(matrix.length).toBeGreaterThan(0);
});

for (const c of matrix) {
  test(c.id, async ({ page }) => {
    // Guarantee zero network: every external src was already swapped for a data:
    // URI in buildPageHtml; abort anything real so a stray asset can never hang
    // a capture (and a reviewer sees the placeholder instead).
    await page.route(/^https?:\/\//, (route) => route.abort());

    await page.setContent(buildPageHtml(c), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot(`${c.id}.png`, { fullPage: true });
  });
}
