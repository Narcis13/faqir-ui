/**
 * Form layout in a real browser — a downstream app's notes on 1.2.5 (forecraft,
 * items 6, 16, 17, 27). Geometry, not screenshots:
 *
 *  - one rhythm: a flat form, a `ui:groups` fieldset card and a wizard step put
 *    the same gap between two fields (the form's data-gap);
 *  - `ui:width`: two half fields share a row from the md tier and stack on a
 *    phone, in the form and inside a group card;
 *  - a fieldset card's legend sits inside the card, below its top border;
 *  - a scale and a horizontal checkbox group lay their options out in a row,
 *    with the scale's captions under its ends.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderForm } from "../../packages/forms/src/index.js";

const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "../../registry");

const TOKENS = [
  "palette", "spacing", "typography", "effects", "motion", "semantic", "aliases",
  "document", "doc-aliases", "density",
];
const BASE = ["reset", "prose", "rhythm", "motion-presets"];
const PRIMITIVES = ["button", "card", "checkbox", "field-group", "input", "label", "radio", "select", "stepper", "switch", "textarea"];

const read = (...parts: string[]) => readFileSync(join(REGISTRY, ...parts), "utf8");
const CSS = [
  ...TOKENS.map((name) => read("tokens", `${name}.css`)),
  ...BASE.map((name) => read("base", `${name}.css`)),
  read("themes", "default.css"),
  ...PRIMITIVES.map((name) => read("primitives", name, `${name}.css`)),
].join("\n");
const FORM_PAGE_CSS = read("patterns", "form-page", "form-page.css");

const SCHEMA = {
  type: "object",
  properties: {
    first: { type: "string", title: "First" },
    second: { type: "string", title: "Second" },
    third: { type: "string", title: "Third" },
    fourth: { type: "string", title: "Fourth" },
  },
} as const;

function page(body: string, withPattern = false): string {
  return `<!DOCTYPE html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<style>${CSS}${withPattern ? FORM_PAGE_CSS : ""}</style></head><body>${body}</body></html>`;
}

/** The vertical gap between each pair of consecutive field-groups in the first visible container. */
async function fieldGaps(p: Page): Promise<number[]> {
  return p.evaluate(() => {
    const groups = [...document.querySelectorAll<HTMLElement>('[data-ui="field-group"]')]
      .filter((group) => group.getBoundingClientRect().height > 0);
    const gaps: number[] = [];
    for (let i = 1; i < groups.length; i++) {
      if (groups[i].parentElement !== groups[i - 1].parentElement) continue;
      gaps.push(Math.round(groups[i].getBoundingClientRect().top - groups[i - 1].getBoundingClientRect().bottom));
    }
    return gaps;
  });
}

async function box(p: Page, selector: string) {
  const handle = p.locator(selector).first();
  const rect = await handle.boundingBox();
  if (!rect) throw new Error(`${selector} has no box`);
  return rect;
}

test.describe("one field rhythm", () => {
  for (const withPattern of [false, true]) {
    test(`a flat form, a group card and a wizard step space fields alike${withPattern ? " (form-page)" : ""}`, async ({ page: p }) => {
      const flat = renderForm(SCHEMA as never);
      const grouped = renderForm(SCHEMA as never, { "ui:groups": [{ title: "All", fields: ["first", "second", "third", "fourth"] }] });
      const wizard = renderForm(SCHEMA as never, {
        "ui:wizard": { steps: [{ title: "One", fields: ["first", "second", "third"] }, { title: "Two", fields: ["fourth"] }] },
      });
      const measured: number[][] = [];
      for (const html of [flat, grouped, wizard]) {
        await p.setContent(page(html, withPattern));
        measured.push(await fieldGaps(p));
      }
      const [flatGaps, groupGaps, wizardGaps] = measured;
      expect(flatGaps.length).toBe(3);
      // data-gap="4" → --space-4.
      const step = await p.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.blockSize = "var(--space-4)";
        document.body.append(probe);
        return Math.round(probe.getBoundingClientRect().height);
      });
      expect(step).toBeGreaterThan(0);
      for (const gap of flatGaps) expect(gap).toBe(step);
      expect(groupGaps).toEqual(flatGaps);
      expect(wizardGaps.slice(0, 2)).toEqual(flatGaps.slice(0, 2));
    });
  }

  test("a card outside a form keeps its body unspaced", async ({ page: p }) => {
    await p.setContent(page(
      `<main><div data-ui="card"><div data-part="body">
        <div data-ui="field-group"><label data-part="label" for="x">X</label><div data-part="input"><input data-ui="input" id="x"></div></div>
        <div data-ui="field-group"><label data-part="label" for="y">Y</label><div data-part="input"><input data-ui="input" id="y"></div></div>
      </div></div></main>`,
    ));
    expect(await fieldGaps(p)).toEqual([0]);
  });
});

