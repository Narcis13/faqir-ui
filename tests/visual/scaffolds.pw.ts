import { expect, test } from "@playwright/test";
import { buildDocumentScaffoldPage } from "../scaffolds/document-pages";

for (const name of ["invoice", "report"] as const) {
  test(`scaffold__${name}__document__light__ltr`, async ({ page }) => {
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.setContent(buildDocumentScaffoldPage(name), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    if (name === "invoice") {
      await expect(page.locator('[data-ui="qr-code"] [data-part="svg"]')).toHaveCount(1);
    }

    await expect(page).toHaveScreenshot(`scaffold__${name}__document__light__ltr.png`, {
      fullPage: true,
    });
  });
}
