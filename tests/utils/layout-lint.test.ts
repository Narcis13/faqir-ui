// The layout-lint checker, proven from literal rectangles (task 0.9-01).
//
// The gate that runs in CI drives this same code over a real browser, but a
// browser is a terrible place to prove a *rule*: a failing screenshot cannot tell
// you whether the rule is wrong or the page is. So every condition is proven here
// from hand-written boxes, in both directions — a clean page reports nothing, and
// a page seeded with exactly one defect reports exactly one.

import { describe, it, expect } from "bun:test";
import {
  BLEED_PX,
  GUTTER_MIN_PX,
  OVERLAP_PX,
  RATCHETED,
  SEAM_GAP_PX,
  compareBudget,
  findBleeds,
  findOverlaps,
  findSeams,
  formatComparison,
  lintPage,
  measureGutter,
  summarize,
  type LabelledBox,
  type LayoutBudget,
  type PageFindings,
  type PageObservation,
} from "../../src/utils/layout-lint";

const VIEWPORT = { width: 1280, height: 900 };

function box(label: string, x: number, y: number, width: number, height: number): LabelledBox {
  return { label, x, y, width, height };
}

/**
 * A page with a gutter, rhythm between its demos, nothing past the edges and one
 * fixed box: the shape every one of the four conditions is silent about.
 */
function cleanPage(over: Partial<PageObservation> = {}): PageObservation {
  const demos = [box("demo-a", 24, 24, 1232, 100), box("demo-b", 24, 148, 1232, 100)];
  return {
    page: "examples/primitives/clean.html",
    viewportWidth: VIEWPORT.width,
    topLevel: demos,
    demos,
    boxes: [...demos, box("text-a", 40, 40, 200, 20), box("text-b", 40, 164, 200, 20)],
    fixed: [box("toast-region", 1000, 700, 256, 120)],
    ...over,
  };
}

describe("a clean page reports nothing", () => {
  it("is silent on all four conditions", () => {
    const f = lintPage(cleanPage());
    expect(f.zeroGutter).toBe(false);
    expect(f.gutter).toBe(24); // the outer demos' inset, not their padded text
    expect(f.seams).toEqual([]);
    expect(f.bleeds).toEqual([]);
    expect(f.overlaps).toEqual([]);
  });
});

describe("gutter", () => {
  it("is the smallest inset of any outer box, from either edge", () => {
    // Inset 40 on the left, but 8 on the right: a page flush on one side is flush.
    const o = cleanPage({ topLevel: [box("wide", 40, 10, 1232, 20)] });
    expect(measureGutter(o)).toBe(8);
  });

  it("reports zero when content touches an edge", () => {
    const f = lintPage(cleanPage({ topLevel: [box("flush", 0, 10, 300, 20)] }));
    expect(f.gutter).toBe(0);
    expect(f.zeroGutter).toBe(true);
  });

  it("treats sub-pixel insets as no gutter at all", () => {
    // 0.5px is layout noise, not an intentional inset — the threshold says so.
    const f = lintPage(cleanPage({ topLevel: [box("hairline", 0.5, 10, 300, 20)] }));
    expect(f.gutter).toBeLessThan(GUTTER_MIN_PX);
    expect(f.zeroGutter).toBe(true);
  });

  it("ignores boxes with no area — they paint nothing", () => {
    const o = cleanPage({
      topLevel: [box("collapsed", 0, 0, 0, 0), box("real", 32, 10, 200, 20)],
    });
    expect(measureGutter(o)).toBe(32);
  });

  it("is null, not zero, when the page painted nothing", () => {
    const f = lintPage(cleanPage({ topLevel: [] }));
    expect(f.gutter).toBeNull();
    expect(f.zeroGutter).toBe(false);
  });

  it("clamps a bleeding leaf to zero and leaves the overflow to the bleed check", () => {
    expect(measureGutter(cleanPage({ topLevel: [box("bled", -40, 10, 200, 20)] }))).toBe(0);
  });
});

