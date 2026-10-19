// The print notes from forecraft, as print-matrix cases (#32 #33 #38 #39 #40
// #43 #47 #49).
//
// Every case here prints through headless Chromium and asserts something a
// rasteriser has no say in — the size of each physical page, the text printed
// on it, where a margin box drew a rule — by reading the PDF itself
// (`pdf-facts.ts`). So, unlike `print.pw.ts`, these run without Poppler and
// without platform baselines, and a failure is a contract change, never noise.
//
// Each page is the framework's full stylesheet (tokens, the `document` print
// theme, base, every component sheet), exactly what a project prints once the
// bundle is built — which is the point of #43: a rule that is global in the
// bundle is global on every page the app prints.

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPrintReferencePageHtml } from "../matrix";
import { buildPrintCaseHtml, buildPrintMatrix, REGISTRY } from "./matrix";
import { readPdf, type PdfPage } from "./pdf-facts";

const PRINT_REFERENCE = readFileSync(
  join(REGISTRY, "patterns/document/document-print.html"),
  "utf8",
);

/** PostScript points per millimetre, and CSS px per millimetre. */
const PT_PER_MM = 72 / 25.4;
const PX_PER_MM = 96 / 25.4;
const A4: [number, number] = [210 * PT_PER_MM, 297 * PT_PER_MM];
const LETTER: [number, number] = [612, 792];
const A5: [number, number] = [148 * PT_PER_MM, 210 * PT_PER_MM];

interface PageOptions {
  /** `lang` of the <html> element. */
  lang?: string;
  /** A stylesheet the project would add after the framework's. */
  css?: string;
}

/** The bundle around `fragment`, as a project would print it. */
function bundlePage(fragment: string, title: string, options: PageOptions = {}): string {
  let html = buildPrintReferencePageHtml(fragment, title);
  if (options.lang) html = html.replace('<html lang="en"', `<html lang="${options.lang}"`);
  if (options.css) html = html.replace("</head>", `<style>${options.css}</style>\n</head>`);
  return html;
}

/** The three-page print reference with its root <article> attributes edited. */
function reference(attrs: string): string {
  return PRINT_REFERENCE.replace(
    '<article data-ui="document" data-variant="report" data-format="a4"',
    `<article data-ui="document" data-variant="report" data-format="a4" ${attrs}`,
  );
}

async function printPdf(page: Page, html: string, ready?: () => Promise<void>): Promise<PdfPage[]> {
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.emulateMedia({ media: "print" });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await ready?.();
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
    tagged: false,
    outline: false,
  });
  return readPdf(pdf);
}

function expectSize(actual: [number, number], expected: [number, number], label: string) {
  // Skia rounds the media box to the device grid: within a point either way.
  expect(Math.abs(actual[0] - expected[0]), `${label} width ${actual[0]}`).toBeLessThan(1);
  expect(Math.abs(actual[1] - expected[1]), `${label} height ${actual[1]}`).toBeLessThan(1);
}

function lineWith(page: PdfPage, needle: string) {
  return page.lines.find((line) => line.text.includes(needle));
}

// ── #43 — the bundle's page rules no longer leak onto other pages ────────────

test("#43 a page with no document, printed with the bundle, has no page counter", async ({ page }) => {
  const pages = await printPdf(
    page,
    bundlePage(
      `<h1>Account settings</h1><p>An ordinary app page printed from the browser.</p>`,
      "app page",
    ),
  );
  expect(pages).toHaveLength(1);
  expect(pages[0].text).toContain("Account settings");
  expect(pages[0].text).not.toMatch(/Page\s*1/);
  // And it is not on the document's paper either: no size rule reached it,
  // so Chromium printed it on its own default (Letter).
  expectSize(pages[0].size, LETTER, "app page");
});

// ── #32 — paper per document, by named page ─────────────────────────────────

test("#32 one file with an A4 and a Letter document prints 595 × 842 then 612 × 792", async ({ page }) => {
  const pages = await printPdf(
    page,
    bundlePage(
      `<article data-ui="document" data-format="a4" data-orientation="portrait" aria-label="A4 document">
  <div data-part="body"><p>The A4 document.</p></div>
</article>
<article data-ui="document" data-format="letter" data-orientation="portrait" aria-label="Letter document">
  <div data-part="body"><p>The Letter document.</p></div>
</article>`,
      "a4 and letter",
    ),
  );
  expect(pages).toHaveLength(2);
  expectSize(pages[0].size, A4, "page 1");
  expect(pages[0].text).toContain("The A4 document.");
  expectSize(pages[1].size, LETTER, "page 2");
  expect(pages[1].text).toContain("The Letter document.");
  // Each is page N / 2 of the file: the counter is document-wide.
  expect(pages[1].text).toContain("Page 2 / 2");
});

