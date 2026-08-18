/**
 * Layout-lint gate — the phase's measurement (task 0.9-01, FAQIR-PLAN §15/§19).
 *
 * Loads every generated page of the docs site in a real browser, **at every
 * viewport in `VIEWPORTS`**, and reports the four conditions of
 * `src/utils/layout-lint.ts`: page gutter, zero-gap seams between stacked
 * top-level demos, boxes bleeding past the viewport, and overlapping
 * fixed-position boxes. The judgement lives in that pure module; this spec only
 * supplies rectangles and compares the result against a committed budget.
 *
 * **Two viewports** (task 1.0R-06). Bleed is the condition that depends on the
 * ruler: until the phone width was added, nothing in the repo measured horizontal
 * bleed at 375px — `tests/a11y/mobile.pw.ts` re-scans narrow but only the
 * layout-bearing set, and axe has no reflow rule — so six pages pushing up to
 * 198px past the edge had been green all along. Each viewport ratchets
 * independently: a rise at 375 fails while 1280 stays green, and vice versa.
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
  collectBudget,
  compareBudgets,
  formatComparisons,
  lintPage,
  summarize,
  viewportKey,
  type LayoutBudget,
  type PageFindings,
  type PageObservation,
  type Viewport,
} from "../../src/utils/layout-lint";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BUDGET_PATH = join(HERE, "layout-budget.json");

/**
 * 1280×900. The width is the docs site's desktop case (and the visual matrix's
 * width, so a seam seen here is a seam in a baseline); the height is taller than
 * the matrix's 720 so more of a long page is laid out before the fold — the
 * measurement reads geometry, not what happens to be scrolled into view.
 */
const DESKTOP: Viewport = { width: 1280, height: 900 };

/**
 * 375×812. A hair narrower than the 390 the a11y and responsive matrices use, on
 * purpose: bleed is the one condition that gets *worse* as the window narrows, so
 * the gate should sit at the narrowest mainstream phone rather than the most
 * common one — anything that clears 375 clears 390. The height is that device's,
 * and the same reasoning as 1280×900 applies: it only decides how much of a long
 * page is laid out, not what the measurement means.
 */
const PHONE: Viewport = { width: 375, height: 812 };

/** Every viewport the sweep measures, widest first. */
const VIEWPORTS: readonly Viewport[] = [DESKTOP, PHONE];

const UPDATING = process.env.UPDATE_LAYOUT_BUDGET === "1";

test.use({ viewport: DESKTOP });

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
/** Per-viewport results, keyed by `viewportKey()`. */
const observations = new Map<string, PageObservation[]>();
const findings = new Map<string, PageFindings[]>();

/** One viewport's findings — the sweep ran in `beforeAll`, so this cannot miss. */
function findingsAt(viewport: Viewport): PageFindings[] {
  return findings.get(viewportKey(viewport)) ?? [];
}

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

  for (const viewport of VIEWPORTS) {
    const key = viewportKey(viewport);
    const observed = await sweep(browser, viewport);
    observations.set(key, observed);
    findings.set(key, observed.map(lintPage));
  }
  measured = collectBudget(
    VIEWPORTS.map((viewport) => summarize(findingsAt(viewport), viewport)),
  );
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

