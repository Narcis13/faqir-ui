// chart 1.1 — the nine kinds faqir-chart draws beyond column, bar and line.
//
// The layout is pure (a model in, geometry out), so each kind is held to its
// geometry here: marks inside the plot, stacks summing from zero, slices making
// a full turn, bubbles sized by area, a gauge filled to its value. Every kind's
// aria-label is checked to read every value, in the existing grammar. The
// controller cases mount into a disposable container, never document.body.
//
// The plugin is evaluated from source, with no Faqir in sight: another file in
// this shared realm may hold it in the require cache or have registered it with
// the engine, and neither may depend on file order.

import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const chart = (() => {
  const mod = { exports: {} as any };
  const source = readFileSync(join(import.meta.dir, "../../registry/core/plugins/faqir-chart.js"), "utf8");
  new Function("module", "exports", "globalThis", "window", source)(mod, mod.exports, {}, undefined);
  return mod.exports;
})();

type Series = { name: string; values: (number | null)[]; texts: string[] };

const FS = 12;
const s = (name: string, values: (number | null)[], texts?: string[]): Series => ({
  name,
  values,
  texts: texts ?? values.map((v) => (v == null ? "" : String(v))),
});
const model = (kind: string, categories: string[], series: Series[], extra: Record<string, unknown> = {}) => ({
  kind,
  title: "T",
  categories,
  series,
  min: NaN,
  max: NaN,
  thresholds: [] as number[],
  ...extra,
});
const draw = (m: any, o: Record<string, unknown> = {}) => chart.layout(m, { width: 640, fontSize: FS, locale: "en-US", ...o });
const marks = (g: any) => g.series.flatMap((x: any) => x.marks);
const inside = (p: number[], g: any, slack = 1) =>
  p[0] >= -slack && p[0] <= g.width + slack && p[1] >= -slack && p[1] <= g.height + slack;
/** Every number in an SVG path, as [x, y] pairs (arc commands' radii and flags dropped). */
function points(d: string): number[][] {
  const out: number[][] = [];
  for (const cmd of d.match(/[MLA][^MLAZ]*/g) ?? []) {
    const n = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
    out.push(cmd[0] === "A" ? [n[5], n[6]] : [n[0], n[1]]);
  }
  return out;
}
/** The angle swept by a sector path's outer arc, in radians (0 at twelve o'clock, clockwise). */
function sweep(d: string, cx: number, cy: number): number {
  let total = 0;
  for (const piece of d.split("Z").filter(Boolean)) {
    const [m, a] = points(piece);
    const ang = (p: number[]) => Math.atan2(p[0] - cx, cy - p[1]);
    let t = ang(a) - ang(m);
    if (t <= 0) t += 2 * Math.PI;
    total += t;
  }
  return total;
}

const containers: HTMLElement[] = [];
function mount(html: string, lang = "en"): HTMLElement {
  const box = document.createElement("div");
  box.setAttribute("lang", lang);
  box.innerHTML = html;
  document.body.appendChild(box);
  containers.push(box);
  return box;
}
afterEach(() => {
  for (const box of containers.splice(0)) {
    box.querySelectorAll('[data-ui="chart"]').forEach((el: any) => el._faqirChart?.destroy());
    box.remove();
  }
});

// ── Area ────────────────────────────────────────────────────────────────────

