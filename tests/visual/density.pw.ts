/**
 * Density-mode screenshots (task 0.7-11).
 *
 * `data-density` is a token modifier, not a component, so the reference page
 * (`registry/tokens/density.html`) carries no `@ui:component` header and stays
 * out of the component × theme matrix. It gets this dedicated sweep instead:
 * every theme in `DENSITY_THEMES` × { light, dark }. Each capture shows the same
 * form and table at comfortable and compact density plus the nesting reset, so a
 * diff can only be the token remap.
 */
import { expect, test } from "@playwright/test";
import { buildDensityPageHtml, DENSITY_THEMES, SCHEMES } from "./matrix";

for (const theme of DENSITY_THEMES) {
  for (const scheme of SCHEMES) {
    const id = `density__${theme}__${scheme}__ltr`;
    test(id, async ({ page }) => {
      await page.route(/^https?:\/\//, (route) => route.abort());
      await page.setContent(buildDensityPageHtml(theme, scheme), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      // The capture is only meaningful if compact actually resolved tighter than
      // the default scale — assert it before trusting the pixels.
      const heights = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('form [data-ui="button"]')];
        const inside = (el: Element, density: string) =>
          el.closest(`[data-density="${density}"]`) !== null;
        const h = (el: Element) => el.getBoundingClientRect().height;
        return {
          comfortable: h(buttons.find((b) => !inside(b, "compact"))!),
          compact: h(buttons.find((b) => inside(b, "compact"))!),
        };
      });
      expect(heights.compact).toBeLessThan(heights.comfortable);

      await expect(page).toHaveScreenshot(`${id}.png`, { fullPage: true });
    });
  }
}
