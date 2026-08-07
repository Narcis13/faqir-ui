/**
 * Cross-card row alignment in a real browser — task 0.9-09.
 *
 * Pricing supplies the unequal-content case: only the featured card has a
 * badge, and its feature list is longer. Every direct card row plus the nested
 * price is measured across each visual grid line. The viewport sweep includes
 * every canon floor, so wrapping 1 → 2 → 3 columns cannot silently detach the
 * subgrid contract.
 *
 * Chromium supports subgrid. To exercise the shipped `@supports not` branch as
 * an unsupported engine would, the fallback test rewrites only the feature-test
 * declaration to a deliberately unknown property. The enhancement block then
 * evaluates false and the unmodified fallback declarations evaluate true.
 */

import { expect, test, type Page } from "@playwright/test";
import { buildMatrix, buildPageHtml, type Case } from "./matrix";

const WIDTHS = [390, 640, 768, 1024, 1280] as const;
const HEIGHT = 900;
const SUPPORT_TEST = "(grid-template-rows: subgrid)";
const DISABLED_TEST = "(faqir-test-subgrid: enabled)";

const PRICING = (() => {
  const pricing = buildMatrix().find(
    (entry) =>
      entry.component.name === "pricing" &&
      entry.theme === "default" &&
      entry.scheme === "light" &&
      entry.dir === "ltr",
  ) as Case | undefined;

  if (!pricing) throw new Error("default/light/ltr pricing case is missing");
  return pricing;
})();

interface CardGeometry {
  top: number;
  left: number;
  width: number;
  height: number;
  display: string;
  templateRows: string;
  parts: Array<{ name: string; top: number }>;
  priceTop: number;
  hasBadge: boolean;
}

interface AlignmentGeometry {
  grid: { left: number; width: number; columns: string };
  cards: CardGeometry[];
}

function expectedColumns(width: number): number {
  if (width < 640) return 1;
  if (width < 1024) return 2;
  return 3;
}

async function mount(page: Page, width: number, forceFallback = false): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.route(/^https?:\/\//, (route) => route.abort());
  const source = buildPageHtml(PRICING);
  const html = forceFallback ? source.replaceAll(SUPPORT_TEST, DISABLED_TEST) : source;
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

async function geometry(page: Page): Promise<AlignmentGeometry> {
  return page.evaluate(() => {
    const pricing = document.querySelector<HTMLElement>('[data-ui="pricing"]')!;
    const grid = pricing.querySelector<HTMLElement>(':scope > [data-part="tiers"]')!;
    const gridRect = grid.getBoundingClientRect();
    const cards = [...grid.querySelectorAll<HTMLElement>(':scope > [data-ui="card"]')];

    return {
      grid: {
        left: gridRect.left,
        width: gridRect.width,
        columns: getComputedStyle(grid).gridTemplateColumns,
      },
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        const rows = [...card.children].filter(
          (child): child is HTMLElement => child instanceof HTMLElement,
        );
        const price = card.querySelector<HTMLElement>(':scope > [data-part="header"] [data-ui="stat"]')!;
        const style = getComputedStyle(card);
        return {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          display: style.display,
          templateRows: style.gridTemplateRows,
          parts: rows.map((row) => ({
            name: row.dataset.part ?? row.dataset.ui ?? row.tagName.toLowerCase(),
            top: row.getBoundingClientRect().top,
          })),
          priceTop: price.getBoundingClientRect().top,
          hasBadge: card.querySelector('[data-ui="badge"]') !== null,
        };
      }),
    };
  });
}

function visualLines(cards: CardGeometry[]): CardGeometry[][] {
  const lines: CardGeometry[][] = [];
  for (const card of [...cards].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find((candidate) => Math.abs(candidate[0].top - card.top) < 0.5);
    if (line) line.push(card);
    else lines.push([card]);
  }
  return lines;
}