describe("seams", () => {
  it("reports exactly one for a single 0px join", () => {
    const demos = [
      box("a", 0, 0, 1280, 100),
      box("b", 0, 100, 1280, 100), // touches a
      box("c", 0, 300, 1280, 100), // 100px below b
    ];
    const seams = findSeams(cleanPage({ demos }));
    expect(seams).toHaveLength(1);
    expect(seams[0]).toEqual({ before: "a", after: "b", gap: 0 });
  });

  it("counts an overlapping pair — worse than touching is still a seam", () => {
    const demos = [box("a", 0, 0, 1280, 100), box("b", 0, 90, 1280, 100)];
    expect(findSeams(cleanPage({ demos }))[0].gap).toBe(-10);
  });

  it("passes a gap of exactly the threshold and fails just under it", () => {
    const at = [box("a", 0, 0, 1280, 100), box("b", 0, 100 + SEAM_GAP_PX, 1280, 100)];
    const under = [box("a", 0, 0, 1280, 100), box("b", 0, 100.5, 1280, 100)];
    expect(findSeams(cleanPage({ demos: at }))).toEqual([]);
    expect(findSeams(cleanPage({ demos: under }))).toHaveLength(1);
  });

  it("does not call two demos side by side a seam", () => {
    // A row: same y, no shared inline space. Touching horizontally is a row's job.
    const demos = [box("left", 0, 0, 640, 100), box("right", 640, 0, 640, 100)];
    expect(findSeams(cleanPage({ demos }))).toEqual([]);
  });

  it("only compares neighbours, so a distant pair cannot make a seam", () => {
    const demos = [
      box("a", 0, 0, 1280, 100),
      box("b", 0, 200, 1280, 100),
      box("c", 0, 300, 1280, 100), // touches b, not a
    ];
    expect(findSeams(cleanPage({ demos })).map((s) => s.before)).toEqual(["b"]);
  });

  it("skips a demo lifted above its predecessor (not vertical rhythm)", () => {
    const demos = [box("a", 0, 200, 1280, 100), box("floated", 0, 0, 300, 100)];
    expect(findSeams(cleanPage({ demos }))).toEqual([]);
  });
});

describe("bleeds", () => {
  it("reports exactly one box past the right edge", () => {
    const boxes = [
      box("in", 0, 0, 1280, 40),
      box("out", 400, 60, 1000, 40), // right = 1400
    ];
    const bleeds = findBleeds(cleanPage({ boxes }));
    expect(bleeds).toHaveLength(1);
    expect(bleeds[0]).toEqual({ label: "out", edge: "right", overflow: 120 });
  });

  it("reports a box past the left edge", () => {
    const bleeds = findBleeds(cleanPage({ boxes: [box("out", -30, 0, 100, 40)] }));
    expect(bleeds).toEqual([{ label: "out", edge: "left", overflow: 30 }]);
  });

  it("ignores an overflow inside the threshold", () => {
    const boxes = [box("hair", 0, 0, VIEWPORT.width + BLEED_PX, 40)];
    expect(findBleeds(cleanPage({ boxes }))).toEqual([]);
  });

  it("counts a box past the edge even inside a scroller — a clip is not an excuse", () => {
    // The collector hands over every painted box, clipping ancestors included:
    // the carousel's slides sit in an `overflow: auto` viewport and start 12px
    // past the right edge, and that is the case the phase set out to name.
    const boxes = [box("slide", 1292, 0, 1280, 400)];
    expect(findBleeds(cleanPage({ boxes }))).toEqual([
      { label: "slide", edge: "right", overflow: 1292 + 1280 - VIEWPORT.width },
    ]);
  });

  it("clamps the gutter of a bleeding page to zero rather than reporting a negative inset", () => {
    const o = cleanPage({ topLevel: [box("bled", 0, 0, 1400, 40)] });
    expect(measureGutter(o)).toBe(0);
    expect(findBleeds(o)).toEqual([]); // …because the *bleed* subject list is separate
  });
});

