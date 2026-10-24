/**
 * forecraft #36 — the chart's geometry in a real layout engine.
 *
 * The unit suite holds the layout to its spec with a 0.6 em-per-character
 * estimate of text width; happy-dom has no fonts to check that estimate with.
 * Here the reference fragment renders in Chromium with the full framework
 * sheet, the engine and faqir-chart, and every claim is measured from what was
 * painted: the columns stand on the zero rule, the series names sit inside
 * their marks, value and line labels collide with nothing, the drawing fills
 * its plot and redraws when that changes width, and the table leaves the
 * screen without leaving the page.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts forecraft-chart`
 */

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY, frameworkCss, sanitizeFragment } from "../visual/matrix";
import { livePage } from "./harness";

const REFERENCE = sanitizeFragment(readFileSync(join(REGISTRY, "primitives/chart/chart.html"), "utf8"));

type Box = { x: number; y: number; width: number; height: number };

const inside = (inner: Box, outer: Box, slack = 0.5) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function open(page: Page, html = livePage(REFERENCE, { plugins: ["chart"] })) {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-ui="chart"][data-state="drawn"]')).toHaveCount(19);
}

/** Painted boxes, in page pixels, for every element `selector` matches inside chart `index`. */
function boxes(page: Page, index: number, selector: string): Promise<Box[]> {
  return page.evaluate(
    ([i, sel]) =>
      Array.from(document.querySelectorAll('[data-ui="chart"]')[i as number].querySelectorAll(sel as string)).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    [index, selector],
  );
}

