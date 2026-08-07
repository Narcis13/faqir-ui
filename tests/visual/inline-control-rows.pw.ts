/**
 * Inline control proximity in a real browser — task 0.9-08, FAQIR-SPEC §15.
 *
 * Every control in all four canonical references is measured. The accessible
 * label must be closer to its own box than that box is to the adjacent control.
 * The final control in a row compares with its previous peer, so no control is
 * silently skipped. A separate fixture proves the documented lone-control case
 * still gets its complete component styling without a cluster ancestor.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "../../registry");
const CONTROLS = ["checkbox", "radio", "switch", "toggle"] as const;

const TOKENS = [
  "palette", "spacing", "typography", "effects", "motion", "semantic", "aliases",
  "document", "doc-aliases", "density",
];
const BASE = ["reset", "prose", "rhythm", "motion-presets"];

const read = (...parts: string[]) => readFileSync(join(REGISTRY, ...parts), "utf8");
const CSS = [
  ...TOKENS.map((name) => read("tokens", `${name}.css`)),
  ...BASE.map((name) => read("base", `${name}.css`)),
  read("themes", "default.css"),
  read("primitives", "cluster", "cluster.css"),
  read("primitives", "label", "label.css"),
  ...CONTROLS.map((name) => read("primitives", name, `${name}.css`)),
].join("\n");

const REFERENCES = Object.fromEntries(
  CONTROLS.map((name) => [name, read("primitives", name, `${name}.html`)]),
) as Record<(typeof CONTROLS)[number], string>;

interface Geometry {
  component: string;
  index: number;
  ownLabel: number;
  adjacentControl: number;
  rowGap: number;
}

function documentForReferences(): string {
  const sections = CONTROLS.map(
    (name) => `<section data-reference="${name}">${REFERENCES[name]}</section>`,
  ).join("\n");
  return `<!DOCTYPE html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<style>${CSS}</style></head><body>${sections}</body></html>`;
}

async function geometry(page: Page): Promise<Geometry[]> {
  return page.evaluate((names) => {
    const distance = (a: DOMRect, b: DOMRect): number => {
      const dx = Math.max(0, a.left - b.right, b.left - a.right);
      const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
      return Math.hypot(dx, dy);
    };
    const itemIn = (control: HTMLElement, cluster: HTMLElement): HTMLElement => {
      let item = control;
      while (item.parentElement && item.parentElement !== cluster) item = item.parentElement;
      return item;
    };

    return names.flatMap((name) => {
      const section = document.querySelector<HTMLElement>(`[data-reference="${name}"]`)!;
      const controls = [...section.querySelectorAll<HTMLElement>(`[data-ui="${name}"]`)];
      return controls.map((control, index) => {
        const cluster = control.closest<HTMLElement>('[data-ui="cluster"]')!;
        const peers = [...cluster.querySelectorAll<HTMLElement>(`[data-ui="${name}"]`)];
        const peerIndex = peers.indexOf(control);
        const adjacent = peers[peerIndex + 1] ?? peers[peerIndex - 1];
        const item = itemIn(control, cluster);
        const adjacentItem = itemIn(adjacent, cluster);
        const label =
          name === "toggle"
            ? control
            : control.parentElement!.querySelector<HTMLElement>(':scope > [data-part="label"]')!;

        return {
          component: name,
          index,
          ownLabel: distance(control.getBoundingClientRect(), label.getBoundingClientRect()),
          adjacentControl: distance(
            control.getBoundingClientRect(),
            adjacent.getBoundingClientRect(),
          ),
          rowGap: distance(item.getBoundingClientRect(), adjacentItem.getBoundingClientRect()),
        };
      });
    });
  }, [...CONTROLS]);
}

test("every control is visually closer to its own label than to an adjacent control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(documentForReferences(), { waitUntil: "load" });
  const rows = await geometry(page);

  expect(Object.fromEntries(CONTROLS.map((name) => [
    name,
    rows.filter((row) => row.component === name).length,
  ]))).toEqual({ checkbox: 8, radio: 9, switch: 7, toggle: 7 });

  for (const row of rows) {
    expect(
      row.ownLabel,
      `${row.component} #${row.index + 1}: own-label ${row.ownLabel}px vs adjacent ${row.adjacentControl}px`,
    ).toBeLessThan(row.adjacentControl);
    expect(row.rowGap, `${row.component} #${row.index + 1}: cluster did not enforce space-4`)
      .toBe(16);
  }

  expect([...new Set(rows.filter((row) => row.component !== "toggle").map((row) => row.ownLabel))])
    .toEqual([8]);
  expect([...new Set(rows.filter((row) => row.component === "toggle").map((row) => row.ownLabel))])
    .toEqual([0]);
});

test("one complete control item renders correctly without a cluster", async ({ page }) => {
  const bare = `
    <label data-ui="checkbox-label" for="bare-checkbox"><input data-ui="checkbox" id="bare-checkbox" type="checkbox"><span data-part="label">Checkbox</span></label>
    <fieldset data-ui="radio-group"><legend data-ui="label">Radio</legend><label data-ui="radio-label" for="bare-radio"><input data-ui="radio" id="bare-radio" type="radio" name="bare"><span data-part="label">Radio</span></label></fieldset>
    <label data-ui="switch-label" for="bare-switch"><button data-ui="switch" id="bare-switch" role="switch" aria-checked="false"><span data-part="thumb"></span></button><span data-part="label">Switch</span></label>
    <button data-ui="toggle" type="button" aria-pressed="false">Toggle</button>`;
  await page.setContent(
    `<!DOCTYPE html><html lang="en" data-theme="light"><head><style>${CSS}</style></head><body><main>${bare}</main></body></html>`,
    { waitUntil: "load" },
  );

  for (const name of CONTROLS) {
    const control = page.locator(`[data-ui="${name}"]`).first();
    await expect(control).toBeVisible();
    expect(await control.evaluate((element) => element.closest('[data-ui="cluster"]'))).toBeNull();
    // A control inside its inline-flex label is blockified by the flex formatting
    // context (`inline-flex` computes to `flex` as a flex item); an unwrapped
    // toggle remains `inline-flex`. Both come from the component's shipped rule.
    expect(["inline-flex", "flex"]).toContain(
      await control.evaluate((element) => getComputedStyle(element).display),
    );
    const box = await control.boundingBox();
    expect(box?.width, `${name} lost its standalone width`).toBeGreaterThan(0);
    expect(box?.height, `${name} lost its standalone height`).toBeGreaterThan(0);
  }

  for (const name of ["checkbox", "radio", "switch"] as const) {
    const wrapper = page.locator(`[data-ui="${name}-label"]`).first();
    expect(await wrapper.evaluate((element) => getComputedStyle(element).columnGap)).toBe("8px");
  }
});
