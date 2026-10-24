// @ui:plugin faqir-chart
// @ui:controller chart
// @ui:provides redraw, destroy
/**
 * faqir-chart — draws a chart's data table as an inline SVG chart. [forecraft #36]
 *
 *   <figure data-ui="chart" data-variant="column">
 *     <figcaption data-part="caption">Revenue, k€</figcaption>
 *     <table data-part="data"> … </table>
 *   </figure>
 *
 * Kinds (data-variant): column, bar, line, area, stacked-column, stacked-bar, pie, donut, scatter, sparkline, radar, gauge.
 *
 * The table is the source of truth and the SVG a progressive enhancement: without this plugin the table is the chart; once it draws, the root takes data-state="drawn", the table stays in the page for assistive technology and paper, and the SVG (role="img", an aria-label that reads the numbers) redraws when the table or the width changes. Colours, type and rules come from the component's custom properties; bar and column value axes start at zero; series differ by lightness, and lines also by dash. Runs with or without faqir-core.
 */
(function () {
  "use strict";

  // One dash pattern per series, so lines survive greyscale even where two
  // lightness bands print close together.
  var DASH = ["", "6 4", "2 3", "9 3 2 3"];
  var KIND = {
    bar: "Bar", column: "Column", line: "Line", area: "Area", "stacked-column": "Stacked column", "stacked-bar": "Stacked bar",
    pie: "Pie", donut: "Donut", scatter: "Scatter", sparkline: "Sparkline", radar: "Radar", gauge: "Gauge",
  };
  var TAU = 2 * Math.PI;

  var text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

  // A direct child part — never one of a nested component's.
  function part(root, name) {
    for (var c = root.firstElementChild; c; c = c.nextElementSibling) {
      if (c.getAttribute("data-part") === name) return c;
    }
    return null;
  }

  /**
   * The chart a root's table describes: { kind, title, categories, series },
   * each series { name, values, texts }, and a gauge's { min, max, thresholds }
   * from the root (NaN / [] when absent). Null when no cell holds a number.
   * A cell's number is its data-value, else its text read in `locale`: the
   * locale's decimal mark kept, grouping and units dropped.
   */
  function read(root, locale) {
    var table = part(root, "data");
    if (!table) return null;
    var mark = (1.5).toLocaleString(locale).charAt(1);
    var num = (cell) => {
      var raw = cell.getAttribute("data-value");
      if (raw == null) {
        raw = text(cell).replace(/−/g, "-").split(mark).map((s) => s.replace(/[^\d-]/g, "")).join(".");
      }
      var n = parseFloat(raw);
      return isFinite(n) ? n : null;
    };
    // The table's own rows, not a descendant query: a chart in another table's
    // cell would otherwise take its header row for a category.
    var own = (section) =>
      [].concat.apply([], Array.from(table.children).filter((c) => c.tagName === section).map((s) => Array.from(s.children).filter((c) => c.tagName === "TR")));
    var head = own("THEAD");
    var names = head.length ? Array.from(head[head.length - 1].cells, text).slice(1) : [];
    var rows = own("TBODY").map((row) => row.cells).filter((cells) => cells.length > 1);
    var series = [];
    var count = Math.max.apply(null, rows.map((cells) => cells.length - 1).concat(0));
    for (var j = 1; j <= count; j++) {
      series.push({
        name: names[j - 1] || "",
        values: rows.map((cells) => (cells[j] ? num(cells[j]) : null)),
        texts: rows.map((cells) => (cells[j] ? text(cells[j]) : "")),
      });
    }
    var kind = root.getAttribute("data-variant");
    var prop = (name) => parseFloat(root.getAttribute("data-" + name));
    return series.some((s) => s.values.some((v) => v != null))
      ? {
          kind: KIND[kind] ? kind : "column",
          title: text(part(root, "caption")) || text(table.caption),
          categories: rows.map((cells) => text(cells[0])),
          series: series,
          min: prop("min"),
          max: prop("max"),
          thresholds: (root.getAttribute("data-thresholds") || "").split(/[\s,]+/).map(parseFloat).filter(isFinite),
        }
      : null;
  }

  // A tick step of 1, 2 or 5 × 10ⁿ giving about five intervals over the domain.
  function scale(lo, hi) {
    if (hi === lo) {
      hi += Math.abs(hi) / 2 || 1;
      lo -= Math.abs(lo) / 2;
    }
    var raw = (hi - lo) / 5;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / mag;
    var step = mag * (f > 5 ? 10 : f > 2 ? 5 : f > 1 ? 2 : 1);
    return {
      lo: Math.floor(lo / step + 1e-9) * step,
      hi: Math.ceil(hi / step - 1e-9) * step,
      step: step,
    };
  }

  /** scale(), with its tick values and their texts in the locale. */
  function axis(lo, hi, locale) {
    var sc = scale(lo, hi);
    var dec = Math.max(0, -Math.floor(Math.log10(sc.step) + 1e-9));
    sc.ticks = [];
    for (var t = sc.lo; t <= sc.hi + sc.step / 2; t += sc.step) sc.ticks.push(+t.toFixed(10));
    sc.texts = sc.ticks.map((v) => v.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }));
    return sc;
  }

  var r = (v) => Math.round(v * 10) / 10;
  var lowest = (a) => Math.min.apply(null, a);
  var highest = (a) => Math.max.apply(null, a);
  var numbers = (list) => [].concat.apply([], list.map((s) => s.values.filter((v) => v != null)));

  /** A sum in the locale, with as many decimals as the most precise addend. */
  function amount(sum, addends, locale) {
    var dec = highest(addends.map((v) => (String(v).split(".")[1] || "").length).concat(0));
    return sum.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  // The label grammar: "Caption. Kind chart. " then, per series, "Name: cat value, …", "; " between.
  var heading = (m) => (m.title ? m.title + ". " : "") + KIND[m.kind] + " chart. ";
  var readout = (list, cats, each) =>
    list
      .map((s) =>
        (list.length > 1 && s.name ? s.name + ": " : "") +
        cats.map((c, i) => (s.texts[i] ? c + " " + (each ? each(s, i) : s.texts[i]) : "")).filter(Boolean).join(", "))
      .join("; ");

  // Legend keys in rows across the top, wrapping at the width.
  function keyRow(names, W, fs, wide) {
    var pad = fs / 2;
    var lx = 0;
    var ly = fs;
    var keys = names.map((name) => {
      var kw = 18 + wide(name);
      if (lx && lx + kw > W) {
        lx = 0;
        ly += fs + pad;
      }
      var key = { x: lx, y: ly, name: name };
      lx += kw + fs;
      return key;
    });
    return { keys: keys, top: ly + pad };
  }

  // Polar geometry: angle 0 at twelve o'clock, growing clockwise.
  var polar = (cx, cy, d, a) => [cx + d * Math.sin(a), cy - d * Math.cos(a)];
  var xy = (p) => r(p[0]) + " " + r(p[1]);
  var bend = (d, a0, a1, back) => "A" + r(d) + " " + r(d) + " 0 " + (a1 - a0 > Math.PI ? 1 : 0) + (back ? " 0 " : " 1 ");
  /** An open arc, for a stroke. */
  var arc = (cx, cy, d, a0, a1) => "M" + xy(polar(cx, cy, d, a0)) + bend(d, a0, a1) + xy(polar(cx, cy, d, a1));
  /** A closed ring sector (a pie slice when the inner radius is 0); a whole turn is two halves. */
  function sector(cx, cy, ro, ri, a0, a1) {
    if (a1 - a0 > TAU - 1e-6) return sector(cx, cy, ro, ri, a0, a0 + Math.PI) + sector(cx, cy, ro, ri, a0 + Math.PI, a1);
    return arc(cx, cy, ro, a0, a1) + (ri > 0 ? "L" + xy(polar(cx, cy, ri, a1)) + bend(ri, a0, a1, true) + xy(polar(cx, cy, ri, a0)) : "L" + r(cx) + " " + r(cy)) + "Z";
  }
  var polygon = (ps) => "M" + ps.map(xy).join("L") + "Z";
  /** The area under each run of points, closed down to `base`. */
  var under = (runs, base) =>
    runs.map((ps) => "M" + r(ps[0][0]) + " " + r(base) + ps.map((p) => "L" + xy(p)).join("") + "L" + r(ps[ps.length - 1][0]) + " " + r(base) + "Z").join("");

  var series = (name) => ({ name: name, dash: "", marks: [], labels: [], path: "", tag: null });

  // What every kind's geometry starts from.
  function context(m, o) {
    var fs = o.fontSize || 12;
    var c = {
      W: Math.max(o.width || 640, m.kind === "sparkline" ? 24 : 240),
      fs: fs,
      pad: fs / 2,
      cats: m.categories,
      list: m.series,
      locale: o.locale,
      wide: (s) => s.length * fs * 0.6,
    };
    c.most = (a) => highest(a.map(c.wide).concat(0));
    c.g = { width: c.W, kind: m.kind, label: "", domain: null, grid: [], axis: [], series: [], legend: null, baseline: null };
    return c;
  }

  /**
   * The chart's geometry, pure: no DOM, the same answer on a server. Options:
   * width (px, default 640), height (column, line, area and scatter), fontSize
   * (px, default 12), locale (tick labels and sums), id (prefix for the area
   * gradients). Text is measured as 0.6 em a character.
   */
  function layout(m, o) {
    o = o || {};
    var kind = m.kind;
    // A radar needs three spokes and a scatter two numeric columns that pair up; anything less is a column chart.
    if (
      (kind === "radar" && m.categories.length < 3) ||
      (kind === "scatter" && !(m.series[1] && m.series[1].values.some((v, i) => v != null && m.series[0].values[i] != null)))
    ) {
      m = Object.assign({}, m, { kind: (kind = "column") });
    }
    if (SHAPES[kind]) return SHAPES[kind](m, o, context(m, o));

    var c = context(m, o);
    var W = c.W;
    var fs = c.fs;
    var pad = c.pad;
    var stack = kind === "stacked-column" || kind === "stacked-bar";
    var bar = kind === "bar" || kind === "stacked-bar";
    var area = kind === "area";
    var line = kind === "line" || area;
    var cats = m.categories;
    var n = cats.length;
    var list = m.series;
    var S = list.length;
    var wide = c.wide;
    var most = c.most;

    var all = [];
    // A stack's extent is its sums: positives stack up from zero, negatives down.
    var ups = [];
    var downs = [];
    if (stack) {
      cats.forEach((_, i) => {
        ups[i] = downs[i] = 0;
        list.forEach((s) => {
          var v = s.values[i];
          if (v > 0) ups[i] += v;
          else if (v < 0) downs[i] += v;
        });
        all.push(ups[i], downs[i]);
      });
    } else list.forEach((s) => s.values.forEach((v) => v != null && all.push(v)));
    var lo = lowest(all);
    var hi = highest(all);
    // Bars, columns and areas encode length: their value axis always holds zero.
    if (!line || area) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    var sc = axis(lo, hi, o.locale);
    var ticks = sc.ticks;
    var tickText = sc.texts;
    var names = list.map((s) => s.name);
    var totals = stack
      ? cats.map((_, i) => {
          var parts = list.map((s) => s.values[i]).filter((v) => v != null);
          return parts.length ? amount(ups[i] + downs[i], parts, o.locale) : "";
        })
      : [];

    var label =
      heading(m) +
      readout(list, cats) +
      (stack && S > 1 ? "; Total: " + cats.map((c, i) => (totals[i] ? c + " " + totals[i] : "")).filter(Boolean).join(", ") : "") +
      ".";

    function draw(legend) {
      var g = { width: W, kind: kind, label: label, domain: [sc.lo, sc.hi], grid: [], axis: [], series: [], legend: null, baseline: null, direct: S > 1 && !legend };
      var top = 0;
      if (legend) {
        var keys = keyRow(names, W, fs, wide);
        g.legend = keys.keys;
        top = keys.top;
      }

      var x0, x1, y0, y1, H, band, val, base;
      var barT = Math.round(fs * 1.5);
      // A stacked bar is one bar per category, a little thicker.
      var stackT = stack ? Math.round(barT * 1.4) : barT;
      if (bar) {
        band = stack ? stackT + barT / 2 : S * barT + barT / 2;
        x0 = Math.min(most(cats), W * 0.35) + pad;
        x1 = W - Math.min(Math.max(most(stack ? totals : [].concat.apply([], list.map((s) => s.texts))), wide(tickText[tickText.length - 1]) / 2), W * 0.25) - pad;
        y0 = top + pad;
        y1 = y0 + n * band;
        H = y1 + fs + pad * 2;
        val = (v) => x0 + ((v - sc.lo) / (sc.hi - sc.lo)) * (x1 - x0);
        base = val(0);
        ticks.forEach((v, i) => {
          g.grid.push({ x1: r(val(v)), y1: r(y0), x2: r(val(v)), y2: r(y1) });
          g.axis.push({ x: r(val(v)), y: r(y1 + fs + pad / 2), text: tickText[i], anchor: "middle" });
        });
        // A category label longer than its column is cut, with an ellipsis.
        var keep = Math.floor((x0 - pad) / (fs * 0.6));
        cats.forEach((c, i) => {
          g.axis.push({ x: r(x0 - pad / 2), y: r(y0 + i * band + band / 2 + fs * 0.35), text: c.length > keep ? c.slice(0, keep - 1) + "…" : c, anchor: "end" });
        });
        g.baseline = { x1: r(base), y1: r(y0), x2: r(base), y2: r(y1) };
      } else {
        var endW = line && S > 1 && !legend ? most(names) + pad * 1.5 : pad;
        if (endW > W * 0.3) return null;
        x0 = most(tickText) + pad;
        x1 = W - endW;
        y0 = top + fs + pad;
        H = top + (o.height || Math.round(Math.min(Math.max(W * 0.5, 200), 360)));
        y1 = H - fs - pad * 2;
        band = (x1 - x0) / n;
        val = (v) => y1 - ((v - sc.lo) / (sc.hi - sc.lo)) * (y1 - y0);
        base = val(Math.min(Math.max(0, sc.lo), sc.hi));
        ticks.forEach((v, i) => {
          g.grid.push({ x1: r(x0), y1: r(val(v)), x2: r(x1), y2: r(val(v)) });
          g.axis.push({ x: r(x0 - pad / 2), y: r(val(v) + fs * 0.35), text: tickText[i], anchor: "end" });
        });
        // Category labels thin out (every k-th) rather than collide.
        var k = Math.ceil((most(cats) + pad) / band);
        cats.forEach((c, i) => {
          if (i % k === 0) g.axis.push({ x: r(x0 + band * (i + 0.5)), y: r(y1 + fs + pad / 2), text: c, anchor: "middle" });
        });
        if (sc.lo <= 0 && sc.hi >= 0) g.baseline = { x1: r(x0), y1: r(val(0)), x2: r(x1), y2: r(val(0)) };
      }
      g.height = Math.round(H);
      g.plot = { x: r(x0), y: r(y0), width: r(x1 - x0), height: r(y1 - y0) };

      var thick = bar ? stackT : stack ? band * 0.6 : (band * 0.8) / S;
      var fits = true;
      var at = -1;
      // Series names go on the first category whose every mark can hold its name.
      if (!line && S > 1 && !legend) {
        for (var c = 0; c < n && at < 0; c++) {
          if (list.every((s) => {
            var v = s.values[c];
            return v > 0 && Math.abs(val(v) - base) >= wide(s.name) + pad * 2 && thick >= fs + 2;
          })) at = c;
        }
        fits = at >= 0;
      }

      // Where each stack has reached, up and down, as the series are laid on it.
      var up = cats.map(() => 0);
      var down = cats.map(() => 0);
      list.forEach((s, j) => {
        var out = { name: s.name, dash: line ? DASH[j % 4] : "", marks: [], labels: [], path: "", tag: null };
        var pen = "M";
        var last = null;
        var runs = [];
        s.values.forEach((v, i) => {
          if (v == null) {
            pen = "M";
            return;
          }
          var t = s.texts[i];
          var tw = wide(t);
          var e = val(v);
          if (stack) {
            var from = v < 0 ? down[i] : up[i];
            if (v < 0) down[i] += v;
            else up[i] += v;
            var a = val(from);
            var b = val(from + v);
            var len = Math.abs(b - a);
            var y = bar ? y0 + i * band + barT / 4 : 0;
            var x = bar ? 0 : x0 + i * band + band * 0.2;
            out.marks.push(bar
              ? { x: r(Math.min(a, b)), y: r(y), width: r(len), height: r(stackT - 1), title: cats[i] + ", " + s.name + " " + t }
              : { x: r(x), y: r(Math.min(a, b)), width: r(Math.max(thick - 1, 1)), height: r(len), title: cats[i] + ", " + s.name + " " + t });
            // The name on the first category that holds every name, else the value where it fits.
            if (i === at) out.tag = bar
              ? { x: r(Math.min(a, b) + pad), y: r(y + stackT / 2 + fs * 0.35), text: s.name, anchor: "start" }
              : { x: r(x + thick / 2 + fs * 0.35), y: r(Math.max(a, b) - pad), text: s.name, anchor: "start", rotate: true };
            else if (bar ? len >= tw + pad && stackT >= fs + 2 : len >= fs + 2 && thick >= tw + pad) {
              out.labels.push(bar
                ? { x: r((a + b) / 2), y: r(y + stackT / 2 + fs * 0.35), text: t, anchor: "middle" }
                : { x: r(x + thick / 2), y: r((a + b) / 2 + fs * 0.35), text: t, anchor: "middle" });
            }
          } else if (bar) {
            var y = y0 + i * band + barT / 4 + j * barT;
            var lx = v < 0 ? e - pad / 2 : e + pad / 2;
            out.marks.push({ x: r(Math.min(e, base)), y: r(y), width: r(Math.abs(e - base)), height: r(barT - 1) });
            if (v < 0 ? lx - tw >= x0 : lx + tw <= W) out.labels.push({ x: r(lx), y: r(y + barT / 2 + fs * 0.35), text: t, anchor: v < 0 ? "end" : "start" });
            if (i === at) out.tag = { x: r(base + pad), y: r(y + barT / 2 + fs * 0.35), text: s.name, anchor: "start" };
          } else if (line) {
            var px = x0 + band * (i + 0.5);
            out.path += pen + r(px) + " " + r(e);
            if (area) {
              if (pen === "M") runs.push([]);
              runs[runs.length - 1].push([px, e]);
            }
            pen = "L";
            last = e;
            out.marks.push({ cx: r(px), cy: r(e), r: 3 });
            if (S === 1 && band >= most(s.texts) + 4) out.labels.push({ x: r(px), y: r(e - pad), text: t, anchor: "middle" });
          } else {
            var x = x0 + i * band + band * 0.1 + j * thick;
            out.marks.push({ x: r(x), y: r(Math.min(e, base)), width: r(Math.max(thick - 1, 1)), height: r(Math.abs(e - base)) });
            // Above a column, below a negative one — and never into the category row.
            if (tw <= (S === 1 ? band : thick) - 2 && (v >= 0 || e + fs <= y1)) out.labels.push({ x: r(x + thick / 2), y: r(v < 0 ? e + fs : e - pad / 2), text: t, anchor: "middle" });
            if (i === at) out.tag = { x: r(x + thick / 2 + fs * 0.35), y: r(base - pad), text: s.name, anchor: "start", rotate: true };
          }
        });
        if (line && S > 1 && !legend && last != null) out.tag = { x: r(x1 + pad / 2), y: last + fs * 0.35, text: s.name, anchor: "start" };
        if (area) {
          out.area = under(runs, base);
          out.grad = (o.id || "faqir-chart") + "-" + j;
        }
        g.series.push(out);
      });

      // A stack's total sits past its outer end, where the stack points.
      if (stack) {
        g.totals = [];
        cats.forEach((_, i) => {
          if (!totals[i]) return;
          var upward = ups[i] > 0 || !downs[i];
          var end = val(upward ? ups[i] : downs[i]);
          if (bar) g.totals.push({ x: r(end + (upward ? pad / 2 : -pad / 2)), y: r(y0 + i * band + barT / 4 + stackT / 2 + fs * 0.35), text: totals[i], anchor: upward ? "start" : "end" });
          else if (wide(totals[i]) <= band - 2) g.totals.push({ x: r(x0 + i * band + band / 2), y: r(upward ? end - pad / 2 : end + fs), text: totals[i], anchor: "middle" });
        });
      }

      // End-of-line names: spread apart so none collides, inside the chart.
      if (line && S > 1 && !legend) {
        var tags = g.series.map((s) => s.tag).filter(Boolean).sort((a, b) => a.y - b.y);
        tags.forEach((t, i) => {
          if (i && t.y < tags[i - 1].y + fs + 2) t.y = tags[i - 1].y + fs + 2;
          t.y = r(t.y);
        });
        fits = !tags.length || (tags[0].y >= fs && tags[tags.length - 1].y <= H - pad);
      }
      return legend || fits ? g : null;
    }

    return draw(false) || draw(true);
  }

  // The kinds that are not a value axis against categories.
  var SHAPES = {};

  /**
   * Pie and donut: one ring per series (the first outermost), a slice per
   * category; a category's slices share one band, so its key and its slices
   * match. A legend beside (or under) reads each value and its share; a single
   * donut carries its total in the hole.
   */
  SHAPES.pie = SHAPES.donut = (m, o, c) => {
    var g = c.g;
    var W = c.W;
    var fs = c.fs;
    var pad = c.pad;
    var cats = c.cats;
    var list = c.list;
    var S = list.length;
    var donut = m.kind === "donut";
    var sums = list.map((s) => s.values.reduce((a, v) => a + (v > 0 ? v : 0), 0));
    var share = (v, sum) => {
      var p = sum > 0 && v > 0 ? v / sum : 0;
      return p.toLocaleString(c.locale, { style: "percent", maximumFractionDigits: p && p < 0.1 ? 1 : 0 });
    };
    var first = list[0];
    var total = amount(sums[0], first.values.filter((v) => v > 0), c.locale);
    g.label = heading(m) + readout(list, cats, (s, i) => s.texts[i] + " (" + share(s.values[i], sums[list.indexOf(s)]) + ")") + (S === 1 ? "; total " + total : "") + ".";

    // A single ring's legend reads each value and its share, in two columns.
    var values = cats.map((_, i) => (S === 1 ? first.texts[i] : ""));
    var shares = cats.map((_, i) => (S === 1 && first.texts[i] ? share(first.values[i], sums[0]) : ""));
    var vw = c.most(values);
    var sw = c.most(shares);
    var lw = 18 + c.most(cats) + (S === 1 ? fs * 1.5 + vw + fs + sw : 0);
    var rowH = fs + pad * 1.5;
    // The legend beside the circle where both fit, else under it; either way centred as one block.
    var side = W - lw - fs * 2 >= 150;
    var D = Math.min(side ? W - lw - fs * 2 : W - 2, 280);
    var H = side ? Math.max(D, cats.length * rowH) + 2 : D + fs + cats.length * rowH + 2;
    var R = D / 2;
    var left = side ? Math.max((W - D - fs * 2 - lw) / 2, 0) : 0;
    var cx = side ? left + R + 1 : W / 2;
    var cy = side ? H / 2 : R + 1;
    var lx = side ? left + D + fs * 2 : Math.max((W - lw) / 2, 0);
    var ly = side ? (H - cats.length * rowH) / 2 + fs : D + fs * 2;
    g.legend = cats.map((name, i) => ({ x: r(lx), y: r(ly + i * rowH), name: name, value: values[i], vx: r(lx + lw - sw - fs), share: shares[i], sx: r(lx + lw) }));
    g.height = Math.round(H);
    g.plot = { x: r(cx - R), y: r(cy - R), width: r(D), height: r(D) };

    var inner = donut ? R * 0.6 : 0;
    var ring = (R - inner) / S;
    g.series = cats.map(series);
    list.forEach((s, j) => {
      var ro = R - j * ring;
      var ri = j < S - 1 ? ro - ring + 2 : inner;
      var a = 0;
      if (!sums[j]) g.grid.push({ tag: "path", d: sector(cx, cy, ro, ri, 0, TAU) });
      s.values.forEach((v, i) => {
        if (!(v > 0) || !sums[j]) return;
        var sweep = (v / sums[j]) * TAU;
        var slice = g.series[i];
        slice.marks.push({ tag: "path", d: sector(cx, cy, ro, ri, a, a + sweep), title: (S > 1 && s.name ? s.name + ", " : "") + cats[i] + " " + s.texts[i] + " (" + share(v, sums[j]) + ")" });
        // The share inside its slice, where the slice can hold it.
        var mid = a + sweep / 2;
        var d = ri ? (ro + ri) / 2 : ro * 0.64;
        var p = share(v, sums[j]);
        if (sweep * d >= c.wide(p) + pad && ro - ri >= fs + 4) {
          var q = polar(cx, cy, d, mid);
          slice.labels.push({ x: r(q[0]), y: r(q[1] + fs * 0.35), text: p, anchor: "middle" });
        }
        a += sweep;
      });
    });
    // A single donut's total, and what it counts, in the hole — where they fit.
    var room = inner * 1.7;
    if (donut && S === 1 && c.wide(total) * 2 <= room) {
      g.totals = [{ x: r(cx), y: r(cy + (c.wide(first.name) <= room ? fs * 0.2 : fs * 0.7)), text: total, anchor: "middle" }];
      if (first.name && c.wide(first.name) <= room) g.totals.push({ x: r(cx), y: r(cy + fs * 1.6), text: first.name, anchor: "middle", part: "name" });
    }
    return g;
  };

  /**
   * Scatter: a point per row, x from the first value column, y from the
   * second, and a third column (when there is one) sizes it as a bubble, by
   * area. Points are named beside themselves where the name collides with nothing.
   */
  SHAPES.scatter = (m, o, c) => {
    var g = c.g;
    var W = c.W;
    var fs = c.fs;
    var pad = c.pad;
    var X = c.list[0];
    var Y = c.list[1];
    var Z = c.list[2];
    var pts = c.cats
      .map((name, i) => ({ name: name, i: i, x: X.values[i], y: Y.values[i], z: Z ? Math.abs(Z.values[i] || 0) : 0 }))
      .filter((p) => p.x != null && p.y != null);
    g.label = heading(m) + c.cats.map((name, i) => {
      var vals = c.list.map((s) => (s.texts[i] ? s.name + " " + s.texts[i] : "")).filter(Boolean);
      return vals.length ? name + ": " + vals.join(", ") : "";
    }).filter(Boolean).join("; ") + ".";

    // Headroom past the outermost points (never across zero), so no bubble sits on an edge.
    var room = (vals) => {
      var lo = lowest(vals);
      var hi = highest(vals);
      var d = (hi - lo || Math.abs(hi) || 1) * 0.06;
      return axis(lo >= 0 ? Math.max(lo - d, 0) : lo - d, hi <= 0 ? Math.min(hi + d, 0) : hi + d, c.locale);
    };
    var sx = room(pts.map((p) => p.x));
    var sy = room(pts.map((p) => p.y));
    var H = o.height || Math.round(Math.min(Math.max(W * 0.6, 220), 380));
    var x0 = c.most(sy.texts) + pad;
    var x1 = W - Math.max(c.wide(sx.texts[sx.texts.length - 1]) / 2, pad);
    var y0 = fs * 2;
    var y1 = H - fs * 2.5 - pad * 2;
    var vx = (v) => x0 + ((v - sx.lo) / (sx.hi - sx.lo)) * (x1 - x0);
    var vy = (v) => y1 - ((v - sy.lo) / (sy.hi - sy.lo)) * (y1 - y0);
    var every = Math.ceil((c.most(sx.texts) + pad) / ((x1 - x0) / Math.max(sx.ticks.length - 1, 1)));
    sx.ticks.forEach((t, k) => {
      g.grid.push({ x1: r(vx(t)), y1: r(y0), x2: r(vx(t)), y2: r(y1) });
      if (k % every === 0) g.axis.push({ x: r(vx(t)), y: r(y1 + fs + pad / 2), text: sx.texts[k], anchor: "middle" });
    });
    sy.ticks.forEach((t, k) => {
      g.grid.push({ x1: r(x0), y1: r(vy(t)), x2: r(x1), y2: r(vy(t)) });
      g.axis.push({ x: r(x0 - pad / 2), y: r(vy(t) + fs * 0.35), text: sy.texts[k], anchor: "end" });
    });
    // The axes are named by their columns: x at the end of its axis, y above its own.
    g.axis.push({ x: r(x1), y: r(H - pad), text: X.name, anchor: "end", part: "title" }, { x: 0, y: r(fs), text: Y.name + (Z ? " (size: " + Z.name + ")" : ""), anchor: "start", part: "title" });
    g.height = H;
    g.domain = [sy.lo, sy.hi];
    g.plot = { x: r(x0), y: r(y0), width: r(x1 - x0), height: r(y1 - y0) };

    var zmax = highest(pts.map((p) => p.z).concat(0));
    var big = Math.max(6, Math.min(24, (x1 - x0) / 14));
    var size = (p) => (zmax ? 3 + Math.sqrt(p.z / zmax) * (big - 3) : 4);
    var out = series(Y.name);
    // The largest first, so a small bubble is never hidden under a big one.
    pts.slice().sort((a, b) => size(b) - size(a)).forEach((p) => {
      out.marks.push({ tag: "circle", cx: r(vx(p.x)), cy: r(vy(p.y)), r: r(size(p)), title: p.name + ": " + c.list.map((s) => s.texts[p.i] && s.name + " " + s.texts[p.i]).filter(Boolean).join(", ") });
    });
    var taken = [];
    if (pts.length <= 30) pts.forEach((p) => {
      var cx = vx(p.x);
      var cy = vy(p.y);
      var w = c.wide(p.name);
      [1, -1].some((side) => {
        var x = cx + side * (size(p) + 3);
        var box = [side > 0 ? x : x - w, cy - fs / 2, w, fs];
        var clear = box[0] >= x0 && box[0] + w <= W && box[1] >= y0 - fs && box[1] + fs <= y1 &&
          taken.every((t) => box[0] >= t[0] + t[2] || t[0] >= box[0] + w || box[1] >= t[1] + t[3] || t[1] >= box[1] + fs);
        if (clear) {
          taken.push(box);
          out.labels.push({ x: r(x), y: r(cy + fs * 0.35), text: p.name, anchor: side > 0 ? "start" : "end" });
        }
        return clear;
      });
    });
    g.series = [out];
    return g;
  };

  /**
   * Sparkline: the shape of a series and nothing else — no axes, no labels, a
   * dot on the last value. Its height follows its width, for a stat or a cell.
   */
  SHAPES.sparkline = (m, o, c) => {
    var g = c.g;
    var W = c.W;
    // Its height follows its width — and stays a line's height in a table cell.
    var H = Math.round(o.cell ? c.fs * 2.4 : Math.min(Math.max(W * 0.25, c.fs * 2), c.fs * 4));
    var p = 4;
    var n = c.cats.length;
    var all = numbers(c.list);
    var lo = lowest(all);
    var hi = highest(all);
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    var X = (i) => (n > 1 ? p + (i * (W - 2 * p)) / (n - 1) : W / 2);
    var Y = (v) => p + ((hi - v) / (hi - lo)) * (H - 2 * p);
    g.label = heading(m) + readout(c.list, c.cats) + ".";
    g.height = H;
    g.domain = [lo, hi];
    g.plot = { x: 0, y: 0, width: W, height: H };
    g.series = c.list.map((s, j) => {
      var out = series(s.name);
      var pen = "M";
      var end = -1;
      var runs = [];
      s.values.forEach((v, i) => {
        if (v == null) {
          pen = "M";
          return;
        }
        if (pen === "M") runs.push([]);
        runs[runs.length - 1].push([X(i), Y(v)]);
        out.path += pen + r(X(i)) + " " + r(Y(v));
        pen = "L";
        end = i;
      });
      out.dash = DASH[j % 4];
      // One series gets the soft fill under it; several would muddy each other.
      if (c.list.length === 1) {
        out.area = under(runs, H);
        out.grad = (o.id || "faqir-chart") + "-" + j;
      }
      if (end >= 0) out.marks.push({ tag: "circle", cx: r(X(end)), cy: r(Y(s.values[end])), r: 3, title: c.cats[end] + " " + s.texts[end] });
      return out;
    });
    return g;
  };

  /** Radar: a spoke per category, rings at the value ticks, a closed polygon per series. */
  SHAPES.radar = (m, o, c) => {
    var g = c.g;
    var W = c.W;
    var fs = c.fs;
    var pad = c.pad;
    var cats = c.cats;
    var n = cats.length;
    var list = c.list;
    var all = numbers(list);
    var sc = axis(Math.min(lowest(all), 0), highest(all), c.locale);
    var top = 0;
    if (list.length > 1) {
      var keys = keyRow(list.map((s) => s.name), W, fs, c.wide);
      g.legend = keys.keys;
      top = keys.top;
    }
    var keep = Math.max(4, Math.floor((W * 0.22) / (fs * 0.6)));
    var names = cats.map((x) => (x.length > keep ? x.slice(0, keep - 1) + "…" : x));
    var R = Math.max(40, Math.min(W / 2 - c.most(names) - fs, 150));
    var cx = W / 2;
    var cy = top + fs * 1.5 + pad + R;
    var angle = (i) => (i * TAU) / n;
    var far = (v) => ((Math.max(v, sc.lo) - sc.lo) / (sc.hi - sc.lo)) * R;
    g.label = heading(m) + readout(list, cats) + ".";
    g.height = Math.round(cy + R + fs * 1.5 + pad);
    g.domain = [sc.lo, sc.hi];
    g.plot = { x: r(cx - R), y: r(cy - R), width: r(2 * R), height: r(2 * R) };
    sc.ticks.forEach((t, k) => {
      if (t === sc.lo) return;
      g.grid.push({ tag: "path", d: polygon(cats.map((_, i) => polar(cx, cy, far(t), angle(i)))) });
      // Tick values run up between the first two spokes, clear of the spoke names.
      var q = polar(cx, cy, far(t), Math.PI / n);
      g.axis.push({ x: r(q[0] + 3), y: r(q[1] + fs * 0.35), text: sc.texts[k], anchor: "start" });
    });
    cats.forEach((_, i) => {
      var a = angle(i);
      var end = polar(cx, cy, R, a);
      var l = polar(cx, cy, R + pad, a);
      g.grid.push({ x1: r(cx), y1: r(cy), x2: r(end[0]), y2: r(end[1]) });
      g.axis.push({
        x: r(l[0]),
        y: r(l[1] + (Math.cos(a) > 0.5 ? -2 : Math.cos(a) < -0.5 ? fs : fs * 0.35)),
        text: names[i],
        anchor: Math.sin(a) > 0.1 ? "start" : Math.sin(a) < -0.1 ? "end" : "middle",
      });
    });
    g.series = list.map((s, j) => {
      var out = series(s.name);
      var ps = s.values.map((v, i) => polar(cx, cy, far(v == null ? sc.lo : v), angle(i)));
      out.path = polygon(ps);
      // Polygons, like lines, differ by dash as well as by band.
      out.dash = DASH[j % 4];
      ps.forEach((q, i) => {
        if (s.values[i] != null) out.marks.push({ tag: "circle", cx: r(q[0]), cy: r(q[1]), r: 3, title: (list.length > 1 ? s.name + ", " : "") + cats[i] + " " + s.texts[i] });
      });
      return out;
    });
    return g;
  };

  /**
   * Gauge: a half ring from data-min to data-max (default 0 to 100) filled to
   * the value, one per row of the first value column; data-thresholds splits an
   * outer scale into zones and notches the ring where each one starts.
   */
  SHAPES.gauge = (m, o, c) => {
    var g = c.g;
    var W = c.W;
    var fs = c.fs;
    var pad = c.pad;
    var s = c.list[0];
    var items = c.cats.map((name, i) => ({ name: name, v: s.values[i], t: s.texts[i] })).filter((d) => d.v != null);
    var vals = items.map((d) => d.v);
    var lo = isFinite(m.min) ? m.min : Math.min(lowest(vals), 0);
    var hi = isFinite(m.max) ? m.max : lo >= 0 && highest(vals) <= 100 ? 100 : scale(lo, highest(vals)).hi;
    if (!(hi > lo)) hi = lo + 1;
    var marks = (m.thresholds || []).filter((t) => t > lo && t < hi).sort((a, b) => a - b);
    var span = lo.toLocaleString(c.locale) + "–" + hi.toLocaleString(c.locale);
    g.label = heading(m) + items.map((d) => d.name + " " + d.t).join(", ") + " (" + span + ").";

    var cols = Math.max(1, Math.min(items.length, Math.floor(W / 160)));
    var cw = W / cols;
    var R = Math.max(30, Math.min(cw / 2 - fs * 1.5, 120));
    var T = Math.max(8, R * 0.2);
    var lift = T / 2 + (marks.length ? 8 : 2);
    var rowH = lift + R + fs * 3.2 + pad;
    var A = (v) => -Math.PI / 2 + Math.min(Math.max((v - lo) / (hi - lo), 0), 1) * Math.PI;
    var edges = [lo].concat(marks, [hi]);
    g.height = Math.round(Math.ceil(items.length / cols) * rowH);
    g.domain = [lo, hi];
    g.plot = { x: 0, y: 0, width: W, height: g.height };
    g.totals = [];
    g.series = items.map((d, k) => {
      var out = series(d.name);
      var cx = cw * ((k % cols) + 0.5);
      var cy = Math.floor(k / cols) * rowH + lift + R;
      out.marks.push({ tag: "path", part: "track", d: arc(cx, cy, R, -Math.PI / 2, Math.PI / 2), "stroke-width": r(T) });
      if (marks.length) edges.slice(1).forEach((e, z) => {
        out.marks.push({ tag: "path", part: "zone", d: arc(cx, cy, R + T / 2 + 5, A(edges[z]) + 0.02, A(e) - 0.02), "stroke-width": 3 });
      });
      if (d.v > lo) out.marks.push({ tag: "path", d: arc(cx, cy, R, -Math.PI / 2, A(d.v)), "stroke-width": r(T), title: d.name + " " + d.t });
      marks.forEach((t) => {
        var p = polar(cx, cy, R - T / 2 - 1, A(t));
        var q = polar(cx, cy, R + T / 2 + 7, A(t));
        out.marks.push({ tag: "line", part: "tick", x1: r(p[0]), y1: r(p[1]), x2: r(q[0]), y2: r(q[1]) });
      });
      g.totals.push(
        { x: r(cx), y: r(cy - fs * 0.3), text: d.t, anchor: "middle" },
        { x: r(cx), y: r(cy + fs * 1.4), text: d.name, anchor: "middle", part: "name" },
      );
      g.axis.push(
        { x: r(cx - R), y: r(cy + fs * 1.4), text: lo.toLocaleString(c.locale), anchor: "middle" },
        { x: r(cx + R), y: r(cy + fs * 1.4), text: hi.toLocaleString(c.locale), anchor: "middle" },
      );
      return out;
    });
    return g;
  };

  var esc = (s) => String(s).replace(/[&<>"]/g, (c) => "&#" + c.charCodeAt(0) + ";");

  function el(tag, a, inner) {
    var s = "<" + tag;
    for (var k in a) if (a[k] !== "" && a[k] != null) s += " " + k + '="' + esc(a[k]) + '"';
    return s + (inner == null ? "/>" : ">" + inner + "</" + tag + ">");
  }

  var words = (t, part) =>
    el("text", { "data-part": t.part || part, x: t.x, y: t.y, "text-anchor": t.anchor, transform: t.rotate ? "rotate(-90 " + t.x + " " + t.y + ")" : "" }, esc(t.text));

  // A drawn shape: its tag (else `tag`), its part (else `part`) and a hover title; the rest are attributes.
  function shape(o, part, tag) {
    var a = { "data-part": o.part || part };
    for (var k in o) if (k !== "tag" && k !== "part" && k !== "title") a[k] = o[k];
    return el(o.tag || tag, a, o.title ? el("title", {}, esc(o.title)) : null);
  }

  /** The SVG markup for a layout — a string, so a server can emit it too. */
  function svg(g) {
    var line = g.kind === "line";
    var dots = line || g.kind === "area";
    var out =
      el("g", { "data-part": "grid" }, g.grid.map((l) => shape(l, "", "line")).join("")) +
      el("g", { "data-part": "axis" }, g.axis.map((t) => words(t)).join("")) +
      el("g", { "data-part": "marks" }, g.series.map((s) =>
        el("g", { "data-part": "series" },
          (s.grad
            ? el("linearGradient", { id: s.grad, x1: 0, y1: 0, x2: 0, y2: 1 }, el("stop", { "data-part": "stop", offset: 0 }) + el("stop", { "data-part": "stop", offset: 1 })) +
              el("path", { "data-part": "area", d: s.area, fill: "url(#" + s.grad + ")" })
            : "") +
          (dots || s.path ? el("path", { "data-part": "line", d: s.path, "stroke-dasharray": s.dash }) : "") +
          s.marks.map((m) => shape(m, "mark", dots ? "circle" : "rect")).join("") +
          s.labels.map((t) => words(t, "label")).join("") +
          (s.tag ? words(s.tag, "name") : ""))).join(""));
    if (g.baseline) out += el("line", Object.assign({ "data-part": "baseline" }, g.baseline));
    if (g.totals) out += el("g", { "data-part": "totals" }, g.totals.map((t) => words(t, "total")).join(""));
    if (g.legend) {
      out += el("g", { "data-part": "legend" }, g.legend.map((k, j) => {
        var y = k.y - 4;
        var swatch = line
          ? el("line", { "data-part": "swatch", x1: k.x, y1: y, x2: k.x + 14, y2: y, "stroke-dasharray": DASH[j % 4] })
          : el("rect", { "data-part": "swatch", x: k.x, y: y - 5, width: 10, height: 10 });
        return el("g", { "data-part": "key" }, swatch + el("text", { x: k.x + 18, y: k.y }, esc(k.name)) +
          (k.value ? el("text", { "data-part": "amount", x: k.vx, y: k.y, "text-anchor": "end" }, esc(k.value)) : "") +
          (k.share ? el("text", { "data-part": "share", x: k.sx, y: k.y, "text-anchor": "end" }, esc(k.share)) : ""));
      }).join(""));
    }
    return el("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 " + g.width + " " + g.height, width: g.width, height: g.height, role: "img", "aria-label": g.label }, out);
  }

  var drawn = 0;

  /**
   * The controller: draws `root`'s table into its plot part and keeps it drawn.
   * Idempotent; returns the existing API on a second call.
   */
  function createChart(root) {
    if (root._faqirChart) return root._faqirChart;
    var table = part(root, "data");
    if (!table) return null;
    var plot = part(root, "plot");
    if (!plot) {
      plot = document.createElement("div");
      plot.setAttribute("data-part", "plot");
      root.insertBefore(plot, table);
    }
    var lang = root.closest("[lang]");
    var locale = lang ? lang.getAttribute("lang") : undefined;
    // The area gradients' ids, unique on the page.
    var id = "faqir-chart-" + ++drawn;
    // A chart inside a table cell (a sparkline beside its figure) draws compact.
    var cell = !!(root.parentElement && root.parentElement.closest("td, th"));
    var width = 0;
    // The plot's width is the root's content width: the plot itself is
    // display: none while it is empty, so it cannot be measured before a draw.
    var inner = () => {
      var cs = getComputedStyle(root);
      return root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    };
    var mo = typeof MutationObserver === "function" && new MutationObserver(redraw);
    var ro = typeof ResizeObserver === "function" && new ResizeObserver(() => {
      if (Math.abs(inner() - width) >= 1) redraw();
    });

    /** Read the data table again and redraw the chart; false when it holds no number. */
    function redraw() {
      var m = read(root, locale);
      width = inner();
      if (!m) {
        plot.innerHTML = "";
        delete root.dataset.state;
        return false;
      }
      plot.innerHTML = svg(layout(m, { width: width || 640, fontSize: parseFloat(getComputedStyle(plot).fontSize), locale: locale, id: id, cell: cell }));
      root.dataset.state = "drawn";
      return true;
    }

    /** Stop watching the table, remove the drawing and show the table again. */
    function destroy() {
      if (mo) mo.disconnect();
      if (ro) ro.disconnect();
      plot.innerHTML = "";
      delete root.dataset.state;
      delete root._faqirChart;
    }

    var api = { redraw: redraw, destroy: destroy };
    root._faqirChart = api;
    redraw();
    if (mo) mo.observe(table, { childList: true, subtree: true, characterData: true, attributes: true });
    if (ro) ro.observe(root);
    return api;
  }

  function sweep() {
    if (typeof document !== "undefined") document.querySelectorAll('[data-ui="chart"]').forEach(createChart);
  }

  function install(Faqir) {
    Faqir.controller("chart", createChart);
    sweep();
  }

  install.createChart = createChart;
  install.read = read;
  install.layout = layout;
  install.svg = svg;

  // CommonJS / bundler export (tests import the installer and the pure layout).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = install;
  }

  // Browser registration: through faqir-core when it is there, else on its own.
  var F =
    (typeof globalThis !== "undefined" && globalThis.Faqir) ||
    (typeof window !== "undefined" && window.Faqir);
  if (F && typeof F.controller === "function") {
    F.plugin(install);
  } else if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sweep);
    else sweep();
  }
})();