test.describe("faqir-chart in Chromium", () => {
  test("every reference chart draws, fills its plot, and reads its numbers", async ({ page }) => {
    await open(page);
    const facts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-ui="chart"]')).map((root) => {
        const plot = root.querySelector('[data-part="plot"]')!.getBoundingClientRect();
        const svg = root.querySelector('[data-part="plot"] > svg')!;
        const r = svg.getBoundingClientRect();
        return {
          plot: plot.width,
          svg: r.width,
          viewBox: Number(svg.getAttribute("viewBox")!.split(" ")[2]),
          role: svg.getAttribute("role"),
          label: svg.getAttribute("aria-label")!,
        };
      }),
    );
    for (const f of facts) {
      expect(f.role).toBe("img");
      expect(Math.abs(f.svg - f.plot)).toBeLessThan(1);
      // Drawn at the plot's own width: one SVG unit is one CSS pixel.
      expect(Math.abs(f.viewBox - f.plot)).toBeLessThan(1);
    }
    expect(facts[0].label).toBe("Invoices paid per quarter. Column chart. Q1 42, Q2 57, Q3 61, Q4 48.");
    expect(facts[1].label).toContain("2023: North 1,240, South 860, West 410");
    expect(facts[3].label).toContain("Feb −4.2");
  });

  test("columns stand on the zero rule, and the zero rule is the axis floor", async ({ page }) => {
    await open(page);
    const [baseline] = await boxes(page, 0, '[data-part="baseline"]');
    const grid = await boxes(page, 0, '[data-part="grid"] > line');
    const marks = await boxes(page, 0, '[data-part="mark"]');
    expect(marks).toHaveLength(4);
    const floor = Math.max(...grid.map((g) => g.y));
    expect(Math.abs(baseline.y - floor)).toBeLessThan(1);
    for (const m of marks) expect(Math.abs(m.y + m.height - baseline.y)).toBeLessThan(1);
    // The lowest tick label reads zero.
    const ticks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-ui="chart"]')[0].querySelectorAll('[data-part="axis"] > text[text-anchor="end"]')).map((t) => t.textContent),
    );
    expect(ticks[0]).toBe("0");
  });

  test("bars grow from zero, and each series is named inside one of its own bars", async ({ page }) => {
    await open(page);
    const [baseline] = await boxes(page, 1, '[data-part="baseline"]');
    const marks = await boxes(page, 1, '[data-part="mark"]');
    for (const m of marks) expect(Math.abs(m.x - baseline.x)).toBeLessThan(1);
    expect(await boxes(page, 1, '[data-part="legend"]')).toHaveLength(0);

    const named = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-ui="chart"]')[1].querySelectorAll('[data-part="series"]')).map((s) => {
        const name = s.querySelector('[data-part="name"]')!;
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return { name: name.textContent, box: box(name), marks: Array.from(s.querySelectorAll('[data-part="mark"]')).map(box) };
      }),
    );
    expect(named.map((n) => n.name)).toEqual(["2023", "2024", "2025"]);
    // Measured with the real font, the name fits the bar it sits on.
    for (const n of named) expect(n.marks.some((m) => inside(n.box, m))).toBe(true);
  });

  test("value labels sit clear of each other and inside the drawing", async ({ page }) => {
    await open(page);
    for (const index of [0, 1, 3]) {
      const [svg] = await boxes(page, index, '[data-part="plot"] > svg');
      const labels = await boxes(page, index, '[data-part="label"]');
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) expect(inside(l, svg, 1)).toBe(true);
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) expect(overlaps(labels[i], labels[j])).toBe(false);
    }
  });

  test("lines differ by dash, and their end names neither collide nor leave the drawing", async ({ page }) => {
    await open(page);
    const dashes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-ui="chart"]')[2].querySelectorAll('[data-part="line"]')).map(
        (p) => getComputedStyle(p).strokeDasharray,
      ),
    );
    expect(dashes).toHaveLength(3);
    expect(new Set(dashes).size).toBe(3);
    expect(dashes[0]).toBe("none");

    const [svg] = await boxes(page, 2, '[data-part="plot"] > svg');
    const names = await boxes(page, 2, '[data-part="name"]');
    expect(names).toHaveLength(3);
    for (const n of names) expect(inside(n, svg, 1)).toBe(true);
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) expect(overlaps(names[i], names[j])).toBe(false);
  });

  test("series step through the lightness bands on screen, darkest first", async ({ page }) => {
    await open(page);
    // Chromium computes a color-mix() in oklab as oklab(L a b): L is the
    // perceptual lightness itself. (The print case converts to greyscale.)
    const lightness = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-ui="chart"]')[1].querySelectorAll('[data-part="series"]')).map((s) =>
        getComputedStyle(s.querySelector('[data-part="mark"]')!).fill,
      ),
    );
    const L = lightness.map((fill) => Number(/^oklab\(([\d.]+)/.exec(fill)?.[1]));
    expect(L).toHaveLength(3);
    for (const l of L) expect(Number.isFinite(l)).toBe(true);
    for (let i = 1; i < 3; i++) expect(L[i] - L[i - 1]).toBeGreaterThanOrEqual(0.1);
  });

  test("the table leaves the screen once drawn, unless data-table says visible", async ({ page }) => {
    await open(page);
    const tables = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-ui="chart"] > [data-part="data"]')).map((t) => {
        const root = t.parentElement!.getBoundingClientRect();
        const plot = t.parentElement!.querySelector('[data-part="plot"]')!.getBoundingClientRect();
        const s = getComputedStyle(t);
        return {
          height: t.getBoundingClientRect().height,
          position: s.position,
          clip: s.clipPath,
          // Out of flow: the figure ends where the drawing does.
          gap: root.bottom - plot.bottom,
        };
      }),
    );
    for (const t of tables.slice(0, 3)) {
      expect(t.position).toBe("absolute");
      expect(t.clip).toBe("inset(50%)");
      expect(t.gap).toBeLessThan(1);
    }
    expect(tables[3].position).toBe("static");
    expect(tables[3].height).toBeGreaterThan(40);
    // Still in the accessibility tree: a screen reader reaches the numbers.
    await expect(page.getByRole("table").first()).toBeAttached();
    await expect(page.getByRole("cell", { name: "1,240" })).toHaveCount(1);
  });

  test("redraws at the new width when its container narrows", async ({ page }) => {
    await open(page);
    // A ResizeObserver reports at a rendering opportunity. A headless Chromium
    // that produces no frames (seen under WSL) never reaches one; there the
    // case calls redraw() itself, which still proves the measurement, and
    // the observer half waits for a host that paints.
    const frames = await page.evaluate(
      () => new Promise<boolean>((done) => {
        requestAnimationFrame(() => done(true));
        setTimeout(() => done(false), 1000);
      }),
    );
    const before = await page.evaluate(() => document.querySelector('[data-ui="chart"] svg')!.getAttribute("viewBox"));
    await page.evaluate(() => {
      (document.querySelector('[data-ui="chart"]') as HTMLElement).style.maxInlineSize = "360px";
    });
    if (!frames) await page.evaluate(() => (window as any).Faqir.ui('[data-ui="chart"]').redraw());
    await expect
      .poll(() => page.evaluate(() => document.querySelector('[data-ui="chart"] svg')!.getAttribute("viewBox")))
      .not.toBe(before);
    const after = await page.evaluate(() => {
      const plot = document.querySelector('[data-ui="chart"] [data-part="plot"]')!.getBoundingClientRect().width;
      return { plot, width: Number(document.querySelector('[data-ui="chart"] svg')!.getAttribute("viewBox")!.split(" ")[2]) };
    });
    expect(Math.abs(after.width - after.plot)).toBeLessThan(1);
    expect(after.width).toBeLessThanOrEqual(360);
  });

  test("without the plugin the table is the chart", async ({ page }) => {
    const html = `<!DOCTYPE html><html lang="en" data-theme="light"><head><meta charset="UTF-8"><style>${frameworkCss()}</style></head><body><main>${REFERENCE}</main></body></html>`;
    await page.setContent(html, { waitUntil: "load" });
    const facts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-ui="chart"]')).map((root) => ({
        state: root.getAttribute("data-state"),
        plot: getComputedStyle(root.querySelector('[data-part="plot"]')!).display,
        table: root.querySelector('[data-part="data"]')!.getBoundingClientRect().height,
      })),
    );
    for (const f of facts) {
      expect(f.state).toBeNull();
      expect(f.plot).toBe("none");
      expect(f.table).toBeGreaterThan(40);
    }
  });
});
