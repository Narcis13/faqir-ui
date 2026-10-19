// forecraft #36 — a chart on paper.
//
// Two claims, both measured rather than baselined: three series print as
// three distinct lightness bands once the colour is gone (read from the
// fills Chromium computes in print media, converted to greyscale lightness),
// and the numbers the chart was drawn from print under it (read out of the
// PDF with `pdf-facts`, which needs no Poppler and no platform baseline).
//
// The page is the framework's full stylesheet under the `document` print
// theme, exactly what a project prints, with faqir-chart loaded after it.

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPrintReferencePageHtml } from "../matrix";
import { REGISTRY } from "./matrix";
import { readPdf, type PdfPage } from "./pdf-facts";

const PLUGIN = readFileSync(join(REGISTRY, "core/plugins/faqir-chart.js"), "utf8");

function chart(attrs: string): string {
  return `<figure data-ui="chart" data-variant="bar"${attrs}>
  <figcaption data-part="caption">Revenue by region, thousand euro</figcaption>
  <div data-part="plot"></div>
  <table data-part="data">
    <thead><tr><th scope="col">Region</th><th scope="col">2023</th><th scope="col">2024</th><th scope="col">2025</th></tr></thead>
    <tbody>
      <tr><th scope="row">North</th><td>1,240</td><td>1,380</td><td>1,510</td></tr>
      <tr><th scope="row">South</th><td>860</td><td>940</td><td>1,020</td></tr>
      <tr><th scope="row">West</th><td>410</td><td>520</td><td>690</td></tr>
    </tbody>
  </table>
</figure>`;
}

function page(fragment: string): string {
  const html = buildPrintReferencePageHtml(
    `<article data-ui="document" data-format="a4" aria-label="Quarterly report"><div data-part="body">${fragment}</div></article>`,
    "chart on paper",
  );
  return html.replace("</body>", `<script>${PLUGIN.replace(/<\/script/gi, "<\\/script")}</script>\n</body>`);
}

async function load(p: Page, html: string) {
  await p.route(/^https?:\/\//, (route) => route.abort());
  await p.emulateMedia({ media: "print" });
  await p.setContent(html, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await expect(p.locator('[data-ui="chart"][data-state="drawn"]')).toHaveCount(1);
}

async function pdf(p: Page): Promise<PdfPage[]> {
  return readPdf(
    await p.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, tagged: false, outline: false }),
  );
}

/**
 * CIE L* (0 black … 100 white) of a computed CSS colour — the lightness a
 * greyscale print keeps. Chromium serialises a color-mix() in oklab as
 * `oklab(L a b)`; anything sRGB arrives as `rgb(…)`.
 */
function greyscale(css: string): number {
  let linear: number[];
  const lab = /^oklab\(\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)/.exec(css);
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css);
  if (lab) {
    const [L, a, b] = lab.slice(1).map(Number);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    linear = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  } else if (rgb) {
    linear = rgb.slice(1).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  } else {
    throw new Error(`cannot read the colour ${css}`);
  }
  const [r, g, b] = linear.map((v) => Math.min(Math.max(v, 0), 1));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

test("#36 three series print as three distinct lightness bands in greyscale", async ({ page: p }) => {
  await load(p, page(chart("")));
  const fills = await p.evaluate(() => ({
    series: Array.from(document.querySelectorAll('[data-part="series"]')).map((s) =>
      Array.from(s.querySelectorAll('[data-part="mark"]')).map((m) => getComputedStyle(m).fill),
    ),
    paper: (() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--color-bg)";
      document.querySelector('[data-ui="chart"]')!.appendChild(probe);
      const bg = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return bg;
    })(),
  }));
  expect(fills.series).toHaveLength(3);
  // One band per series: every mark of a series paints the same fill.
  for (const marks of fills.series) expect(new Set(marks).size).toBe(1);

  const bands = fills.series.map((marks) => greyscale(marks[0]));
  for (let i = 1; i < bands.length; i++) {
    expect(bands[i] - bands[i - 1], `band ${i + 1} against band ${i}: ${bands.map((b) => b.toFixed(1))}`).toBeGreaterThanOrEqual(10);
  }
  // And the lightest still reads against the paper.
  expect(greyscale(fills.paper) - bands[2]).toBeGreaterThanOrEqual(10);
});

test("#36 the numbers print under the chart, and data-table=hidden leaves them off", async ({ page: p }) => {
  await load(p, page(chart("")));
  const [withTable] = await pdf(p);
  // "Region" heads only the table's category column: the drawing never prints it.
  expect(withTable.text).toContain("Region");
  for (const n of ["1,240", "1,380", "1,510", "860", "410", "690"]) expect(withTable.text).toContain(n);
  // The chart drew first: its caption precedes the table's heading on the page.
  expect(withTable.text.indexOf("Revenue by region")).toBeLessThan(withTable.text.indexOf("Region"));

  await load(p, page(chart(' data-table="hidden"')));
  const [chartOnly] = await pdf(p);
  expect(chartOnly.text).not.toContain("Region");
  // The value labels on the marks still carry the numbers.
  expect(chartOnly.text).toContain("1,510");
});
