import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildDocumentScaffoldPage } from "../scaffolds/document-pages";
import { WCAG_TAGS } from "./axe-config";

for (const name of ["invoice", "report"] as const) {
  test(`scaffold__${name} has zero axe violations`, async ({ page }) => {
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.setContent(buildDocumentScaffoldPage(name), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
}