for (const attrs of ['data-format="a4"', 'data-format="letter" data-orientation="portrait"', 'data-variant="letter"']) {
  test(`#32 an empty element before a document (${attrs}) prints no blank first page`, async ({ page }) => {
    // A change of page name is a forced break, which Chromium honours even at
    // the top of the flow; the body takes the document's page so there is none.
    const pages = await printPdf(
      page,
      bundlePage(
        `<div data-region="toasts"></div>
<article data-ui="document" ${attrs} aria-label="After an empty element">
  <div data-part="body"><p>The only page.</p></div>
</article>`,
        "empty element first",
      ),
    );
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain("The only page.");
  });
}

test("#32 landscape is its own named page", async ({ page }) => {
  const pages = await printPdf(
    page,
    bundlePage(
      `<article data-ui="document" data-format="a4" data-orientation="landscape" aria-label="Landscape">
  <div data-part="body"><p>Wide.</p></div>
</article>`,
      "a4 landscape",
    ),
  );
  expectSize(pages[0].size, [A4[1], A4[0]], "landscape");
});

test("#32 an unpinned document still takes its paper from the tokens", async ({ page }) => {
  // data-format alone does not pin the paper (the scaffolds all carry
  // data-format="a4"), so --page-format keeps working as it always has.
  const pages = await printPdf(
    page,
    bundlePage(
      `<article data-ui="document" data-format="a4" aria-label="Token paper">
  <div data-part="body"><p>Paper from the tokens.</p></div>
</article>`,
      "token paper",
      { css: ":root { --page-format: A5; }" },
    ),
  );
  expectSize(pages[0].size, A5, "token-driven page");
});

test("#32 --doc-accent re-inks a print theme's primary, and defaults to it", async ({ page }) => {
  await page.setContent(bundlePage(`<p id="probe">accent</p><p id="was">was</p>`, "accent"));
  const colour = (css: string) =>
    page.evaluate((style) => {
      const probe = document.createElement("span");
      probe.setAttribute("style", style);
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }, css);
  // The document theme's accent, unchanged by default…
  expect(await colour("color: var(--color-primary)")).toBe(await colour("color: oklch(0.35 0.10 250)"));
  // …and one root declaration away from a brand colour.
  await page.addStyleTag({ content: ":root { --doc-accent: rgb(0, 102, 51); }" });
  expect(await colour("color: var(--color-primary)")).toBe("rgb(0, 102, 51)");
});

// ── #33 — the counter speaks the document's language ────────────────────────

test("#33 a lang=ro document prints Pagina 1 din 3", async ({ page }) => {
  const pages = await printPdf(page, bundlePage(PRINT_REFERENCE, "ro", { lang: "ro" }));
  expect(pages).toHaveLength(3);
  expect(pages[0].text).toContain("Pagina 1 din 3");
  expect(pages[2].text).toContain("Pagina 3 din 3");
  expect(pages[0].text).not.toContain("Page 1");
});

test("#33 the document's own lang counts, not only the page's", async ({ page }) => {
  const pages = await printPdf(page, bundlePage(reference('lang="de"'), "de"));
  expect(pages[1].text).toContain("Seite 2 von 3");
});

test("#33 any other language restates the labels on :root", async ({ page }) => {
  const pages = await printPdf(
    page,
    bundlePage(PRINT_REFERENCE, "pl", {
      lang: "pl",
      css: ':root { --doc-page-label: "Strona "; --doc-page-separator: " z "; }',
    }),
  );
  expect(pages[0].text).toContain("Strona 1 z 3");
});

// ── #39 — the running header can stay off page 1 ────────────────────────────

const HEADER = "Faqir UI - Quarterly Operations Report - Reference DOC-2026-Q2";

test("#39 data-header=from-page-2: no header text on page 1, the header on page 2", async ({ page }) => {
  const pages = await printPdf(
    page,
    bundlePage(reference('data-header="from-page-2"'), "from page 2", {
      css: `:root { --doc-running-header: "${HEADER}"; }`,
    }),
  );
  expect(pages).toHaveLength(3);
  expect(pages[0].text).not.toContain("Quarterly Operations Report - Reference");
  expect(pages[1].text).toContain(HEADER);
  expect(pages[2].text).toContain(HEADER);
  // The DOM header is the screen's: in print it is not ALSO repeated.
  expect(pages[1].text.split(HEADER)).toHaveLength(2);
});

test("#39 by default the fixed DOM header still repeats on every page", async ({ page }) => {
  const pages = await printPdf(page, bundlePage(PRINT_REFERENCE, "default header"));
  for (const printed of pages) expect(printed.text).toContain(HEADER);
});

// ── #47 — footer text and counter on one line ───────────────────────────────

