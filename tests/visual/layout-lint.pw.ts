/**
 * Layout-lint gate — the phase's measurement (task 0.9-01, FAQIR-PLAN §15/§19).
 *
 * Loads every generated page of the docs site in a real browser and reports the
 * four conditions of `src/utils/layout-lint.ts`: page gutter, zero-gap seams
 * between stacked top-level demos, boxes bleeding past the viewport, and
 * overlapping fixed-position boxes. The judgement lives in that pure module; this
 * spec only supplies rectangles and compares the result against a committed
 * budget.
 *
 * **A ratchet, not a wall.** `tests/visual/layout-budget.json` records today's
 * counts. A count that *rises* fails; a count that *falls* passes and prints its
 * slack. A wall ("no page may have a seam") would be red the day it lands and
 * stay red for the whole phase, which teaches everyone to ignore it. A budget
 * that can only fall cannot be ignored: every later 0.9 task moves a number it is
 * not allowed to move back.
 *
 * The budget is also kept *current*: an improvement that is not recorded fails
 * the "budget is the current measurement" case, the same shape `check:docs` uses
 * for the built site. Re-record it with:
 *
 *     bun run lint:layout:update        (UPDATE_LAYOUT_BUDGET=1 playwright test …)
 *
 * Update mode refuses to write a *rise*, so the committed file can only ever
 * describe a better site than the last commit did.
 *
 * The site is built in-process from the same generator `bun run build:docs`
 * writes and served from memory — no dependency on `site/dist` being fresh, and
 * no network.
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocsSite, isExamplePage, isShellPage } from "../../src/generator/docs";
import {
  compareBudget,
  formatComparison,
  lintPage,
  summarize,
  type LayoutBudget,
  type PageFindings,
  type PageObservation,
} from "../../src/utils/layout-lint";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BUDGET_PATH = join(HERE, "layout-budget.json");

/**
 * 1280×900. The width is the docs site's desktop case (and the visual matrix's
 * width, so a seam seen here is a seam in a baseline); the height is taller than
 * the matrix's 720 so more of a long page is laid out before the fold — the
 * measurement reads geometry, not what happens to be scrolled into view.
 */
const VIEWPORT = { width: 1280, height: 900 };

const UPDATING = process.env.UPDATE_LAYOUT_BUDGET === "1";

test.use({ viewport: VIEWPORT });

// One long serial measurement, not 178 parallel ones: the budget is a property of
// the whole site, so every page must be measured by the same worker before any
// assertion about the total can be made.
test.describe.configure({ mode: "serial" });

// ── the site, served from memory ─────────────────────────────────────────────

const files = buildDocsSite();

/** Every page a reader navigates to: the 86 examples plus the shell pages.
 *  Frame documents (`frames/**`) are excluded — they render inside an `<iframe>`
 *  at a size the parent chooses, so a viewport-relative gutter or bleed would be
 *  measuring the harness rather than the page. */
const PAGES = files
  .map((f) => f.path)
  .filter((p) => isExamplePage(p) || isShellPage(p))
  .sort();

let server: Server | null = null;
let origin = "";
let measured: LayoutBudget | null = null;
let observations: PageObservation[] = [];
let findings: PageFindings[] = [];

