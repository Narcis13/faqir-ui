/**
 * Form proximity in a real browser — task 0.9-07, FAQIR-SPEC §15/§20.
 *
 * A field has two spacing systems around it: field-group owns the tight links
 * between its label, control and help/error text; the surrounding flow root
 * owns the looser link to the next field through the default rhythm. These are
 * geometry properties over the complete reference, not snapshots or a handful
 * of named examples.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "../../registry");

const TOKENS = [
  "palette", "spacing", "typography", "effects", "motion", "semantic", "aliases",
  "document", "doc-aliases", "density",
];
const BASE = ["reset", "prose", "rhythm", "motion-presets"];
const COMPONENTS = ["field-group", "input", "select", "textarea", "label"];

const read = (...parts: string[]) => readFileSync(join(REGISTRY, ...parts), "utf8");
const CSS = [
  ...TOKENS.map((name) => read("tokens", `${name}.css`)),
  ...BASE.map((name) => read("base", `${name}.css`)),
  read("themes", "default.css"),
  ...COMPONENTS.map((name) => read("primitives", name, `${name}.css`)),
].join("\n");
const REFERENCE = read("primitives", "field-group", "field-group.html");

interface FieldGeometry {
  id: string;
  intra: number[];
  inter: number | null;
}

function documentFor(attributes = ""): string {
  return `<!DOCTYPE html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<style>${CSS}</style></head><body><form id="reference" ${attributes}>${REFERENCE}</form></body></html>`;
}

async function geometry(page: Page): Promise<FieldGeometry[]> {
  return page.evaluate(() => {
    const gap = (a: DOMRect, b: DOMRect): number => {
      const dx = Math.max(0, a.left - b.right, b.left - a.right);
      const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
      return Math.hypot(dx, dy);
    };
    const groups = [...document.querySelectorAll<HTMLElement>('[data-ui="field-group"]')];

    return groups.map((group, index) => {
      const parts = [...group.querySelectorAll<HTMLElement>(
        ':scope > [data-part="label"], :scope > [data-part="input"], ' +
          ':scope > [data-part="description"], :scope > [data-part="error"]',
      )].filter((part) => {
        const rect = part.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const rects = parts.map((part) => part.getBoundingClientRect());
      const nextLabel = groups[index + 1]?.querySelector<HTMLElement>(':scope > [data-part="label"]');

      return {
        id: group.querySelector<HTMLElement>("[id]")?.id ?? `field-${index + 1}`,
        intra: rects.slice(1).map((rect, partIndex) => gap(rects[partIndex], rect)),
        inter:
          nextLabel && rects.length > 0
            ? gap(rects[rects.length - 1], nextLabel.getBoundingClientRect())
            : null,
      };
    });
  });
}

function assertWholeReferenceIsGrouped(fields: FieldGeometry[]): void {
  expect(fields).toHaveLength(10);
  for (const field of fields.slice(0, -1)) {
    expect(field.intra.length, `${field.id} has no internal relationship to measure`).toBeGreaterThan(0);
    expect(field.inter, `${field.id} has no adjacent field to compare`).not.toBeNull();
    for (const intra of field.intra) {
      expect(
        intra,
        `${field.id}: internal gap ${intra}px must be smaller than adjacent-field gap ${field.inter}px`,
      ).toBeLessThan(field.inter!);
    }
  }
}

test("every field keeps its own parts closer than the next field", async ({ page }) => {
  await page.setContent(documentFor(), { waitUntil: "load" });
  const fields = await geometry(page);
  assertWholeReferenceIsGrouped(fields);
  expect([...new Set(fields.slice(0, -1).map((field) => field.inter))]).toEqual([48]);
  expect([...new Set(fields.flatMap((field) => field.intra))].sort((a, b) => a - b)).toEqual([
    4, 8, 16,
  ]);
});

test("turning the default rhythm off does not change any intra-field step", async ({ page }) => {
  await page.setContent(documentFor(), { waitUntil: "load" });
  const withRhythm = await geometry(page);

  await page.setContent(documentFor('data-gap="0"'), { waitUntil: "load" });
  const withoutRhythm = await geometry(page);

  expect(withoutRhythm.map((field) => field.intra)).toEqual(withRhythm.map((field) => field.intra));
  expect(withRhythm[0].inter).toBeGreaterThan(0);
  expect(withoutRhythm[0].inter).toBe(0);
});

test("compact density remaps both steps and preserves proximity", async ({ page }) => {
  await page.setContent(documentFor(), { waitUntil: "load" });
  const comfortable = await geometry(page);

  await page.setContent(documentFor('data-density="compact"'), { waitUntil: "load" });
  const compact = await geometry(page);
  assertWholeReferenceIsGrouped(compact);
  expect([...new Set(compact.slice(0, -1).map((field) => field.inter))]).toEqual([36]);
  expect([...new Set(compact.flatMap((field) => field.intra))].sort((a, b) => a - b)).toEqual([
    3, 6, 12,
  ]);

  for (let index = 0; index < comfortable.length; index++) {
    if (comfortable[index].inter !== null) {
      expect(
        compact[index].inter!,
        `${comfortable[index].id}: outer step did not compact`,
      ).toBeLessThan(comfortable[index].inter!);
    }
    for (let part = 0; part < comfortable[index].intra.length; part++) {
      expect(
        compact[index].intra[part],
        `${comfortable[index].id}: inner step ${part + 1} did not compact`,
      ).toBeLessThan(comfortable[index].intra[part]);
    }
  }
});

test("the Address row opts into the declared horizontal variant", async ({ page }) => {
  await page.setContent(documentFor(), { waitUntil: "load" });
  const address = page.locator('[data-ui="field-group"]:has(#address)');
  await expect(address).toHaveAttribute("data-variant", "horizontal");
  expect(await address.evaluate((element) => getComputedStyle(element).flexDirection)).toBe("row");

  const label = await address.locator(':scope > [data-part="label"]').boundingBox();
  const control = await address.locator(':scope > [data-part="input"]').boundingBox();
  expect(label).not.toBeNull();
  expect(control).not.toBeNull();
  expect(control!.x - (label!.x + label!.width)).toBeGreaterThan(0);
  expect(control!.x).toBeGreaterThan(label!.x);
});
