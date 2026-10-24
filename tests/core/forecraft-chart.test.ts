// forecraft #36 — the `chart` primitive and its opt-in plugin, faqir-chart.
//
// The plugin's layout is pure (a model in, geometry out, no DOM), so most of
// this file holds that geometry to the spec the note asked for: value axes
// from zero for bars and columns, direct labels where they fit and a legend
// only where they do not, a dash pattern per line, an aria-label that reads
// the numbers, and colours that come from custom properties only. The rest
// mounts the controller in a disposable container — never `document.body`,
// never `Faqir.start()` — because every engine test shares one happy-dom realm.

import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readControllerApi } from "../../src/utils/controller-api";

const ROOT = join(import.meta.dir, "../..");
const PLUGIN = join(ROOT, "registry/core/plugins/faqir-chart.js");
const CHART = join(ROOT, "registry/primitives/chart");

const Faqir = require("../../registry/core/faqir-core.js");

// The browser load order: core, then the plugin, which registers through it.
let pluginCalls = 0;
const origPlugin = Faqir.plugin;
Faqir.plugin = function (fn: any) {
  pluginCalls++;
  return origPlugin.call(Faqir, fn);
};
(globalThis as any).Faqir = Faqir;
const chart = require("../../registry/core/plugins/faqir-chart.js");
Faqir.plugin = origPlugin;

type Series = { name: string; values: (number | null)[]; texts: string[] };
type Model = { kind: string; title: string; categories: string[]; series: Series[] };

const FS = 12;
const textWidth = (s: string) => s.length * FS * 0.6;

function series(name: string, values: (number | null)[]): Series {
  return { name, values, texts: values.map((v) => (v == null ? "" : String(v))) };
}

function model(kind: string, categories: string[], list: Series[], title = "Revenue"): Model {
  return { kind, title, categories, series: list };
}

