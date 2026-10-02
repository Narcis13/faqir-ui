/**
 * Wide content in a narrow window — task 1.1F-16 (FAQIR-PLAN-1.1-FIXES).
 *
 * `narrow-fit.pw.ts` asks whether a component's own reference page fits a
 * phone. Every reference page already did when a downstream dashboard still
 * scrolled sideways, because the defect was never in a component's own demo: it
 * was in what a *layout* does when one of its children is wider than the window
 * — a 1400px table inside a stack column, a run id with no break opportunity in
 * a heading. So the fixtures here are synthetic: the smallest layout that
 * reproduces each downstream case, at the 390px window it was reported at.
 *
 * Three mechanisms are under test, and each fixture isolates one:
 *
 *   - **A flex child that may shrink.** `stack > [data-flex]` carried the flex
 *     default `min-inline-size: auto`, so a growing child could never be
 *     narrower than its content.
 *   - **A grid track that may shrink.** `1fr` is `minmax(auto, 1fr)`; the track
 *     floor has to be `0` for a wide item to scroll in its own box.
 *   - **A token that may break.** An id has no soft-wrap opportunity, and only
 *     `overflow-wrap: anywhere` lowers the min-content width a flex or grid
 *     parent sizes by — `break-word` breaks the painted line and leaves the
 *     intrinsic width alone.
 *
 * The last test is the exception that keeps the third mechanism honest: inside
 * a table cell an id must NOT break, or auto table layout squeezes every column
 * to one character per line instead of letting the table scroll.
 */

import { test, expect, type Page } from "@playwright/test";
import { frameworkCss } from "./matrix";

/** The window every downstream case was reported at. */
const WIDTH = 390;
const HEIGHT = 900;

/** Sub-pixel tolerance, the same 1px `narrow-fit.pw.ts` and `layout-lint.ts` use. */
const TOLERANCE = 1;

/** An id with no soft-wrap opportunity, wider than the window in any font. */
const LONG_ID = "run_01HZX4T9QK7M2N8P5R3V6W0Y1BCDEFGHJKMNPQRSTVWXYZ0123456789";

/** A table of `width` px inside the recipe's own scrolling root. */
function wideTable(width: number): string {
  return `<div data-ui="table">
  <table data-part="table" style="inline-size: ${width}px">
    <thead data-part="thead"><tr data-part="tr"><th data-part="th" scope="col">Run</th><th data-part="th" scope="col">Status</th></tr></thead>
    <tbody data-part="tbody"><tr data-part="tr"><td data-part="td">Nightly import</td><td data-part="td">Done</td></tr></tbody>
  </table>
</div>`;
}

/**
 * One downstream layout: the markup, and the single declaration whose removal
 * brings the overflow back. `revert` is injected after the framework CSS, so
 * the regression is exercised without touching the registry.
 */
const FIXTURES = [
  {
    name: "a stack shell: sidebar beside a growing column that holds a 1400px table",
    html: `<div data-ui="stack" data-direction="horizontal" data-gap="0">
  <aside style="flex: none; inline-size: 200px">Navigation</aside>
  <div data-ui="stack" data-flex="1" data-gap="4">
    ${wideTable(1400)}
  </div>
</div>`,
    revert: `[data-ui="stack"] > [data-flex="1"] { min-inline-size: auto !important; }`,
  },
  {
    name: "a stack row whose data-flex=\"auto\" child holds a 1400px table",
    html: `<div data-ui="stack" data-direction="horizontal" data-gap="0">
  <div data-flex="auto">
    ${wideTable(1400)}
  </div>
</div>`,
    revert: `[data-ui="stack"] > [data-flex="auto"] { min-inline-size: auto !important; }`,
  },
  {
    name: "a grid whose item holds a 900px table",
    html: `<div data-ui="grid" data-cols="1" data-gap="4">
  <section>
    ${wideTable(900)}
  </section>
</div>`,
    revert: `[data-ui="grid"][data-cols="1"] { grid-template-columns: repeat(1, 1fr) !important; }`,
  },
  {
    name: "a horizontal description-list whose details hold a scrolling payload",
    html: `<dl data-ui="description-list" data-variant="horizontal">
  <dt data-part="term">Payload</dt>
  <dd data-part="details"><pre style="overflow-x: auto">{"source":"s3://exports/2026/10/01/nightly-import-full-refresh.parquet","rows":1048576,"checksum":"sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"}</pre></dd>
</dl>`,
    revert: `[data-ui="description-list"][data-variant="horizontal"] { grid-template-columns: minmax(8rem, auto) 1fr !important; }`,
  },
  {
    name: "a heading that is one unbreakable id, in a cluster row",
    html: `<div data-ui="cluster">
  <h1 data-ui="heading" data-size="2">${LONG_ID}</h1>
  <span>active</span>
</div>`,
    // `break-word` is the tempting half-fix: it breaks the painted line but
    // leaves the min-content width the cluster sizes its item by.
    revert: `[data-ui="heading"] { overflow-wrap: break-word !important; }`,
  },
  {
    name: "a mono id in a growing stack child",
    html: `<div data-ui="stack" data-direction="horizontal" data-gap="4">
  <span>Run</span>
  <div data-flex="1"><span data-ui="text" data-variant="mono">${LONG_ID}</span></div>
</div>`,
    revert: `[data-ui="text"][data-variant="mono"] { overflow-wrap: normal !important; }`,
  },
  {
    name: "a breadcrumb whose current page is one unbreakable id",
    html: `<nav data-ui="breadcrumb" aria-label="Breadcrumb">
  <ol data-part="list">
    <li><a data-part="item" href="#">Runs</a></li>
    <li data-part="separator" aria-hidden="true"></li>
    <li><span data-part="current" aria-current="page">${LONG_ID}</span></li>
  </ol>
</nav>`,
    revert: `[data-ui="breadcrumb"] { overflow-wrap: normal !important; }`,
  },
] as const;