/** Measure every page at one viewport, one browser context, in path order. */
async function sweep(browser: Browser, viewport: Viewport): Promise<PageObservation[]> {
  // `reducedMotion` matters as much as the viewport here. A controller that
  // reconciles its state on init — the sidebar settling into its closed mobile
  // drawer is the case that caught this — starts a `transform` transition during
  // load, and a sweep that reads geometry mid-slide measures a panel halfway
  // across the window. The site honours `prefers-reduced-motion` (every recipe
  // with motion carries a `transition: none` block for it), which is the same
  // switch `playwright.config.ts` throws for the screenshot matrix.
  const context = await browser.newContext({
    viewport,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
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
  await page.evaluate(settleMotion);
  const observed = await page.evaluate(collectBoxes);
  return { page: path, ...observed };
}

// ── the collector (runs in the page) ─────────────────────────────────────────

/**
 * Jump every finite animation and transition to its end state, so the geometry
 * read next is the layout the page settles at rather than a frame of the way
 * there. `reducedMotion` already removes the ones the site declares a reduce
 * block for; this covers the rest without a sleep, and without the sweep's 372
 * page loads paying a settle timeout each. Infinite animations (the spinner, the
 * skeleton shimmer) cannot be finished and are left running — they animate paint,
 * not box geometry.
 */
function settleMotion(): void {
  for (const animation of document.getAnimations()) {
    try {
      animation.finish();
    } catch {
      // An infinite animation: nothing to settle to.
    }
  }
}

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
    // `inert` is the mirror image: a subtree the reader cannot reach by any
    // route — not focusable, not announced, not clickable. The sidebar recipe
    // marks its *closed* mobile drawer inert and parks it at
    // `translateX(-100%)`; measured as content, that one closed panel is 58
    // boxes past the inline start on a phone, which is a defect only if a
    // deliberately dismissed panel counts as content. It does not. Narrow on
    // purpose: `aria-hidden` alone would also swallow every decorative icon,
    // which *is* content the reader sees.
    if (el.closest("[inert]")) return false;
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

  /**
   * The horizontal slice of a box that is actually *painted*: its own rectangle
   * intersected with the padding box of every ancestor that hides its overflow.
   *
   * Bleed asks what a reader can and cannot reach, so the subject has to be the
   * pixels a browser paints, not the pixels layout assigned. Without this the
   * phone width reports the docs shell's **closed off-canvas sidebar** — parked
   * at `x: -288` behind an `overflow-x: hidden` shell, painting nothing, on all
   * 110 shell pages — as 124 bleeding boxes each, burying the handful of real
   * findings under a five-digit number. A box whose visible slice is empty is
   * clipped away entirely and is dropped; one whose slice still crosses the
   * window edge is counted at the width it actually paints.
   *
   * Only ancestors that *clip* participate. A scroll container also clips, but
   * what is off-screen there is one gesture from view, which is the separate
   * (and older) excuse above.
   */
  const paintedRect = (el: Element) => {
    const r = el.getBoundingClientRect();
    let start = r.x;
    let end = r.x + r.width;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue;
      // `overflow` clips to the padding box; `getBoundingClientRect` is the
      // border box, and a 2px border is twice the 1px bleed threshold.
      const pr = p.getBoundingClientRect();
      start = Math.max(start, pr.x + Number.parseFloat(cs.borderLeftWidth));
      end = Math.min(end, pr.x + pr.width - Number.parseFloat(cs.borderRightWidth));
    }
    return { x: start, y: r.y, width: end - start, height: r.height };
  };

  const boxes = all
    .filter((el) => {
      if (!shown(el)) return false;
      const r = el.getBoundingClientRect();
      const pastEnd = r.x + r.width > window.innerWidth;
      return !(pastEnd && r.x >= 0 && scrollableAncestor(el));
    })
    .map((el) => ({ label: label(el), ...paintedRect(el) }))
    // A box clipped to nothing paints nothing, and paints it nowhere in
    // particular — it is evidence of no condition, including this one.
    .filter((b) => b.width >= 1);

  // Overlap subjects: fixed boxes, which share the viewport with everything.
  const fixed = all.filter((el) => getComputedStyle(el).position === "fixed" && shown(el)).map(box);

  return { viewportWidth: window.innerWidth, topLevel, demos, boxes, fixed };
}

// ── the gate ─────────────────────────────────────────────────────────────────

function readBudget(): LayoutBudget {
  return JSON.parse(readFileSync(BUDGET_PATH, "utf8")) as LayoutBudget;
}

