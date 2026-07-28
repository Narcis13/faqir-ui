// Layout lint — four measurable page defects, as pure geometry (task 0.9-01).
//
// v0.9 is a phase about *rhythm*, and rhythm is the one quality nothing in the
// toolchain measured. `faqir audit` checks contract conformance, axe checks
// accessibility, and the screenshot matrix checks that pixels did not move —
// none of them can say a page is cramped. This module can, because it reduces
// "cramped" to four conditions a diff can argue with:
//
//   1. **gutter**  — how far the first painted content sits from the viewport edge.
//   2. **seam**    — two stacked top-level demos touching (<1px apart).
//   3. **bleed**   — a box extending past the viewport that nothing clips.
//   4. **overlap** — two fixed-position boxes sitting on top of each other.
//
// No aesthetic judgement is encoded. Every condition is a number, so the phase's
// progress is a countdown rather than an opinion, and a budget of today's counts
// can ratchet: a rise fails, a fall is slack (see `compareBudget`).
//
// The module takes *boxes*, never a DOM: the browser side of the gate collects
// rectangles and this decides what they mean. That keeps the whole checker
// provable from literal rectangles under `bun test` while Playwright drives the
// same code over real pages — the 0.8-01 discipline, so it is deliberately
// `node:*`-free and dependency-free.
//
// Physical, not logical, on purpose: `left`/`right` here are pixels a browser
// reported, not CSS an author wrote. The sweep runs LTR (the docs site's own
// direction), so "left" is the inline start of every page it measures.

/** A rectangle in CSS pixels, viewport-relative — the `DOMRect` subset used here. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A box with a label, so a finding can name the thing it found. */
export interface LabelledBox extends Box {
  /** A human-readable id for the element — a selector, a tag, a component name. */
  label: string;
}

// ── thresholds ───────────────────────────────────────────────────────────────
//
// One pixel, everywhere, and for the same reason: sub-pixel layout (fractional
// rems, transforms, border rounding) puts real geometry a few hundredths off the
// integer, and a gate that treats 0.02px as a gap would report success by noise.

/** A gap smaller than this between two stacked demos is a seam. */
export const SEAM_GAP_PX = 1;

/** Content closer than this to a viewport edge counts as no gutter at all. */
export const GUTTER_MIN_PX = 1;

/** A box reaching further than this past a viewport edge is bleeding. */
export const BLEED_PX = 1;

/** Two fixed boxes must intersect by more than this on both axes to overlap. */
export const OVERLAP_PX = 1;

// ── observation: what a browser saw on one page ──────────────────────────────

/**
 * One page's geometry, collected in a real browser. Each list is a different
 * *subject*, because the four conditions do not ask about the same elements:
 * the gutter is about painted leaves, the seam about top-level blocks, the bleed
 * about anything nothing clips, the overlap about fixed boxes only.
 */
export interface PageObservation {
  /** Site-relative path, e.g. `examples/primitives/badge.html`. */
  page: string;
  /** Viewport width in CSS px — the ruler both the gutter and the bleed use. */
  viewportWidth: number;
  /**
   * The page's **outer** content boxes: the in-flow children of the content root,
   * inline ones included. The gutter is a property of these and not of the text
   * inside them — a card flush against the window edge has no page gutter, however
   * generous its own padding, and measuring its padded leaves would say it does.
   */
  topLevel: LabelledBox[];
  /**
   * The block-level subset of `topLevel`, in document order — the stack. Inline
   * runs are excluded by the collector: badges sharing a line are a different
   * problem than two tables welded together.
   */
  demos: LabelledBox[];
  /**
   * The bleed subjects: every painted box *except* those a scroll container can
   * bring into view. A code block's long lines inside `overflow-x: auto` are one
   * gesture away and are not a defect; a box past the window edge that no
   * scrollbar reaches is content the reader will never see.
   */
  boxes: LabelledBox[];
  /** `position: fixed` boxes, which share the viewport with everything else. */
  fixed: LabelledBox[];
}

// ── findings ─────────────────────────────────────────────────────────────────

/** Two stacked demos with nothing between them. */
export interface Seam {
  /** Label of the upper demo. */
  before: string;
  /** Label of the lower demo. */
  after: string;
  /** Vertical distance in px; ≤0 when they overlap. */
  gap: number;
}

/** A box reaching past a viewport edge with nothing to clip it. */
export interface Bleed {
  label: string;
  /** Which viewport edge it crossed. */
  edge: "left" | "right";
  /** How far past the edge, in px. */
  overflow: number;
}

/** Two fixed boxes occupying the same region of the viewport. */
export interface Overlap {
  a: string;
  b: string;
  /** Intersection extent, px. */
  width: number;
  height: number;
}

/** Everything the four conditions found on one page. */
export interface PageFindings {
  page: string;
  /**
   * Smallest inline inset of painted content from either viewport edge, in px.
   * `null` when the page painted nothing to measure (an empty page cannot fail
   * a gutter check — it can only fail the tripwire that says it is empty).
   */
  gutter: number | null;
  /** True when content touches an edge — the condition 84 of 86 pages met. */
  zeroGutter: boolean;
  seams: Seam[];
  bleeds: Bleed[];
  overlaps: Overlap[];
}