test("#47 data-running=margin: the footer and the counter share a baseline", async ({ page }) => {
  const FOOTER = "Confidential - generated with Faqir UI";
  const pages = await printPdf(
    page,
    bundlePage(reference('data-running="margin"'), "margin running", {
      css: `:root { --doc-running-header: "${HEADER}"; --doc-running-footer: "${FOOTER}"; }`,
    }),
  );
  expect(pages).toHaveLength(3);
  for (const [index, printed] of pages.entries()) {
    const footer = lineWith(printed, FOOTER);
    const counter = lineWith(printed, `Page ${index + 1} / 3`);
    expect(footer, `page ${index + 1} footer`).toBeDefined();
    expect(counter, `page ${index + 1} counter`).toBeDefined();
    expect(Math.abs(footer!.y - counter!.y), `page ${index + 1} baselines`).toBeLessThan(0.5);
    // Printed once: the DOM footer is screen-only in this mode.
    expect(printed.text.split(FOOTER)).toHaveLength(2);
    expect(printed.text).toContain(HEADER);
  }
});

// ── #40 — a DIN 5008 letter ─────────────────────────────────────────────────

test("#40 the letter variant prints on A4 with fold marks at 105 / 210mm and the punch mark at 148.5mm", async ({ page }) => {
  const pages = await printPdf(
    page,
    bundlePage(
      `<article data-ui="document" data-variant="letter" aria-label="Letter to Example GmbH">
  <header data-part="doc-header"><p>ACME SRL - Letterhead</p></header>
  <address data-part="address"><p>Example GmbH</p><p>Musterstrasse 1</p><p>10115 Berlin</p></address>
  <div data-part="body"><p>Dear Sir or Madam,</p></div>
</article>`,
      "din letter",
    ),
  );
  expect(pages).toHaveLength(1);
  expectSize(pages[0].size, A4, "letter");
  // The marks are page-margin rules near the sheet's left edge; their y is
  // where a mark sits, measured from the top of the sheet.
  const marks = pages[0].rects.filter((r) => r.x / PX_PER_MM < 15 && r.h <= 2);
  const at = marks.map((r) => (r.y + r.h / 2) / PX_PER_MM).sort((a, b) => a - b);
  expect(at).toHaveLength(3);
  for (const [found, expected] of at.map((mm, i) => [mm, [105, 148.5, 210][i]])) {
    expect(Math.abs(found - expected), `mark at ${found.toFixed(2)}mm`).toBeLessThan(0.75);
  }
  // The punch mark is the long one.
  expect(marks.find((r) => Math.abs(r.y / PX_PER_MM - 148.5) < 1)!.w).toBeGreaterThan(marks[0].w);
  // The address sits in the Form B window: its first line just under 45mm
  // from the top of the sheet (page-area y + the 15mm top margin), and the
  // body starts below the window's foot at 90mm.
  const address = lineWith(pages[0], "Example GmbH")!;
  const body = lineWith(pages[0], "Dear Sir or Madam")!;
  const sheetMm = (y: number) => y / PX_PER_MM + 15;
  expect(sheetMm(address.y)).toBeGreaterThan(45);
  expect(sheetMm(address.y)).toBeLessThan(52);
  expect(sheetMm(body.y)).toBeGreaterThan(90);
  // The address text starts at the text margin (25mm), not in the window's
  // 20mm edge.
  expect(Math.abs(address.x / PX_PER_MM)).toBeLessThan(1);
});

test("#40 data-form=a moves the folds to 87 / 192mm and the window to 27mm", async ({ page }) => {
  const pages = await printPdf(
    page,
    bundlePage(
      `<article data-ui="document" data-variant="letter" data-form="a" aria-label="Form A letter">
  <header data-part="doc-header"><p>Letterhead</p></header>
  <address data-part="address"><p>Example GmbH</p></address>
  <div data-part="body"><p>Body.</p></div>
</article>`,
      "din letter form a",
    ),
  );
  const at = pages[0].rects
    .filter((r) => r.x / PX_PER_MM < 15 && r.h <= 2)
    .map((r) => (r.y + r.h / 2) / PX_PER_MM)
    .sort((a, b) => a - b);
  expect(at.map((mm) => Math.round(mm))).toEqual([87, 149, 192]);
  const address = lineWith(pages[0], "Example GmbH")!;
  expect(address.y / PX_PER_MM + 15).toBeGreaterThan(27);
  expect(address.y / PX_PER_MM + 15).toBeLessThan(34);
});

// ── #38 — print themes use the project's faces ──────────────────────────────