describe("chart · area", () => {
  const m = model("area", ["Jan", "Feb", "Mar"], [s("Web", [42, 45, 51]), s("iOS", [18, 21, 26])]);

  it("starts its value axis at zero and fills each series down to it", () => {
    const g = draw(m);
    expect(g.domain[0]).toBe(0);
    for (const x of g.series) {
      expect(x.area).toMatch(/^M[\d.]+ [\d.]+L.*Z$/);
      const ys = points(x.area).map((p) => p[1]);
      expect(Math.max(...ys)).toBeCloseTo(g.baseline.y1, 0);
      expect(x.grad).toMatch(/^faqir-chart-\d$/);
    }
  });

  it("keeps the line kind's dashes and end names", () => {
    const g = draw(m);
    expect(g.series.map((x: any) => x.dash)).toEqual(["", "6 4"]);
    expect(g.series.map((x: any) => x.tag.text)).toEqual(["Web", "iOS"]);
  });

  it("paints its gradient from the stylesheet: the svg names no colour", () => {
    const svg: string = chart.svg(draw(m, { id: "c7" }));
    expect(svg).toContain('<linearGradient id="c7-0"');
    expect(svg).toContain('fill="url(#c7-0)"');
    expect(svg).not.toMatch(/stop-color|#[0-9a-f]{3,8}\b|rgb|oklch/i);
  });

  it("breaks the fill where a value is missing, and fills below zero up to it", () => {
    const g = draw(model("area", ["a", "b", "c", "d"], [s("x", [3, null, -2, 4])]));
    expect(g.series[0].area.match(/Z/g)).toHaveLength(2);
    expect(g.domain[0]).toBeLessThan(0);
  });

  it("reads every value", () => {
    expect(draw(m).label).toBe("T. Area chart. Web: Jan 42, Feb 45, Mar 51; iOS: Jan 18, Feb 21, Mar 26.");
  });
});

// ── Stacked ─────────────────────────────────────────────────────────────────

describe("chart · stacked column and bar", () => {
  const cats = ["Q1", "Q2"];
  const three = [s("Email", [320, 290]), s("Chat", [210, 260]), s("Phone", [140, 120])];

  it("stacks each category's segments end to end from zero, and its axis reaches the sum", () => {
    const g = draw(model("stacked-column", cats, three), { width: 900, height: 360 });
    expect(g.domain[1]).toBeGreaterThanOrEqual(670);
    const zero = g.baseline.y1;
    const q1 = g.series.map((x: any) => x.marks[0]);
    expect(q1[0].y + q1[0].height).toBeCloseTo(zero, 0);
    for (let j = 1; j < q1.length; j++) expect(q1[j].y + q1[j].height).toBeCloseTo(q1[j - 1].y, 0);
    // One column per category: every segment shares its x and width
    expect(new Set(q1.map((m: any) => m.x)).size).toBe(1);
  });

  it("writes each stack's total past its end", () => {
    const g = draw(model("stacked-bar", cats, three));
    expect(g.totals.map((t: any) => t.text)).toEqual(["670", "670"]);
    const top = g.series.map((x: any) => x.marks[0]).reduce((a: any, b: any) => (a.x + a.width > b.x + b.width ? a : b));
    expect(g.totals[0].x).toBeGreaterThan(top.x + top.width);
  });

  it("stacks negatives down from zero, positives up", () => {
    const g = draw(model("stacked-column", ["a"], [s("x", [5]), s("y", [-3]), s("z", [2])]));
    const zero = g.baseline.y1;
    const [x, y, z] = g.series.map((q: any) => q.marks[0]);
    expect(x.y + x.height).toBeCloseTo(zero, 0);
    expect(y.y).toBeCloseTo(zero, 0); // below zero
    expect(z.y + z.height).toBeCloseTo(x.y, 0); // on top of x
    expect(g.totals[0].text).toBe("4");
  });

  it("sums in the page language, with the precision of its parts", () => {
    const g = chart.layout(model("stacked-bar", ["a"], [s("x", [12.5], ["12,5"]), s("y", [48], ["48"])]), { width: 640, fontSize: FS, locale: "de-DE" });
    expect(g.totals[0].text).toBe("60,5");
    expect(g.label).toBe("T. Stacked bar chart. x: a 12,5; y: a 48; Total: a 60,5.");
  });

  it("names series on the first stack that holds every name, else falls back to a legend", () => {
    const g = draw(model("stacked-bar", cats, three));
    expect(g.legend).toBeNull();
    expect(g.series.map((x: any) => x.tag?.text)).toEqual(["Email", "Chat", "Phone"]);
    const narrow = draw(model("stacked-bar", cats, three), { width: 240 });
    expect(narrow.legend?.map((k: any) => k.name)).toEqual(["Email", "Chat", "Phone"]);
  });

  it("reads every value, then every total", () => {
    expect(draw(model("stacked-column", cats, three)).label).toBe(
      "T. Stacked column chart. Email: Q1 320, Q2 290; Chat: Q1 210, Q2 260; Phone: Q1 140, Q2 120; Total: Q1 670, Q2 670.",
    );
  });

  it("skips an empty cell without breaking its stack", () => {
    const g = draw(model("stacked-column", ["a", "b"], [s("x", [1, null]), s("y", [2, 3])]));
    expect(g.series[0].marks).toHaveLength(1);
    expect(g.totals.map((t: any) => t.text)).toEqual(["3", "3"]);
  });
});

// ── Pie and donut ───────────────────────────────────────────────────────────

describe("chart · pie and donut", () => {
  const cats = ["Wind", "Solar", "Hydro", "Gas", "Other"];
  const gen = [s("Generation", [136, 84, 72, 68, 40])];

  it("makes a full turn from its slices, in table order from twelve o'clock", () => {
    for (const kind of ["pie", "donut"]) {
      const g = draw(model(kind, cats, gen));
      const cx = g.plot.x + g.plot.width / 2;
      const cy = g.plot.y + g.plot.height / 2;
      const turns = marks(g).map((m: any) => sweep(m.d, cx, cy));
      expect(turns.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(2 * Math.PI, 2);
      expect(turns[0] / (2 * Math.PI)).toBeCloseTo(136 / 400, 2);
      const start = points(marks(g)[0].d)[0];
      expect(start[0]).toBeCloseTo(cx, 0);
      expect(start[1]).toBeLessThan(cy);
    }
  });

  it("gives each category its own group, so its key and its slices share a band", () => {
    const g = draw(model("pie", cats, gen));
    expect(g.series.map((x: any) => x.name)).toEqual(cats);
    expect(g.legend.map((k: any) => k.name)).toEqual(cats);
  });

  it("writes shares on the slices that hold them, and value and share in the legend", () => {
    const g = draw(model("pie", cats, gen));
    expect(g.series[0].labels[0].text).toBe("34%");
    expect(g.legend[0]).toMatchObject({ value: "136", share: "34%" });
    expect(g.legend[0].sx).toBeGreaterThan(g.legend[0].vx);
  });

  it("holds a single donut's total in the hole, with what it counts", () => {
    const g = draw(model("donut", cats, gen));
    expect(g.totals.map((t: any) => t.text)).toEqual(["400", "Generation"]);
    const cx = g.plot.x + g.plot.width / 2;
    for (const t of g.totals) expect(t.x).toBeCloseTo(cx, 0);
    expect(draw(model("pie", cats, gen)).totals).toBeUndefined();
  });

  it("draws one ring per series, outermost first", () => {
    const g = draw(model("donut", ["a", "b"], [s("2024", [1, 1]), s("2025", [1, 3])]));
    expect(g.series[0].marks).toHaveLength(2);
    expect(g.totals).toBeUndefined();
    expect(g.label).toBe("T. Donut chart. 2024: a 1 (50%), b 1 (50%); 2025: a 1 (25%), b 3 (75%).");
  });

  it("reads every value with its share, then the total", () => {
    expect(draw(model("pie", cats, gen)).label).toBe(
      "T. Pie chart. Wind 136 (34%), Solar 84 (21%), Hydro 72 (18%), Gas 68 (17%), Other 40 (10%); total 400.",
    );
  });

  it("draws a single row as the whole circle, and leaves zeros and negatives out", () => {
    const one = draw(model("pie", ["all"], [s("x", [7])]));
    const cx = one.plot.x + one.plot.width / 2;
    const cy = one.plot.y + one.plot.height / 2;
    expect(sweep(marks(one)[0].d, cx, cy)).toBeCloseTo(2 * Math.PI, 2);
    const mixed = draw(model("donut", ["a", "b", "c"], [s("x", [3, 0, -2])]));
    expect(marks(mixed)).toHaveLength(1);
    expect(mixed.label).toBe("T. Donut chart. a 3 (100%), b 0 (0%), c -2 (0%); total 3.");
  });

  it("puts the legend under the circle when the two do not fit side by side", () => {
    const g = draw(model("donut", cats, gen), { width: 300 });
    for (const k of g.legend) expect(k.y).toBeGreaterThan(g.plot.y + g.plot.height);
  });
});

// ── Scatter ─────────────────────────────────────────────────────────────────

describe("chart · scatter", () => {
  const cats = ["Search", "Social", "Email"];
  const cols = [s("Ad spend", [12, 18, 4]), s("Revenue", [86, 64, 38]), s("Customers", [240, 410, 120])];

  it("places each row at (first column, second column), inside the plot", () => {
    const g = draw(model("scatter", cats, cols.slice(0, 2)));
    const pts = marks(g);
    expect(pts).toHaveLength(3);
    const p = g.plot;
    for (const m of pts) {
      expect(m.cx).toBeGreaterThanOrEqual(p.x);
      expect(m.cx).toBeLessThanOrEqual(p.x + p.width);
      expect(m.cy).toBeGreaterThanOrEqual(p.y);
      expect(m.cy).toBeLessThanOrEqual(p.y + p.height);
    }
    const search = pts.find((m: any) => m.title.startsWith("Search"));
    const email = pts.find((m: any) => m.title.startsWith("Email"));
    expect(search.cx).toBeGreaterThan(email.cx); // more spend, further right
    expect(search.cy).toBeLessThan(email.cy); // more revenue, higher
  });

  it("sizes bubbles by area from the third column, the largest drawn first", () => {
    const g = draw(model("scatter", cats, cols));
    const pts = marks(g);
    expect(pts[0].title.startsWith("Social")).toBe(true);
    const r = (name: string) => pts.find((m: any) => m.title.startsWith(name)).r - 3;
    expect((r("Social") / r("Email")) ** 2).toBeCloseTo(410 / 120, 0);
  });

  it("names its axes by their columns and keeps headroom past the outermost point", () => {
    const g = draw(model("scatter", cats, cols));
    const titles = g.axis.filter((t: any) => t.part === "title").map((t: any) => t.text);
    expect(titles).toEqual(["Ad spend", "Revenue (size: Customers)"]);
    expect(g.domain[1]).toBeGreaterThan(86);
  });

  it("names points beside themselves without two names colliding", () => {
    const crowd = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const g = draw(model("scatter", crowd, [s("x", crowd.map((_, i) => i % 3)), s("y", crowd.map((_, i) => Math.floor(i / 3)))]), { width: 300 });
    const boxes = g.series[0].labels.map((l: any) => {
      const w = l.text.length * FS * 0.6;
      return { x: l.anchor === "end" ? l.x - w : l.x, y: l.y - FS, w, h: FS };
    });
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
  });

  it("reads every row's values with their column names", () => {
    expect(draw(model("scatter", cats, cols)).label).toBe(
      "T. Scatter chart. Search: Ad spend 12, Revenue 86, Customers 240; Social: Ad spend 18, Revenue 64, Customers 410; Email: Ad spend 4, Revenue 38, Customers 120.",
    );
  });

  it("handles negatives, a single row, and a row missing a coordinate", () => {
    const g = draw(model("scatter", ["a", "b", "c"], [s("x", [-5, 3, null]), s("y", [2, -4, 1])]));
    expect(marks(g)).toHaveLength(2);
    expect(g.domain[0]).toBeLessThan(-4);
    const one = draw(model("scatter", ["a"], [s("x", [3]), s("y", [3])]));
    expect(marks(one)).toHaveLength(1);
    expect(inside([marks(one)[0].cx, marks(one)[0].cy], one)).toBe(true);
  });

  it("draws as a column chart without two value columns that pair up", () => {
    expect(draw(model("scatter", ["a", "b"], [s("x", [1, 2])])).kind).toBe("column");
    expect(draw(model("scatter", ["a", "b"], [s("x", [1, null]), s("y", [null, 2])])).kind).toBe("column");
  });
});

// ── Sparkline ───────────────────────────────────────────────────────────────

describe("chart · sparkline", () => {
  const weeks = ["W1", "W2", "W3", "W4"];
  const m = model("sparkline", weeks, [s("Revenue", [3.4, 3.6, 3.5, 3.8])]);

  it("draws no grid, no axis and no labels, just the line across the full width", () => {
    const g = draw(m, { width: 160 });
    expect(g.grid).toEqual([]);
    expect(g.axis).toEqual([]);
    expect(g.legend).toBeNull();
    const ps = points(g.series[0].path);
    expect(ps[0][0]).toBeCloseTo(4, 0);
    expect(ps[ps.length - 1][0]).toBeCloseTo(156, 0);
    for (const p of ps) expect(inside(p, g)).toBe(true);
  });

  it("marks only the last value, the highest point here, at the top", () => {
    const g = draw(m, { width: 160 });
    expect(g.series[0].marks).toHaveLength(1);
    const dot = g.series[0].marks[0];
    expect(dot.title).toBe("W4 3.8");
    expect(dot.cy).toBeCloseTo(4, 0);
  });

  it("is short: its height follows its width, and a line's height in a table cell", () => {
    expect(draw(m, { width: 80 }).height).toBe(24);
    expect(draw(m, { width: 160 }).height).toBe(40);
    expect(draw(m, { width: 900 }).height).toBe(48);
    expect(draw(m, { width: 900, cell: true }).height).toBe(29);
  });

  it("works at the width of a table cell", () => {
    expect(draw(m, { width: 60 }).width).toBe(60);
  });

  it("dots the last value that exists, and draws a flat series in the middle", () => {
    const gap = draw(model("sparkline", weeks, [s("x", [1, 2, 3, null])]), { width: 160 });
    expect(gap.series[0].marks[0].title).toBe("W3 3");
    const flat = draw(model("sparkline", ["a", "b"], [s("x", [5, 5])]), { width: 160 });
    const ys = points(flat.series[0].path).map((p) => p[1]);
    expect(ys[0]).toBeCloseTo(flat.height / 2, 0);
  });

  it("reads every value", () => {
    expect(draw(m).label).toBe("T. Sparkline chart. W1 3.4, W2 3.6, W3 3.5, W4 3.8.");
  });
});

// ── Radar ───────────────────────────────────────────────────────────────────

describe("chart · radar", () => {
  const crit = ["Battery", "Display", "Performance", "Weight", "Price", "Keyboard"];
  const two = [s("Aero", [8, 7, 6, 9, 8, 7]), s("Studio", [6, 9, 9, 5, 4, 8])];

  it("draws a closed polygon per series with a vertex per spoke, dashed apart", () => {
    const g = draw(model("radar", crit, two));
    for (const x of g.series) {
      expect(x.path.endsWith("Z")).toBe(true);
      expect(points(x.path)).toHaveLength(crit.length);
      expect(x.marks).toHaveLength(crit.length);
    }
    expect(g.series.map((x: any) => x.dash)).toEqual(["", "6 4"]);
    expect(g.legend.map((k: any) => k.name)).toEqual(["Aero", "Studio"]);
  });

  it("puts a vertex at its value's distance from the centre, the first straight up", () => {
    const g = draw(model("radar", ["a", "b", "c", "d"], [s("x", [10, 5, 0, 5])]));
    const cx = g.plot.x + g.plot.width / 2;
    const cy = g.plot.y + g.plot.height / 2;
    const [top, right] = points(g.series[0].path);
    expect(top[0]).toBeCloseTo(cx, 0);
    const R = cy - top[1];
    expect(right[0] - cx).toBeCloseTo(R * (5 / g.domain[1]) * (g.domain[1] / 10), 0);
  });

  it("draws a ring per tick above zero and a spoke per category", () => {
    const g = draw(model("radar", crit, two));
    const rings = g.grid.filter((l: any) => l.tag === "path");
    const spokes = g.grid.filter((l: any) => !l.tag);
    expect(spokes).toHaveLength(crit.length);
    expect(rings.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps every name and vertex inside the drawing", () => {
    for (const width of [240, 390, 640]) {
      const g = draw(model("radar", crit, two), { width });
      for (const x of g.series) for (const p of points(x.path)) expect(inside(p, g)).toBe(true);
    }
  });

  it("draws as a column chart with fewer than three spokes", () => {
    expect(draw(model("radar", ["a", "b"], [s("x", [1, 2])])).kind).toBe("column");
  });

  it("reads every value", () => {
    expect(draw(model("radar", crit.slice(0, 3), [s("Aero", [8, 7, 6])])).label).toBe(
      "T. Radar chart. Battery 8, Display 7, Performance 6.",
    );
  });
});

// ── Gauge ───────────────────────────────────────────────────────────────────

describe("chart · gauge", () => {
  const load = [s("Load", [62, 78, 41], ["62%", "78%", "41%"])];
  const cats = ["CPU", "Memory", "Disk"];

  it("fills a half ring from data-min to the value", () => {
    const g = draw(model("gauge", ["CPU"], [s("Load", [50], ["50%"])], { min: 0, max: 100 }));
    const [track, value] = g.series[0].marks;
    expect(track.part).toBe("track");
    const [start, end] = points(track.d);
    expect(start[1]).toBeCloseTo(end[1], 0); // the ends level: a half ring
    const [, half] = points(value.d);
    // Half of the range is the top of the ring
    expect(half[0]).toBeCloseTo((start[0] + end[0]) / 2, 0);
    expect(half[1]).toBeLessThan(start[1]);
  });

  it("defaults to 0–100 for percentages, and fits a round maximum otherwise", () => {
    expect(draw(model("gauge", cats, load)).domain).toEqual([0, 100]);
    expect(draw(model("gauge", ["Q3"], [s("Sales", [184500])])).domain[1]).toBe(200000);
    expect(draw(model("gauge", ["Q3"], [s("Sales", [184500])], { max: 250000 })).domain).toEqual([0, 250000]);
  });

  it("draws a zone between each threshold and notches the ring at each", () => {
    const g = draw(model("gauge", cats, load, { min: 0, max: 100, thresholds: [90, 70, 150] }));
    const parts = g.series[0].marks.map((m: any) => m.part ?? "mark");
    expect(parts.filter((p: string) => p === "zone")).toHaveLength(3);
    expect(parts.filter((p: string) => p === "tick")).toHaveLength(2);
  });

  it("clamps a value outside the range and draws no arc for the minimum", () => {
    const over = draw(model("gauge", ["x"], [s("v", [140])], { max: 100 }));
    const [track, value] = over.series[0].marks;
    expect(points(value.d)[1]).toEqual(points(track.d)[1]);
    const none = draw(model("gauge", ["x"], [s("v", [0])]));
    expect(none.series[0].marks.filter((m: any) => !m.part)).toHaveLength(0);
  });

  it("lays gauges out in columns that fit, a reading and a name under each", () => {
    const wide = draw(model("gauge", cats, load), { width: 900 });
    const narrow = draw(model("gauge", cats, load), { width: 320 });
    expect(new Set(wide.totals.filter((t: any) => !t.part).map((t: any) => t.y)).size).toBe(1);
    expect(narrow.height).toBeGreaterThan(wide.height);
    expect(wide.totals.map((t: any) => t.text)).toEqual(["62%", "CPU", "78%", "Memory", "41%", "Disk"]);
  });

  it("reads every value, then the range", () => {
    expect(draw(model("gauge", cats, load)).label).toBe("T. Gauge chart. CPU 62%, Memory 78%, Disk 41% (0–100).");
  });
});

// ── Every kind ──────────────────────────────────────────────────────────────

describe("chart · every new kind", () => {
  const KINDS = ["area", "stacked-column", "stacked-bar", "pie", "donut", "scatter", "sparkline", "radar", "gauge"];
  const cats = ["North", "South", "West"];
  const list = [s("A", [12, 7, 3]), s("B", [5, 9, 4]), s("C", [2, 3, 8])];

  it("reads every cell's text in its aria-label", () => {
    for (const kind of KINDS) {
      const label: string = draw(model(kind, cats, kind === "gauge" || kind === "sparkline" ? [list[0]] : list)).label;
      expect(label.startsWith("T. ")).toBe(true);
      const used = kind === "gauge" || kind === "sparkline" ? [list[0]] : list;
      for (const x of used) for (const t of x.texts) expect(label, kind).toContain(t);
      for (const c of cats) expect(label, kind).toContain(c);
    }
  });

  it("is one role=img svg, deterministic, with no colour of its own", () => {
    for (const kind of KINDS) {
      const m = model(kind, cats, list);
      const svg: string = chart.svg(draw(m));
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('role="img"');
      expect(svg).toBe(chart.svg(draw(m)));
      expect(svg, kind).not.toMatch(/\b(stroke|style|color)=|#[0-9a-f]{3,8}\b|rgb|hsl|oklch/i);
      expect(svg.replace(/fill="url\(#[\w-]+\)"/g, ""), kind).not.toMatch(/\bfill=/);
    }
  });

  it("keeps every mark inside the drawing at a phone's width and a wide one", () => {
    for (const kind of KINDS) {
      for (const width of [240, 358, 1200]) {
        const g = draw(model(kind, cats, list), { width });
        for (const m of marks(g)) {
          const ps = m.d ? points(m.d) : m.cx != null ? [[m.cx, m.cy]] : m.x1 != null ? [[m.x1, m.y1], [m.x2, m.y2]] : [[m.x, m.y], [m.x + m.width, m.y + m.height]];
          for (const p of ps) expect(inside(p, g, 2), `${kind} @${width}`).toBe(true);
        }
      }
    }
  });

  it("survives zeros, a single row and empty cells", () => {
    for (const kind of KINDS) {
      for (const m of [
        model(kind, ["a", "b"], [s("x", [0, 0]), s("y", [0, 0])]),
        model(kind, ["only"], [s("x", [4]), s("y", [2])]),
        model(kind, ["a", "b", "c"], [s("x", [1, null, 3]), s("y", [null, 2, 1])]),
      ]) {
        const svg: string = chart.svg(draw(m));
        expect(svg, kind).not.toContain("NaN");
        expect(svg, kind).not.toContain("Infinity");
      }
    }
  });
});

// ── Reading and drawing, in a page ──────────────────────────────────────────

describe("chart · the controller with the new kinds", () => {
  const TABLE = (rows: string) =>
    `<table data-part="data"><thead><tr><th>Week</th><th>Units</th></tr></thead><tbody>${rows}</tbody></table>`;

  it("reads a gauge's range and thresholds from the root", () => {
    const box = mount(`<figure data-ui="chart" data-variant="gauge" data-min="10" data-max="90" data-thresholds="40, 70 x">${TABLE("<tr><th>a</th><td>50</td></tr>")}</figure>`);
    const m = chart.read(box.firstElementChild, "en");
    expect(m.kind).toBe("gauge");
    expect([m.min, m.max, m.thresholds]).toEqual([10, 90, [40, 70]]);
    const bare = mount(`<figure data-ui="chart" data-variant="gauge">${TABLE("<tr><th>a</th><td>50</td></tr>")}</figure>`);
    const n = chart.read(bare.firstElementChild, "en");
    expect(Number.isNaN(n.min) && Number.isNaN(n.max)).toBe(true);
    expect(n.thresholds).toEqual([]);
  });

  it("reads each kind's numbers in the page language", () => {
    const box = mount(`<figure data-ui="chart" data-variant="donut">${TABLE("<tr><th>a</th><td>1.240,5</td></tr><tr><th>b</th><td>759,5</td></tr>")}</figure>`, "de");
    const root = box.firstElementChild as HTMLElement;
    chart.createChart(root);
    // German writes a no-break space before the percent sign.
    const label = root.querySelector("svg")!.getAttribute("aria-label")!.replace(/ /g, " ");
    expect(label).toBe("Donut chart. a 1.240,5 (62 %), b 759,5 (38 %); total 2.000,0.");
  });

  it("reads only its own rows when it sits in another table's cell, and draws compact there", () => {
    const box = mount(`<table><thead><tr><th>Product</th><th>Trend</th></tr></thead><tbody><tr><td>Lamp</td><td>
      <figure data-ui="chart" data-variant="sparkline">${TABLE("<tr><th>W1</th><td>3</td></tr><tr><th>W2</th><td>5</td></tr>")}</figure>
    </td></tr></tbody></table>`);
    const root = box.querySelector('[data-ui="chart"]') as HTMLElement;
    expect(chart.read(root, "en").categories).toEqual(["W1", "W2"]);
    chart.createChart(root);
    const svg = root.querySelector("svg")!;
    expect(svg.getAttribute("aria-label")).toBe("Sparkline chart. W1 3, W2 5.");
    const fs = parseFloat(getComputedStyle(root.querySelector('[data-part="plot"]')!).fontSize);
    expect(Number(svg.getAttribute("height"))).toBe(Math.round(fs * 2.4));
  });

  it("names a chart by its data table's caption when there is no figcaption", () => {
    const box = mount(`<figure data-ui="chart" data-variant="sparkline"><table data-part="data"><caption>Weekly orders</caption><thead><tr><th>W</th><th>n</th></tr></thead><tbody><tr><th>W1</th><td>4</td></tr></tbody></table></figure>`);
    const root = box.firstElementChild as HTMLElement;
    chart.createChart(root);
    expect(root.querySelector("svg")!.getAttribute("aria-label")).toBe("Weekly orders. Sparkline chart. W1 4.");
  });

  it("gives each chart's gradients their own ids", () => {
    const box = mount(
      `<figure data-ui="chart" data-variant="area">${TABLE("<tr><th>a</th><td>1</td></tr><tr><th>b</th><td>2</td></tr>")}</figure>` +
        `<figure data-ui="chart" data-variant="area">${TABLE("<tr><th>a</th><td>3</td></tr><tr><th>b</th><td>4</td></tr>")}</figure>`,
    );
    const ids = Array.from(box.querySelectorAll('[data-ui="chart"]'), (root) => {
      chart.createChart(root);
      return root.querySelector("linearGradient")!.id;
    });
    expect(ids[0]).not.toBe(ids[1]);
    for (const root of box.querySelectorAll('[data-ui="chart"]')) {
      const id = root.querySelector("linearGradient")!.id;
      expect(root.querySelector('[data-part="area"]')!.getAttribute("fill")).toBe(`url(#${id})`);
    }
  });
});

// ── The contract ────────────────────────────────────────────────────────────

describe("chart · manifest and stylesheet for the new kinds", () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "../../registry/primitives/chart/chart.manifest.json"), "utf8"));
  const css = readFileSync(join(import.meta.dir, "../../registry/primitives/chart/chart.css"), "utf8");

  it("declares every kind as a value of the one variant group, each described", () => {
    const v = manifest.variants.variant;
    expect(v.values).toEqual(["column", "bar", "line", "area", "stacked-column", "stacked-bar", "pie", "donut", "scatter", "sparkline", "radar", "gauge"]);
    expect(Object.keys(v.descriptions)).toEqual(v.values);
    for (const kind of v.values.slice(3)) expect(manifest.templates[`html_${kind.replace("-", "_")}`], kind).toContain(`data-variant="${kind}"`);
  });

  it("declares the gauge props and every drawn part it styles", () => {
    for (const p of ["min", "max", "thresholds"]) expect(manifest.props[p].attr).toBe(`data-${p}`);
    for (const part of css.matchAll(/\[data-part="([a-z-]+)"\]/g)) expect(manifest.slots[part[1]], part[1]).toBeDefined();
  });

  it("drops the hover transition under reduced motion, and paints from custom properties only", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("transition: none");
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(/i);
  });
});