test("the sweep covers every example page and every shell page, at every viewport", () => {
  // A collector that silently stopped finding pages would report a perfect site.
  const examples = PAGES.filter(isExamplePage);
  expect(examples.length).toBeGreaterThanOrEqual(86);
  expect(PAGES.filter(isShellPage).length).toBeGreaterThan(5);
  // Both viewports measured, and neither is a subset of the other: phone-width
  // bleed is measured on every generated page, every run, or this fails.
  expect([...findings.keys()]).toEqual(VIEWPORTS.map(viewportKey));
  for (const viewport of VIEWPORTS) {
    const key = viewportKey(viewport);
    expect(findingsAt(viewport), key).toHaveLength(PAGES.length);
    expect(findingsAt(viewport).map((f) => f.page), key).toEqual(PAGES);
    // …and one that found pages but no boxes would report the same. Every page
    // must have yielded evidence of *some* kind.
    const empty = (observations.get(key) ?? []).filter(
      (o) => o.topLevel.length + o.demos.length + o.boxes.length + o.fixed.length === 0,
    );
    expect(empty.map((o) => o.page), key).toEqual([]);
    // The collector must have used the viewport it was handed — a context whose
    // size silently reverted would measure 1280 twice and call it coverage.
    const widths = new Set((observations.get(key) ?? []).map((o) => o.viewportWidth));
    expect([...widths], key).toEqual([viewport.width]);
  }
  // Every page also yields a *gutter* now. Two used not to: `watermark` and
  // `toast` paint nothing but fixed boxes, so there was no in-flow content whose
  // inset could be measured. Task 0.9-03's example shell lifts each fragment's
  // own comment labels into visible captions, and a caption is in-flow content —
  // so those two pages became measurable like every other, without either
  // fragment being edited. The list stays (rather than being deleted) as the
  // tripwire it always was: a page dropping out of the measurement is a decision.
  for (const viewport of VIEWPORTS) {
    expect(
      findingsAt(viewport).filter((f) => f.gutter === null).map((f) => f.page),
      viewportKey(viewport),
    ).toEqual([]);
  }
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

test("an off-canvas panel is not a bleed; the same panel left reachable is", async ({ page }) => {
  // The two exemptions the phone width forced (task 1.0R-06), pinned so they
  // cannot quietly widen into "nothing off-screen counts". Both subjects sit at
  // exactly the same coordinates; only the reason they are unreachable differs.
  await page.setViewportSize(PHONE);
  await page.setContent(OFF_CANVAS_PAGE, { waitUntil: "load" });
  const found = lintPage({ page: "synthetic/off-canvas", ...(await page.evaluate(collectBoxes)) });

  // The drawer clipped away by its shell, and the dismissed `inert` one, are
  // both absent. The third — off-canvas and reachable by neither clip nor
  // inertness, i.e. content in the tab order the reader can never see — is the
  // one finding, and it is named.
  expect(found.bleeds.every((b) => b.edge === "left")).toBe(true);
  expect(found.bleeds.map((b) => b.label)).toEqual(['aside[data-part="stranded"]', "span"]);

  // …and a box whose *visible slice* still crosses the window edge is counted at
  // the width it paints, not excused by having a clipping ancestor at all.
  const partly = found.bleeds.length;
  await page.setContent(CLIPPED_BLEED_PAGE, { waitUntil: "load" });
  const clipped = lintPage({ page: "synthetic/clipped", ...(await page.evaluate(collectBoxes)) });
  expect(partly).toBe(2);
  // The card itself is 45px past the window end and says so. Its 400px child is
  // reported at the same 45 — the width it *paints* after the card clips it —
  // rather than the 325 its layout box claims, which is the whole point of
  // measuring the painted slice.
  const byLabel = new Map(clipped.bleeds.map((b) => [b.label, b.overflow]));
  expect(byLabel.get('div[data-part="card"]')).toBeCloseTo(45, 0);
  expect(byLabel.get("div")).toBeCloseTo(45, 0);
});

test("the four inline-control references have zero layout seams", () => {
  // Both navigable renderings are pinned: the contract page and the canonical
  // reference page. A future generator change must not hide a seam in one while
  // the other stays green.
  for (const viewport of VIEWPORTS) {
    for (const name of ["checkbox", "radio", "switch", "toggle"]) {
      for (const path of [
        `components/primitives/${name}.html`,
        `examples/primitives/${name}.html`,
      ]) {
        const key = viewportKey(viewport);
        const page = findingsAt(viewport).find((finding) => finding.page === path);
        expect(page, `${path} was not measured at ${key}`).toBeDefined();
        expect(page!.seams, `${path} contains a zero-gap seam at ${key}`).toEqual([]);
      }
    }
  }
});

test("no reference page has unreachable viewport bleed at desktop width", () => {
  // A wall, not a ratchet, and it can be: 0.9-11 drove this count to zero at
  // 1280 and nothing may put it back. The phone width has no wall yet — 1.0R-06
  // records its six bleeds in the budget and 1.0R-07 spends them; until then the
  // ratchet below is what keeps a *new* narrow bleed from landing.
  const bled = findingsAt(DESKTOP)
    .filter((finding) => finding.bleeds.length > 0)
    .map((finding) => ({ page: finding.page, bleeds: finding.bleeds }));
  expect(bled).toEqual([]);
});

test("two toasts in one fixed container stack with the container's real gap", async ({ page }) => {
  await page.goto(`${origin}/examples/recipes/toast.html`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const measuredStack = await page.evaluate(() => {
    const containers = Array.from(
      document.querySelectorAll<HTMLElement>('[data-ui="toast"][data-part="container"]'),
    );
    const topRight = containers.find((element) => element.dataset.variant === "top-right");
    if (!topRight) return null;
    const toasts = Array.from(topRight.querySelectorAll<HTMLElement>(':scope > [data-part="toast"]'));
    if (toasts.length !== 2) {
      return { containers: containers.length, toasts: toasts.length, cssGap: null, measuredGap: null };
    }
    const first = toasts[0].getBoundingClientRect();
    const second = toasts[1].getBoundingClientRect();
    return {
      containers: containers.length,
      toasts: toasts.length,
      cssGap: Number.parseFloat(getComputedStyle(topRight).rowGap),
      measuredGap: second.top - first.bottom,
    };
  });

  expect(measuredStack).not.toBeNull();
  expect(measuredStack!.containers).toBe(4);
  expect(measuredStack!.toasts).toBe(2);
  expect(measuredStack!.cssGap!).toBeGreaterThan(0);
  expect(measuredStack!.measuredGap!).toBeCloseTo(measuredStack!.cssGap!, 5);
});

test("no ratcheted count rose against the committed budget", () => {
  // Update mode runs the identical comparison before it writes (below), so the
  // gate is never bypassed — it just cannot also assert here, or recording an
  // improvement would report one failure and one success for the same run.
  test.skip(UPDATING, "update mode enforces the same rule before writing");
  const cmp = compareBudgets(measured!, readBudget());
  expect(
    cmp.ok,
    `Layout regressed — the budget in tests/visual/layout-budget.json may only fall:\n${formatComparisons(cmp)}`,
  ).toBe(true);
  const moved = cmp.viewports.some((v) => v.slack.length > 0) || cmp.unbudgeted.length > 0;
  if (moved) console.log(`layout-lint slack:\n${formatComparisons(cmp)}`);
});

test("the committed budget is the current measurement", () => {
  const exists = existsSync(BUDGET_PATH);
  if (UPDATING) {
    if (exists) {
      // Update mode is not a reset button: recording a rise would turn the
      // ratchet into a rubber stamp, so it refuses and points at the regression.
      const cmp = compareBudgets(measured!, readBudget());
      expect(cmp.ok, `Refusing to record a regression:\n${formatComparisons(cmp)}`).toBe(true);
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

/**
 * Three panels parked off the inline start at the same place, for three
 * different reasons: clipped by the shell, dismissed with `inert`, and neither.
 * Only the last is content a reader is offered and cannot reach.
 */
const OFF_CANVAS_PAGE = `
<style>
  html, body { margin: 0; }
  main { padding: 16px; }
  .shell { overflow-x: hidden; }
  aside { position: fixed; inset-block: 0; inset-inline-start: 0; width: 256px; transform: translateX(-100%); }
</style>
<main>
  <div class="shell"><aside data-part="clipped"><span>behind the shell</span></aside></div>
  <aside data-part="dismissed" inert><span>closed drawer</span></aside>
  <aside data-part="stranded"><span>nothing to bring me back</span></aside>
  <p>page content</p>
</main>`;

/** A card past the window end whose own children are clipped to it: one finding,
 *  the card, at the width it actually paints — not one per clipped descendant. */
const CLIPPED_BLEED_PAGE = `
<style>
  html, body { margin: 0; }
  main { padding: 0; }
  [data-part="card"] { overflow: hidden; margin-inline-start: 300px; width: 120px; height: 60px; }
  [data-part="card"] > div { width: 400px; height: 40px; }
</style>
<main>
  <div data-part="card"><div><span>clipped to the card</span></div></div>
</main>`;
