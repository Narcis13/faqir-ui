/**
 * Sidebar trigger glyph follows the state in a real engine [1.1F-11].
 *
 * The canonical markup authors one chevron, pointing inline-start (collapse), and
 * the stylesheet mirrors it with `scale: -1 1` while the sidebar is a rail. The
 * Bun suite can only read that rule as text: happy-dom computes no `scale`. This
 * reads the computed value off the live reference page, with the shipped engine
 * and controller running, through a real click on the trigger — and checks that
 * the click changes `aria-expanded` but not the accessible name.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts sidebar-rail`
 */

import { test, expect, type Page } from "@playwright/test";
import { liveReferencePage } from "./harness";

const PAGE = liveReferencePage("registry/recipes/sidebar/sidebar.html");

/** Computed `scale` of a sidebar's trigger glyph, once its transition settles. */
async function glyphScale(page: Page, id: string): Promise<string> {
  return page.evaluate(async (sel) => {
    const svg = document.querySelector(sel) as SVGElement;
    await Promise.all(svg.getAnimations().map((a) => a.finished));
    return getComputedStyle(svg).scale;
  }, `#${id} [data-part="trigger"] > svg`);
}

test.describe("sidebar · rail trigger glyph", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(PAGE);
  });

  test("a declared rail mirrors the glyph; an expanded sidebar does not", async ({ page }) => {
    expect(await glyphScale(page, "rail-sidebar")).toBe("-1 1");
    expect(await glyphScale(page, "app-sidebar")).toBe("none");
  });

  test("toggling flips the glyph both ways and keeps the trigger's name", async ({ page }) => {
    const trigger = page.locator('#app-sidebar [data-part="trigger"]');
    await expect(trigger).toHaveAccessibleName("Toggle sidebar");

    await trigger.click();
    await expect(page.locator("#app-sidebar")).toHaveAttribute("data-state", "rail");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAccessibleName("Toggle sidebar");
    expect(await glyphScale(page, "app-sidebar")).toBe("-1 1");

    await trigger.click();
    await expect(page.locator("#app-sidebar")).toHaveAttribute("data-state", "expanded");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAccessibleName("Toggle sidebar");
    expect(await glyphScale(page, "app-sidebar")).toBe("none");
  });
});