/**
 * A table whose cells are ids — the layout the `anywhere` exception exists for.
 * The last column's id is in the header over a short cell: header cells are
 * `white-space: nowrap`, so that one holds with or without the exception.
 */
const ID_TABLE = `<div data-ui="table">
  <table data-part="table">
    <thead data-part="thead"><tr data-part="tr">
      <th data-part="th" scope="col">Run</th><th data-part="th" scope="col">Parent</th><th data-part="th" scope="col">Title</th>
      <th data-part="th" scope="col"><span data-ui="text" data-variant="mono" data-probe>${LONG_ID}</span></th>
    </tr></thead>
    <tbody data-part="tbody"><tr data-part="tr">
      <td data-part="td"><span data-ui="text" data-variant="mono" data-probe>${LONG_ID}</span></td>
      <td data-part="td"><span data-ui="text" data-variant="mono" data-probe>${LONG_ID}</span></td>
      <td data-part="td"><h3 data-ui="heading" data-size="6"><span data-probe>${LONG_ID}</span></h3></td>
      <td data-part="td">ok</td>
    </tr></tbody>
  </table>
</div>`;

/** The shipped stylesheet around one fragment, with an optional override after it. */
function documentFor(fragment: string, css = ""): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>wide content</title>
<style>${frameworkCss()}</style>
<style>${css}</style>
</head>
<body>
<main>
${fragment}
</main>
</body>
</html>`;
}

async function mount(page: Page, html: string): Promise<void> {
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

/** How far the document scrolls sideways — the defect as a reader meets it. */
function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

// ── the wall ─────────────────────────────────────────────────────────────────

for (const fixture of FIXTURES) {
  test(`${fixture.name} stays within ${WIDTH}px`, async ({ page }) => {
    await mount(page, documentFor(fixture.html));
    expect(await sidewaysScroll(page), "the document scrolls sideways").toBeLessThanOrEqual(
      TOLERANCE,
    );
  });
}

/** What the id table looks like: does it scroll in its box, and did any id break? */
function measureIdTable(): { rootOverflow: number; brokenIds: number; ids: number } {
  const root = document.querySelector('[data-ui="table"]');
  if (!root) throw new Error("no table to measure");
  const probes = Array.from(root.querySelectorAll("[data-probe]"));
  return {
    rootOverflow: root.scrollWidth - root.clientWidth,
    // An inline box that wrapped paints one client rect per line.
    brokenIds: probes.filter((el) => el.getClientRects().length > 1).length,
    ids: probes.length,
  };
}

test("a table of ids keeps its width and scrolls inside its own box", async ({ page }) => {
  await mount(page, documentFor(ID_TABLE));

  expect(await sidewaysScroll(page), "the document scrolls sideways").toBeLessThanOrEqual(
    TOLERANCE,
  );
  const table = await page.evaluate(measureIdTable);
  expect(table.ids).toBe(4);
  expect(table.brokenIds, "an id broke across lines inside a cell").toBe(0);
  expect(table.rootOverflow, "the table was squeezed instead of scrolling").toBeGreaterThan(
    TOLERANCE,
  );
});

// ── the wall must bite ───────────────────────────────────────────────────────

test.describe("each overflow fix is caught when it is undone", () => {
  for (const fixture of FIXTURES) {
    test(fixture.name, async ({ page }) => {
      await mount(page, documentFor(fixture.html, fixture.revert));
      expect(
        await sidewaysScroll(page),
        "the reverted fix should have scrolled the document",
      ).toBeGreaterThan(TOLERANCE);
    });
  }

  test("ids in table cells break one character per line without the exception", async ({
    page,
  }) => {
    await mount(
      page,
      documentFor(
        ID_TABLE,
        `[data-ui="table"] [data-part="td"] :is([data-ui="text"], [data-ui="heading"]) { overflow-wrap: anywhere !important; }`,
      ),
    );
    const table = await page.evaluate(measureIdTable);
    // The three ids in data cells break; the one in the nowrap header cannot.
    expect(table.brokenIds, "the reverted exception should have broken the ids").toBe(3);
  });
});