// ── geometry helpers ─────────────────────────────────────────────────────────

const left = (b: Box): number => b.x;
const right = (b: Box): number => b.x + b.width;
const top = (b: Box): number => b.y;
const bottom = (b: Box): number => b.y + b.height;

/** A box with no area paints nothing, so it is evidence of nothing. */
function painted(b: Box): boolean {
  return b.width > 0 && b.height > 0;
}

/** Overlap extent of two 1-D spans; negative means a gap of that size. */
function span(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

// ── the four conditions ──────────────────────────────────────────────────────

/**
 * The page gutter: how far the outermost content sits from the nearer viewport
 * edge. Both edges are measured and the *smaller* inset wins, because a page
 * inset on the left and flush on the right is still flush.
 */
export function measureGutter(o: PageObservation): number | null {
  const boxes = o.topLevel.filter(painted);
  if (boxes.length === 0) return null;
  let inset = Infinity;
  for (const b of boxes) {
    inset = Math.min(inset, left(b), o.viewportWidth - right(b));
  }
  // Content that bleeds past an edge has a negative inset; a gutter is never
  // negative — it is absent. Clamp so the number reads as "no gutter", and let
  // the bleed condition own the overflow.
  return Math.max(0, inset);
}

/**
 * Seams: consecutive top-level demos that stack with nothing between them.
 *
 * Only *consecutive* pairs, because a seam is a rhythm defect between neighbours;
 * and only pairs that genuinely stack — they must share inline space (two demos
 * side by side are a row, not a stack) and the second must start at or below the
 * first (a floated or absolutely-placed demo is not in the rhythm).
 */
export function findSeams(o: PageObservation): Seam[] {
  const demos = o.demos.filter(painted);
  const seams: Seam[] = [];
  for (let i = 0; i + 1 < demos.length; i++) {
    const a = demos[i];
    const b = demos[i + 1];
    // Side by side → a row, not a stack.
    if (span(left(a), right(a), left(b), right(b)) <= 0) continue;
    // The next demo must be the lower one; anything else is not vertical rhythm.
    if (top(b) < top(a)) continue;
    const gap = top(b) - bottom(a);
    if (gap < SEAM_GAP_PX) {
      seams.push({ before: a.label, after: b.label, gap });
    }
  }
  return seams;
}

/**
 * Bleeds: boxes crossing a viewport edge with no way back. *Reachability*, not
 * clipping, is the test the collector applies before a box gets here — a
 * horizontally scrollable code block is a deliberate affordance and would
 * otherwise put a permanent floor under this count, while a box sitting past the
 * inline start of a scroller cannot be scrolled to at all in LTR and is exactly
 * the kind of content a reader never learns exists.
 */
export function findBleeds(o: PageObservation): Bleed[] {
  const bleeds: Bleed[] = [];
  for (const b of o.boxes) {
    if (!painted(b)) continue;
    const over = right(b) - o.viewportWidth;
    if (over > BLEED_PX) bleeds.push({ label: b.label, edge: "right", overflow: over });
    if (-left(b) > BLEED_PX) bleeds.push({ label: b.label, edge: "left", overflow: -left(b) });
  }
  return bleeds;
}

/**
 * Overlaps: unordered pairs of fixed boxes sharing viewport space. Fixed boxes
 * are the one class of element that cannot be pushed apart by rhythm — two of
 * them anchored to the same corner will sit on top of each other forever, which
 * is exactly what the toast page does today.
 */
export function findOverlaps(o: PageObservation): Overlap[] {
  const boxes = o.fixed.filter(painted);
  const overlaps: Overlap[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const w = span(left(a), right(a), left(b), right(b));
      const h = span(top(a), bottom(a), top(b), bottom(b));
      if (w > OVERLAP_PX && h > OVERLAP_PX) {
        overlaps.push({ a: a.label, b: b.label, width: w, height: h });
      }
    }
  }
  return overlaps;
}

/** All four conditions for one page. */
export function lintPage(o: PageObservation): PageFindings {
  const gutter = measureGutter(o);
  return {
    page: o.page,
    gutter,
    zeroGutter: gutter !== null && gutter < GUTTER_MIN_PX,
    seams: findSeams(o),
    bleeds: findBleeds(o),
    overlaps: findOverlaps(o),
  };
}

// ── the budget ───────────────────────────────────────────────────────────────

/** One page's counts as the budget file records them. */
export interface PageBudget {
  zeroGutter: boolean;
  seams: number;
  bleeds: number;
  overlaps: number;
}

/** The five ratcheted counts. */
export interface BudgetTotals {
  /** Pages measured — informational context for the four counts, never ratcheted. */
  pages: number;
  /** Pages whose content touches a viewport edge. */
  zeroGutterPages: number;
  /** Pages carrying at least one seam. */
  seamPages: number;
  /** Seams, summed over every page. */
  seams: number;
  /** Bleeding boxes, summed over every page. */
  bleeds: number;
  /** Overlapping fixed-box pairs, summed over every page. */
  overlaps: number;
}