test.beforeAll(async ({ browser }) => {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  server = createServer((req, res) => {
    const path =
      decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname).replace(/^\//, "") ||
      "index.html";
    const body = byPath.get(path);
    if (body === undefined) {
      res.writeHead(404).end("not found");
      return;
    }
    const type = path.endsWith(".css")
      ? "text/css"
      : path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".txt")
          ? "text/plain; charset=utf-8"
          : "text/html; charset=utf-8";
    res.writeHead(200, { "content-type": type }).end(body);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;

  observations = await sweep(browser);
  findings = observations.map(lintPage);
  measured = summarize(findings, VIEWPORT);
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

/** Measure every page, one browser context, in path order. */
async function sweep(browser: Browser): Promise<PageObservation[]> {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light" });
  const page = await context.newPage();
  const out: PageObservation[] = [];
  try {
    for (const path of PAGES) {
      out.push(await observePage(page, `${origin}/${path}`, path));
    }
  } finally {
    await context.close();
  }
  return out;
}

/** Load one page and hand its rectangles to the pure checker. */
async function observePage(page: Page, url: string, path: string): Promise<PageObservation> {
  // Nothing on the site points off-origin, but a stray external asset must never
  // be able to hang or perturb a measurement.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const observed = await page.evaluate(collectBoxes);
  return { page: path, ...observed };
}

// ── the collector (runs in the page) ─────────────────────────────────────────

/**
 * Collect the four subjects. Deliberately self-contained — it is serialised into
 * the browser, so it may not close over anything in this module. It decides only
 * *which* boxes are evidence; what they mean is `src/utils/layout-lint.ts`.
 */
function collectBoxes(): Omit<PageObservation, "page"> {
  const OUT_OF_FLOW = new Set(["fixed", "absolute", "sticky"]);
  const INLINE = /^(inline|inline-block|inline-flex|inline-grid|contents|none)$/;

  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };

  /** A name a human can find in the page source. */
  const label = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const ui = el.getAttribute("data-ui");
    if (ui) return `${tag}[data-ui="${ui}"]`;
    const part = el.getAttribute("data-part");
    if (part) return `${tag}[data-part="${part}"]`;
    if (el.id) return `${tag}#${el.id}`;
    return tag;
  };

  const box = (el: Element) => ({ label: label(el), ...rect(el) });

  /** Painted: it has a box, it is displayed, and it is not a clipped-away label. */
  const shown = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    // `clip-path: inset(50%)` is the screen-reader-only idiom: present in the
    // tree, painted nowhere. Its 1px box must not set a page's gutter.
    if (cs.clipPath !== "none") return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };

  const root: Element = document.querySelector("main") ?? document.body;
  const all = Array.from(document.body.querySelectorAll("*"));

  // Gutter subjects: the content root's own in-flow children — the page's outer
  // content boxes, inline runs included so a page of badges still has an edge to
  // measure. Not their padded leaves: a card flush against the window has no page
  // gutter however generous its own padding.
  const inFlow = Array.from(root.children).filter((el) => {
    const cs = getComputedStyle(el);
    return !OUT_OF_FLOW.has(cs.position) && cs.float === "none" && shown(el);
  });
  const topLevel = inFlow.map(box);

  // Seam subjects: the block-level subset, in document order. A row of badges is
  // a different problem than two tables welded together.
  const demos = inFlow.filter((el) => !INLINE.test(getComputedStyle(el).display)).map(box);

  // Bleed subjects: painted boxes a scrollbar cannot rescue. A code block inside
  // `overflow-x: auto` is one gesture from view — counting it would put a
  // permanent floor under a number 0.9-11 has to drive to zero. Overflow past the
  // inline *start* is never reachable (LTR `scrollLeft` cannot go below 0), which
  // is why only end-side overflow can be excused by an ancestor scroller.
  const scrollableAncestor = (el: Element): boolean => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const boxes = all
    .filter((el) => {
      if (!shown(el)) return false;
      const r = el.getBoundingClientRect();
      const pastEnd = r.x + r.width > window.innerWidth;
      return !(pastEnd && r.x >= 0 && scrollableAncestor(el));
    })
    .map(box);

  // Overlap subjects: fixed boxes, which share the viewport with everything.
  const fixed = all.filter((el) => getComputedStyle(el).position === "fixed" && shown(el)).map(box);

  return { viewportWidth: window.innerWidth, topLevel, demos, boxes, fixed };
}

// ── the gate ─────────────────────────────────────────────────────────────────

function readBudget(): LayoutBudget {
  return JSON.parse(readFileSync(BUDGET_PATH, "utf8")) as LayoutBudget;
}

test("the sweep covers every example page and every shell page", () => {
  // A collector that silently stopped finding pages would report a perfect site.
  const examples = PAGES.filter(isExamplePage);
  expect(examples.length).toBeGreaterThanOrEqual(86);
  expect(PAGES.filter(isShellPage).length).toBeGreaterThan(5);
  expect(findings).toHaveLength(PAGES.length);
  // …and one that found pages but no boxes would report the same. Every page must
  // have yielded evidence of *some* kind.
  const empty = observations.filter(
    (o) => o.topLevel.length + o.demos.length + o.boxes.length + o.fixed.length === 0,
  );
  expect(empty.map((o) => o.page)).toEqual([]);
  // Every page also yields a *gutter* now. Two used not to: `watermark` and
  // `toast` paint nothing but fixed boxes, so there was no in-flow content whose
  // inset could be measured. Task 0.9-03's example shell lifts each fragment's
  // own comment labels into visible captions, and a caption is in-flow content —
  // so those two pages became measurable like every other, without either
  // fragment being edited. The list stays (rather than being deleted) as the
  // tripwire it always was: a page dropping out of the measurement is a decision.
  expect(findings.filter((f) => f.gutter === null).map((f) => f.page)).toEqual([]);
});