describe("overlaps", () => {
  it("reports exactly one pair for two stacked fixed boxes", () => {
    const fixed = [box("toast-1", 1000, 700, 256, 120), box("toast-2", 1000, 700, 256, 120)];
    const overlaps = findOverlaps(cleanPage({ fixed }));
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({ a: "toast-1", b: "toast-2", width: 256, height: 120 });
  });

  it("counts every unordered pair, which is why three regions cost three", () => {
    const at = (label: string) => box(label, 1000, 700, 256, 120);
    expect(findOverlaps(cleanPage({ fixed: [at("a"), at("b"), at("c")] }))).toHaveLength(3);
  });

  it("does not report fixed boxes that merely touch", () => {
    const fixed = [box("top", 0, 0, 100, 100), box("under", 0, 100 + OVERLAP_PX, 100, 100)];
    expect(findOverlaps(cleanPage({ fixed }))).toEqual([]);
  });

  it("ignores a fixed box with no area (a hidden region is not in the way)", () => {
    const fixed = [box("region", 1000, 700, 256, 120), box("empty", 1000, 700, 0, 0)];
    expect(findOverlaps(cleanPage({ fixed }))).toEqual([]);
  });
});

// ── the budget ───────────────────────────────────────────────────────────────

function findings(over: Partial<PageObservation>[]): PageFindings[] {
  return over.map((o, i) => lintPage(cleanPage({ page: `page-${i}.html`, ...o })));
}

describe("summarize", () => {
  it("counts pages and defects, and sorts the per-page detail by path", () => {
    const budget = summarize(
      findings([
        { page: "b.html", topLevel: [box("flush", 0, 0, 100, 20)] },
        {
          page: "a.html",
          demos: [box("x", 0, 0, 1280, 100), box("y", 0, 100, 1280, 100)],
        },
      ]),
      VIEWPORT,
    );
    expect(Object.keys(budget.pages)).toEqual(["a.html", "b.html"]);
    expect(budget.totals).toEqual({
      pages: 2,
      zeroGutterPages: 1,
      seamPages: 1,
      seams: 1,
      bleeds: 0,
      overlaps: 0,
    });
  });
});

/** A budget with the given totals and no per-page detail beyond one page. */
function budgetOf(totals: Partial<LayoutBudget["totals"]>, pages: LayoutBudget["pages"] = {}): LayoutBudget {
  return {
    viewport: VIEWPORT,
    totals: {
      pages: 1,
      zeroGutterPages: 0,
      seamPages: 0,
      seams: 0,
      bleeds: 0,
      overlaps: 0,
      ...totals,
    },
    pages,
  };
}