function layout(m: Model, o: Record<string, unknown> = {}) {
  return chart.layout(m, { width: 640, fontSize: FS, locale: "en-US", ...o });
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const TABLE = `
  <table data-part="data">
    <thead><tr><th scope="col">Region</th><th scope="col">2024</th><th scope="col">2025</th></tr></thead>
    <tbody>
      <tr><th scope="row">North</th><td>1,240</td><td>1,380</td></tr>
      <tr><th scope="row">South</th><td>860</td><td>940</td></tr>
    </tbody>
  </table>`;

// ── The value axis ──────────────────────────────────────────────────────────

describe("faqir-chart · value axes", () => {
  const high = [series("Load", [950, 975, 1000])];
  const cats = ["Mon", "Tue", "Wed"];

  it("starts a column chart's axis at zero, even when every value is far from it", () => {
    const g = layout(model("column", cats, high));
    expect(g.domain[0]).toBe(0);
    expect(g.domain[1]).toBeGreaterThanOrEqual(1000);
    // The baseline is the plot's bottom edge, and every column grows from it.
    expect(g.baseline.y1).toBe(g.plot.y + g.plot.height);
    for (const m of g.series[0].marks) expect(m.y + m.height).toBeCloseTo(g.baseline.y1, 0);
  });

  it("starts a bar chart's axis at zero, and every bar grows from it", () => {
    const g = layout(model("bar", cats, high));
    expect(g.domain[0]).toBe(0);
    expect(g.baseline.x1).toBe(g.plot.x);
    for (const m of g.series[0].marks) expect(m.x).toBeCloseTo(g.baseline.x1, 0);
  });

  it("keeps the lengths proportional: twice the value is twice the column", () => {
    const g = layout(model("column", ["a", "b"], [series("s", [20, 40])]));
    const [a, b] = g.series[0].marks;
    expect(b.height / a.height).toBeCloseTo(2, 1);
  });

  it("does not force zero onto a line chart, whose position carries the value", () => {
    const g = layout(model("line", cats, high));
    expect(g.domain[0]).toBeGreaterThan(0);
    expect(g.domain[0]).toBeLessThanOrEqual(950);
  });

  it("holds zero inside the axis when values are negative, and grows negatives downwards", () => {
    const g = layout(model("column", ["Jan", "Feb", "Mar"], [series("Net", [12.5, -4.2, 8.1])]));
    expect(g.domain[0]).toBeLessThan(0);
    expect(g.domain[1]).toBeGreaterThan(0);
    const zero = g.baseline.y1;
    const [jan, feb] = g.series[0].marks;
    expect(jan.y + jan.height).toBeCloseTo(zero, 0); // up from zero
    expect(feb.y).toBeCloseTo(zero, 0); // down from zero
  });

  it("puts ticks on round numbers and labels them in the locale", () => {
    const g = layout(model("column", ["a"], [series("s", [1240])]));
    const ticks = g.axis.filter((t: any) => t.anchor === "end").map((t: any) => t.text);
    expect(ticks[0]).toBe("0");
    expect(ticks).toContain("1,000");
    const ro = chart.layout(model("column", ["a"], [series("s", [1.5])]), { width: 640, fontSize: FS, locale: "ro" });
    expect(ro.axis.map((t: any) => t.text)).toContain("0,5");
  });
});

// ── Direct labels ───────────────────────────────────────────────────────────

describe("faqir-chart · direct labels instead of a legend", () => {
  const regions = ["North", "South", "West"];
  const three = [
    series("2023", [1240, 860, 410]),
    series("2024", [1380, 940, 520]),
    series("2025", [1510, 1020, 690]),
  ];

  it("names each bar series on its own mark when every name fits, and draws no legend", () => {
    const g = layout(model("bar", regions, three));
    expect(g.legend).toBeNull();
    expect(g.direct).toBe(true);
    g.series.forEach((s: any, j: number) => {
      expect(s.tag.text).toBe(three[j].name);
      // On the first category's mark, and inside it.
      const mark = s.marks[0];
      expect(s.tag.x).toBeGreaterThanOrEqual(mark.x);
      expect(s.tag.x + textWidth(s.tag.text)).toBeLessThanOrEqual(mark.x + mark.width);
      expect(s.tag.y).toBeGreaterThan(mark.y);
      expect(s.tag.y).toBeLessThanOrEqual(mark.y + mark.height + FS);
    });
  });

  it("names column series on their marks, rotated, when the columns are tall enough", () => {
    const g = layout(model("column", regions, three), { width: 900, height: 360 });
    expect(g.legend).toBeNull();
    g.series.forEach((s: any) => {
      expect(s.tag.rotate).toBe(true);
      const mark = s.marks[0];
      // Rotated, the name runs up the column from just above the baseline.
      expect(textWidth(s.tag.text)).toBeLessThanOrEqual(mark.height);
      expect(s.tag.x).toBeGreaterThan(mark.x);
      expect(s.tag.x).toBeLessThan(mark.x + mark.width);
    });
  });

  it("uses the first category where every name fits, not necessarily the first", () => {
    const g = layout(model("bar", regions, [series("2024", [12, 860, 410]), series("2025", [13, 940, 520])]));
    expect(g.legend).toBeNull();
    for (const s of g.series) expect(s.tag.y).toBeGreaterThan(s.marks[1].y); // South, not North
  });

  it("falls back to a legend when no category's marks can hold every name", () => {
    const long = [
      series("Consolidated group revenue", [12, 15, 10]),
      series("Second series", [900, 940, 520]),
    ];
    const g = layout(model("bar", regions, long));
    expect(g.direct).toBe(false);
    expect(g.legend.map((k: any) => k.name)).toEqual(long.map((s) => s.name));
    for (const s of g.series) expect(s.tag).toBeNull();
    // The legend sits above the plot.
    for (const k of g.legend) expect(k.y).toBeLessThan(g.plot.y);
  });

  it("names a single series nowhere: the caption already does", () => {
    const g = layout(model("column", regions, [three[0]]));
    expect(g.legend).toBeNull();
    expect(g.series[0].tag).toBeNull();
  });

  it("writes a value label on a column only where the label fits the column", () => {
    const wide = layout(model("column", ["a", "b"], [series("s", [10, 20])]));
    expect(wide.series[0].labels.map((l: any) => l.text)).toEqual(["10", "20"]);

    const many = Array.from({ length: 24 }, (_, i) => `c${i}`);
    const narrow = layout(
      model("column", many, [{ name: "s", values: many.map(() => 123456), texts: many.map(() => "123,456 €") }]),
      { width: 320 },
    );
    expect(narrow.series[0].labels).toEqual([]);
  });

  it("writes a negative column's label under it, never into the category row", () => {
    const room = layout(model("column", ["a", "b"], [series("s", [12, -4])]));
    const below = room.series[0].labels.find((l: any) => l.text === "-4");
    expect(below.y).toBeGreaterThan(room.series[0].marks[1].y + room.series[0].marks[1].height);
    expect(below.y).toBeLessThanOrEqual(room.plot.y + room.plot.height);

    // -10 reaches the axis floor: there is no room under it, so no label.
    const full = layout(model("column", ["a", "b"], [series("s", [10, -10])]));
    expect(full.domain[0]).toBe(-10);
    expect(full.series[0].labels.map((l: any) => l.text)).toEqual(["10"]);
  });

  it("places a bar's value label after the bar's end, inside the chart", () => {
    const g = layout(model("bar", regions, three));
    g.series.forEach((s: any) => {
      s.labels.forEach((l: any, i: number) => {
        const m = s.marks[i];
        expect(l.x).toBeGreaterThan(m.x + m.width);
        expect(l.x + textWidth(l.text)).toBeLessThanOrEqual(g.width);
      });
    });
  });

  it("names lines after their ends, spread apart so close values do not collide", () => {
    const lines = [series("Retail", [18, 17, 16]), series("Wholesale", [18, 17, 16.2]), series("Public", [18, 17, 16.4])];
    const g = layout(model("line", ["Jan", "Feb", "Mar"], lines));
    expect(g.legend).toBeNull();
    const ys = g.series.map((s: any) => s.tag.y).sort((a: number, b: number) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(FS + 2 - 0.05);
    for (const s of g.series) expect(s.tag.x).toBeGreaterThanOrEqual(g.plot.x + g.plot.width);
  });

  it("puts a legend under a line chart's names when they would take more than a third of the width", () => {
    const lines = [series("A very long series name indeed", [1, 2]), series("Another long series name", [2, 3])];
    const g = layout(model("line", ["a", "b"], lines), { width: 320 });
    expect(g.legend).not.toBeNull();
    for (const s of g.series) expect(s.tag).toBeNull();
  });
});

// ── Greyscale: dashes for lines ─────────────────────────────────────────────

describe("faqir-chart · lines differ by dash pattern", () => {
  const lines = [series("A", [1, 2, 3]), series("B", [2, 3, 1]), series("C", [3, 1, 2]), series("D", [1, 1, 1])];

  it("gives every line in a group of four its own dash pattern, the first solid", () => {
    const g = layout(model("line", ["x", "y", "z"], lines));
    const dashes = g.series.map((s: any) => s.dash);
    expect(dashes[0]).toBe("");
    expect(new Set(dashes).size).toBe(4);
  });

  it("writes the pattern on each path, and on the legend's sample of it", () => {
    const g = layout(model("line", ["x", "y", "z"], lines), { width: 240 });
    const svg: string = chart.svg(g);
    for (const s of g.series.slice(1)) expect(svg).toContain(`stroke-dasharray="${s.dash}"`);
    if (g.legend) {
      const legend = svg.slice(svg.indexOf('data-part="legend"'));
      expect(legend).toContain(`stroke-dasharray="${g.series[1].dash}"`);
    }
  });

  it("does not dash bars or columns: length already reads in greyscale", () => {
    const g = layout(model("column", ["x"], [series("A", [1]), series("B", [2])]));
    expect(g.series.map((s: any) => s.dash)).toEqual(["", ""]);
  });

  it("breaks a line at a missing value rather than bridging it", () => {
    const g = layout(model("line", ["a", "b", "c", "d"], [series("A", [1, null, 3, 4])]));
    expect(g.series[0].path.match(/M/g)).toHaveLength(2);
    expect(g.series[0].marks).toHaveLength(3);
  });
});

// ── The SVG ─────────────────────────────────────────────────────────────────

describe("faqir-chart · the svg", () => {
  const m = model("bar", ["North", "South"], [series("2024", [1240, 860]), series("2025", [1380, 940])], "Revenue, k€");

  it("is one role=img whose aria-label reads the caption, the kind and every number", () => {
    const g = layout(m);
    const svg: string = chart.svg(g);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('role="img"');
    expect(g.label).toBe("Revenue, k€. Bar chart. 2024: North 1240, South 860; 2025: North 1380, South 940.");
    expect(svg).toContain(`aria-label="${g.label}"`);
  });

  it("carries no colour of its own: every paint comes from the stylesheet's custom properties", () => {
    for (const kind of ["bar", "column", "line"]) {
      const svg: string = chart.svg(layout({ ...m, kind }));
      expect(svg).not.toMatch(/\b(fill|stroke|style|color)=/);
      expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl|oklch/i);
    }
  });

  it("puts every series in its own group under marks, in table order", () => {
    const svg: string = chart.svg(layout(m));
    const marks = svg.slice(svg.indexOf('data-part="marks"'));
    expect(marks.match(/data-part="series"/g)).toHaveLength(2);
  });

  it("escapes the table's text", () => {
    const g = layout(model("column", ["<b>&"], [series('"q"', [1])], "A < B"));
    const svg: string = chart.svg(g);
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("&#60;b&#62;&#38;");
  });

  it("is the same string on every call: deterministic, so a server can render it", () => {
    expect(chart.svg(layout(m))).toBe(chart.svg(layout(m)));
  });
});

// ── Reading the table ───────────────────────────────────────────────────────

describe("faqir-chart · reading the table", () => {
  it("takes series from the header row and categories from the row headers", () => {
    const box = mount(`<figure data-ui="chart" data-variant="bar"><figcaption data-part="caption">Revenue</figcaption>${TABLE}</figure>`);
    const m = chart.read(box.firstElementChild, "en");
    expect(m.kind).toBe("bar");
    expect(m.title).toBe("Revenue");
    expect(m.categories).toEqual(["North", "South"]);
    expect(m.series.map((s: Series) => s.name)).toEqual(["2024", "2025"]);
    expect(m.series[0].values).toEqual([1240, 860]);
    expect(m.series[0].texts).toEqual(["1,240", "860"]);
  });

  it("reads a cell in the page language, and data-value over the text", () => {
    const box = mount(`<figure data-ui="chart">
      <table data-part="data"><thead><tr><th>Month</th><th>Net</th></tr></thead><tbody>
        <tr><th>Jan</th><td>1.240,5 lei</td></tr>
        <tr><th>Feb</th><td>−4,2</td></tr>
        <tr><th>Mar</th><td data-value="7">about seven</td></tr>
        <tr><th>Apr</th><td>n/a</td></tr>
      </tbody></table></figure>`);
    const m = chart.read(box.firstElementChild, "ro");
    expect(m.series[0].values).toEqual([1240.5, -4.2, 7, null]);
  });

  it("defaults the kind to column and answers null for a table with no number", () => {
    const box = mount(`<figure data-ui="chart" data-variant="pyramid"><table data-part="data"><tbody><tr><th>a</th><td>—</td></tr></tbody></table></figure>`);
    expect(chart.read(box.firstElementChild, "en")).toBeNull();
    box.querySelector("td")!.textContent = "3";
    expect(chart.read(box.firstElementChild, "en").kind).toBe("column");
  });
});

// ── The controller ──────────────────────────────────────────────────────────

describe("faqir-chart · the controller", () => {
  it("self-registers through Faqir.plugin and exports the installer and the layout", () => {
    expect(pluginCalls).toBe(1);
    expect(typeof chart).toBe("function");
    expect(typeof chart.createChart).toBe("function");
    expect(typeof chart.layout).toBe("function");
  });

  it("draws the table into the plot, marks the root drawn, and is idempotent", () => {
    const box = mount(`<figure data-ui="chart"><div data-part="plot"></div>${TABLE}</figure>`);
    const root = box.firstElementChild as HTMLElement;
    const api = chart.createChart(root);
    expect(root.dataset.state).toBe("drawn");
    const svg = root.querySelector('[data-part="plot"] > svg')!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toContain("North 1,240");
    expect(root.querySelectorAll('[data-part="mark"]')).toHaveLength(4);
    expect(chart.createChart(root)).toBe(api);
    // The table stays in the document, for assistive technology and print.
    expect(root.querySelector('table[data-part="data"]')).not.toBeNull();
  });

  it("creates the plot before the table when the markup leaves it out", () => {
    const box = mount(`<figure data-ui="chart">${TABLE}</figure>`);
    const root = box.firstElementChild as HTMLElement;
    chart.createChart(root);
    const plot = root.querySelector('[data-part="plot"]')!;
    expect(plot.nextElementSibling?.getAttribute("data-part")).toBe("data");
  });

  it("redraws when the table changes", async () => {
    const box = mount(`<figure data-ui="chart">${TABLE}</figure>`);
    const root = box.firstElementChild as HTMLElement;
    chart.createChart(root);
    root.querySelector("td")!.textContent = "2,000";
    await tick();
    expect(root.querySelector("svg")!.getAttribute("aria-label")).toContain("North 2,000");
  });

  it("destroy() removes the drawing and the state, so the table shows again", () => {
    const box = mount(`<figure data-ui="chart">${TABLE}</figure>`);
    const root = box.firstElementChild as any;
    const api = chart.createChart(root);
    api.destroy();
    expect(root.dataset.state).toBeUndefined();
    expect(root.querySelector("svg")).toBeNull();
    expect(root._faqirChart).toBeUndefined();
  });

  it("leaves a chart with no number undrawn, and one with no table alone", () => {
    const box = mount(`<figure data-ui="chart"><table data-part="data"><tbody><tr><th>a</th><td>—</td></tr></tbody></table></figure><figure data-ui="chart"></figure>`);
    const [empty, bare] = Array.from(box.children) as HTMLElement[];
    expect(chart.createChart(empty).redraw()).toBe(false);
    expect(empty.dataset.state).toBeUndefined();
    expect(chart.createChart(bare)).toBeNull();
  });

  it("is the chart's controller to the engine: initTree starts it and $ui reaches it", () => {
    const box = mount(`<figure data-ui="chart" id="fc-engine">${TABLE}</figure>`);
    Faqir.initTree(box);
    const root = box.firstElementChild as HTMLElement;
    expect(root.dataset.state).toBe("drawn");
    const api = Faqir.ui(root);
    expect(typeof api.redraw).toBe("function");
    expect(typeof api.destroy).toBe("function");
  });
});

// ── The contract around it ──────────────────────────────────────────────────

describe("faqir-chart · manifest, stylesheet and header", () => {
  const source = readFileSync(PLUGIN, "utf8");
  const manifest = JSON.parse(readFileSync(join(CHART, "chart.manifest.json"), "utf8"));
  const css = readFileSync(join(CHART, "chart.css"), "utf8");

  it("declares its controller and API in its header, and the manifest carries that API", () => {
    expect(source).toMatch(/^\/\/ @ui:plugin faqir-chart$/m);
    expect(source).toMatch(/^\/\/ @ui:controller chart$/m);
    expect(manifest.api).toEqual(readControllerApi(source));
    expect(manifest.api.methods.map((m: any) => m.name)).toEqual(["redraw", "destroy"]);
  });

  it("expresses the kind as the variant, within the five-attribute protocol", () => {
    expect(manifest.variants.variant).toMatchObject({ attr: "data-variant", values: ["column", "bar", "line", "area", "stacked-column", "stacked-bar", "pie", "donut", "scatter", "sparkline", "radar", "gauge"], default: "column" });
    expect(JSON.stringify(manifest)).not.toContain("data-kind");
    expect(source).not.toContain("data-kind");
  });

  it("paints from custom properties only: no literal colour in the stylesheet", () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|\blab\(|\blch\(/i);
    expect(body).not.toMatch(/:\s*(black|white|red|green|blue|gray|grey)\b/i);
    expect(body).toContain("color-mix(in oklab, var(--faqir-chart-hue)");
  });

  it("hides the table on screen once drawn, and prints it unless told not to", () => {
    expect(css).toMatch(/\[data-state="drawn"\]:not\(\[data-table="visible"\]\) > \[data-part="data"\] \{[^}]*clip-path: inset\(50%\)/);
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/\[data-state="drawn"\]:not\(\[data-table="hidden"\]\) > \[data-part="data"\] \{[^}]*position: static/);
  });
});
