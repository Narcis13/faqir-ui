import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildAppScaffoldPage } from "../scaffolds/app-pages";
import { buildDocumentScaffoldPage } from "../scaffolds/document-pages";
import { buildLandingScaffoldPage } from "../scaffolds/landing-page";
import { APP_SCAFFOLD_NAMES } from "../../src/scaffolds/app";
import { WCAG_TAGS } from "./axe-config";
import { A11Y_THEMES } from "./a11y-matrix";

async function scan(page: import("@playwright/test").Page, html: string) {
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    targets: violation.nodes.map((node) => node.target),
  }));
}

for (const name of ["invoice", "report"] as const) {
  test(`scaffold__${name} has zero axe violations`, async ({ page }) => {
    expect(await scan(page, buildDocumentScaffoldPage(name))).toEqual([]);
  });
}

// The landing patterns are scanned individually by the a11y matrix; this covers
// the assembled page a user gets — where the sections share one document, one
// heading outline, and four navigation landmarks. Every theme the gate sweeps.
for (const theme of A11Y_THEMES) {
  test(`scaffold__landing-page__${theme} has zero axe violations`, async ({ page }) => {
    expect(await scan(page, buildLandingScaffoldPage(theme))).toEqual([]);
  });
}

// The two application scaffolds, composed from registry patterns since 1.0R-08.
// Their patterns are scanned individually by the a11y matrix; this covers the
// assembled page a user gets — where a shell, a table and a settings form share
// one document, one heading outline and one set of landmarks.
for (const name of APP_SCAFFOLD_NAMES) {
  test(`scaffold__${name} has zero axe violations`, async ({ page }) => {
    expect(await scan(page, buildAppScaffoldPage(name))).toEqual([]);
  });
}
