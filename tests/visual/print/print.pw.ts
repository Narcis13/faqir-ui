import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { buildPrintCaseHtml, buildPrintMatrix } from "./matrix";

const matrix = buildPrintMatrix();

test("print matrix is non-empty", () => {
  expect(matrix.length).toBeGreaterThan(0);
});

for (const printCase of matrix) {
  test(`${printCase.id} is ${printCase.expectedPages} pages and matches baselines`, async ({
    page,
  }, testInfo) => {
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.emulateMedia({ media: "print" });
    await page.setContent(buildPrintCaseHtml(printCase), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    // The invoice's QR SVG is controller-generated. Waiting here also proves
    // the production scaffold settled before Chromium snapshots the PDF.
    if (printCase.id === "scaffold-invoice") {
      await expect(page.locator('[data-ui="qr-code"] [data-part="svg"]')).toHaveCount(1);
    }

    const pdfPath = testInfo.outputPath(`${printCase.id}.pdf`);
    const pdf = await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
      tagged: false,
      outline: false,
    });
    await testInfo.attach(`${printCase.id}.pdf`, {
      body: pdf,
      contentType: "application/pdf",
    });

    const rasterPrefix = testInfo.outputPath(`${printCase.id}-page`);
    const raster = spawnSync(
      "pdftoppm",
      ["-png", "-r", "96", "-aa", "yes", "-aaVector", "yes", pdfPath, rasterPrefix],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(
      raster.status,
      raster.error?.message || raster.stderr || "pdftoppm failed without diagnostics",
    ).toBe(0);

    const prefix = basename(rasterPrefix);
    const pages = readdirSync(testInfo.outputDir)
      .filter((file) => file.startsWith(`${prefix}-`) && file.endsWith(".png"))
      .sort((a, b) => {
        const pageNumber = (file: string) => Number(/-(\d+)\.png$/.exec(file)?.[1] ?? 0);
        return pageNumber(a) - pageNumber(b);
      });

    // Cheap pagination tripwire before the more expensive pixel comparisons.
    expect(pages, `${printCase.id} PDF page count`).toHaveLength(printCase.expectedPages);

    for (const [index, pageName] of pages.entries()) {
      const pagePng = readFileSync(testInfo.outputPath(pageName));
      expect(pagePng).toMatchSnapshot(`${printCase.id}-page-${index + 1}.png`);
    }
  });
}
