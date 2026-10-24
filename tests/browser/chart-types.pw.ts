/**
 * chart 1.1 — the nine new kinds, measured from what Chromium paints.
 *
 * The reference fragment renders with the full framework sheet, the engine and
 * faqir-chart. Every claim is read off the page: each kind draws and its
 * aria-label reads every cell, its marks stay inside its drawing, its labels
 * collide with nothing, a donut's and a pie's slices make one full turn, a
 * gauge's arc ends where its value says, a sparkline in a table cell stays a
 * line's height and leaves its table off screen and paper, the hover emphasis
 * is presentational and still under reduced motion, and the drawing redraws
 * at a new width.
 *
 * Run: `PW_BASE=browser bunx playwright test --config=playwright.wsl.config.ts chart-types`
 */

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY, sanitizeFragment } from "../visual/matrix";
import { livePage } from "./harness";

const REFERENCE = sanitizeFragment(readFileSync(join(REGISTRY, "primitives/chart/chart.html"), "utf8"));
const KINDS = ["area", "stacked-column", "stacked-bar", "pie", "donut", "scatter", "sparkline", "radar", "gauge"];

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

async function open(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(livePage(REFERENCE, { plugins: ["chart"], css: width < 600 ? "main.smoke-root { padding: 16px; }" : "" }), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  // A ResizeObserver reports at a rendering opportunity, which a headless
  // Chromium that paints no frames (WSL) never reaches; a table cell's width
  // settles only once its chart's table has left it. Redrawing by hand keeps
  // the geometry current either way.
  await page.evaluate(() => {
    for (let k = 0; k < 2; k++) document.querySelectorAll('[data-ui="chart"]').forEach((c: any) => c._faqirChart?.redraw());
  });
}

test.describe("faqir-chart's new kinds in Chromium", () => {
  test("every kind draws one role=img whose aria-label reads every cell", async ({ page }) => {
    await open(page);
    for (const kind of KINDS) {
      const facts = await page.evaluate((kind) =>
        Array.from(document.querySelectorAll(`[data-ui="chart"][data-variant="${kind}"]`)).map((root) => {
          const svg = root.querySelector('[data-part="plot"] > svg');
          const cells = Array.from(root.querySelectorAll('[data-part="data"] tbody th, [data-part="data"] tbody td'), (c) =>
            c.textContent!.replace(/\s+/g, " ").trim(),
          );
          return { state: root.getAttribute("data-state"), role: svg?.getAttribute("role"), label: svg?.getAttribute("aria-label") ?? "", cells };
        }),
      kind);
      expect(facts.length, kind).toBeGreaterThan(0);
      for (const f of facts) {
        expect(f.state, kind).toBe("drawn");
        expect(f.role, kind).toBe("img");
        // A gauge reads its first value column, which is every value its table holds here.
        for (const cell of f.cells) expect(f.label, `${kind}: ${cell}`).toContain(cell);
      }
    }
  });

  test("marks stay inside their drawing, at a desktop width and a phone's", async ({ page }) => {
    for (const width of [1280, 390]) {
      await open(page, width);
      const escapes = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll('[data-ui="chart"][data-state="drawn"]').forEach((root) => {
          const svg = root.querySelector('[data-part="plot"] > svg')!.getBoundingClientRect();
          root.querySelectorAll('[data-part="mark"], [data-part="area"], [data-part="line"], [data-part="track"]').forEach((m) => {
            const r = m.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return;
            const slack = 3;
            if (r.left < svg.left - slack || r.right > svg.right + slack || r.top < svg.top - slack || r.bottom > svg.bottom + slack) {
              out.push(`${root.getAttribute("data-variant")} ${m.getAttribute("data-part")} ${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(svg.left)}..${Math.round(svg.right)}`);
            }
          });
          // And the drawing stays inside the page.
          if (svg.right > document.documentElement.clientWidth + 1) out.push(`${root.getAttribute("data-variant")} svg bleeds`);
        });
        return out;
      });
      expect(escapes, `@${width}`).toEqual([]);
    }
  });

  test("labels, totals, names and legend text collide with nothing", async ({ page }) => {
    for (const width of [1280, 390]) {
      await open(page, width);
      const hits = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll('[data-ui="chart"][data-state="drawn"]').forEach((root) => {
          const kind = root.getAttribute("data-variant") || "column";
          const texts = Array.from(root.querySelectorAll('[data-part="label"], [data-part="total"], [data-part="name"], [data-part="key"] > text, [data-part="title"]'));
          const boxes = texts.map((t) => {
            const r = t.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, text: t.textContent };
          });
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i];
              const b = boxes[j];
              if (a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5) {
                out.push(`${kind}: "${a.text}" × "${b.text}"`);
              }
            }
        });
        return out;
      });
      expect(hits, `@${width}`).toEqual([]);
    }
  });

  test("a pie's and a donut's slices make one full turn, starting at twelve o'clock", async ({ page }) => {
    await open(page);
    for (const kind of ["pie", "donut"]) {
      const turn = await page.evaluate((kind) => {
        const root = document.querySelector(`[data-ui="chart"][data-variant="${kind}"]`)!;
        const slices = Array.from(root.querySelectorAll('[data-part="mark"]')) as SVGPathElement[];
        const box = slices.reduce(
          (b, s) => {
            const r = s.getBBox();
            return { x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.width), y1: Math.max(b.y1, r.y + r.height) };
          },
          { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
        );
        const cx = (box.x0 + box.x1) / 2;
        const cy = (box.y0 + box.y1) / 2;
        const angle = (p: DOMPoint) => {
          const a = Math.atan2(p.x - cx, cy - p.y);
          return a < -1e-6 ? a + 2 * Math.PI : a;
        };
        // Each slice's outer arc runs from its first point; walk the painted
        // outline to find the far end of that arc (where the path turns inwards).
        let total = 0;
        const starts: number[] = [];
        for (const s of slices) {
          const len = s.getTotalLength();
          const r0 = Math.hypot(s.getPointAtLength(0).x - cx, s.getPointAtLength(0).y - cy);
          let end = s.getPointAtLength(0);
          for (let l = 0; l <= len; l += 0.5) {
            const p = s.getPointAtLength(l);
            if (Math.abs(Math.hypot(p.x - cx, p.y - cy) - r0) > 1.5) break;
            end = p;
          }
          const a0 = angle(s.getPointAtLength(0));
          let sweep = angle(end) - a0;
          if (sweep <= 1e-3) sweep += 2 * Math.PI;
          starts.push(a0);
          total += sweep;
        }
        return { total, first: starts[0], width: box.x1 - box.x0, height: box.y1 - box.y0 };
      }, kind);
      expect(turn.total * (180 / Math.PI), kind).toBeCloseTo(360, 0);
      expect(Math.min(turn.first, 2 * Math.PI - turn.first), kind).toBeLessThan(0.02);
      expect(Math.abs(turn.width - turn.height), kind).toBeLessThan(2);
    }
    // The donut's total sits in its hole.
    const centre = await page.evaluate(() => {
      const root = document.querySelector('[data-ui="chart"][data-variant="donut"]')!;
      const total = root.querySelector('[data-part="total"]')!.getBoundingClientRect();
      const ring = (root.querySelector('[data-part="marks"]') as SVGGElement).getBoundingClientRect();
      return { total: [total.x + total.width / 2, total.y + total.height / 2], ring: [ring.x + ring.width / 2, ring.y + ring.height / 2], text: root.querySelector('[data-part="total"]')!.textContent };
    });
    expect(centre.text).toBe("4,800");
    expect(Math.abs(centre.total[0] - centre.ring[0])).toBeLessThan(2);
    expect(Math.abs(centre.total[1] - centre.ring[1])).toBeLessThan(16);
  });

  test("a gauge's arc ends where its value says, under the reading", async ({ page }) => {
    await open(page);
    const gauges = await page.evaluate(() => {
      const root = document.querySelector('[data-ui="chart"][data-variant="gauge"]')!;
      return Array.from(root.querySelectorAll('[data-part="series"]')).map((g) => {
        const track = g.querySelector('[data-part="track"]') as SVGPathElement;
        const value = g.querySelector('[data-part="mark"]') as SVGPathElement;
        const t0 = track.getPointAtLength(0);
        const t1 = track.getPointAtLength(track.getTotalLength());
        const v1 = value.getPointAtLength(value.getTotalLength());
        const cx = (t0.x + t1.x) / 2;
        const cy = t0.y;
        // Fraction of the half turn, from the left end over the top.
        const frac = (Math.atan2(v1.x - cx, cy - v1.y) + Math.PI / 2) / Math.PI;
        return { frac, zones: g.querySelectorAll('[data-part="zone"]').length, ticks: g.querySelectorAll('[data-part="tick"]').length };
      });
    });
    expect(gauges.map((g) => Math.round(g.frac * 100))).toEqual([62, 78, 41]);
    for (const g of gauges) expect([g.zones, g.ticks]).toEqual([3, 2]);
  });

  test("a sparkline in a table cell stays a line's height and keeps its table off screen and paper", async ({ page }) => {
    await open(page);
    const cell = await page.evaluate(() => {
      const wrap = document.querySelector('[data-ui="table"]') as HTMLElement;
      const root = wrap.querySelector('[data-ui="chart"]')!;
      const svg = root.querySelector("svg")!;
      return {
        height: svg.getBoundingClientRect().height,
        scroll: [wrap.scrollHeight, wrap.clientHeight],
        table: getComputedStyle(root.querySelector('[data-part="data"]')!).display,
        label: svg.getAttribute("aria-label"),
      };
    });
    expect(cell.height).toBeLessThanOrEqual(36);
    expect(cell.scroll[0]).toBeLessThanOrEqual(cell.scroll[1]);
    expect(cell.table).toBe("none");
    expect(cell.label).toBe("Desk lamp, units per week. Sparkline chart. W1 38, W2 41, W3 40, W4 47, W5 52, W6 50, W7 58, W8 63.");
    await page.emulateMedia({ media: "print" });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-variant="sparkline"] [data-part="data"]')!).display)).toBe("none");
    // …while the other kinds still print their numbers under the chart.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-variant="donut"] > [data-part="data"]')!).position)).toBe("static");
  });

  test("hovering a series steps the others back; reduced motion drops the transition", async ({ page }) => {
    await open(page);
    // The share label sits on the slice (a slice's box centre can be the hole).
    const slice = page.locator('[data-ui="chart"][data-variant="donut"] [data-part="series"]').first();
    await slice.locator('[data-part="label"]').hover();
    await expect
      .poll(() => page.evaluate(() => Array.from(document.querySelectorAll('[data-ui="chart"][data-variant="donut"] [data-part="series"]'), (s) => getComputedStyle(s).opacity)))
      .toEqual(["1", "0.35", "0.35", "0.35"]);
    // Presentational: the label is the same as before the hover.
    expect(await page.locator('[data-ui="chart"][data-variant="donut"] svg').getAttribute("aria-label")).toContain("Free 2,480 (52%)");
    await page.emulateMedia({ reducedMotion: "reduce" });
    // No motion: the sheet drops the transition, and the base layer pins every
    // duration to 0.01ms under reduced motion anyway.
    const duration = await page.evaluate(() => getComputedStyle(document.querySelector('[data-variant="donut"] [data-part="series"]')!).transitionDuration);
    expect(parseFloat(duration)).toBeLessThan(0.001);
  });

  test("every new kind redraws at its container's new width", async ({ page }) => {
    await open(page);
    const frames = await page.evaluate(
      () => new Promise<boolean>((done) => {
        requestAnimationFrame(() => done(true));
        setTimeout(() => done(false), 1000);
      }),
    );
    for (const kind of KINDS.filter((k) => k !== "sparkline")) {
      const sel = `[data-ui="chart"][data-variant="${kind}"]`;
      const before = await page.evaluate((sel) => document.querySelector(`${sel} svg`)!.getAttribute("viewBox"), sel);
      await page.evaluate((sel) => {
        (document.querySelector(sel) as HTMLElement).style.maxInlineSize = "360px";
      }, sel);
      if (!frames) await page.evaluate((sel) => (document.querySelector(sel) as any)._faqirChart.redraw(), sel);
      await expect.poll(() => page.evaluate((sel) => document.querySelector(`${sel} svg`)!.getAttribute("viewBox"), sel), kind).not.toBe(before);
      const after = await page.evaluate((sel) => {
        const plot = document.querySelector(`${sel} [data-part="plot"]`)!.getBoundingClientRect().width;
        return { plot, width: Number(document.querySelector(`${sel} svg`)!.getAttribute("viewBox")!.split(" ")[2]) };
      }, sel);
      expect(Math.abs(after.width - after.plot), kind).toBeLessThan(1);
      expect(after.width, kind).toBeLessThanOrEqual(360);
    }
  });
});