describe("the ratchet", () => {
  const budget = budgetOf(
    { pages: 2, zeroGutterPages: 1, seamPages: 1, seams: 3, bleeds: 1, overlaps: 1 },
    {
      "a.html": { zeroGutter: true, seams: 3, bleeds: 1, overlaps: 1 },
      "b.html": { zeroGutter: false, seams: 0, bleeds: 0, overlaps: 0 },
    },
  );

  it("fails a page worse than the budget, naming the count and the page", () => {
    const worse = budgetOf(
      { pages: 2, zeroGutterPages: 2, seamPages: 2, seams: 5, bleeds: 1, overlaps: 1 },
      {
        "a.html": { zeroGutter: true, seams: 3, bleeds: 1, overlaps: 1 },
        "b.html": { zeroGutter: true, seams: 2, bleeds: 0, overlaps: 0 },
      },
    );
    const cmp = compareBudget(worse, budget);
    expect(cmp.ok).toBe(false);
    expect(cmp.regressions.map((r) => r.count)).toEqual(["zeroGutterPages", "seamPages", "seams"]);
    for (const r of cmp.regressions) expect(r.pages).toEqual(["b.html"]);
    expect(formatComparison(cmp)).toContain("seams: 3 → 5");
  });

  it("passes a page better than the budget and reports the difference as slack", () => {
    const better = budgetOf(
      { pages: 2, zeroGutterPages: 0, seamPages: 0, seams: 0, bleeds: 1, overlaps: 1 },
      {
        "a.html": { zeroGutter: false, seams: 0, bleeds: 1, overlaps: 1 },
        "b.html": { zeroGutter: false, seams: 0, bleeds: 0, overlaps: 0 },
      },
    );
    const cmp = compareBudget(better, budget);
    expect(cmp.ok).toBe(true);
    expect(cmp.regressions).toEqual([]);
    expect(cmp.slack).toEqual([
      { count: "zeroGutterPages", budget: 1, measured: 0 },
      { count: "seamPages", budget: 1, measured: 0 },
      { count: "seams", budget: 3, measured: 0 },
    ]);
    expect(formatComparison(cmp)).toContain("3 better than budget");
  });

  it("passes an unchanged measurement with neither regression nor slack", () => {
    const cmp = compareBudget(budget, budget);
    expect(cmp).toEqual({ regressions: [], slack: [], ok: true });
  });

  it("blames a new page for the count it added", () => {
    const withNew = budgetOf(
      { pages: 3, zeroGutterPages: 2, seamPages: 2, seams: 5, bleeds: 1, overlaps: 1 },
      {
        ...budget.pages,
        "c.html": { zeroGutter: true, seams: 2, bleeds: 0, overlaps: 0 },
      },
    );
    const cmp = compareBudget(withNew, budget);
    expect(cmp.ok).toBe(false);
    expect(cmp.regressions[0].pages).toEqual(["c.html (new)"]);
  });

  // Task 0.9-04's first acceptance criterion. 0.9-02 and 0.9-03 drove seams and
  // zero-gutter pages to zero; what makes that permanent is that the committed
  // floor IS zero and the ratchet fails a single seam appearing anywhere — a
  // budget of 0 is not a special case in `compareBudget`, and this pins that.
  it("holds a floor of zero: one new seam on one page fails", () => {
    const floor = budgetOf(
      { pages: 2, zeroGutterPages: 0, seamPages: 0, seams: 0, bleeds: 7, overlaps: 3 },
      {
        "a.html": { zeroGutter: false, seams: 0, bleeds: 7, overlaps: 3 },
        "b.html": { zeroGutter: false, seams: 0, bleeds: 0, overlaps: 0 },
      },
    );
    expect(compareBudget(floor, floor).ok).toBe(true);

    const oneSeam = budgetOf(
      { pages: 2, zeroGutterPages: 0, seamPages: 1, seams: 1, bleeds: 7, overlaps: 3 },
      {
        "a.html": { zeroGutter: false, seams: 0, bleeds: 7, overlaps: 3 },
        "b.html": { zeroGutter: false, seams: 1, bleeds: 0, overlaps: 0 },
      },
    );
    const cmp = compareBudget(oneSeam, floor);
    expect(cmp.ok).toBe(false);
    expect(cmp.regressions.map((r) => r.count)).toEqual(["seamPages", "seams"]);
    for (const r of cmp.regressions) expect(r.pages).toEqual(["b.html"]);

    const oneGutter = budgetOf(
      { pages: 2, zeroGutterPages: 1, seamPages: 0, seams: 0, bleeds: 7, overlaps: 3 },
      {
        "a.html": { zeroGutter: true, seams: 0, bleeds: 7, overlaps: 3 },
        "b.html": { zeroGutter: false, seams: 0, bleeds: 0, overlaps: 0 },
      },
    );
    expect(compareBudget(oneGutter, floor).ok).toBe(false);
  });

  // The committed file, not a fixture: the library's own floor is zero today.
  it("has zero as the committed floor for seams and zero-gutter pages", async () => {
    const committed = (await import("../visual/layout-budget.json")).default as unknown as {
      totals: Record<string, number>;
    };
    expect(committed.totals.seams).toBe(0);
    expect(committed.totals.seamPages).toBe(0);
    expect(committed.totals.zeroGutterPages).toBe(0);
    expect(committed.totals.pages).toBeGreaterThanOrEqual(180);
  });

  it("never ratchets the page count — adding a clean page is not a regression", () => {
    expect(RATCHETED).not.toContain("pages");
    const grown = budgetOf(
      { ...budget.totals, pages: 3 },
      { ...budget.pages, "c.html": { zeroGutter: false, seams: 0, bleeds: 0, overlaps: 0 } },
    );
    expect(compareBudget(grown, budget).ok).toBe(true);
  });
});