test("#38 a document and a report set in the project's role families", async ({ page }) => {
  await page.setContent(
    bundlePage(
      `<article data-ui="document" aria-label="Plain"><div data-part="body"><p id="plain">Plain</p></div></article>
<article data-ui="document" data-variant="report" aria-label="Report"><div data-part="body"><p id="report">Report</p></div></article>`,
      "fonts",
      { css: ":root { --font-body: 'Installed Sans', sans-serif; --font-serif: 'Installed Serif', serif; }" },
    ),
  );
  const family = (id: string) =>
    page.evaluate((target) => getComputedStyle(document.getElementById(target)!).fontFamily, id);
  expect(await family("plain")).toMatch(/^"?Installed Sans"?/);
  expect(await family("report")).toMatch(/^"?Installed Serif"?/);
});

// ── #49 — a quote inside a document ─────────────────────────────────────────

test("#49 a quote inside a document: attribution smaller than its text, both on the document's scale", async ({ page }) => {
  await page.setContent(
    bundlePage(
      `<article data-ui="document" aria-label="Quoted">
  <div data-part="body">
    <p id="body-text">Body text.</p>
    <figure data-ui="quote" data-mark="hang">
      <blockquote data-part="text"><p id="q-text">The verbatim.</p></blockquote>
      <figcaption data-part="author"><span data-part="name" id="q-name">A. Person</span><span data-part="role">12 March 2026</span></figcaption>
    </figure>
    <figure data-ui="quote" data-mark="none" id="no-mark">
      <blockquote data-part="text"><p>No mark.</p></blockquote>
    </figure>
  </div>
</article>`,
      "quote",
    ),
  );
  const size = (id: string) =>
    page.evaluate((target) => parseFloat(getComputedStyle(document.getElementById(target)!).fontSize), id);
  const body = await size("body-text");
  const text = await size("q-text");
  const name = await size("q-name");
  expect(text).toBeCloseTo(body, 1);
  expect(name).toBeLessThan(text);

  const marks = await page.evaluate(() => {
    const quote = document.querySelector('[data-mark="hang"]')!;
    const text = quote.querySelector('[data-part="text"]')!;
    const none = document.getElementById("no-mark")!;
    return {
      rootMark: getComputedStyle(quote, "::before").content,
      hung: getComputedStyle(text, "::before").position,
      hungContent: getComputedStyle(text, "::before").content,
      noneMark: getComputedStyle(none, "::before").content,
    };
  });
  expect(marks.rootMark).toBe("none");
  expect(marks.hung).toBe("absolute");
  expect(marks.hungContent).toContain("open-quote");
  expect(marks.noneMark).toBe("none");
});

test("#49 data-mark=hang prints the mark on the text's first baseline, not on a line above it", async ({ page }) => {
  const pages = await printPdf(
    page,
    bundlePage(
      `<article data-ui="document" aria-label="Quoted">
  <div data-part="body">
    <figure data-ui="quote" data-mark="hang"><blockquote data-part="text"><p>Hung verbatim.</p></blockquote></figure>
    <figure data-ui="quote"><blockquote data-part="text"><p>Default verbatim.</p></blockquote></figure>
  </div>
</article>`,
      "quote marks",
    ),
  );
  const hung = lineWith(pages[0], "Hung verbatim.")!;
  const above = lineWith(pages[0], "Default verbatim.")!;
  const marks = pages[0].lines.filter((line) => line.text === "“");
  expect(marks).toHaveLength(2);
  // Hung: the mark shares the first line's baseline, just before the text,
  // and inside the figure (x ≥ 0) where the page cannot clip it.
  const hungMark = marks.find((mark) => Math.abs(mark.y - hung.y) < 0.5);
  expect(hungMark, "a mark on the hung text's baseline").toBeDefined();
  expect(hungMark!.x).toBeLessThan(hung.x);
  expect(hungMark!.x).toBeGreaterThanOrEqual(0);
  // The default draws it on a line of its own, above the text.
  const aboveMark = marks.find((mark) => mark !== hungMark)!;
  expect(aboveMark.y).toBeLessThan(above.y);
});

// ── Pagination, without Poppler ─────────────────────────────────────────────
// `print.pw.ts` checks these counts through pdftoppm. A named page forces a
// break wherever the page name changes, so the counts are re-proved here on a
// machine without Poppler: a blank first page would be the regression.

for (const printCase of buildPrintMatrix()) {
  test(`${printCase.id} still prints ${printCase.expectedPages} pages on its named page`, async ({ page }) => {
    // As in print.pw.ts: the invoice's QR is controller-drawn, so wait for it.
    const pages = await printPdf(page, buildPrintCaseHtml(printCase), async () => {
      if (printCase.id === "scaffold-invoice") {
        await expect(page.locator('[data-ui="qr-code"] [data-part="svg"]')).toHaveCount(1);
      }
    });
    expect(pages).toHaveLength(printCase.expectedPages);
    for (const printed of pages) expect(printed.text.trim().length).toBeGreaterThan(0);
    expect(pages[0].text).toContain(`Page 1 / ${printCase.expectedPages}`);
  });
}