test.describe("ui:width", () => {
  const ui = { first: { width: "half" }, second: { width: "half" }, third: { width: "third" } } as const;

  for (const [where, html] of [
    ["the form", renderForm(SCHEMA as never, ui as never)],
    ["a group card", renderForm(SCHEMA as never, { ...ui, "ui:groups": [{ title: "G", fields: ["first", "second", "third", "fourth"] }] } as never)],
  ] as const) {
    test(`two halves share a row from md and stack on a phone, in ${where}`, async ({ page: p }) => {
      await p.setViewportSize({ width: 1024, height: 900 });
      await p.setContent(page(html, true));
      const a = await box(p, '[data-span="half"] >> nth=0');
      const b = await box(p, '[data-span="half"] >> nth=1');
      const third = await box(p, '[data-span="third"]');
      const full = await box(p, '[data-ui="field-group"]:not([data-span])');
      expect(Math.abs(a.y - b.y)).toBeLessThan(1);
      expect(b.x).toBeGreaterThan(a.x + a.width);
      expect(third.y).toBeGreaterThan(a.y + a.height);
      expect(third.width).toBeLessThan(a.width);
      expect(full.y).toBeGreaterThan(third.y + third.height);
      expect(full.width).toBeGreaterThan(a.width * 1.9);

      await p.setViewportSize({ width: 375, height: 900 });
      const a2 = await box(p, '[data-span="half"] >> nth=0');
      const b2 = await box(p, '[data-span="half"] >> nth=1');
      expect(b2.y).toBeGreaterThan(a2.y + a2.height);
      expect(Math.abs(a2.width - b2.width)).toBeLessThan(1);
    });
  }
});

test("a fieldset card's legend sits inside the card, not on its border", async ({ page: p }) => {
  await p.setContent(page(renderForm(SCHEMA as never, { "ui:groups": [{ title: "Group title", fields: ["first", "second", "third", "fourth"] }] })));
  const geometry = await p.evaluate(() => {
    const fieldset = document.querySelector<HTMLElement>('fieldset[data-ui="card"]')!;
    const legend = fieldset.querySelector<HTMLElement>(':scope > legend')!;
    const body = fieldset.querySelector<HTMLElement>(':scope > [data-part="body"]')!;
    const style = getComputedStyle(fieldset);
    const f = fieldset.getBoundingClientRect();
    return {
      fieldsetTop: f.top, borderTop: parseFloat(style.borderTopWidth), fieldsetLeft: f.left, fieldsetWidth: f.width,
      marginInline: parseFloat(style.marginLeft) + parseFloat(style.marginRight),
      legend: legend.getBoundingClientRect().toJSON(),
      legendPaddingLeft: parseFloat(getComputedStyle(legend).paddingLeft),
      bodyPaddingLeft: parseFloat(getComputedStyle(body).paddingLeft),
      body: body.getBoundingClientRect().toJSON(),
    };
  });
  expect(geometry.marginInline).toBe(0);
  expect(geometry.legend.top).toBeGreaterThanOrEqual(geometry.fieldsetTop + geometry.borderTop - 0.5);
  expect(geometry.body.top).toBeGreaterThanOrEqual(geometry.legend.bottom - 0.5);
  // Full width, inset like the body.
  expect(geometry.legend.width).toBeGreaterThan(geometry.fieldsetWidth - 2 * geometry.borderTop - 1);
  expect(geometry.legendPaddingLeft).toBe(geometry.bodyPaddingLeft);
});

test("a scale's options form a row with its captions under the ends; a horizontal checkbox group is a row", async ({ page: p }) => {
  await p.setViewportSize({ width: 1024, height: 900 });
  await p.setContent(page(renderForm(
    {
      type: "object",
      properties: {
        nps: { type: "integer", minimum: 0, maximum: 10 },
        days: { type: "array", items: { type: "string", enum: ["mon", "tue", "wed"] } },
      },
    } as never,
    { nps: { widget: "scale", minLabel: "Not likely", maxLabel: "Very likely" }, days: { orientation: "horizontal" } } as never,
  )));
  const geometry = await p.evaluate(() => {
    const rects = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].map((el) => el.getBoundingClientRect().toJSON());
    return {
      scale: rects('[data-ui="radio-group"] > [data-ui="radio-label"]'),
      captions: rects('[data-ui="radio-group"] > [data-part="captions"] > span'),
      days: rects('[data-ui="checkbox-group"] > [data-ui="checkbox-label"]'),
    };
  });
  const tops = new Set(geometry.scale.map((rect) => Math.round(rect.top)));
  expect(tops.size).toBe(1);
  const [min, max] = geometry.captions;
  const first = geometry.scale[0];
  const last = geometry.scale[geometry.scale.length - 1];
  expect(min.top).toBeGreaterThanOrEqual(first.bottom);
  expect(Math.abs(min.left - first.left)).toBeLessThan(1);
  expect(Math.abs(max.right - last.right)).toBeLessThan(1);
  expect(new Set(geometry.days.map((rect) => Math.round(rect.top))).size).toBe(1);
});