test("unequal pricing cards align every fixed row and price through the canon ladder", async ({
  page,
}) => {
  for (const width of WIDTHS) {
    await mount(page, width);
    expect(await page.evaluate(() => CSS.supports("grid-template-rows", "subgrid"))).toBe(true);

    const measured = await geometry(page);
    const columns = expectedColumns(width);
    const lines = visualLines(measured.cards);

    expect(measured.cards).toHaveLength(3);
    expect(lines.map((line) => line.length)).toEqual(
      columns === 1 ? [1, 1, 1] : columns === 2 ? [2, 1] : [3],
    );
    expect(measured.grid.columns.trim().split(/\s+/)).toHaveLength(columns);
    expect(measured.cards.filter((card) => card.hasBadge)).toHaveLength(1);

    for (const [lineIndex, line] of lines.entries()) {
      for (const card of line) {
        expect(card.display, `card display at ${width}px`).toBe("grid");
        expect(card.templateRows, `card rows at ${width}px`).toContain("subgrid");
        expect(card.parts.map((part) => part.name)).toEqual([
          "header",
          "divider",
          "body",
          "footer",
        ]);
      }

      if (line.length < 2) continue;
      const rowNames = line[0].parts.map((part) => part.name);
      for (const name of rowNames) {
        const tops = line.map((card) => card.parts.find((part) => part.name === name)!.top);
        for (const top of tops.slice(1)) {
          expect(
            top,
            `${name} is detached on visual line ${lineIndex + 1} at ${width}px`,
          ).toBeCloseTo(tops[0], 5);
        }
      }
      for (const priceTop of line.slice(1).map((card) => card.priceTop)) {
        expect(
          priceTop,
          `price is detached on visual line ${lineIndex + 1} at ${width}px`,
        ).toBeCloseTo(line[0].priceTop, 5);
      }
    }
  }
});

test("with subgrid disabled the declared fallback stacks complete cards", async ({ page }) => {
  await mount(page, 1280, true);
  expect(await page.evaluate(() => CSS.supports("faqir-test-subgrid", "enabled"))).toBe(false);

  const measured = await geometry(page);
  const lines = visualLines(measured.cards);
  expect(lines.map((line) => line.length)).toEqual([1, 1, 1]);

  for (const [index, card] of measured.cards.entries()) {
    expect(card.display, `fallback card ${index + 1} keeps card's intrinsic layout`).toBe("flex");
    expect(card.templateRows).toBe("none");
    expect(card.parts.map((part) => part.name)).toEqual([
      "header",
      "divider",
      "body",
      "footer",
    ]);
    expect(card.left).toBeCloseTo(measured.grid.left, 5);
    expect(card.width).toBeCloseTo(measured.grid.width, 5);
    for (let part = 1; part < card.parts.length; part++) {
      expect(card.parts[part].top).toBeGreaterThanOrEqual(card.parts[part - 1].top);
    }
    expect(card.parts[0].top).toBeGreaterThanOrEqual(card.top);
    expect(card.parts.at(-1)!.top).toBeLessThan(card.top + card.height);
  }

  for (let index = 1; index < measured.cards.length; index++) {
    expect(measured.cards[index].top).toBeGreaterThan(
      measured.cards[index - 1].top + measured.cards[index - 1].height,
    );
  }
});

test("pricing's root column variant still controls the nested grid", async ({ page }) => {
  await mount(page, 1280);
  const root = page.locator('[data-ui="pricing"]').first();
  const tiers = root.locator(':scope > [data-part="tiers"]');

  await root.evaluate((element) => element.setAttribute("data-cols", "2"));
  expect(
    (await tiers.evaluate((element) => getComputedStyle(element).gridTemplateColumns))
      .trim()
      .split(/\s+/),
  ).toHaveLength(2);

  await root.evaluate((element) => element.setAttribute("data-cols", "3"));
  expect(
    (await tiers.evaluate((element) => getComputedStyle(element).gridTemplateColumns))
      .trim()
      .split(/\s+/),
  ).toHaveLength(3);
});