/** The committed budget: totals to ratchet against, plus per-page detail. */
export interface LayoutBudget {
  viewport: { width: number; height: number };
  totals: BudgetTotals;
  /** Site-relative page path → that page's counts, sorted by path. */
  pages: Record<string, PageBudget>;
}

/** The counts that may only ever fall. Order is the order failures report in. */
export const RATCHETED: readonly (keyof BudgetTotals)[] = Object.freeze([
  "zeroGutterPages",
  "seamPages",
  "seams",
  "bleeds",
  "overlaps",
] as const);

/** Reduce a sweep to the budget it would be committed as. */
export function summarize(
  findings: readonly PageFindings[],
  viewport: { width: number; height: number },
): LayoutBudget {
  const pages: Record<string, PageBudget> = {};
  for (const f of [...findings].sort((a, b) => a.page.localeCompare(b.page))) {
    pages[f.page] = {
      zeroGutter: f.zeroGutter,
      seams: f.seams.length,
      bleeds: f.bleeds.length,
      overlaps: f.overlaps.length,
    };
  }
  const totals: BudgetTotals = {
    pages: findings.length,
    zeroGutterPages: findings.filter((f) => f.zeroGutter).length,
    seamPages: findings.filter((f) => f.seams.length > 0).length,
    seams: sum(findings, (f) => f.seams.length),
    bleeds: sum(findings, (f) => f.bleeds.length),
    overlaps: sum(findings, (f) => f.overlaps.length),
  };
  return { viewport, totals, pages };
}

function sum<T>(items: readonly T[], of: (item: T) => number): number {
  return items.reduce((n, item) => n + of(item), 0);
}

/** A count that rose — the only thing that fails the gate. */
export interface Regression {
  count: keyof BudgetTotals;
  budget: number;
  measured: number;
  /** Pages that got worse in this dimension, for the failure message. */
  pages: string[];
}

/** A count that fell — the phase's progress, reported rather than enforced. */
export interface Slack {
  count: keyof BudgetTotals;
  budget: number;
  measured: number;
}

export interface BudgetComparison {
  regressions: Regression[];
  slack: Slack[];
  /** True when nothing rose — a fall is a pass, which is what makes it a ratchet. */
  ok: boolean;
}

/**
 * The ratchet. A *wall* — "no page may have a seam" — would be red on the day it
 * lands and stay red for the whole phase, which teaches everyone to ignore it. A
 * budget of today's counts is green on day one and can only be lowered: every
 * task after this one moves a number it is not allowed to raise.
 */
export function compareBudget(measured: LayoutBudget, budget: LayoutBudget): BudgetComparison {
  const regressions: Regression[] = [];
  const slack: Slack[] = [];
  for (const count of RATCHETED) {
    const was = budget.totals[count];
    const now = measured.totals[count];
    if (now > was) regressions.push({ count, budget: was, measured: now, pages: worsened(measured, budget, count) });
    else if (now < was) slack.push({ count, budget: was, measured: now });
  }
  return { regressions, slack, ok: regressions.length === 0 };
}

/** Which pages account for a risen count — a total is useless without a name. */
function worsened(
  measured: LayoutBudget,
  budget: LayoutBudget,
  count: keyof BudgetTotals,
): string[] {
  const pages: string[] = [];
  for (const [path, now] of Object.entries(measured.pages)) {
    const was = budget.pages[path];
    if (!was) {
      // A page with no budget line is new; it can only add to a count.
      if (pageCount(now, count) > 0) pages.push(`${path} (new)`);
      continue;
    }
    if (pageCount(now, count) > pageCount(was, count)) pages.push(path);
  }
  return pages;
}

function pageCount(p: PageBudget, count: keyof BudgetTotals): number {
  switch (count) {
    case "zeroGutterPages":
      return p.zeroGutter ? 1 : 0;
    case "seamPages":
      return p.seams > 0 ? 1 : 0;
    case "seams":
      return p.seams;
    case "bleeds":
      return p.bleeds;
    case "overlaps":
      return p.overlaps;
    default:
      return 0;
  }
}

/** The failure/slack message, so a CI log says what moved and where. */
export function formatComparison(cmp: BudgetComparison): string {
  const lines: string[] = [];
  for (const r of cmp.regressions) {
    lines.push(`✗ ${r.count}: ${r.budget} → ${r.measured} (the budget may only fall)`);
    for (const p of r.pages.slice(0, 10)) lines.push(`    ${p}`);
    if (r.pages.length > 10) lines.push(`    … and ${r.pages.length - 10} more`);
  }
  for (const s of cmp.slack) {
    lines.push(`✓ ${s.count}: ${s.budget} → ${s.measured} (${s.budget - s.measured} better than budget)`);
  }
  return lines.join("\n");
}