test("the collector sees a seeded defect, and nothing on a clean page", async ({ page }) => {
  // The pure module proves the *rules* from literal rectangles; this proves the
  // browser-side collector hands them the right boxes — otherwise a green gate
  // could mean "measured nothing".
  await page.setContent(CLEAN_PAGE, { waitUntil: "load" });
  const cleanFindings = lintPage({ page: "synthetic/clean", ...(await page.evaluate(collectBoxes)) });
  expect(cleanFindings.zeroGutter).toBe(false);
  expect(cleanFindings.seams).toEqual([]);
  expect(cleanFindings.bleeds).toEqual([]);
  expect(cleanFindings.overlaps).toEqual([]);

  await page.setContent(SEEDED_PAGE, { waitUntil: "load" });
  const dirtyFindings = lintPage({ page: "synthetic/seeded", ...(await page.evaluate(collectBoxes)) });
  expect(dirtyFindings.zeroGutter).toBe(true);
  expect(dirtyFindings.seams).toHaveLength(1);
  expect(dirtyFindings.bleeds).toHaveLength(1);
  expect(dirtyFindings.overlaps).toHaveLength(1);
});

test("no ratcheted count rose against the committed budget", () => {
  // Update mode runs the identical comparison before it writes (below), so the
  // gate is never bypassed — it just cannot also assert here, or recording an
  // improvement would report one failure and one success for the same run.
  test.skip(UPDATING, "update mode enforces the same rule before writing");
  const cmp = compareBudget(measured!, readBudget());
  expect(
    cmp.ok,
    `Layout regressed — the budget in tests/visual/layout-budget.json may only fall:\n${formatComparison(cmp)}`,
  ).toBe(true);
  if (cmp.slack.length > 0) console.log(`layout-lint slack:\n${formatComparison(cmp)}`);
});

test("the committed budget is the current measurement", () => {
  const exists = existsSync(BUDGET_PATH);
  if (UPDATING) {
    if (exists) {
      // Update mode is not a reset button: recording a rise would turn the
      // ratchet into a rubber stamp, so it refuses and points at the regression.
      const cmp = compareBudget(measured!, readBudget());
      expect(cmp.ok, `Refusing to record a regression:\n${formatComparison(cmp)}`).toBe(true);
    }
    writeFileSync(BUDGET_PATH, `${JSON.stringify(measured, null, 2)}\n`);
    console.log(`layout-lint budget ${exists ? "updated" : "created"}: ${BUDGET_PATH}`);
    return;
  }
  expect(exists, "No layout budget — record the first one with `bun run lint:layout:update`.").toBe(
    true,
  );
  expect(
    measured,
    "The layout budget is stale — re-record it with `bun run lint:layout:update`.",
  ).toEqual(readBudget());
});

// ── synthetic pages for the collector check ──────────────────────────────────

/** A gutter, rhythm between two stacked demos, nothing past the edge, one fixed box. */
const CLEAN_PAGE = `
<style>
  html, body { margin: 0; }
  p { margin: 0; }
  main { padding: 24px; }
  main > section { margin-block-end: 24px; }
  main > section:last-of-type { margin-block-end: 0; }
  .fixed { position: fixed; inset-block-end: 16px; inset-inline-end: 16px; width: 200px; height: 80px; }
</style>
<main>
  <section><p>first demo</p></section>
  <section><p>second demo</p></section>
  <div class="fixed"><span>one region</span></div>
</main>`;

/** One of each: flush content, a 0px seam, an unclipped bleed, two stacked fixed boxes. */
const SEEDED_PAGE = `
<style>
  html, body { margin: 0; }
  p { margin: 0; }
  main > section { margin: 0; }
  .wide { width: 2000px; height: 40px; margin-block-start: 24px; }
  .fixed { position: fixed; inset-block-end: 16px; inset-inline-end: 16px; width: 200px; height: 80px; }
</style>
<main>
  <section><p>flush, and welded to the next</p></section>
  <section><p>no gap above me</p></section>
  <div class="wide"><span>past the edge</span></div>
  <div class="fixed"><span>region one</span></div>
  <div class="fixed"><span>region two</span></div>
</main>`;
